---
phase: 05-sdk-feature-enablement
plan: 01
subsystem: analytics
tags: [posthog, session-replay, heatmaps, error-tracking, nestjs-filter]

requires:
  - phase: 04-posthog-activation
    provides: PostHog SDK init (posthog-js + posthog-node), AnalyticsService, AnalyticsModule
provides:
  - Session replay with input masking and network header redaction
  - Autocapture and heatmap data generation
  - Frontend JS exception capture
  - Backend 5xx exception capture via PostHogExceptionFilter
affects: [06-dashboard-configuration]

tech-stack:
  added: []
  patterns: [NestJS global exception filter extending BaseExceptionFilter, PostHog maskCapturedNetworkRequestFn for header redaction]

key-files:
  created:
    - apps/api/src/analytics/posthog-exception.filter.ts
  modified:
    - apps/web/src/lib/posthog.ts
    - apps/api/src/main.ts

key-decisions:
  - "Used maskCapturedNetworkRequestFn (not deprecated maskNetworkRequestFn) for network header redaction"
  - "Only capture 5xx errors in backend filter to avoid noise from 404s and validation errors"
  - "Backend exception filter extends BaseExceptionFilter to preserve default NestJS error responses"

patterns-established:
  - "PostHogExceptionFilter: global NestJS filter for server-side error tracking"
  - "Network header redaction pattern using maskCapturedNetworkRequestFn"

requirements-completed: [REPLAY-01, REPLAY-03, HEAT-01, HEAT-03, ERR-01, ERR-03, WEB-03]

duration: 3min
completed: 2026-03-08
---

# Phase 5 Plan 1: SDK Feature Enablement Summary

**PostHog session replay with input masking, autocapture/heatmaps, JS exception capture, and NestJS backend exception filter for 5xx errors**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-07T22:07:57Z
- **Completed:** 2026-03-07T22:11:09Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Enabled session replay with maskAllInputs and network header redaction (authorization/cookie)
- Enabled autocapture, heatmaps, exception capture, and pageleave tracking in posthog-js
- Created PostHogExceptionFilter that sends 5xx errors to PostHog with stack traces
- Wired exception filter globally in NestJS main.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Enable session replay, autocapture, heatmaps, error tracking** - `2c42ad4` (feat)
   - Fix: `f20ebfc` (corrected session recording config to match SDK types)
2. **Task 2: Create NestJS global exception filter** - `2120709` (feat)

## Files Created/Modified
- `apps/web/src/lib/posthog.ts` - Added session_recording, autocapture, heatmaps, capture_exceptions, capture_pageleave, and network header redaction
- `apps/api/src/analytics/posthog-exception.filter.ts` - NestJS global exception filter capturing 5xx errors as $exception events
- `apps/api/src/main.ts` - Wired PostHogExceptionFilter via app.useGlobalFilters()

## Decisions Made
- Used `maskCapturedNetworkRequestFn` inside `session_recording` options (correct PostHog SDK v1.359 API) instead of deprecated/invalid alternatives
- Only capture 5xx errors in backend filter -- 4xx errors (404, validation) are normal client behavior, not exceptions
- Exception filter extends `BaseExceptionFilter` to preserve default NestJS HTTP response handling

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PostHog session recording config to match SDK types**
- **Found during:** Task 1 verification (frontend build)
- **Issue:** Plan specified `networkPayloadCapture` and `recordHeaders` inside `session_recording`, and `session_recording_network_payload_capture_config` at top level -- none of these match the posthog-js v1.359 TypeScript types
- **Fix:** Removed invalid properties, used `maskCapturedNetworkRequestFn` inside `session_recording` options (the correct API)
- **Files modified:** apps/web/src/lib/posthog.ts
- **Verification:** `pnpm --filter web build` passes
- **Committed in:** f20ebfc

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type-safe config matching actual PostHog SDK API. No scope creep.

## Issues Encountered
None beyond the type fix documented above.

## User Setup Required
None - no external service configuration required. PostHog SDK features activate automatically when the API key is configured.

## Next Phase Readiness
- All SDK features enabled, ready for Phase 6 dashboard configuration
- Session replays, heatmaps, and error tracking will begin generating data immediately

---
*Phase: 05-sdk-feature-enablement*
*Completed: 2026-03-08*
