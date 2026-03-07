---
phase: 7
plan: 2
title: "Fix all failing tests"
subsystem: test-infrastructure
tags: [testing, vitest, mocking, test-fixes]
dependency-graph:
  requires: [07-01]
  provides: [green-test-suite]
  affects: [all-packages]
tech-stack:
  added: []
  patterns: [loadBuiltin-mock, contact-event-filtering, passWithNoTests]
key-files:
  created: []
  modified:
    - apps/api/src/__tests__/helpers/db.helper.ts
    - apps/api/src/accounts/__tests__/accounts.controller.test.ts
    - apps/api/src/auth/__tests__/auth.service.test.ts
    - apps/api/src/contacts/__tests__/contacts.service.test.ts
    - apps/api/src/db/__tests__/db.service.test.ts
    - apps/api/src/jobs/__tests__/jobs.controller.test.ts
    - apps/api/src/jobs/__tests__/sync.processor.test.ts
    - apps/api/src/logs/__tests__/logs.service.test.ts
    - apps/api/src/memory/__tests__/embed.processor.test.ts
    - apps/api/src/memory/__tests__/enrich.processor.test.ts
    - apps/api/src/memory/__tests__/memory.service.test.ts
    - apps/api/src/memory/__tests__/ollama.service.test.ts
    - apps/api/src/memory/__tests__/qdrant.service.test.ts
    - apps/api/src/memory/__tests__/resolveSlackContacts.test.ts
    - apps/api/src/plugins/__tests__/plugins.service.test.ts
    - apps/web/src/components/__tests__/JobTable.test.tsx
    - apps/web/src/hooks/__tests__/useMemories.test.ts
    - apps/web/src/store/__tests__/memoryStore.test.ts
    - packages/connectors/imessage/src/__tests__/imessage.test.ts
    - packages/connectors/photos-immich/src/__tests__/immich.test.ts
    - packages/connectors/slack/src/__tests__/slack.test.ts
    - packages/connectors/slack/src/__tests__/sync.test.ts
    - packages/connectors/whatsapp/src/__tests__/whatsapp.test.ts
    - packages/cli/vitest.config.ts
decisions:
  - "Only test files modified; no production code changes"
  - "Used createService helper for plugins tests to mock loadBuiltin"
  - "Added passWithNoTests to CLI config instead of creating stub test"
metrics:
  duration: ~25min
  completed: "2025-07-05"
  tasks: 5/5
  files-modified: 24
  tests-fixed: 77+
---

# Phase 7 Plan 2: Fix All Failing Tests Summary

Fixed all failing tests across the monorepo to achieve 0 test failures. Updated 24 test files to match current source code without modifying any production code.

## One-liner

Fixed 77+ failing tests across 24 files by updating mocks, assertions, and test helpers to match refactored source code (pipeline changes, new deps, API changes).

## Task Breakdown

### Task 1: Fix 7 core API test files

**Commit:** `a079d43`

Root cause: `db.helper.ts` was missing columns and tables added since tests were last updated.

- **db.helper.ts**: Added `stage` to logs, `cleaned_text` to raw_events, `pinned`/`recall_count` to memories, `entity_type` to contacts, entire `settings` table
- **accounts.controller.test.ts**: Added `findByTypeAndIdentifier` mock for dedup check
- **auth.service.test.ts**: Added AnalyticsService (6th constructor param), `findByTypeAndIdentifier`/`getById` to accounts mock, EventEmitter for QR connector mock, updated 11 constructor calls
- **jobs.controller.test.ts**: Added DbService + 5 BullMQ queue mocks (8 constructor params)
- **sync.processor.test.ts**: Rewrote with 11 deps, new connector methods (`resetSyncLimit`, `wrapSyncContext`, `isLimitReached`), fixed infinite loop test
- **contacts.service.test.ts**: Schema fixes cascaded from db.helper
- **logs.service.test.ts**: Schema fixes cascaded from db.helper (`stage` column)
- **db.service.test.ts**: Schema fixes cascaded from db.helper

### Task 2: Fix 6 memory module test files

**Commit:** `328c25b`

- **embed.processor.test.ts**: 12-dep constructor, added ConnectorsService with `embed()`, AccountsService, JobsService, SettingsService, PluginRegistry with `fireHook`. Changed embeddingStatus from 'done' to 'pending', vector size 1024 to 768
- **enrich.processor.test.ts**: Complete rewrite -- EnrichProcessor now delegates to EnrichService
- **memory.service.test.ts**: Added `rerank` to OllamaService, `getScorers`/`fireHook` to PluginRegistry, changed `results` to `response.items` (SearchResponse type)
- **ollama.service.test.ts**: `/api/generate` to `/api/chat` endpoint, `{ response }` to `{ message: { content } }`, added `retries=0` to prevent 18s timeout
- **qdrant.service.test.ts**: Added `optimizers_config` to createCollection assertion
- **resolveSlackContacts.test.ts**: Replaced with placeholder (function inlined into embed processor)

### Task 3: Fix 3 web test files

**Commit:** `6a0af1e`

- **JobTable.test.tsx**: `getByText` to `getAllByText` for connector names in both filter bar and rows
- **useMemories.test.ts**: Seeded store with sampleMemories (store starts empty)
- **memoryStore.test.ts**: Seeded with 3 sample memories, fixed query filter test (getFiltered doesn't filter by text -- search is server-side)

### Task 4: Fix 5 connector test files

**Commit:** `46c3e02`

- **imessage.test.ts**: Added `myIdentifier: ''` to auth.raw assertions
- **photos-immich/immich.test.ts**: `order` changed from 'asc' to 'desc'
- **slack/slack.test.ts**: Progress event includes `total` field
- **slack/sync.test.ts**: Added `auth.test` mock for selfId, filtered contact events from message assertions (syncSlack now emits contact events for workspace users)
- **whatsapp/whatsapp.test.ts**: `startQrAuth` mock must return Promise (source calls `.catch()`)

### Task 5: Full suite verification and final fixes

**Commit:** `3018ae8`

- **plugins.service.test.ts**: Mocked `loadBuiltin` to prevent WhatsApp connector warm session hanging during `loadAll()`
- **packages/cli/vitest.config.ts**: Added `passWithNoTests: true` (CLI has no test files yet)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed plugins.service.test.ts timeout**
- **Found during:** Task 5 (full suite verification)
- **Issue:** `loadAll()` imports WhatsApp connector which starts a warm session, hanging indefinitely in test context
- **Fix:** Mocked `loadBuiltin` private method in all tests that call `loadAll()`
- **Files modified:** `apps/api/src/plugins/__tests__/plugins.service.test.ts`
- **Commit:** `3018ae8`

**2. [Rule 3 - Blocking] Fixed CLI test runner exit code 1**
- **Found during:** Task 5 (full suite verification)
- **Issue:** CLI package has no test files, vitest exits with code 1 by default
- **Fix:** Added `passWithNoTests: true` to vitest config
- **Files modified:** `packages/cli/vitest.config.ts`
- **Commit:** `3018ae8`

## Final Verification

```
pnpm test
Tasks:    19 successful, 19 total
```

All 19 workspace packages pass tests with 0 failures.
