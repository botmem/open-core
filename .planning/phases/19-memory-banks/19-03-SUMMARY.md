---
phase: 19-memory-banks
plan: 03
subsystem: ui
tags: [react, zustand, memory-banks, neobrutalism]

requires:
  - phase: 19-memory-banks-01
    provides: Backend memory bank endpoints (sync with bankId, API key bank scoping)
  - phase: 19-memory-banks-02
    provides: Memory bank store, sidebar bank selector, settings tab

provides:
  - Bank selector dropdown on connector sync trigger
  - Bank multi-select checkboxes on API key creation
  - Updated API client passing memoryBankId/memoryBankIds to backend

affects: []

tech-stack:
  added: []
  patterns:
    - Bank selector appears only when multiple banks exist (single bank auto-selected)
    - Unchecked bank checkboxes means unrestricted access

key-files:
  created: []
  modified:
    - apps/web/src/lib/api.ts
    - apps/web/src/store/connectorStore.ts
    - apps/web/src/hooks/useApiKeys.ts
    - apps/web/src/components/connectors/ConnectorAccountRow.tsx
    - apps/web/src/pages/ConnectorsPage.tsx
    - apps/web/src/components/settings/CreateKeyModal.tsx
    - apps/web/src/components/settings/ApiKeysTab.tsx

key-decisions:
  - 'Bank selector hidden when only one bank exists (no UI clutter for single-bank users)'
  - 'Bank dropdown defaults to active sidebar bank or default bank'
  - 'Unchecked bank checkboxes on API key creation means unrestricted access to all banks'

patterns-established:
  - 'Bank-aware UI: components read from memoryBankStore for bank selection'

requirements-completed: [BANK-02, BANK-03]

duration: 2min
completed: 2026-03-09
---

# Phase 19 Plan 03: Frontend Bank Selection UI Summary

**Bank selector dropdown on sync triggers and bank multi-select checkboxes on API key creation, wired through API client and stores**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T07:13:05Z
- **Completed:** 2026-03-09T07:16:00Z
- **Tasks:** 3 (2 auto + 1 auto-approved checkpoint)
- **Files modified:** 7

## Accomplishments

- API client (`api.ts`) now passes `memoryBankId` on sync and `memoryBankIds` on API key creation
- ConnectorAccountRow shows bank dropdown next to SYNC button when multiple banks exist
- CreateKeyModal includes "Bank Access" checkboxes section for scoping API keys to specific banks
- All stores and hooks updated to thread bank parameters through

## Task Commits

Each task was committed atomically:

1. **Task 1: Update API client and stores** - `c6261e3` (feat)
2. **Task 2: Add bank selector on sync and API key creation** - `75e830f` (feat)
3. **Task 3: Verify complete memory banks feature** - Auto-approved (checkpoint)

## Files Created/Modified

- `apps/web/src/lib/api.ts` - triggerSync accepts memoryBankId, createApiKey accepts memoryBankIds
- `apps/web/src/store/connectorStore.ts` - syncNow passes memoryBankId through
- `apps/web/src/hooks/useApiKeys.ts` - createKey passes memoryBankIds through
- `apps/web/src/components/connectors/ConnectorAccountRow.tsx` - Bank selector dropdown next to SYNC button
- `apps/web/src/pages/ConnectorsPage.tsx` - Updated onSyncNow prop to pass memoryBankId
- `apps/web/src/components/settings/CreateKeyModal.tsx` - Bank access multi-select checkboxes
- `apps/web/src/components/settings/ApiKeysTab.tsx` - handleCreate passes memoryBankIds

## Decisions Made

- Bank selector hidden when only one bank exists -- avoids unnecessary UI for single-bank users
- Bank dropdown defaults to active sidebar bank or default bank
- Unchecked bank checkboxes on API key creation means unrestricted access to all banks

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Memory banks feature is complete across backend (Plan 01), data layer (Plan 02), and frontend (Plan 03)
- Ready for end-to-end verification by user

---

_Phase: 19-memory-banks_
_Completed: 2026-03-09_
