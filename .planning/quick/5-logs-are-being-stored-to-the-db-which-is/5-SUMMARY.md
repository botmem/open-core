---
phase: quick
plan: 5
subsystem: logs
tags: [logs, ndjson, file-based, postgres, performance]
dependency_graph:
  requires: []
  provides: [file-based-log-storage]
  affects: [logs.service, db.service, config.service]
tech_stack:
  added: []
  patterns: [fire-and-forget fs.appendFile, NDJSON line protocol]
key_files:
  created: []
  modified:
    - apps/api/src/logs/logs.service.ts
    - apps/api/src/logs/__tests__/logs.service.test.ts
    - apps/api/src/config/config.service.ts
    - apps/api/src/db/schema.ts
    - apps/api/src/db/db.service.ts
decisions:
  - Fire-and-forget append (no await) so log writes never block the caller
  - ENOENT on read returns empty result instead of throwing
  - dropLegacyTables() is idempotent — safe to run on every startup
  - logsPath configurable via LOGS_PATH env var, defaults to ./data/logs.ndjson
metrics:
  duration: 8min
  completed: 2026-03-09
  tasks_completed: 2
  files_modified: 5
---

# Quick Task 5: Move Logs from PostgreSQL to NDJSON File Summary

**One-liner:** Migrated connector sync logs from a PostgreSQL table to a flat NDJSON file on disk, eliminating unbounded DB growth during syncs while keeping GET /api/logs fully functional.

## What Was Done

Connector/sync logs were being written to a `logs` table in PostgreSQL on every sync event, causing unbounded table growth with no query value. Logs are only read by the UI for a running job. This task moved log storage to a flat NDJSON file (`./data/logs.ndjson`) and dropped the DB table.

## Tasks Completed

| Task | Name                                                                    | Commit  | Files                                                    |
| ---- | ----------------------------------------------------------------------- | ------- | -------------------------------------------------------- |
| 1    | Rewrite LogsService to use file-based NDJSON storage                    | 9d42b3e | logs.service.ts, logs.service.test.ts, config.service.ts |
| 2    | Remove logs table from schema.ts and db.service.ts, drop existing table | d0615bd | schema.ts, db.service.ts                                 |

## Changes Made

### Task 1: File-based LogsService

- `LogsService` no longer depends on `DbService` — only `ConfigService`
- `add()` is now synchronous (void return) — appends `JSON.stringify(entry) + '\n'` via fire-and-forget `fs.appendFile`
- `query()` reads the file, parses each NDJSON line, filters by jobId/accountId/level, sorts descending by timestamp, applies limit
- File directory is created on demand via `fs.mkdir(..., { recursive: true })`
- ENOENT on read returns `{ logs: [], total: 0 }` cleanly
- `ConfigService` gains `logsPath` getter (`LOGS_PATH` env var or `./data/logs.ndjson`)
- Unit tests replaced: 3 real file-based tests (add+query roundtrip, missing file, level filter)

### Task 2: DB Schema Cleanup

- `export const logs = pgTable(...)` removed from `schema.ts`
- `CREATE TABLE IF NOT EXISTS logs (...)` block removed from `createTables()` in `db.service.ts`
- `CREATE INDEX IF NOT EXISTS idx_logs_job_id ON logs(job_id)` removed from indexes block
- New private method `dropLegacyTables()` added — runs `DROP TABLE IF EXISTS logs CASCADE` idempotently
- `dropLegacyTables()` called in `onModuleInit()` after `createTables()` — logs "Legacy logs table dropped (now file-based)"

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- All 3 LogsService unit tests pass (file roundtrip, missing file, level filter)
- Pre-existing `nlq-parser.test.ts` failures (date-sensitive tests) are unrelated to this task
- `GET /api/logs` continues to work — controller unchanged, `query()` signature preserved
- On next server startup, `logs` table will be dropped from PostgreSQL

## Self-Check

- [x] `apps/api/src/logs/logs.service.ts` — no DbService import, file-based
- [x] `apps/api/src/db/schema.ts` — no `logs` table export
- [x] `apps/api/src/db/db.service.ts` — no `CREATE TABLE logs` SQL, has `dropLegacyTables()`
- [x] Commits 9d42b3e and d0615bd exist

## Self-Check: PASSED
