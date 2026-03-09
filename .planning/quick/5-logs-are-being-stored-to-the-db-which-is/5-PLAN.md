---
phase: quick
plan: 5
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/logs/logs.service.ts
  - apps/api/src/logs/logs.controller.ts
  - apps/api/src/logs/__tests__/logs.service.test.ts
  - apps/api/src/db/db.service.ts
  - apps/api/src/db/schema.ts
  - apps/api/src/config/config.service.ts
autonomous: true
requirements: [QUICK-5]

must_haves:
  truths:
    - 'No log entries are written to the PostgreSQL database'
    - 'Log entries are appended as NDJSON lines to a file on disk'
    - 'GET /api/logs still works, reading from file and filtering by jobId/accountId/level'
    - 'The logs table is absent from the DB (dropped at startup)'
  artifacts:
    - path: 'apps/api/src/logs/logs.service.ts'
      provides: 'File-based LogsService (no DB dependency)'
    - path: 'apps/api/src/db/db.service.ts'
      provides: 'createTables without logs table; drops logs table on startup'
  key_links:
    - from: 'apps/api/src/logs/logs.service.ts'
      to: 'data/logs.ndjson'
      via: 'fs.appendFile'
      pattern: 'appendFile|createWriteStream'
---

<objective>
Move connector/sync logs from the PostgreSQL database to a flat NDJSON file on disk.

Purpose: The logs table grows unboundedly during syncs, hammering the DB with inserts that have no query value. Logs are only read by the UI for a running job — a file tail serves that equally well and keeps the DB clean.
Output: LogsService writes to `./data/logs.ndjson` (one JSON object per line). `GET /api/logs` reads and filters from that file. The `logs` table is dropped from PostgreSQL schema and DB.
</objective>

<execution_context>
@/Users/amr/.claude/get-shit-done/workflows/execute-plan.md
@/Users/amr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Key facts:

- PostgreSQL via Drizzle ORM. Tables created imperatively in db.service.ts createTables().
- schema.ts defines the Drizzle table object — removing it from there prevents Drizzle from touching it.
- LogsService is @Global(), injected into sync.processor, embed.processor, memory.processor, clean.processor, enrich.service, enrich.processor.
- The public API of LogsService must not change (add() and query() signatures stay the same).
- Log file lives under ./data/ (same dir as DB_PATH default). Config getter logsPath should default to process.env.LOGS_PATH || './data/logs.ndjson'.
- The controller GET /logs is already guarded by JWT — no auth changes needed.
- NestJS Logger (not LogsService) handles stdout — that's separate and fine to leave.
  </context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite LogsService to use file-based NDJSON storage</name>
  <files>
    apps/api/src/logs/logs.service.ts
    apps/api/src/logs/__tests__/logs.service.test.ts
    apps/api/src/config/config.service.ts
  </files>
  <action>
**config.service.ts** — Add getter at the end of the env getters block:
```typescript
get logsPath(): string {
  return process.env.LOGS_PATH || './data/logs.ndjson';
}
```

**logs.service.ts** — Full rewrite. Remove DbService dependency entirely. Use Node `fs/promises` for appending and reading.

Constructor should inject ConfigService only. On first `add()` call, ensure the parent directory exists with `fs.mkdir(dirname(path), { recursive: true })`.

`add()` logic:

- Build a log entry object: `{ id: crypto.randomUUID(), jobId, connectorType, accountId, stage, level, message: sanitizedMessage, timestamp: new Date().toISOString() }`
- Sanitize message using the existing sanitizeMessage private method (keep it)
- Append `JSON.stringify(entry) + '\n'` to the file using `fs.appendFile(this.logsPath, ...)` — fire-and-forget (do NOT await, wrap in `.catch(err => console.warn(...))` so it never throws)

`query()` logic:

- Read the file with `fs.readFile(path, 'utf-8')`. If file doesn't exist (ENOENT), return `{ logs: [], total: 0 }`.
- Split by newline, parse each non-empty line as JSON, skip malformed lines silently.
- Apply filters: jobId, accountId, level — exact string match.
- Sort by timestamp descending.
- Apply limit (default 50) after filtering.
- Return `{ logs: results, total: results.length }`.

