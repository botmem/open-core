# Phase 3: Extensibility - Research

**Researched:** 2026-03-07
**Domain:** Plugin system architecture (filesystem-based, plain-object plugins for NestJS pipeline)
**Confidence:** HIGH

## Summary

Phase 3 extends the existing `PluginsService` stub to support three plugin types (connector, scorer, lifecycle) loaded from the `PLUGINS_DIR` directory. The existing codebase already has a working pattern: `ConnectorRegistry.loadFromDirectory()` reads subdirectories, checks for a marker in `package.json`, dynamically imports the entry point, and calls a factory. This phase generalizes that pattern to handle scorer and lifecycle plugins alongside connectors.

The core technical challenge is wiring lifecycle hooks into the existing pipeline processors (`MemoryProcessor`, `EmbedProcessor`, `EnrichProcessor`) and the `MemoryService.search()` method without adding latency. Hooks must be fire-and-forget (non-blocking), error-isolated (caught and logged), and support multiple subscribers per hook point.

**Primary recommendation:** Keep the plugin system simple -- a `PluginRegistry` class in the plugins module that loads all three types at startup from `manifest.json` files, stores hook handlers in a `Map<hookName, handler[]>`, and exposes a `fireHook(name, data)` method that calls all handlers with `Promise.allSettled`. Inject the registry into processors via NestJS DI.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Three plugin types: `connector`, `scorer`, `lifecycle`
- Connector plugins already work via `ConnectorRegistry.loadFromDirectory()` -- extend this pattern
- Scorer plugins provide a custom scoring function that can contribute to the final score
- Lifecycle hook plugins subscribe to memory events and receive the memory object
- Plugins are loaded from the `PLUGINS_DIR` directory (default: `./plugins`)
- Each plugin is a directory with a `manifest.json` and an entry point (e.g., `index.js` or `index.ts`)
- Manifest fields: `name`, `version`, `type` (connector | scorer | lifecycle), `description`, `hooks` (for lifecycle type)
- Plugins are plain objects exported from the entry point -- NOT NestJS providers
- Loading happens at startup via `PluginsService.loadAll()` which already exists and loads connectors
- Four hook points: `afterIngest`, `afterEmbed`, `afterEnrich`, `afterSearch`
- Hook handlers receive the memory object (read-only) and can log, track, or enrich externally
- Hooks are fire-and-forget -- they should not block the pipeline
- A hook that throws is caught and logged, never crashes the pipeline
- Multiple plugins can subscribe to the same hook -- all are called
- A working sample plugin in `plugins/sample-enricher/` that demonstrates the lifecycle hook interface
- The sample hooks into `afterEnrich` and logs the memory's entities to demonstrate the pattern
- The sample includes a `manifest.json`, `index.js`, and a `README.md` explaining the plugin API

### Claude's Discretion
- Exact manifest schema fields beyond the required ones
- How to wire hook calls into the existing processors (SyncProcessor, EmbedProcessor, EnrichProcessor, search method)
- Whether to use a central event bus or direct function calls for hooks
- Plugin validation and error reporting
- Whether scorer plugins integrate with `computeWeights()` or replace it

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXT-01 | Plugin system supports three plugin types: connector, scorer, and lifecycle hook | Existing `ConnectorRegistry.loadFromDirectory()` provides the pattern; extend `PluginsService` with a `PluginRegistry` that handles all three types via `manifest.json` type field |
| EXT-02 | Lifecycle hooks fire on memory events: afterIngest, afterEmbed, afterEnrich, afterSearch | `MemoryProcessor.process()` has clear pipeline stages (steps 8, 11, 13); `MemoryService.search()` has a clear return point; inject `PluginRegistry` and call `fireHook()` at each point |
| EXT-03 | Plugins are plain objects with a manifest, not NestJS providers -- loaded from plugins directory | Use `manifest.json` (not `package.json`) as the plugin marker; dynamic `import()` of entry point; exported object has handler methods matching hook names |
| EXT-04 | Plugin interface is documented with a sample enricher plugin | Create `plugins/sample-enricher/` with `manifest.json`, `index.js`, `README.md`; README documents the full plugin API contract |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `fs/promises` | built-in | Read plugin directories and manifest files | Already used in `ConnectorRegistry.loadFromDirectory()` |
| Dynamic `import()` | ES2022 | Load plugin entry points at runtime | Already used for connector loading; native, no deps |
| `Promise.allSettled()` | ES2020 | Fire multiple hook handlers without short-circuiting on error | Built-in; perfect for fire-and-forget with error isolation |
| NestJS `@Injectable()` | 11.x | DI for PluginRegistry into processors | Already the project pattern |

