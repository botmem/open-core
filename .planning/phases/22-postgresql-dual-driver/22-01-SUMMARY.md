---
phase: 22-postgresql-dual-driver
plan: 01
subsystem: database
tags: [postgresql, drizzle, pg-core, docker, pgTable, jsonb, timestamptz]

# Dependency graph
requires: []
provides:
  - PostgreSQL pgTable schema for all 16 tables with native types
  - DbService with pg Pool and NodePgDatabase
  - ConfigService DATABASE_URL validation (fail-fast)
  - Docker Compose postgres:17-alpine service
affects: [22-02, memory, accounts, jobs, connectors, contacts, auth]

# Tech tracking
tech-stack:
  added: [pg, '@types/pg']
  removed: [better-sqlite3, '@types/better-sqlite3']
  patterns:
    [
      pgTable schema definitions,
      Pool-based async DB init,
      GIN full-text search indexes,
      pg_trgm trigram indexes,
    ]

key-files:
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/db/db.service.ts
    - apps/api/src/config/config.service.ts
    - apps/api/src/agent/agent.service.ts
    - docker-compose.yml
    - .env.example

key-decisions:
  - 'Encrypted columns stay as TEXT (authContext, credentials, memory text/entities/claims/metadata) -- ciphertext is opaque strings'
  - 'JSONB for structured data only (factuality, weights, avatars, contacts.metadata)'
  - 'Pool max=20, idle timeout 30s, connect timeout 5s'
  - 'GIN indexes replace SQLite FTS5 for full-text search'
  - 'All SQLite migration functions removed -- fresh Postgres DB, no legacy data migration'
  - 'DATABASE_URL required at startup (fail-fast OnModuleInit pattern)'

patterns-established:
  - 'pgTable with index/uniqueIndex as third argument for Drizzle Postgres schema'
  - 'Async onModuleInit + onModuleDestroy for database lifecycle'
  - 'healthCheck() pattern: acquire client, SELECT 1, release'

requirements-completed: [DB-01, DB-02, DB-03]

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 22 Plan 01: PostgreSQL Database Layer Summary

**Full SQLite-to-PostgreSQL migration at schema, service, and infrastructure layers with pgTable, pg Pool, and Docker Compose**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T01:21:53Z
- **Completed:** 2026-03-09T01:24:29Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Rewrote all 16 tables from sqliteTable to pgTable with native Postgres types (boolean, timestamptz, jsonb, doublePrecision)
- Replaced better-sqlite3 DbService with async pg Pool + NodePgDatabase, including healthCheck and graceful shutdown
- Added postgres:17-alpine to Docker Compose with health check and persistent volume
- ConfigService validates DATABASE_URL at startup (fail-fast)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite schema.ts to pgTable + update ConfigService** - `92817d7` (feat)
2. **Task 2: Rewrite DbService to pg Pool** - `fc5f8fa` (feat)
3. **Task 3: Docker Compose + .env.example + npm deps** - `39dd805` (chore)

## Files Created/Modified

- `apps/api/src/db/schema.ts` - All 16 pgTable definitions with native Postgres types, indexes
- `apps/api/src/db/db.service.ts` - pg Pool, NodePgDatabase, async createTables with PostgreSQL DDL
- `apps/api/src/config/config.service.ts` - databaseUrl getter, OnModuleInit validation
- `apps/api/src/agent/agent.service.ts` - Fixed Date type usage (was string from SQLite text timestamps)
- `docker-compose.yml` - Added postgres:17-alpine service
- `.env.example` - DATABASE_URL replaces DB_PATH

## Decisions Made

- Encrypted columns stay TEXT (ciphertext is opaque strings, not structured data)
- JSONB only for structured data: factuality, weights, avatars, contacts metadata
- Pool settings: max=20, idle timeout 30s, connect timeout 5s
- GIN indexes with pg_trgm replace SQLite FTS5 virtual tables
- All SQLite migration functions removed (fresh Postgres DB per data policy)
- DATABASE_URL required at startup with clear error message

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Date type mismatches in agent.service.ts**

- **Found during:** Task 1 (schema rewrite)
- **Issue:** Schema changed timestamps from text (string) to timestamp (Date). agent.service.ts used string methods (.slice, .localeCompare) and had string type annotations for dateRange.
- **Fix:** Changed dateRange type to Date, used .toISOString().slice() and .getTime() comparison
- **Files modified:** apps/api/src/agent/agent.service.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** 92817d7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for type correctness after schema migration. No scope creep.

## Issues Encountered

None

## User Setup Required

None - Docker Compose postgres service starts automatically with `docker compose up -d`.

## Next Phase Readiness

- Database layer fully migrated to PostgreSQL
- Ready for Plan 22-02 (service layer adaptations to handle Date objects and JSONB types)
- All consumers of schema types may need timestamp string-to-Date adjustments (agent.service.ts fixed here, others in 22-02)

## Self-Check: PASSED

All 6 modified files verified on disk. All 3 task commits verified in git log (92817d7, fc5f8fa, 39dd805).

---

_Phase: 22-postgresql-dual-driver_
_Completed: 2026-03-09_
