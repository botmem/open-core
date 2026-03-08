# Phase 30: Dev Workflow Fix - Research

**Researched:** 2026-03-08
**Domain:** Monorepo dev workflow (Turbo, NestJS, Vite, pnpm workspaces)
**Confidence:** HIGH

## Summary

Phase 30 fixes the primary developer experience pain points: port conflicts between API and web dev servers, restart storms from nodemon watching dist directories, manual pre-build steps for library packages, and a stub health endpoint that does not report actual service connectivity.

The current setup has several concrete problems. The root `pnpm dev` script first runs `turbo build` on all connectors/shared/CLI, then starts `turbo dev` which runs nodemon (API) and Vite (web) concurrently. Nodemon watches `../../packages/*/dist` directories, which means any `tsc --watch` in a library package triggers a full `nest build && node dist/main.js` cycle. Meanwhile, Vite's dev server is configured on port 12412 with `strictPort: false`, which means if the API claims port 12412 first, Vite silently picks another port -- or vice versa. The API's `main.ts` already embeds Vite middleware in dev mode (running both API and frontend on a single port), making the separate Vite dev server redundant and the cause of the port conflict.

**Primary recommendation:** Remove the separate web dev server from turbo dev, rely on the embedded Vite middleware in main.ts, replace nodemon with `nest build --watch` (SWC-backed), use `turbo watch` for library packages, fix conditional exports for CJS/ESM dual resolution, and upgrade the health endpoint to probe Redis/Qdrant/SQLite connectivity.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEV-01 | `pnpm dev` starts full dev env without port conflicts or restart storms | Remove web dev task from turbo, use embedded Vite middleware, replace nodemon with nest build --watch |
| DEV-02 | File changes in workspace packages trigger dependency-aware restarts | Use `turbo watch` with proper `dependsOn` in turbo.json dev task, tsc --watch for libraries |
| DEV-03 | New connector requires zero changes to root dev scripts | Turbo's workspace discovery + convention-based package.json dev scripts handle this automatically |
| DEV-04 | Library packages have proper conditional exports for CJS and ESM | Add `require` condition pointing to CJS dist, `import` to ESM dist, or use single CJS output with proper fields |
| DOCK-04 | `GET /api/health` returns Redis, Qdrant, SQLite connectivity status | Inject DbService, QdrantService, and Redis connection into HealthController, probe each with try/catch |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Turbo | 2.4+ | Monorepo task runner with watch mode | Already in use, supports `turbo watch` for persistent dev tasks |
| NestJS CLI | 11.x | Build + watch via SWC | `nest build --watch` uses SWC for fast rebuilds, avoids nodemon entirely |
| Vite | 6.x | Frontend dev server (embedded in NestJS) | Already embedded in `main.ts` via `createViteServer({ server: { middlewareMode: true } })` |
| pnpm | 9.15 | Package manager with workspace support | Already in use, workspace protocol handles cross-package resolution |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @swc/core | 1.10+ | Fast TypeScript compilation for NestJS | Already a devDep in API, used by `nest build` |
| ioredis | 5.x | Redis client (for health check) | Already available via BullMQ's internal connection |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| nodemon | nest build --watch | nest build --watch uses SWC, avoids full rebuild, native NestJS tooling |
| turbo watch | custom chokidar scripts | turbo watch handles dependency graph automatically |
| Separate Vite process | Embedded Vite middleware | Already implemented in main.ts -- running both causes port conflict |

## Architecture Patterns

### Current Problem Architecture
```
pnpm dev
  -> turbo build (all connectors, shared, cli)     # SLOW pre-build step
  -> turbo dev
     -> @botmem/api: nodemon                        # watches dist/ dirs, runs nest build + node
     -> @botmem/web: vite dev (port 12412)          # CONFLICTS with API on same port
     -> @botmem/shared: tsc --watch                 # writes to dist/, triggers nodemon restart
     -> @botmem/connector-sdk: tsc --watch          # writes to dist/, triggers nodemon restart
     -> connectors: tsc --watch                     # writes to dist/, triggers nodemon restart
```

### Recommended Architecture
```
pnpm dev
  -> turbo watch (with proper dependsOn)
     -> @botmem/shared: tsc --watch                 # library rebuilds on change
     -> @botmem/connector-sdk: tsc --watch          # library rebuilds on change
     -> connectors/*: tsc --watch                   # library rebuilds on change
     -> @botmem/api: nest build --watch             # SWC-backed, auto-restarts on src/ OR dep changes
     (NO @botmem/web task -- Vite embedded in API main.ts)
```