### Supporting
No additional dependencies needed. The plugin system is pure Node.js filesystem + dynamic import.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct function calls for hooks | Node.js EventEmitter | EventEmitter adds complexity; plain function arrays are simpler, more debuggable, and sufficient for startup-loaded plugins |
| `manifest.json` per plugin | `package.json` with `botmem` field | `manifest.json` is cleaner for plugins that aren't npm packages; `package.json` is the connector pattern but requires `botmem.connector` field -- using `manifest.json` differentiates plugins from connectors |

**Installation:**
No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/plugins/
  plugins.service.ts       # Extended: loads all 3 types, manages PluginRegistry
  plugins.module.ts        # Extended: exports PluginRegistry for injection
  plugin-registry.ts       # NEW: registry class holding loaded plugins + fireHook()
  plugin.types.ts          # NEW: TypeScript interfaces for manifest, hooks, scorer
  __tests__/
    plugins.service.test.ts  # Extended with new type tests
    plugin-registry.test.ts  # NEW: registry unit tests

plugins/                   # PLUGINS_DIR (created at project root)
  sample-enricher/
    manifest.json
    index.js
    README.md
```

### Pattern 1: PluginRegistry Class
**What:** A class that holds loaded plugins by type, provides hook firing, and scorer integration.
**When to use:** Always -- this is the central plugin management abstraction.
**Example:**
```typescript
// apps/api/src/plugins/plugin-registry.ts

export interface PluginManifest {
  name: string;
  version: string;
  type: 'connector' | 'scorer' | 'lifecycle';
  description?: string;
  hooks?: string[]; // e.g. ['afterEnrich', 'afterSearch']
  entryPoint?: string; // defaults to 'index.js'
}

export type HookName = 'afterIngest' | 'afterEmbed' | 'afterEnrich' | 'afterSearch';

export interface LifecyclePlugin {
  manifest: PluginManifest;
  hooks: Partial<Record<HookName, (memory: Record<string, unknown>) => void | Promise<void>>>;
}

export interface ScorerPlugin {
  manifest: PluginManifest;
  score: (memory: Record<string, unknown>, currentWeights: Record<string, number>) => number;
}

export class PluginRegistry {
  private lifecyclePlugins: LifecyclePlugin[] = [];
  private scorerPlugins: ScorerPlugin[] = [];
  private logger: { warn: (msg: string) => void; log: (msg: string) => void };

  constructor(logger?: any) {
    this.logger = logger || console;
  }

  registerLifecycle(plugin: LifecyclePlugin): void { ... }
  registerScorer(plugin: ScorerPlugin): void { ... }

  async fireHook(hook: HookName, memoryData: Record<string, unknown>): Promise<void> {
    const handlers = this.lifecyclePlugins
      .filter(p => p.hooks[hook])
      .map(p => p.hooks[hook]!(Object.freeze({ ...memoryData })));

    const results = await Promise.allSettled(handlers);
    for (const r of results) {
      if (r.status === 'rejected') {
        this.logger.warn(`Plugin hook ${hook} failed: ${r.reason}`);
      }
    }
  }

