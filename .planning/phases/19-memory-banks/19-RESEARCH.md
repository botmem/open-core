# Phase 19: Memory Banks - Research

**Researched:** 2026-03-09
**Domain:** Data isolation, multi-tenant scoping, NestJS/Drizzle/Qdrant
**Confidence:** HIGH

## Summary

Phase 19 is substantially pre-built. The schema, CRUD service, controller, frontend store, and settings UI all exist. The embed processor already assigns memories to the user's default bank and includes `memory_bank_id` in Qdrant payloads. Search already filters by `memoryBankId`/`memoryBankIds` in both Postgres and Qdrant.

The remaining work centers on three gaps: (1) sync does not accept a `memoryBankId` parameter -- all memories always go to the default bank, (2) existing data (memories without `memoryBankId`) needs migration to the default bank, and (3) API key creation does not accept `memoryBankIds` scoping. The frontend also needs bank selection during connector sync and bank multi-select during API key creation.

**Primary recommendation:** Focus planning on the three gaps above. Do NOT rebuild what exists. Each gap is a small, targeted change.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Plan 01: User-Data Ownership must be implemented first (userId on accounts/contacts, user filtering everywhere)
- Plan 02: Memory Banks Schema + CRUD (already done in codebase)
- Plan 03: Memory Bank Scoping (sync accepts memoryBankId, search scoping, API key enforcement, cascade delete)
- Plan 04: Frontend (bank selector, management, sync bank selection, API key bank multi-select)
- Memory bank selected at sync time (not auto-assigned per connector)

### Claude's Discretion

None specified.

### Deferred Ideas (OUT OF SCOPE)

None specified.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                    | Research Support                                                                                                                                                                                                   |
| ------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BANK-01 | Create, list, rename, and delete memory banks per user         | ALREADY IMPLEMENTED: `MemoryBanksService` + `MemoryBanksController` + frontend `MemoryBanksTab.tsx` all exist with full CRUD                                                                                       |
| BANK-02 | Select target memory bank at sync time (connector sync config) | GAP: `triggerSync()` in `jobs.service.ts` does not accept `memoryBankId`. Embed processor defaults to user's default bank. Need to thread bankId through sync->clean->embed pipeline                               |
| BANK-03 | Search scoped to accessible bank(s)                            | PARTIALLY DONE: `MemoryService.search()` and Qdrant filter already support `memoryBankId`/`memoryBankIds`. API key guard already extracts `memoryBankIds`. Gap: API key creation always sets `memoryBankIds: null` |
| BANK-04 | Default bank on registration + migration of existing data      | PARTIALLY DONE: `user-auth.service.ts` calls `getOrCreateDefault()` on registration. Gap: no migration script for existing memories/Qdrant vectors without `memoryBankId`                                          |

</phase_requirements>

## What Already Exists (Do NOT Rebuild)

### Backend - Complete

| Component                        | Location                                                                 | Status                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `memoryBanks` table + schema     | `apps/api/src/db/schema.ts` lines 238-249, `db.service.ts` lines 202-209 | Complete with unique partial index on `(user_id) WHERE is_default`                            |
| `memories.memoryBankId` column   | `schema.ts` line 85, indexed                                             | Complete                                                                                      |
| `apiKeys.memoryBankIds` column   | `schema.ts` line 263                                                     | Complete (nullable text, JSON)                                                                |
| `MemoryBanksService`             | `apps/api/src/memory-banks/memory-banks.service.ts`                      | Full CRUD + `getOrCreateDefault()` + `getMemoryCounts()` + cascade delete with Qdrant cleanup |
| `MemoryBanksController`          | `apps/api/src/memory-banks/memory-banks.controller.ts`                   | GET /memory-banks, POST, PATCH /:id, DELETE /:id                                              |
| Default bank on registration     | `user-auth.service.ts` line 51                                           | Calls `getOrCreateDefault()` after user insert                                                |
| Embed processor bank assignment  | `embed.processor.ts` lines 128-148                                       | Looks up account userId, finds default bank, assigns to memory + Qdrant payload               |
| Search bank filtering (Postgres) | `memory.service.ts`                                                      | Filters by `memoryBankId` or `memoryBankIds` in list, search, timeline, stats, graph          |
| Search bank filtering (Qdrant)   | `memory.service.ts` lines 1661-1666                                      | `memory_bank_id` filter in Qdrant must clauses                                                |
| Auth guard API key scoping       | `jwt-auth.guard.ts` lines 55-60                                          | Extracts `memoryBankIds` from key record, puts on `request.user`                              |
| `accounts.userId` column         | `schema.ts` line 17, indexed                                             | Nullable, already used in `AccountsService.getAll(userId)`                                    |
| `contacts.userId` column         | `schema.ts` line 135, indexed                                            | Nullable, already used in contact resolution                                                  |