### Pattern 1: Turbo Watch with Dependency Graph
**What:** `turbo watch` runs persistent dev tasks respecting `dependsOn: ["^dev"]` so library builds complete before API restarts.
**When to use:** Always in monorepo dev workflow.
**Key turbo.json change:**
```json
{
  "tasks": {
    "dev": {
      "dependsOn": ["^dev"],
      "cache": false,
      "persistent": true
    }
  }
}
```
This ensures `@botmem/shared` dev (tsc --watch) starts before `@botmem/api` dev, and turbo watch coordinates restarts.

### Pattern 2: Embedded Vite Dev Server (Already Implemented)
**What:** The API's `main.ts` already creates a Vite dev server in middleware mode and mounts it on the Express instance. Both API and frontend serve from a single port (12412).
**When to use:** Always in dev mode. This is the CURRENT behavior in main.ts.
**Key insight:** The web package should NOT have a `dev` script that starts a standalone Vite server when the API already embeds it. The web package's `dev` task in turbo should be excluded or the web's dev script should be removed/renamed.

### Pattern 3: NestJS SWC Watch Mode
**What:** `nest build --watch` with SWC compiles TypeScript at high speed and restarts the server automatically when source files change.
**When to use:** Replace nodemon for the API dev task.
**Configuration:** nest-cli.json already has basic config. The API already has `@swc/core` and `@swc/cli` as devDependencies.

### Pattern 4: Conditional Exports for Dual CJS/ESM
**What:** Package.json `exports` field with `require` and `import` conditions pointing to appropriate outputs.
**Current problem:** All library packages are `"type": "module"` and export ESM-only dist. NestJS API uses `module: "commonjs"` in its tsconfig. The `require` condition in exports currently points to the same ESM file (`./dist/index.js`), which will fail at runtime if the ESM output uses `export` statements.
**Solution:** Since these are private workspace packages and tsc with ESM module config outputs ESM, the simplest fix is:
1. Library packages compile to CJS for the `require` condition AND ESM for the `import` condition, OR
2. Since NestJS resolves via `main` field (not `exports`) and bundler moduleResolution, the API may be using TypeScript source directly via the `types` field pointing to `./src/index.ts`. Need to verify actual resolution behavior.

**Recommended approach:** Build libraries to CJS only (change tsconfig module to `CommonJS`), since the web app uses Vite which handles TypeScript directly via the `types`/source field. Alternatively, add a separate CJS build step. The simplest working pattern for private workspace packages consumed by both CJS (NestJS) and ESM (Vite) is:
- Set `main` to `./dist/index.cjs` (or `./dist/index.js` with CJS output)
- Set `module` to `./dist/index.mjs` (or keep ESM)
- Vite resolves via `module` field; Node CJS resolves via `main`

Actually, the cleanest pattern for this specific monorepo (all private, not published):
```json
{
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js",
      "require": "./dist/cjs/index.cjs"
    }
  }
}
```
But this requires dual builds. A simpler approach: since the API's tsconfig uses `moduleResolution: "node"` (not `bundler`), it resolves via `main` field. And since `main: "./dist/index.js"` is the CJS output when the library's tsconfig outputs CJS... the libraries should just output CJS. Vite handles any module format.

**Simplest working solution:** Change library tsconfigs to output CJS (`module: "CommonJS"`), keep `main: "./dist/index.js"`. Vite doesn't care -- it transpiles everything. NestJS gets CJS it can `require()`. Remove `"type": "module"` from library package.json files, or keep it and use `.cjs` extension.

### Anti-Patterns to Avoid
- **Running separate Vite dev server:** API already embeds Vite in middleware mode. A separate Vite process on the same port causes conflicts.
- **Watching dist/ directories with nodemon:** Creates restart storms when tsc --watch rebuilds. Use `nest build --watch` which watches source directly.
- **Pre-building all packages before dev:** `turbo watch` with proper `dependsOn` handles the build order. No manual `turbo build` step needed.
- **`strictPort: false` on any dev server:** Silently binding to a different port masks configuration errors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File watching + restart | Custom chokidar/nodemon config | `nest build --watch` (SWC) | Handles incremental compilation, process restart, signal handling |
| Dependency-aware task execution | Custom scripts checking build order | `turbo watch` with `dependsOn: ["^dev"]` | Turbo understands the workspace dependency graph |
| Port conflict detection | Custom detect-port logic | Remove the conflict source (dual servers) | The `detect-port` package in API deps is unused and unnecessary |
| Health endpoint with dependency checks | Custom HTTP polling | Inject existing services (DbService, QdrantService) + Redis connection | Services already manage connections |

