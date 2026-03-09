---
phase: 22-postgresql-dual-driver
plan: 02
subsystem: database
tags: [postgresql, drizzle, jsonb, tsvector, migration, testing]

requires:
  - phase: 22-postgresql-dual-driver/01
    provides: 'pgTable schema, NodePgDatabase, Pool, healthCheck, GIN indexes'
provides:
  - 'All services consume PostgreSQL-native types (JSONB, boolean, timestamp)'
  - 'Test infrastructure uses mock-based DbService (no SQLite dependency)'
  - 'Zero references to better-sqlite3 or SQLite patterns in apps/api/src/'
affects: [testing, memory, contacts, user-auth]

tech-stack:
  added: []
  patterns:
    - 'JSONB columns read directly as objects (no JSON.parse)'
    - 'Boolean columns use true/false (not 0/1)'
    - 'Timestamp columns use Date objects (not ISO strings)'
    - 'Mock-based test helper via createMockDbService()'
    - 'PostgreSQL unique constraint detection via error code 23505'

key-files:
  created: []
  modified:
    - apps/api/src/__tests__/helpers/db.helper.ts
    - apps/api/src/__tests__/health.controller.spec.ts
    - apps/api/src/memory/memory.service.ts
    - apps/api/src/memory/enrich.service.ts
    - apps/api/src/memory/decay.processor.ts
    - apps/api/src/contacts/contacts.service.ts
    - apps/api/src/me/me.service.ts
    - apps/api/src/user-auth/user-auth.service.ts
    - apps/api/src/user-auth/users.service.ts
    - apps/api/src/agent/agent.service.ts

key-decisions:
  - 'Mock-based test helper instead of in-memory SQLite -- integration tests deferred to TEST_DATABASE_URL infrastructure'
  - 'users.service accepts string|Date for expiresAt -- backward-compatible with existing callers'
  - 'SQLite SQLITE_CONSTRAINT_UNIQUE replaced with PostgreSQL error code 23505'
  - 'JSONB columns accessed directly without JSON.parse -- typeof guards removed'

patterns-established:
  - 'JSONB read pattern: use column value directly, no JSON.parse needed'
  - 'JSONB write pattern: pass objects directly, no JSON.stringify needed'
  - 'Boolean column pattern: use true/false, not 0/1'
  - 'Timestamp write pattern: pass new Date(), not new Date().toISOString()'

requirements-completed: [DB-04]

duration: 16min
completed: 2026-03-09
---

# Phase 22 Plan 02: Service Layer PostgreSQL Migration Summary

**Eliminated all SQLite patterns from service layer: JSONB direct access, boolean true/false, Date timestamps, mock-based test infrastructure**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-09T01:28:03Z
- **Completed:** 2026-03-09T01:44:15Z
- **Tasks:** 2
- **Files modified:** 26

## Accomplishments

- Zero references to better-sqlite3, sqlite-core, BetterSQLite3, or .sqlite anywhere in apps/api/src/
- All JSON.parse calls on JSONB columns (factuality, weights, avatars) removed across 5 services
- Test infrastructure rewritten from in-memory SQLite to mock-based approach
- Boolean 0/1 patterns replaced with true/false in all test and service files
- Timestamps use Date objects instead of ISO strings for Drizzle timestamp columns
- Old SQLite migration scripts deleted (backfill-source-types.ts, backfill-entity-types.ts)

## Task Commits

1. **Task 1: FTS rewrite + sqlite direct usage removal** - no commit needed (already completed by Plan 01)
2. **Task 2: JSONB/boolean/timestamp fixes + test infrastructure + cleanup** - `ce4b344` (feat)

**Plan metadata:** pending

## Files Created/Modified

