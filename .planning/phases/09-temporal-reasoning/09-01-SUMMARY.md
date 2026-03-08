---
phase: 09-temporal-reasoning
plan: 01
subsystem: api
tags: [chrono-node, nlq, temporal-parsing, pure-functions, tdd]

requires: []
provides:
  - "parseNlq() pure function for temporal extraction, intent classification, source type detection"
  - "NlqParsed interface for downstream search integration"
affects: [09-02, memory-search, query-pipeline]

tech-stack:
  added: [chrono-node]
  patterns: [pure-function-module, utc-date-operations, regex-intent-classification]

key-files:
  created:
    - apps/api/src/memory/nlq-parser.ts
    - apps/api/src/memory/__tests__/nlq-parser.test.ts
  modified:
    - apps/api/package.json

key-decisions:
  - "Custom 'last week' handler for Mon-Sun week boundaries instead of chrono-node default (7 days back)"
  - "Custom 'between X and Y' handler combining two chrono results since chrono parses them separately"
  - "UTC-only date operations throughout to avoid timezone drift in ISO output"
  - "Confidence gating: reject chrono parses where neither month nor day is certain"

patterns-established:
  - "Pure function modules with no NestJS/DB dependencies for testability"
  - "TDD: RED (failing tests) -> GREEN (implementation) -> verify"

requirements-completed: [NLQ-01, NLQ-03, PERF-01]

duration: 3min
completed: 2026-03-08
---

# Phase 9 Plan 01: NLQ Parser Summary

**Pure-function NLQ parser with chrono-node temporal extraction, regex intent classification, and source type detection -- 23 tests, sub-5ms performance**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-08T12:02:38Z
- **Completed:** 2026-03-08T12:06:09Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3

## Accomplishments
- chrono-node installed for deterministic temporal parsing (no LLM in search hot path)
- parseNlq() handles relative dates (last week, yesterday), named months (January), and ranges (between March and June)
- Intent classification routes queries to recall/browse/find with regex patterns
- Source type detection identifies photo/email/message queries
- Clean query strips temporal tokens and dangling prepositions
- All 23 tests pass with sub-5ms performance per call

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing NLQ parser tests** - `2b491c1` (test)
2. **Task 1 GREEN: NLQ parser implementation** - `a710ee9` (feat)

## Files Created/Modified
- `apps/api/src/memory/nlq-parser.ts` - Pure function NLQ parser (parseNlq, classifyIntent, detectSourceType, parseTemporal)
- `apps/api/src/memory/__tests__/nlq-parser.test.ts` - 23 unit tests covering temporal, intent, source type, clean query, performance
- `apps/api/package.json` - Added chrono-node dependency

## Decisions Made
- Custom "last week" handler computes proper Mon-Sun week boundaries (chrono-node returns a point 7 days back)
- Custom "between X and Y" handler combines two separate chrono parse results (chrono splits them into individual month references)
- All date operations use UTC methods (setUTCHours, Date.UTC) to avoid timezone-dependent ISO output
- Confidence gating rejects ambiguous chrono parses where neither month nor day is certain

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] chrono-node "last week" returns point, not Mon-Sun range**
- **Found during:** Task 1 GREEN (implementation)
- **Issue:** chrono.parse("last week") returns a single date 7 days before ref, not a Mon-Sun week range
- **Fix:** Added custom parseLastWeek() computing proper UTC Monday-Sunday boundaries
- **Files modified:** apps/api/src/memory/nlq-parser.ts
- **Verification:** Test passes: Feb 23 Mon to Mar 1 Sun for ref date Mar 8 Sun

**2. [Rule 1 - Bug] chrono-node "between X and Y" returns 2 separate results, not a range**
- **Found during:** Task 1 GREEN (implementation)
- **Issue:** chrono.parse("between March and June") returns two independent results, not a start-end range
- **Fix:** Added custom parseBetween() that detects the pattern and combines two chrono results
- **Files modified:** apps/api/src/memory/nlq-parser.ts
- **Verification:** Test passes: March 1 to June 30

**3. [Rule 1 - Bug] Timezone-dependent date output**
- **Found during:** Task 1 GREEN (implementation)
- **Issue:** Using setHours/getFullYear (local time) caused UTC ISO strings to be offset (e.g., Jan 1 local = Dec 31 UTC)
- **Fix:** Switched all date helpers to UTC equivalents (setUTCHours, Date.UTC, getUTCFullYear, etc.)
- **Files modified:** apps/api/src/memory/nlq-parser.ts
- **Verification:** All temporal tests pass with UTC ISO strings matching expected dates

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes necessary for correctness. chrono-node's API doesn't directly support the date range semantics the plan required, so custom wrappers were needed. No scope creep.

## Issues Encountered
None beyond the chrono-node API differences handled as deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- NLQ parser ready for integration into memory search pipeline (Plan 09-02)
- Exports parseNlq and NlqParsed for downstream consumption
- No async dependencies -- can be called synchronously in search hot path

---
*Phase: 09-temporal-reasoning*
*Completed: 2026-03-08*