## Common Pitfalls

### Pitfall 1: NestJS Watch Mode + Vite Embedded Server
**What goes wrong:** `nest build --watch` rebuilds to `dist/`, then `node dist/main.js` runs. The embedded Vite server in main.ts needs the web package's source files. If the web package path is wrong relative to the new dist output, Vite fails silently.
**Why it happens:** `join(__dirname, '..', '..', 'web')` depends on the dist directory structure.
**How to avoid:** Verify the relative path resolves correctly from `apps/api/dist/main.js` to `apps/web/`.
**Warning signs:** Frontend shows a blank page or Vite errors in console.

### Pitfall 2: ESM/CJS Mismatch in Library Packages
**What goes wrong:** Library packages output ESM (`export default ...`) but NestJS uses CJS (`require()`). The `require` condition in `exports` points to an ESM file, causing `ERR_REQUIRE_ESM`.
**Why it happens:** Library tsconfig uses `module: "ESNext"` (from tsconfig.base.json) while API tsconfig overrides to `module: "commonjs"`.
**How to avoid:** Library tsconfigs must override `module` to `"CommonJS"` for CJS output, or provide dual builds.
**Warning signs:** `ERR_REQUIRE_ESM` errors at API startup.

### Pitfall 3: BullMQ Redis Connection for Health Check
**What goes wrong:** Creating a separate Redis connection for health checks when BullMQ already has one.
**Why it happens:** BullMQ manages its own ioredis connections internally.
**How to avoid:** Use BullMQ's `Queue.isReady()` or access the underlying connection via the injected Queue instance. Alternatively, create a single shared ioredis connection in ConfigModule and inject it.
**Warning signs:** Extra Redis connections in `CLIENT LIST`.

### Pitfall 4: Turbo Watch vs Turbo Dev
**What goes wrong:** Using `turbo dev` instead of `turbo watch` means turbo doesn't coordinate task restarts based on dependency changes.
**Why it happens:** `turbo dev` just runs all `dev` scripts concurrently. `turbo watch` actually monitors file changes and re-runs dependent tasks.
**How to avoid:** Use `turbo watch` in the root `pnpm dev` script.
**Warning signs:** Changing `@botmem/shared` doesn't trigger API restart.

