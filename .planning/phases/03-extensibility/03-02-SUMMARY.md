---
phase: 03-extensibility
plan: 02
subsystem: api
tags: [plugins, lifecycle-hooks, scorer, pipeline, extensibility]

requires:
  - phase: 03-01
    provides: PluginRegistry with fireHook, getScorers, registerLifecycle, registerScorer
provides:
  - Lifecycle hooks wired into all pipeline processors (afterIngest, afterEmbed, afterEnrich, afterSearch)
  - Scorer plugin integration in computeWeights with clamped bonus
  - Sample enricher plugin with manifest, handler, and comprehensive API documentation
affects: [memory-pipeline, search-ranking, plugins]

tech-stack:
  added: []
  patterns: [fire-and-forget hooks via void prefix, scorer bonus clamping +/-0.05]

key-files:
  created:
    - plugins/sample-enricher/manifest.json
    - plugins/sample-enricher/index.js
    - plugins/sample-enricher/README.md
    - apps/api/src/plugins/__tests__/sample-plugin.test.ts
  modified:
    - apps/api/src/memory/memory.processor.ts
    - apps/api/src/memory/embed.processor.ts
    - apps/api/src/memory/enrich.processor.ts
    - apps/api/src/memory/memory.service.ts

key-decisions:
  - "Fire-and-forget hooks via void prefix on all fireHook calls to avoid blocking pipeline"
  - "Scorer bonus averaged across plugins and clamped to +/-0.05 to prevent single plugin from dominating ranking"
  - "afterEnrich hook reads enriched memory from DB to include entities and factuality data"

patterns-established:
  - "void this.pluginRegistry.fireHook() pattern for non-blocking hook calls in pipeline hot path"
  - "Scorer integration after base score computation, before pinned floor check"

requirements-completed: [EXT-02, EXT-04]

duration: 5min
completed: 2026-03-07
---

# Phase 03 Plan 02: Pipeline Hook Wiring and Sample Plugin Summary

**Lifecycle hooks wired into all pipeline processors with fire-and-forget semantics, scorer plugin bonus integration in computeWeights, and sample-enricher plugin with full API documentation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-07T17:24:29Z
- **Completed:** 2026-03-07T17:29:30Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- All 4 lifecycle hooks (afterIngest, afterEmbed, afterEnrich, afterSearch) fire at correct pipeline stages in MemoryProcessor, EmbedProcessor, EnrichProcessor, and MemoryService
- Scorer plugins contribute a clamped +/-0.05 averaged bonus to computeWeights ranking formula
- Sample enricher plugin with valid manifest, working afterEnrich handler, and comprehensive README documenting the full plugin API
- 20 plugin tests passing (including 5 new sample-plugin tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire hooks into processors and scorer into computeWeights** - `cac20e6` (feat)
2. **Task 2: Create sample enricher plugin and plugin API documentation** - `ac93cc1` (feat)

## Files Created/Modified
- `apps/api/src/memory/memory.processor.ts` - Added PluginRegistry injection, afterIngest/afterEmbed/afterEnrich hooks
- `apps/api/src/memory/embed.processor.ts` - Added PluginRegistry injection, afterIngest/afterEmbed hooks
- `apps/api/src/memory/enrich.processor.ts` - Added PluginRegistry injection, afterEnrich hook
- `apps/api/src/memory/memory.service.ts` - Added PluginRegistry injection, afterSearch hook, scorer integration in computeWeights
- `plugins/sample-enricher/manifest.json` - Lifecycle plugin manifest subscribing to afterEnrich
- `plugins/sample-enricher/index.js` - Hook handler that logs entity information
- `plugins/sample-enricher/README.md` - Full plugin API documentation (lifecycle hooks, scorer interface, manifest schema)
- `apps/api/src/plugins/__tests__/sample-plugin.test.ts` - Tests for manifest structure, hook export, and graceful error handling

## Decisions Made
- Fire-and-forget hooks via `void` prefix on all fireHook calls to avoid blocking the pipeline hot path
- Scorer bonus averaged across plugins and clamped to +/-0.05 to prevent single plugin from dominating ranking
- afterEnrich hook in MemoryProcessor reads enriched memory from DB to include entities and factuality data in hook payload

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failures in memory tests (SQLite schema mismatch with `cleaned_text` column and Slack contact helper import issue) are unrelated to this plan's changes. These are out of scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Extensibility system is complete: plugin registry (03-01) + pipeline hook wiring + scorer integration + sample plugin (03-02)
- Developers can create lifecycle and scorer plugins by copying the sample-enricher directory
- All plugin types (lifecycle, scorer, connector) are documented in the sample plugin README

---
*Phase: 03-extensibility*
*Completed: 2026-03-07*
