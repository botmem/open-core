---
phase: 03-extensibility
plan: 01
subsystem: plugins
tags: [nestjs, plugin-registry, lifecycle-hooks, scorer, extensibility]

# Dependency graph
requires: []
provides:
  - PluginRegistry class with lifecycle hook firing and scorer registration
  - Plugin type definitions (PluginManifest, HookName, LifecyclePlugin, ScorerPlugin)
  - Manifest-based plugin loading from plugins directory
  - Global PluginsModule exporting PluginRegistry for cross-module injection
affects: [03-02, 03-03, memory, enrich]

# Tech tracking
tech-stack:
  added: []
  patterns: [manifest-based-plugin-loading, hook-fire-with-frozen-data, promise-allsettled-error-isolation]

key-files:
  created:
    - apps/api/src/plugins/plugin.types.ts
    - apps/api/src/plugins/plugin-registry.ts
    - apps/api/src/plugins/__tests__/plugin-registry.test.ts
  modified:
    - apps/api/src/plugins/plugins.service.ts
    - apps/api/src/plugins/plugins.module.ts
    - apps/api/src/plugins/__tests__/plugins.service.test.ts

key-decisions:
  - "fireHook passes Object.freeze({...data}) to prevent plugins from mutating pipeline state"
  - "Promise.allSettled with try-catch wrapper for both sync and async handler error isolation"
  - "_importPlugin method is overridable for test mocking of dynamic imports"

patterns-established:
  - "Plugin manifest format: { name, version, type, hooks?, entryPoint?, description? }"
  - "Hook names: afterIngest, afterEmbed, afterEnrich, afterSearch"
  - "Error isolation: bad plugins log warnings, never crash the registry or other plugins"

requirements-completed: [EXT-01, EXT-03]

# Metrics
duration: 4min
completed: 2026-03-07
---

# Phase 3 Plan 1: Plugin Registry Summary

**PluginRegistry with lifecycle hook firing (frozen data, error isolation) and manifest-based loading of scorer/lifecycle plugins**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T17:18:54Z
- **Completed:** 2026-03-07T17:22:31Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- PluginRegistry class with registerLifecycle, registerScorer, fireHook (frozen data + Promise.allSettled), getScorers
- PluginsService extended with manifest.json scanning for lifecycle and scorer plugins
- PluginsModule is @Global() and exports PluginRegistry for injection into any module
- 15 unit tests covering registration, hook firing, error isolation, data immutability, manifest loading

## Task Commits

Each task was committed atomically:

1. **Task 1: Create plugin types and PluginRegistry class with tests** - `8be87bc` (feat)
2. **Task 2: Extend PluginsService and module for manifest-based loading** - `06d21bd` (feat)

_Note: TDD tasks had RED/GREEN phases within each commit._

## Files Created/Modified
- `apps/api/src/plugins/plugin.types.ts` - TypeScript interfaces for PluginManifest, HookName, LifecyclePlugin, ScorerPlugin
- `apps/api/src/plugins/plugin-registry.ts` - Injectable PluginRegistry class with hook firing and scorer management
- `apps/api/src/plugins/__tests__/plugin-registry.test.ts` - 8 unit tests for registry behavior
- `apps/api/src/plugins/plugins.service.ts` - Extended loadAll with manifest-based lifecycle/scorer plugin loading
- `apps/api/src/plugins/plugins.module.ts` - @Global() module exporting PluginRegistry
- `apps/api/src/plugins/__tests__/plugins.service.test.ts` - Extended with 5 manifest loading tests

## Decisions Made
- fireHook passes Object.freeze({...data}) so plugins cannot mutate pipeline state
- Promise.allSettled wrapped with try-catch to handle both synchronous throws and async rejections
- _importPlugin method is overridable for test mocking (avoids complex vi.mock of dynamic import())
- Connector-type manifests are skipped during manifest scan (already handled by ConnectorRegistry)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Synchronous throw not caught by Promise.resolve wrapper**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** A synchronous throw inside a hook handler was not caught by `Promise.resolve(handler())` because the throw happens before the Promise wraps it
- **Fix:** Added try-catch wrapper around handler invocation before Promise.resolve
- **Files modified:** apps/api/src/plugins/plugin-registry.ts
- **Verification:** Error isolation test passes - throwing handler does not prevent other handlers
- **Committed in:** 8be87bc (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for error isolation correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PluginRegistry is ready for injection into memory/enrich modules to fire hooks at pipeline stages
- Scorer plugins can be integrated into the ranking formula via getScorers()
- Next plans can wire hooks into SyncProcessor, EmbedProcessor, EnrichProcessor, and search

---
*Phase: 03-extensibility*
*Completed: 2026-03-07*
