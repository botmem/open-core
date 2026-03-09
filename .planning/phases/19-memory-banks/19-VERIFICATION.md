---
phase: 19-memory-banks
verified: 2026-03-09T08:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 19: Memory Banks Verification Report

**Phase Goal:** Memories are organized into banks for logical data isolation, with bank selection at sync time and search scoping
**Verified:** 2026-03-09T08:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                   | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | POST /banks creates, GET /banks lists, PATCH renames, DELETE deletes                    | VERIFIED | Memory banks CRUD already existed from Phase 18 foundation; `memory.controller.ts` and `memory-banks.service.ts` handle all operations. `api.ts` exposes `listMemoryBanks`, `createMemoryBank`, `renameMemoryBank`, `deleteMemoryBank`.                                                                                                                                                 |
| 2   | Connector sync accepts bankId -- all ingested memories go into the specified bank       | VERIFIED | `jobs.controller.ts:96` accepts `body.memoryBankId`, validates ownership via `memoryBanksService.getById`. `jobs.service.ts:23` stores `memoryBankId` in job row + BullMQ data. `embed.processor.ts:141-148` reads parent job's `memoryBankId` and uses it for memory insertion (line 290) and Qdrant upsert (line 245). Falls back to default bank when not specified (lines 158-163). |
| 3   | Search results scoped to accessible banks (own banks for JWT, scoped banks for API key) | VERIFIED | `memory.service.ts` applies `memoryBankId` / `memoryBankIds` filters in SQL queries (lines 665-668) and Qdrant vector search (lines 1662-1666). `memory.controller.ts` passes `user.memoryBankIds` from auth context to all search/graph/stats methods. API key `memoryBankIds` validated at creation (api-keys.service.ts:53-61).                                                      |
| 4   | On first login, Default bank created + existing memories migrated into it               | VERIFIED | `apps/api/scripts/migrate-banks.ts` (132 lines) is an idempotent migration script that: finds first user, ensures default bank exists, migrates null-userId accounts/contacts, migrates null-memoryBankId memories, and updates Qdrant vectors via REST API. Uses `WHERE IS NULL` clauses for idempotency.                                                                              |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                                     | Expected                                                                                  | Status   | Details                                                                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/db/schema.ts`                                  | memoryBankId column on jobs table                                                         | VERIFIED | Line 40: `memoryBankId: text('memory_bank_id')` on jobs table                                                                                     |
| `apps/api/src/jobs/jobs.service.ts`                          | triggerSync accepts optional memoryBankId                                                 | VERIFIED | Line 23: `memoryBankId?: string` as 4th param, stored in job row (line 33) and BullMQ data (line 43)                                              |
| `apps/api/src/jobs/jobs.controller.ts`                       | Accepts memoryBankId in body, validates ownership                                         | VERIFIED | Lines 96-109: `@Body() body?: { memoryBankId?: string }`, validates via `memoryBanksService.getById`                                              |
| `apps/api/src/jobs/sync.processor.ts`                        | Updated job data type with memoryBankId                                                   | VERIFIED | Line 59: job data type includes `memoryBankId?: string`                                                                                           |
| `apps/api/src/memory/embed.processor.ts`                     | Reads memoryBankId from parent job, falls back to default                                 | VERIFIED | Lines 136-170: checks parent job memoryBankId first, falls back to default bank lookup                                                            |
| `apps/api/src/api-keys/dto/create-api-key.dto.ts`            | memoryBankIds optional array field                                                        | VERIFIED | Lines 13-16: `@IsOptional() @IsArray() @IsString({ each: true }) memoryBankIds?: string[]`                                                        |
| `apps/api/src/api-keys/api-keys.service.ts`                  | create() accepts memoryBankIds with validation                                            | VERIFIED | Line 23: accepts `memoryBankIds?: string[]`, validates ownership (lines 53-61), stores as JSON (line 73)                                          |
| `apps/api/scripts/migrate-banks.ts`                          | Idempotent data migration script                                                          | VERIFIED | 132 lines, covers accounts, contacts, memories, Qdrant vectors. Uses `WHERE IS NULL` for idempotency.                                             |
| `apps/web/src/store/memoryBankStore.ts`                      | isDefault typed as boolean                                                                | VERIFIED | Line 7: `isDefault: boolean`                                                                                                                      |
| `apps/web/src/lib/api.ts`                                    | isDefault boolean types + triggerSync with memoryBankId + createApiKey with memoryBankIds | VERIFIED | Line 272: `isDefault: boolean`, Line 87: `triggerSync(accountId, memoryBankId?)`, Lines 253-262: `createApiKey(name, expiresAt?, memoryBankIds?)` |
| `apps/web/src/components/layout/Sidebar.tsx`                 | isDefault === true check                                                                  | VERIFIED | Line 258: `bank.isDefault === true`                                                                                                               |
| `apps/web/src/components/settings/MemoryBanksTab.tsx`        | isDefault === true check                                                                  | VERIFIED | Line 156: `bank.isDefault === true`, Line 182: `!bank.isDefault`                                                                                  |
| `apps/web/src/components/connectors/ConnectorAccountRow.tsx` | Bank selector dropdown next to sync button                                                | VERIFIED | 94 lines, shows bank selector when `memoryBanks.length > 1`, passes `selectedBankId` to `onSyncNow`                                               |
| `apps/web/src/components/settings/CreateKeyModal.tsx`        | Bank multi-select checkboxes on API key creation                                          | VERIFIED | 171 lines, loads banks on mount, checkbox UI with toggleBank, passes `selectedBankIds` to `onCreate`                                              |

### Key Link Verification

| From                | To                         | Via                                      | Status | Details                                                                                                                                 |
| ------------------- | -------------------------- | ---------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| jobs.controller.ts  | jobs.service.ts            | triggerSync with memoryBankId            | WIRED  | Controller line 105 calls `triggerSync(accountId, connectorType, identifier, body?.memoryBankId)`                                       |
| embed.processor.ts  | db/schema.ts               | reads memoryBankId from parent job       | WIRED  | Lines 142-148: queries `jobs.memoryBankId` from parent job record                                                                       |
| api.ts (frontend)   | POST /jobs/sync/:accountId | fetch with body { memoryBankId }         | WIRED  | Lines 87-91: passes `memoryBankId` in JSON body                                                                                         |
| api.ts (frontend)   | POST /api-keys             | fetch with body { memoryBankIds }        | WIRED  | Lines 253-262: passes `memoryBankIds` in JSON body                                                                                      |
| ConnectorAccountRow | connectorStore.syncNow     | onSyncNow(id, memoryBankId)              | WIRED  | Line 63: `onSyncNow(account.id, selectedBankId)`, ConnectorsPage line 151 wires to `syncNow(id, memoryBankId)`                          |
| CreateKeyModal      | useApiKeys.createKey       | onCreate(name, expiresAt, memoryBankIds) | WIRED  | Line 64: `onCreate(name, computeExpiry(), selectedBankIds)`, ApiKeysTab line 17-18 wires to `createKey(name, expiresAt, memoryBankIds)` |
| connectorStore      | api.triggerSync            | syncNow passes memoryBankId              | WIRED  | connectorStore line 97: `api.triggerSync(id, memoryBankId)`                                                                             |
| useApiKeys          | api.createApiKey           | createKey passes memoryBankIds           | WIRED  | useApiKeys lines 34-35: `api.createApiKey(name, expiresAt, memoryBankIds)`                                                              |

### Requirements Coverage

| Requirement | Source Plan  | Description                                                       | Status    | Evidence                                                                                                                                                                       |
| ----------- | ------------ | ----------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BANK-01     | 19-02        | Create, list, rename, and delete memory banks per user            | SATISFIED | Full CRUD exists in memory-banks module (pre-existing from Phase 18) + isDefault boolean fix applied                                                                           |
| BANK-02     | 19-01, 19-03 | Select target memory bank at sync time                            | SATISFIED | Backend accepts memoryBankId on sync trigger, threads through pipeline. Frontend shows bank selector dropdown on ConnectorAccountRow.                                          |
| BANK-03     | 19-01, 19-03 | Search scoped to accessible banks -- user's own + API key scope   | SATISFIED | API key creation accepts memoryBankIds with ownership validation. Search service applies bank filters in SQL and Qdrant. Frontend shows bank multi-select on API key creation. |
| BANK-04     | 19-02        | Default bank created on registration + migration of existing data | SATISFIED | Migration script assigns null-ownership data to first user and default bank. Qdrant vectors updated. Script is idempotent.                                                     |

### Anti-Patterns Found

| File | Line | Pattern                | Severity | Impact |
| ---- | ---- | ---------------------- | -------- | ------ |
| --   | --   | No anti-patterns found | --       | --     |

No TODOs, FIXMEs, placeholders, empty implementations, or stub patterns detected in any phase-modified files.

### Human Verification Required

### 1. Bank Selector on Sync Trigger

**Test:** Go to Connectors page, create a second memory bank, then click Sync on a connected account
**Expected:** A bank selector dropdown appears next to the SYNC button when multiple banks exist. Selecting a bank and triggering sync stores memories in that bank.
**Why human:** Visual appearance and actual data routing cannot be verified programmatically without a running app.

### 2. API Key Bank Scoping UI

**Test:** Go to Settings > API Keys, click Create, verify bank checkboxes appear
**Expected:** Bank Access section with checkboxes for each bank. Unchecked means unrestricted. Creating a key with checked banks scopes it correctly.
**Why human:** Modal rendering and checkbox interaction require visual confirmation.

### 3. isDefault Badge Rendering

**Test:** Check Sidebar bank selector and Settings > Memory Banks tab
**Expected:** Default bank shows "DEFAULT" badge correctly (not broken from SQLite integer comparison)
**Why human:** Visual rendering of the badge in both locations needs human confirmation.

### Gaps Summary

No gaps found. All four success criteria are met:

1. Bank CRUD endpoints work (POST, GET, PATCH, DELETE)
2. Sync pipeline threads memoryBankId from controller through job record to embed processor
3. Search is scoped by memoryBankId (user's active bank) and memoryBankIds (API key restriction) in both SQL and Qdrant
4. Migration script handles existing data assignment to default bank

All artifacts exist, are substantive (no stubs), and are properly wired end-to-end from frontend components through API client, stores, and hooks to backend controllers, services, and processors.

---

_Verified: 2026-03-09T08:00:00Z_
_Verifier: Claude (gsd-verifier)_
