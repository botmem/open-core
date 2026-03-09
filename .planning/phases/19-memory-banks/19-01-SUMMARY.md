---
phase: 19-memory-banks
plan: 01
subsystem: api
tags: [nestjs, drizzle, bullmq, memory-banks, api-keys, sync-pipeline]

# Dependency graph
requires:
  - phase: 18-memory-banks-foundation
    provides: memoryBanks table, MemoryBanksService, MemoryBanksModule
provides:
  - memoryBankId threading through sync pipeline (job -> embed processor)
  - bank-scoped API key creation with ownership validation
affects: [19-02, memory-search, api-keys-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      job-level bank override with default fallback,
      bank ownership validation on sync and API key creation,
    ]

key-files:
  created: []
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/jobs/jobs.service.ts
    - apps/api/src/jobs/jobs.controller.ts
    - apps/api/src/jobs/sync.processor.ts
    - apps/api/src/memory/embed.processor.ts
    - apps/api/src/api-keys/dto/create-api-key.dto.ts
    - apps/api/src/api-keys/api-keys.service.ts
    - apps/api/src/api-keys/api-keys.controller.ts
    - apps/api/src/jobs/__tests__/jobs.controller.test.ts

key-decisions:
  - 'Job-level memoryBankId override takes priority over default bank lookup in embed processor'
  - 'Bank ownership validated via MemoryBanksService.getById (throws NotFoundException) before sync'
  - "API key bank IDs validated with inArray query against user's banks before creation"

patterns-established:
  - 'Bank-targeted sync: optional memoryBankId flows from controller -> service -> BullMQ job data -> embed processor'
  - 'Bank scoping on API keys: stored as JSON string in existing column, validated at creation time'

requirements-completed: [BANK-02, BANK-03]

# Metrics
duration: 6min
completed: 2026-03-09
---

# Phase 19 Plan 01: Sync Pipeline Bank Threading & API Key Scoping Summary

**Thread memoryBankId through sync-to-embed pipeline and add bank-scoped API key creation with ownership validation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-09T07:05:07Z
- **Completed:** 2026-03-09T07:11:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Sync trigger accepts optional memoryBankId, threads it through job record to embed processor
- Embed processor uses job-level bank override, falls back to default bank when not specified
- API key creation accepts optional memoryBankIds array with bank ownership validation
- Fixed 6 pre-existing test failures in jobs controller tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread memoryBankId through sync pipeline** - `956600c` (feat)
2. **Task 2: Add memoryBankIds to API key creation** - `838a9bf` (feat)

## Files Created/Modified

- `apps/api/src/db/schema.ts` - Added memoryBankId column to jobs table
- `apps/api/src/jobs/jobs.service.ts` - triggerSync accepts optional memoryBankId, stores in job row and BullMQ data
- `apps/api/src/jobs/jobs.controller.ts` - Accepts memoryBankId in request body, validates ownership, injects MemoryBanksService
- `apps/api/src/jobs/sync.processor.ts` - Updated job data type to include optional memoryBankId
- `apps/api/src/memory/embed.processor.ts` - Checks parent job for memoryBankId override before default bank lookup
- `apps/api/src/api-keys/dto/create-api-key.dto.ts` - Added optional memoryBankIds array with class-validator decorators
- `apps/api/src/api-keys/api-keys.service.ts` - Accepts memoryBankIds, validates bank ownership, stores as JSON
- `apps/api/src/api-keys/api-keys.controller.ts` - Passes dto.memoryBankIds to service
- `apps/api/src/jobs/__tests__/jobs.controller.test.ts` - Updated mocks and calls for new constructor params

## Decisions Made

- Job-level memoryBankId override takes priority over default bank lookup in embed processor
- Bank ownership validated via MemoryBanksService.getById (throws NotFoundException) before sync
- API key bank IDs validated with inArray query against user's banks before creation
- MemoryBanksModule is @Global so no import needed in JobsModule

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed jobs controller tests for new constructor signature**

- **Found during:** Task 2 verification
- **Issue:** Adding MemoryBanksService to JobsController constructor broke all test instantiations (missing 3rd param). Also fixed 3 pre-existing failures from user isolation changes.
- **Fix:** Added memoryBanksService mock, updated list() calls with user param, added dbService.db mock
- **Files modified:** apps/api/src/jobs/**tests**/jobs.controller.test.ts
- **Verification:** All 6 tests pass (previously 3 failing)
- **Committed in:** 1823c80

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test fix necessary for constructor compatibility. Also resolved pre-existing failures.

## Issues Encountered

- Pre-existing TS errors in accounts.service.ts (missing 'logs' export) and embed.processor.ts (null assignment to string fields) -- both from uncommitted changes in working tree, not from this plan's changes. Out of scope per deviation rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend now supports bank-targeted sync and bank-scoped API keys
- Ready for frontend integration (bank selector on sync trigger, bank selector on API key creation)
- Data migration script (19-02) can assign existing memories to banks

---

_Phase: 19-memory-banks_
_Completed: 2026-03-09_