  getScorers(): ScorerPlugin[] { return [...this.scorerPlugins]; }
}
```

### Pattern 2: Hook Integration in Processors
**What:** Inject `PluginRegistry` into processors and call `fireHook()` at the right pipeline stages.
**When to use:** At each hook point in the pipeline.

The key insight from code analysis -- there are TWO processor paths:
1. **`MemoryProcessor`** (queue: `memory`) -- the unified pipeline that handles clean -> embed -> enrich in one job. This is the primary path.
2. **`EmbedProcessor`** (queue: `embed`) and **`EnrichProcessor`** (queue: `enrich`) -- separate queue processors that handle embed and enrich as individual jobs.

Hook points map to these processors:
- `afterIngest`: After memory record is inserted in DB (step 8 in MemoryProcessor, or after DB insert in EmbedProcessor)
- `afterEmbed`: After embedding is stored in Qdrant (step 11 in MemoryProcessor, or after qdrant.upsert in EmbedProcessor)
- `afterEnrich`: After `enrichService.enrich()` completes (step 13 in MemoryProcessor, or after enrich in EnrichProcessor)
- `afterSearch`: After search results are computed in `MemoryService.search()`, before returning

### Pattern 3: Scorer Plugin Integration
**What:** Scorer plugins add a custom weight component to the scoring formula.
**When to use:** During `computeWeights()` in `MemoryService`.

**Recommendation:** Scorer plugins should contribute an ADDITIONAL score component that gets blended into the final score, not replace `computeWeights()`. This preserves the existing scoring formula while allowing plugins to influence results.

```typescript
// In MemoryService.computeWeights():
let pluginScore = 0;
const scorers = this.pluginRegistry.getScorers();
if (scorers.length) {
  const scores = scorers.map(s => {
    try { return s.score(mem, weights); } catch { return 0; }
  });
  pluginScore = scores.reduce((a, b) => a + b, 0) / scores.length;
}
// Redistribute weights slightly to accommodate plugin score
// e.g., reduce semantic by 0.05 and add 0.05 * pluginScore
```

### Anti-Patterns to Avoid
- **Blocking the pipeline on hooks:** Never `await` hooks inline in the hot path. Use `fireHook()` which is fire-and-forget via `Promise.allSettled`. For `afterSearch`, fire hooks but don't await before returning results.
- **Passing mutable memory objects to hooks:** Always pass a frozen shallow copy. Plugins should NOT be able to mutate pipeline state.
- **Loading plugins lazily:** Load everything at startup in `onModuleInit`. No dynamic loading during request handling.
- **Making PluginRegistry a NestJS provider that depends on processors:** This creates circular deps. PluginRegistry should be a standalone class instantiated by PluginsService and exported via the module.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error isolation for hooks | Custom try/catch per handler | `Promise.allSettled()` | Handles both sync and async handlers, never short-circuits |
| Object immutability for hook data | Deep clone | `Object.freeze({ ...data })` | Shallow freeze is sufficient (memory objects are flat strings/numbers); deep clone is expensive |
| Plugin directory scanning | Custom recursive walk | `readdir()` + check for `manifest.json` | Same pattern as existing `ConnectorRegistry.loadFromDirectory()` |

## Common Pitfalls

### Pitfall 1: Circular Dependency Between PluginsModule and MemoryModule
**What goes wrong:** PluginsModule imports ConnectorsModule (for connector plugins). MemoryModule imports ConnectorsModule too. If PluginRegistry needs to be injected into MemoryModule processors, and PluginsModule depends on MemoryModule, you get a circular dep.
**Why it happens:** NestJS module dependency graph.
**How to avoid:** Make `PluginsModule` a `@Global()` module that only exports `PluginRegistry`. PluginRegistry has NO dependencies on other modules -- it's a plain class. PluginsService handles the loading logic and depends on ConnectorsService, but PluginRegistry is independent.
**Warning signs:** `Nest cannot resolve dependencies` error at startup.

### Pitfall 2: Forgetting the Separate Processor Paths
**What goes wrong:** Hooks only fire in `MemoryProcessor` but not in `EmbedProcessor`/`EnrichProcessor`, or vice versa.
**Why it happens:** The codebase has two processing paths -- the unified `MemoryProcessor` and the separate `EmbedProcessor`+`EnrichProcessor` pair.
**How to avoid:** Add hook calls to ALL processor paths. Check which path is currently active (the unified `MemoryProcessor` appears to be the primary one based on the `memory` queue name).
**Warning signs:** Hooks fire inconsistently depending on which queue processes the job.

### Pitfall 3: Plugin Entry Point Resolution
**What goes wrong:** `import(join(dir, entry.name))` fails because the plugin has no `package.json` with a `main` field, or uses CommonJS.
**Why it happens:** Dynamic import needs to resolve the entry point.
**How to avoid:** Read `manifest.json` for an `entryPoint` field (default: `index.js`). Use `import(join(dir, entry.name, entryPoint))` for explicit resolution. Handle both ESM default exports and CommonJS `module.exports`.
**Warning signs:** `ERR_MODULE_NOT_FOUND` or `Cannot find module` errors.

### Pitfall 4: afterSearch Hook Blocking Response
**What goes wrong:** Search latency increases because hooks are awaited before returning results.
**Why it happens:** `await fireHook('afterSearch', ...)` in the search path.
**How to avoid:** For `afterSearch`, fire the hook but don't await it. Use `void this.pluginRegistry.fireHook(...)` (fire-and-forget without awaiting).
**Warning signs:** Search response time increases after adding plugins.

## Code Examples

### manifest.json for Sample Enricher Plugin
```json
{
  "name": "sample-enricher",
  "version": "1.0.0",
  "type": "lifecycle",
  "description": "Sample plugin that logs entities after enrichment",
  "hooks": ["afterEnrich"]
}
```

### Sample Plugin Entry Point (index.js)
```javascript
// plugins/sample-enricher/index.js
module.exports = {
  afterEnrich(memory) {
    const entities = memory.entities ? JSON.parse(memory.entities) : [];
    if (entities.length > 0) {
      console.log(`[sample-enricher] Memory ${memory.id?.slice(0, 8)} has ${entities.length} entities:`,
        entities.map(e => `${e.type}:${e.value}`).join(', '));
    }
  },
};
```

### Loading Plugins in PluginsService
```typescript
// In PluginsService.loadAll() — after loading built-in connectors:
const dir = resolve(this.config.pluginsDir);
const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const manifestPath = join(dir, entry.name, 'manifest.json');
  try {
    const manifestJson = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestJson);

    if (manifest.type === 'connector') {
      // Already handled by ConnectorRegistry.loadFromDirectory()
      continue;
    }

    const entryPoint = manifest.entryPoint || 'index.js';
    const mod = await import(join(dir, entry.name, entryPoint));
    const plugin = mod.default || mod;

    if (manifest.type === 'lifecycle') {
      const hooks: Partial<Record<HookName, Function>> = {};
      for (const hookName of (manifest.hooks || [])) {
        if (typeof plugin[hookName] === 'function') {
          hooks[hookName] = plugin[hookName].bind(plugin);
        }
      }
      this.registry.registerLifecycle({ manifest, hooks });
    } else if (manifest.type === 'scorer') {
      if (typeof plugin.score === 'function') {
        this.registry.registerScorer({ manifest, score: plugin.score.bind(plugin) });
      }
    }

    this.logger.log(`Loaded plugin: ${manifest.name} (${manifest.type})`);
  } catch (err: any) {
    this.logger.warn(`Failed to load plugin from ${entry.name}: ${err.message}`);
  }
}
```

### Firing Hooks in MemoryProcessor
```typescript
// In MemoryProcessor.process(), after step 8 (DB insert):
void this.pluginRegistry.fireHook('afterIngest', {
  id: memoryId,
  text: embedText,
  sourceType: event.sourceType,
  connectorType: rawEvent.connectorType,
  eventTime: event.timestamp,
});

