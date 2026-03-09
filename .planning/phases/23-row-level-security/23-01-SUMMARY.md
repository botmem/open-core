---
phase: 23-row-level-security
plan: 01
subsystem: database
tags: [postgres, rls, row-level-security, security, multi-tenancy]

# Dependency graph
requires:
  - phase: 22-postgres-migration
    provides: PostgreSQL schema with all user-owned tables
provides:
  - PostgreSQL RLS enabled on 13 user-owned tables with 4 policies each (SELECT/INSERT/UPDATE/DELETE)
  - Idempotent createRlsPolicies() in DbService called at startup
  - DB-level user isolation via current_setting('app.current_user_id', true)
affects: [24-firebase-auth, 35-fixture-capture, pipeline-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RLS policies use current_setting('app.current_user_id', true) — NULL-safe, no error if unset"
    - 'FORCE ROW LEVEL SECURITY ensures table owners also obey RLS'
    - 'Idempotent policy creation: DROP POLICY IF EXISTS before every CREATE POLICY'
    - 'Indirect tables use EXISTS subquery to walk FK chain back to accounts.user_id'

key-files:
  created: []
  modified:
    - apps/api/src/db/db.service.ts

key-decisions:
  - "RLS policies use NULL-safe current_setting('app.current_user_id', true) — returns NULL not ERROR if session var unset, preventing startup failures"
  - 'FORCE ROW LEVEL SECURITY added to every table so the table owner (Postgres role) also obeys RLS in production'
  - 'users, settings, connector_credentials excluded from RLS — users needed for auth lookups, settings and connector_credentials are global not per-user'
  - 'Two-hop policies for memory_links/memory_contacts use nested EXISTS subqueries (memories→accounts→user_id)'
  - 'createRlsPolicies() runs after validateSchema() in onModuleInit() — idempotent on every startup'

patterns-established:
  - 'RLS policy naming: rls_{table}_{operation} (e.g. rls_accounts_select)'
  - "Direct user_id: USING (user_id = current_setting('app.current_user_id', true))"
  - 'Via accounts: USING (EXISTS (SELECT 1 FROM accounts a WHERE a.id = {table}.account_id AND a.user_id = current_setting(...)))'
  - 'Two-hop: nested EXISTS walking the FK chain'

requirements-completed: [DB-05]

# Metrics
duration: 2min
completed: 2026-03-09
---

# Phase 23 Plan 01: Row-Level Security Summary

**PostgreSQL RLS enabled on all 13 user-owned tables with 52 idempotent policies using current_setting('app.current_user_id', true) for database-level user isolation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T09:03:12Z
- **Completed:** 2026-03-09T09:05:10Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `createRlsPolicies()` private method to `DbService` called from `onModuleInit()` after schema validation
- Enabled RLS + FORCE RLS on 13 user-owned tables: accounts, contacts, memory_banks, api_keys, refresh_tokens, password_resets, jobs, raw_events, memories, memory_links, memory_contacts, contact_identifiers, merge_dismissals
- Created 52 policies (4 per table: SELECT/INSERT/UPDATE/DELETE) using the `current_setting('app.current_user_id', true)` session variable
- Verified API restarted successfully with no PostgreSQL errors — all 52 policies confirmed active in `pg_policies`
- Excluded tables correctly: users (rowsecurity=f), settings (rowsecurity=f), connector_credentials (rowsecurity=f)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add createRlsPolicies() to DbService** - `4f26676` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `apps/api/src/db/db.service.ts` - Added `createRlsPolicies()` method (179 lines of SQL) and updated `onModuleInit()` call sequence

## Decisions Made

- RLS policies use `current_setting('app.current_user_id', true)` — the `true` second argument returns NULL instead of ERROR if the session variable is unset, preventing errors during startup before any user session is active
- `FORCE ROW LEVEL SECURITY` added alongside `ENABLE ROW LEVEL SECURITY` so the table owner role (Postgres superuser aside) also obeys policies in production deployments
- Policy creation is idempotent: every `CREATE POLICY` is preceded by `DROP POLICY IF EXISTS` — safe to run on every API startup
- Indirect tables use EXISTS subqueries walking FK chains back to accounts.user_id (two-hop for memory_links/memory_contacts via the memories table)

## Deviations from Plan

None — plan executed exactly as written. The plan's `createTables()` / `dropLegacyTables()` pattern was adapted to fit the actual `migrate()` + `validateSchema()` sequence in db.service.ts, but this is a labeling difference not a behavioral deviation.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. RLS policies are applied automatically on every API startup via `onModuleInit()`.

## Next Phase Readiness

- PostgreSQL RLS is structurally enforced at the database layer — DB-05 requirement satisfied
- Application code must set `app.current_user_id` session variable via `SET LOCAL app.current_user_id = $userId` on each request to allow row access — this is the responsibility of Phase 23-02 (middleware) or the auth guard layer
- Phase 24 (Firebase auth) and Phase 35 (fixture capture) are unblocked by this plan completing

---

_Phase: 23-row-level-security_
_Completed: 2026-03-09_
