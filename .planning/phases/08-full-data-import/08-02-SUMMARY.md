---
phase: 08-full-data-import
plan: 02
subsystem: api
tags: [entity-types, migration, search, cli, sqlite]

requires:
  - phase: 08-full-data-import
    provides: "Canonical entity type taxonomy defined in 08-01"
provides:
  - "Backfill migration script for entity type normalization"
  - "Type-filtered entity search API endpoint"
  - "GET /entities/types canonical type list endpoint"
  - "CLI --type flag for entity search"
affects: [09-temporal-reasoning, 10-entity-graph-api]

tech-stack:
  added: []
  patterns: ["standalone migration scripts using better-sqlite3 directly"]

key-files:
  created:
    - apps/api/src/migrations/backfill-entity-types.ts
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/memory/memory.service.ts
    - apps/api/src/memory/memory.controller.ts
    - packages/cli/src/client.ts
    - packages/cli/src/commands/entities.ts

key-decisions:
  - "Migration uses better-sqlite3 directly (not Drizzle) for one-time scripts"
  - "Contact entityType update is conditional on column existence for forward compatibility"

patterns-established:
  - "Standalone migrations: npx tsx apps/api/src/migrations/<name>.ts"

requirements-completed: [ENT-02, ENT-03]

duration: 2min
completed: 2026-03-08
---

# Phase 8 Plan 02: Entity Type Backfill & Filtered Search Summary

**Backfill migration normalizes all entities to 10-type canonical taxonomy; API and CLI support type-filtered entity search**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-08T03:05:19Z
- **Completed:** 2026-03-08T03:07:20Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created standalone migration script that removes time/amount/metric entities, strips to {type, value} only, and maps non-canonical types to 'other'
- Added type filter parameter to entity search API (comma-separated ?type= query param)
- Added GET /entities/types endpoint returning the 10 canonical types
- Added --type flag to CLI `botmem entities search` command

## Task Commits

Each task was committed atomically:

1. **Task 1: Create backfill migration script** - `8ccf994` (feat)
2. **Task 2: Add type-filtered entity search to API and CLI** - `b5a46c3` (feat)

## Files Created/Modified
- `apps/api/src/migrations/backfill-entity-types.ts` - One-time migration: normalizes entity types in memories and contacts
- `apps/api/src/db/schema.ts` - Updated entityType schema comment to canonical 10-type set
- `apps/api/src/memory/memory.service.ts` - Added getEntityTypes() and types filter to searchEntities()
- `apps/api/src/memory/memory.controller.ts` - Added /entities/types endpoint and ?type= param to /entities/search
- `packages/cli/src/client.ts` - Added type parameter to searchEntities API call
- `packages/cli/src/commands/entities.ts` - Added --type flag to entities search subcommand

## Decisions Made
- Migration uses better-sqlite3 directly (not Drizzle) since it's a one-time standalone script
- Contact entityType update is conditional on column existence -- the DB may not have the column if it was never migrated

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Contact entity_type column may not exist in DB**
- **Found during:** Task 1 (migration script execution)
- **Issue:** The `entity_type` column is defined in Drizzle schema but may not exist in the actual SQLite DB (SqliteError: no such column)
- **Fix:** Added conditional check using `pragma_table_info` before running the contact UPDATE
- **Files modified:** apps/api/src/migrations/backfill-entity-types.ts
- **Verification:** Migration runs successfully with "Migration complete" output
- **Committed in:** 8ccf994 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for migration to run on actual database. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Entity types are normalized, ready for temporal reasoning (Phase 9)
- Entity search with type filtering available for all downstream consumers

---
*Phase: 08-full-data-import*
*Completed: 2026-03-08*