### Frontend - Complete

| Component                     | Location                                              | Status                                                                        |
| ----------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `memoryBankStore`             | `apps/web/src/store/memoryBankStore.ts`               | Zustand store with CRUD actions, persisted active bank ID                     |
| `MemoryBanksTab`              | `apps/web/src/components/settings/MemoryBanksTab.tsx` | Full management UI (create, rename, delete with confirmation)                 |
| Bank selector in sidebar      | `apps/web/src/components/layout/Sidebar.tsx`          | Dropdown switching active bank                                                |
| API client methods            | `apps/web/src/lib/api.ts`                             | `listMemoryBanks`, `createMemoryBank`, `renameMemoryBank`, `deleteMemoryBank` |
| Bank-scoped search/list/stats | `apps/web/src/lib/api.ts`                             | `memoryBankId` param on search, listMemories, getMemoryStats, getGraphData    |

## Remaining Gaps (What To Build)

### Gap 1: Sync Does Not Accept memoryBankId (BANK-02)

**Current state:** `JobsController.triggerSync()` takes only `accountId`. `JobsService.triggerSync()` enqueues `{ accountId, connectorType, jobId }`. The embed processor auto-assigns the user's default bank.

**What's needed:**

1. `triggerSync()` accepts optional `memoryBankId` parameter
2. Sync queue job data includes `memoryBankId`
3. BullMQ job data flows through sync -> raw events -> clean -> embed
4. Embed processor uses provided `memoryBankId` instead of auto-detecting default
5. Frontend sync trigger passes selected bank

**Threading path:** `POST /jobs/sync/:accountId` body `{ memoryBankId }` -> `jobs.service.triggerSync(accountId, ..., memoryBankId)` -> sync queue job data -> `SyncProcessor` stores on raw events (or passes through) -> `EmbedProcessor` reads from job data or raw event metadata

**Recommended approach:** Add `memoryBankId` to the sync queue job data. The embed processor already has the lookup logic; modify it to prefer job-provided bankId over auto-detected default. The simplest path: store `memoryBankId` on the job record in the `jobs` table (add a nullable column), then embed processor can look it up from the job row.

### Gap 2: Existing Data Migration (BANK-04)

**Current state:** Existing memories have `memoryBankId = null`. Qdrant vectors have `memory_bank_id = null` in payloads.

**What's needed:**

1. Create default bank for existing user (if not exists)
2. Update all memories with null `memoryBankId` to point to default bank
3. Update Qdrant payloads to include `memory_bank_id`
4. Update all accounts with null `userId` to point to existing user

**Approach:** A migration script (same pattern as Phase 25/27 scripts: `main().catch()` for tsx CJS compatibility). Steps:

- Find first user (or create one if needed)
- Call `getOrCreateDefault(userId)` to ensure default bank
- `UPDATE memories SET memory_bank_id = :bankId WHERE memory_bank_id IS NULL`
- `UPDATE accounts SET user_id = :userId WHERE user_id IS NULL`
- `UPDATE contacts SET user_id = :userId WHERE user_id IS NULL`
- Qdrant bulk set payload: use `setPayload` with filter for null `memory_bank_id`

### Gap 3: API Key Memory Bank Scoping (BANK-03)

**Current state:** `ApiKeysService.create()` always sets `memoryBankIds: null`. The guard already reads and applies the value. The frontend API key creation UI does not show bank selection.