// After step 11 (Qdrant upsert):
void this.pluginRegistry.fireHook('afterEmbed', {
  id: memoryId,
  text: currentText,
  sourceType: event.sourceType,
  connectorType: rawEvent.connectorType,
  eventTime: event.timestamp,
});

// After step 13 (enrich):
void this.pluginRegistry.fireHook('afterEnrich', {
  id: memoryId,
  text: currentText,
  sourceType: event.sourceType,
  connectorType: rawEvent.connectorType,
  eventTime: event.timestamp,
  entities: memory.entities,
  factuality: memory.factuality,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `package.json` with `botmem.connector` field | `manifest.json` with `type` field | This phase | Plugins use a dedicated manifest, cleaner than overloading package.json |
| Only connector plugins | Three plugin types | This phase | Extensibility beyond data sources |

**Deprecated/outdated:**
- The existing `ConnectorRegistry.loadFromDirectory()` still works for connector plugins loaded via `package.json`. The new manifest-based loading supplements, not replaces, the connector loading.

## Open Questions

1. **Scorer plugin weight allocation**
   - What we know: The current formula is `0.40*semantic + 0.30*rerank + 0.15*recency + 0.10*importance + 0.05*trust`
   - What's unclear: How much weight to allocate to plugin scorers -- should they take from existing weights or be additive?
   - Recommendation: Keep it simple -- scorer plugins contribute a bonus of up to +/-0.05 to the final score, clamped to [0, 1]. This avoids disrupting the existing formula while allowing meaningful influence.

2. **Which processor path is primary?**
   - What we know: Both `MemoryProcessor` (queue: `memory`) and `EmbedProcessor`+`EnrichProcessor` (queues: `embed`, `enrich`) exist. The `MemoryProcessor` appears to be the unified pipeline.
   - What's unclear: Whether both paths are actively used or if one is deprecated.
   - Recommendation: Add hook calls to both paths to be safe. The overhead is minimal (a single function call that returns immediately if no plugins are registered).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3 |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && npx vitest run src/plugins/ --reporter=verbose` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXT-01 | PluginRegistry loads three plugin types from manifest.json | unit | `cd apps/api && npx vitest run src/plugins/__tests__/plugin-registry.test.ts -x` | Wave 0 |
| EXT-02 | fireHook calls all registered handlers, catches errors | unit | `cd apps/api && npx vitest run src/plugins/__tests__/plugin-registry.test.ts -x` | Wave 0 |
| EXT-03 | loadAll reads manifest.json, dynamic imports entry point, handles errors | unit | `cd apps/api && npx vitest run src/plugins/__tests__/plugins.service.test.ts -x` | Exists (extend) |
| EXT-04 | Sample enricher plugin has valid manifest and working hook | unit | `cd apps/api && npx vitest run src/plugins/__tests__/sample-plugin.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && npx vitest run src/plugins/ --reporter=verbose`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/plugins/__tests__/plugin-registry.test.ts` -- covers EXT-01, EXT-02
- [ ] `apps/api/src/plugins/__tests__/sample-plugin.test.ts` -- covers EXT-04
- [ ] Extend `apps/api/src/plugins/__tests__/plugins.service.test.ts` -- covers EXT-03

## Sources

### Primary (HIGH confidence)
- Direct code analysis of `apps/api/src/plugins/plugins.service.ts` (45 lines, stub with connector loading)
- Direct code analysis of `packages/connector-sdk/src/registry.ts` (loadFromDirectory pattern)
- Direct code analysis of `apps/api/src/memory/memory.processor.ts` (unified pipeline, 627 lines)
- Direct code analysis of `apps/api/src/memory/embed.processor.ts` (separate embed pipeline)
- Direct code analysis of `apps/api/src/memory/enrich.processor.ts` (separate enrich pipeline)
- Direct code analysis of `apps/api/src/memory/memory.service.ts` (search + computeWeights)
- Direct code analysis of `apps/api/src/memory/enrich.service.ts` (enrichment logic)
- Direct code analysis of `apps/api/src/plugins/plugins.module.ts` (NestJS module structure)
- Direct code analysis of `apps/api/src/memory/memory.module.ts` (module dependencies)

### Secondary (MEDIUM confidence)
- Node.js `Promise.allSettled()` API -- stable since ES2020, well-understood behavior
- NestJS `@Global()` module pattern -- standard DI pattern for cross-cutting concerns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; pattern directly extends existing code
- Architecture: HIGH -- clear integration points identified in all processors and search
- Pitfalls: HIGH -- identified from direct code analysis (circular deps, dual processor paths, import resolution)

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable domain, no external API changes expected)