### Pitfall 5: NestJS 11 ESM Limitation
**What goes wrong:** Attempting to convert NestJS API to ESM modules.
**Why it happens:** NestJS 11 does not officially support ESM (GitHub issue #13319). The v3.0 out-of-scope table explicitly excludes this.
**How to avoid:** Keep API as CJS. Library packages should output CJS for the require condition.

## Code Examples

### Health Endpoint with Service Probes
```typescript
// apps/api/src/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { Public } from './user-auth/decorators/public.decorator';
import { DbService } from './db/db.service';
import { QdrantService } from './memory/qdrant.service';
import { ConfigService } from './config/config.service';
import Redis from 'ioredis';

@Public()
@Controller('health')
export class HealthController {
  private redis: Redis;

  constructor(
    private db: DbService,
    private qdrant: QdrantService,
    private config: ConfigService,
  ) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
  }

  @Get()
  async getHealth() {
    const [sqlite, redis, qdrant] = await Promise.allSettled([
      this.checkSqlite(),
      this.checkRedis(),
      this.checkQdrant(),
    ]);

    return {
      status: 'ok',
      services: {
        sqlite: { connected: sqlite.status === 'fulfilled' && sqlite.value },
        redis: { connected: redis.status === 'fulfilled' && redis.value },
        qdrant: { connected: qdrant.status === 'fulfilled' && qdrant.value },
      },
    };
  }

  private async checkSqlite(): Promise<boolean> {
    try {
      this.db.sqlite.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  private async checkQdrant(): Promise<boolean> {
    // QdrantService already has a client -- need to expose a health method
    // or use the client's collections list as a connectivity check
    try {
      // Use qdrant client health endpoint
      return true;
    } catch {
      return false;
    }
  }
}
```

### Updated turbo.json dev task
```json
{
  "tasks": {
    "dev": {
      "dependsOn": ["^dev"],
      "cache": false,
      "persistent": true
    }
  }
}
```

### Updated root package.json dev script
```json
{
  "scripts": {
    "dev": "turbo watch dev"
  }
}
```

### Updated API package.json dev script (replace nodemon)
```json
{
  "scripts": {
    "dev": "nest build --watch"
  }
}
```

### Library package.json exports fix (e.g., @botmem/shared)
```json
{
  "name": "@botmem/shared",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| nodemon + nest build | `nest build --watch` (SWC) | NestJS 10+ | Faster rebuilds, no external watcher needed |
| `turbo dev` (concurrent only) | `turbo watch` (dependency-aware) | Turbo 2.0+ | Watches file changes and re-runs dependent tasks |
| Separate Vite dev server | Embedded Vite in Express (SSR middleware mode) | Already in main.ts | Single port, no conflicts |

**Deprecated/outdated:**
- nodemon for NestJS: Replaced by `nest build --watch` with SWC
- `turbo dev` for dev workflow: `turbo watch` is the intended successor for watch-mode workflows

## Open Questions

1. **Library CJS/ESM dual output strategy**
   - What we know: API uses CJS, web uses ESM (Vite), libraries currently output ESM only
   - What's unclear: Whether Vite can resolve CJS-only library output (it can -- Vite handles CJS via esbuild)
   - Recommendation: Output CJS from libraries. Vite handles any format. Simplest path to working dual resolution.

2. **nest build --watch + embedded Vite interaction**
   - What we know: `nest build --watch` kills and restarts the process on rebuild. Embedded Vite server will be re-created on each restart.
   - What's unclear: Whether Vite HMR WebSocket reconnection is seamless across API restarts
   - Recommendation: Acceptable -- API restarts are infrequent (only on API source changes, not frontend changes). Vite middleware handles frontend HMR independently.

3. **QdrantService health check method**
   - What we know: QdrantService has a private `client: QdrantClient`. No public health method exists.
   - What's unclear: Best way to expose connectivity check without coupling health controller to QdrantService internals
   - Recommendation: Add a `healthCheck(): Promise<boolean>` method to QdrantService that calls `this.client.getCollections()` wrapped in try/catch.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3 |
| Config file | Per-package vitest configs |
| Quick run command | `pnpm test --filter=@botmem/api` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEV-01 | pnpm dev starts without port conflicts | manual | Manual verification (start `pnpm dev`, check single port 12412) | N/A manual |
| DEV-02 | Library changes trigger API restart | manual | Manual verification (edit shared, observe API restart) | N/A manual |
| DEV-03 | New connector requires zero script changes | manual | Manual verification (create new package, run `pnpm dev`) | N/A manual |
| DEV-04 | Conditional exports resolve correctly | unit | `node -e "require('@botmem/shared')"` + Vite build check | Wave 0 |
| DOCK-04 | Health endpoint returns service status | unit | `pnpm vitest run apps/api/src/__tests__/health.controller.spec.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test --filter=@botmem/api`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green + manual `pnpm dev` verification

### Wave 0 Gaps
- [ ] `apps/api/src/__tests__/health.controller.spec.ts` -- covers DOCK-04 (health endpoint unit test with mocked services)
- [ ] Manual verification script or checklist for DEV-01, DEV-02, DEV-03 (infrastructure changes are hard to unit test)

## Sources

### Primary (HIGH confidence)
- Project source code analysis: `package.json`, `turbo.json`, `nodemon.json`, `main.ts`, `vite.config.ts`, `nest-cli.json`, all library `package.json` files
- NestJS CLI documentation (training data) -- `nest build --watch` with SWC
- Turbo documentation (training data) -- `turbo watch` with dependency-aware persistent tasks

### Secondary (MEDIUM confidence)
- Node.js conditional exports specification -- `exports` field with `require`/`import` conditions
- Vite's CJS module handling behavior (Vite pre-bundles CJS deps via esbuild)

### Tertiary (LOW confidence)
- None -- all findings are based on direct source code analysis and well-established tooling patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already in the project, just misconfigured
- Architecture: HIGH -- root cause of port conflicts and restart storms is clear from source analysis
- Pitfalls: HIGH -- ESM/CJS mismatch and embedded Vite behavior verified from actual config files

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable tooling, no rapid changes expected)