**What's needed:**

1. `create()` accepts `memoryBankIds?: string[]` parameter
2. Validate provided bank IDs belong to the user
3. Store as JSON text in the column
4. Frontend: multi-select of user's banks during API key creation

### Gap 4: Frontend Sync Bank Selection

**Current state:** Sync is triggered from connectors page. No bank selection shown.

**What's needed:** When clicking "Sync" on a connected account, show a bank selector (dropdown of user's banks) before triggering. Default to the active bank (from sidebar selector) or the default bank.

## Architecture Patterns

### Data Flow for Bank-Scoped Sync

```
User clicks Sync → selects bank → POST /jobs/sync/:accountId { memoryBankId }
  → jobs.service creates job row (with memoryBankId)
  → enqueues sync queue job { accountId, connectorType, jobId, memoryBankId }
  → SyncProcessor runs connector.sync() → emits raw events
  → raw events enqueued to clean → embed
  → EmbedProcessor reads memoryBankId from job data
  → Memory inserted with memoryBankId
  → Qdrant upsert includes memory_bank_id in payload
```

### User Isolation Pattern (Already Established)

```typescript
// Controller: extract userId from JWT/API key
@CurrentUser() user: { id: string; memoryBankIds?: string[] }

// Service: filter by userId (via accounts)
const userAccounts = await db.select({ id: accounts.id })
  .from(accounts).where(eq(accounts.userId, user.id));

// Memory queries: filter by memoryBankId or memoryBankIds
if (memoryBankId) conditions.push(eq(memories.memoryBankId, memoryBankId));
else if (memoryBankIds?.length) conditions.push(inArray(memories.memoryBankId, memoryBankIds));
```

### Migration Script Pattern (From Phase 25)

```typescript
// apps/api/scripts/migrate-banks.ts
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // ... migration logic
  await pool.end();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
// Run: npx tsx apps/api/scripts/migrate-banks.ts
```

## Don't Hand-Roll

| Problem                      | Don't Build              | Use Instead                                    | Why                                                                     |
| ---------------------------- | ------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Bank CRUD                    | Custom implementation    | Already exists in `MemoryBanksService`         | Fully complete with cascade delete, uniqueness checks, default handling |
| Search scoping               | Custom filter logic      | Already exists in `MemoryService`              | Both Postgres and Qdrant filters already implemented                    |
| Default bank on registration | Custom registration hook | Already wired in `user-auth.service.ts`        | Calls `getOrCreateDefault()` after insert                               |
| Frontend bank management     | New UI components        | Already exists in `MemoryBanksTab.tsx` + store | Full CRUD UI with confirmation dialogs                                  |

## Common Pitfalls

### Pitfall 1: Qdrant Payload Backfill Performance

**What goes wrong:** Updating all Qdrant payloads one-by-one is slow for large collections.
**Why it happens:** Qdrant `setPayload` with a filter can update many points at once.
**How to avoid:** Use `setPayload` with a filter `{ must: [{ key: "memory_bank_id", match: { value: null } }] }` instead of point-by-point updates. The QdrantService already has a `setPayload(payload, filter)` method.

### Pitfall 2: Sync Queue Job Data Not Including memoryBankId

**What goes wrong:** memoryBankId gets lost between the sync trigger and the embed processor.
**Why it happens:** BullMQ job data is serialized -- must explicitly include all needed fields.
**How to avoid:** Thread memoryBankId through the entire pipeline: job record -> sync queue data -> (via job lookup in embed processor, which already looks up the job via `rawEvent.jobId`).

### Pitfall 3: Nullable memoryBankId on Existing Data

**What goes wrong:** Queries using `eq(memories.memoryBankId, bankId)` exclude memories with null memoryBankId.
**Why it happens:** SQL null comparison semantics -- `null = 'x'` is false.
**How to avoid:** Run migration before deploying bank-filtered queries. Migration script should be idempotent and safe to re-run.

### Pitfall 4: isDefault Check on Boolean vs Number