The return shape of each log entry in query() should match the old DB row shape so the UI doesn't break:
`{ id, jobId, connectorType, accountId, stage, level, message, timestamp }` — timestamp as string is fine.

**logs.service.test.ts** — Replace the existing mock-DB test with a simple unit test:

- Import `LogsService` and mock `ConfigService` to return a tmp path (use `os.tmpdir() + '/test-logs-' + Date.now() + '.ndjson'`).
- Test: `add()` followed by `query()` returns the added entry.
- Test: `query()` with non-existent file returns empty array.
- Clean up the temp file in afterEach.
  </action>
  <verify>
  <automated>cd /Users/amr/Projects/botmem && pnpm --filter @botmem/api test -- --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>LogsService has no DbService import; tests pass; add() appends NDJSON; query() reads and filters from file.</done>
  </task>

<task type="auto">
  <name>Task 2: Remove logs table from schema.ts and db.service.ts, drop existing table</name>
  <files>
    apps/api/src/db/schema.ts
    apps/api/src/db/db.service.ts
  </files>
  <action>
**schema.ts** — Delete the entire `logs` table definition (lines 50-63: `export const logs = pgTable('logs', {...})`). Also remove the `index` import alias if it's no longer needed (check — `index` is still used by other tables so keep it).

**db.service.ts** — Two changes:

1. In `createTables()`, remove the `CREATE TABLE IF NOT EXISTS logs (...)` block and remove the `CREATE INDEX IF NOT EXISTS idx_logs_job_id ON logs(job_id);` line from the indexes block.

2. Add a one-time cleanup after `createTables()` resolves. In `onModuleInit()`, after `await this.createTables()`, add:

```typescript
await this.dropLegacyTables();
```

Add the private method:

```typescript
private async dropLegacyTables() {
  const client = await this.pool.connect();
  try {
    await client.query('DROP TABLE IF EXISTS logs CASCADE');
    this.logger.log('Legacy logs table dropped (now file-based)');
  } catch (err) {
    this.logger.warn('Could not drop legacy logs table:', err instanceof Error ? err.message : String(err));
  } finally {
    client.release();
  }
}
```

This is idempotent — if the table doesn't exist it's a no-op.

Also remove the `logs` import from schema.ts in logs.service.ts (already done in Task 1), and verify no other file imports `logs` from schema.ts.
</action>
<verify>
<automated>cd /Users/amr/Projects/botmem && grep -rn "from '../db/schema'" apps/api/src/logs/ && echo "check: no 'logs' table usage" && grep -n "logs" apps/api/src/db/schema.ts | grep -v "//" && echo "schema check done"</automated>
</verify>
<done>logs table absent from schema.ts and createTables SQL. DB drops the table on next startup. No TypeScript errors from removed export (verify with pnpm --filter @botmem/api build --noEmit or typecheck).</done>
</task>

</tasks>

<verification>
After both tasks:
1. `pnpm --filter @botmem/api test` — all tests pass
2. `curl -s http://localhost:12412/api/version` — server restarted cleanly (check logs for "Legacy logs table dropped")
3. `curl -s -H "Authorization: Bearer $TOKEN" http://localhost:12412/api/logs?limit=5` — returns `{"logs":[],"total":0}` or recent log entries from file
4. Check PostgreSQL: `psql $DATABASE_URL -c "\dt"` — no `logs` table listed
</verification>

<success_criteria>

- Zero DB writes for log entries
- `./data/logs.ndjson` (or LOGS_PATH) receives one JSON line per connector log event
- `GET /api/logs` still returns filtered log entries from file
- `logs` table dropped from PostgreSQL
- All existing tests pass
  </success_criteria>

<output>
After completion, create `.planning/quick/5-logs-are-being-stored-to-the-db-which-is/5-SUMMARY.md`
</output>