- `apps/api/src/__tests__/helpers/db.helper.ts` - Rewritten from better-sqlite3 to mock-based createMockDbService()
- `apps/api/src/__tests__/health.controller.spec.ts` - Updated mock from sqlite.prepare to healthCheck, assertions use postgres key
- `apps/api/src/memory/memory.service.ts` - Removed JSON.parse on factuality/weights JSONB columns, updated comment
- `apps/api/src/memory/enrich.service.ts` - Removed JSON.parse on factuality JSONB column
- `apps/api/src/memory/decay.processor.ts` - Removed JSON.parse on weights JSONB column
- `apps/api/src/contacts/contacts.service.ts` - Removed JSON.parse/JSON.stringify on avatars JSONB column
- `apps/api/src/me/me.service.ts` - Removed JSON.parse on avatars JSONB column
- `apps/api/src/agent/agent.service.ts` - Changed cutoff from toISOString() to Date object
- `apps/api/src/user-auth/user-auth.service.ts` - Pass Date objects for expiresAt, fix PG constraint detection
- `apps/api/src/user-auth/users.service.ts` - Accept string|Date for expiresAt parameters
- `apps/api/src/memory/memory.controller.ts` - Updated comment from SQLite to Postgres
- `apps/api/src/memory/__tests__/decay.test.ts` - Boolean true/false, Date objects, JSONB weights
- `apps/api/src/memory/__tests__/scoring.test.ts` - Boolean true/false
- `apps/api/src/memory/__tests__/embed.processor.test.ts` - Mock-based DB approach
- `apps/api/src/memory/__tests__/enrich.processor.test.ts` - Mock-based DB approach
- `apps/api/src/memory/__tests__/memory.service.test.ts` - Mock-based DB approach
- `apps/api/src/api-keys/__tests__/api-keys.service.test.ts` - Removed better-sqlite3
- `apps/api/src/db/__tests__/db.service.test.ts` - Mock-based test
- `apps/api/src/accounts/__tests__/accounts.service.test.ts` - Mock-based test
- `apps/api/src/logs/__tests__/logs.service.test.ts` - Mock-based test
- `apps/api/src/jobs/__tests__/jobs.service.test.ts` - Mock-based test
- `apps/api/src/contacts/__tests__/contacts.service.test.ts` - Kept pure function tests, deferred DB tests
- `apps/api/src/user-auth/__tests__/user-auth.service.test.ts` - Boolean false for onboarded
- `apps/api/src/user-auth/__tests__/password-reset.test.ts` - Expect Date for expiresAt
- `apps/api/src/migrations/backfill-source-types.ts` - Deleted
- `apps/api/src/migrations/backfill-entity-types.ts` - Deleted

## Decisions Made

- **Mock-based test helper:** Chose Option A (mock factory) over Option B (real Postgres) since no TEST_DATABASE_URL infrastructure exists yet. Integration tests that need real queries are deferred.
- **string|Date for timestamps:** Made users.service.ts accept both types for backward compatibility with any callers still passing strings.
- **PostgreSQL constraint detection:** Added error code 23505 check alongside existing UNIQUE constraint message check for cross-DB compatibility during transition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SQLite unique constraint detection for PostgreSQL**

- **Found during:** Task 2 (JSONB/boolean/timestamp fixes)
- **Issue:** user-auth.service.ts checked for `SQLITE_CONSTRAINT_UNIQUE` error code which doesn't exist in PostgreSQL
- **Fix:** Added PostgreSQL error code `23505` and `err.constraint` check
- **Files modified:** apps/api/src/user-auth/user-auth.service.ts
- **Verification:** TypeScript compiles, no SQLite references remain
- **Committed in:** ce4b344

**2. [Rule 3 - Blocking] Fixed ESLint errors in test files**

- **Found during:** Task 2 (test infrastructure rewrite)
- **Issue:** Unused `rawEventRow` variable and `Function` type in test mocks caused lint-staged hook failure
- **Fix:** Removed unused variable, replaced `Function` with explicit function type
- **Files modified:** apps/api/src/memory/**tests**/enrich.processor.test.ts, apps/api/src/memory/**tests**/memory.service.test.ts
- **Verification:** ESLint passes with 0 errors
- **Committed in:** ce4b344

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness and commit success. No scope creep.

## Issues Encountered

- Task 1 was already completed by Plan 01 -- FTS tsvector, Postgres health probe, and Drizzle ORM in memory-banks were all in place. No commit needed.
- 11 pre-existing test failures (auth.service, jobs.controller, nlq-parser) are unrelated to this plan's changes and were not fixed per scope boundary rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All services, controllers, processors, and tests are PostgreSQL-compatible
- TypeScript compilation passes cleanly
- Unit tests pass (226 passing, 11 pre-existing failures unrelated to this plan)
- The codebase has zero references to SQLite or better-sqlite3 in apps/api/src/
- Integration tests need TEST_DATABASE_URL infrastructure (deferred item)

---

## Self-Check: PASSED

All key files verified present. Deleted files confirmed removed. Commit ce4b344 confirmed in git log.

---

_Phase: 22-postgresql-dual-driver_
_Completed: 2026-03-09_