**What goes wrong:** Frontend checks `bank.isDefault === 1` but Postgres returns true/false boolean.
**Warning signs:** The `MemoryBanksTab.tsx` has `{bank.isDefault === 1 && (...)}` which works with SQLite integers but may need adjustment for Postgres booleans.
**How to avoid:** Check both: `bank.isDefault === true || bank.isDefault === 1` or normalize in the API response.

## Validation Architecture

### Test Framework

| Property           | Value                             |
| ------------------ | --------------------------------- |
| Framework          | Vitest 3                          |
| Config file        | `apps/api/vitest.config.ts`       |
| Quick run command  | `pnpm --filter api test -- --run` |
| Full suite command | `pnpm test`                       |

### Phase Requirements -> Test Map

| Req ID  | Behavior                                                     | Test Type | Automated Command                                   | File Exists?                                     |
| ------- | ------------------------------------------------------------ | --------- | --------------------------------------------------- | ------------------------------------------------ |
| BANK-01 | CRUD operations on memory banks                              | unit      | `pnpm --filter api test -- --run memory-banks`      | No (needs Wave 0 test)                           |
| BANK-02 | Sync accepts memoryBankId, memories stored in specified bank | unit      | `pnpm --filter api test -- --run sync.processor`    | Existing `sync.processor.test.ts` needs update   |
| BANK-03 | Search filtered by bank, API key scoping                     | unit      | `pnpm --filter api test -- --run memory.service`    | Existing `memory.service.test.ts` needs update   |
| BANK-04 | Default bank on registration, data migration                 | unit      | `pnpm --filter api test -- --run user-auth.service` | Existing test already mocks `getOrCreateDefault` |

### Sampling Rate

- **Per task commit:** `pnpm --filter api test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/api/src/memory-banks/__tests__/memory-banks.service.test.ts` -- covers BANK-01 CRUD
- [ ] Update `apps/api/src/jobs/__tests__/sync.processor.test.ts` -- covers BANK-02 memoryBankId threading
- [ ] Update `apps/api/src/memory/__tests__/embed.processor.test.ts` -- covers BANK-02 bank assignment

## State of the Art

| Old Approach             | Current Approach            | When Changed     | Impact                                                |
| ------------------------ | --------------------------- | ---------------- | ----------------------------------------------------- |
| No user isolation        | userId on accounts/contacts | Phase 18/19 prep | Multi-user safe                                       |
| All memories in one pool | memoryBankId partitioning   | Phase 19         | Logical data isolation                                |
| SQLite                   | PostgreSQL                  | Phase 22         | Enables proper FK constraints, partial unique indexes |

## Open Questions

1. **Should deleting a non-default bank move memories to default bank instead of deleting them?**
   - Current implementation: cascade deletes all memories + Qdrant vectors
   - Alternative: move to default bank (safer, but user may not want that)
   - Recommendation: Keep cascade delete (already implemented), but add confirmation in frontend (already done)

2. **How to handle the `isDefault` check in frontend (boolean vs number)?**
   - What we know: Postgres returns boolean, frontend checks `=== 1`
   - Recommendation: Fix to `bank.isDefault === true` in MemoryBanksTab.tsx during this phase

3. **Should memoryBankId be stored on the jobs table or threaded through BullMQ job data?**
   - Option A: Add `memory_bank_id` column to `jobs` table -- persistent, queryable
   - Option B: Pass in BullMQ job data only -- simpler, but not visible in job listing
   - Recommendation: Option A -- add column to jobs table. The embed processor already queries the job row via `rawEvent.jobId`.

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection of all relevant files (schema, services, controllers, processors, frontend)
- `apps/api/src/db/schema.ts` -- complete schema including memoryBanks, apiKeys tables
- `apps/api/src/memory-banks/` -- full service + controller
- `apps/api/src/memory/embed.processor.ts` -- bank assignment in pipeline
- `apps/api/src/memory/memory.service.ts` -- search filtering implementation

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - entire codebase inspected, NestJS/Drizzle/Qdrant patterns well established
- Architecture: HIGH - patterns already established by existing implementation
- Pitfalls: HIGH - identified from direct code analysis of nullable columns, type mismatches, and pipeline threading

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- internal project patterns)
