# Phase 33: Production Docker - Research

**Researched:** 2026-03-08
**Domain:** Docker multi-stage builds, Turborepo prune, pnpm workspaces
**Confidence:** HIGH

## Summary

Phase 33 requires a production Docker image for the API using `turbo prune --docker` for minimal image size. The project is a pnpm 9.15 monorepo with Turbo 2.4+, NestJS 11 built with SWC, and native dependencies (better-sqlite3, bcrypt). The key challenge is that `@botmem/api` currently lists `@botmem/web` as a workspace dependency -- `turbo prune` follows the dependency graph and includes the entire web app. Since the API never imports from `@botmem/web` (ServeStaticModule uses a filesystem path, not a module import), this dependency must be removed before prune will produce a clean API-only output.

The multi-stage Dockerfile follows the standard turbo prune pattern: (1) prune stage generates a partial monorepo, (2) install stage uses `out/json` for dependency caching, (3) build stage uses `out/full` for compilation, (4) production stage copies only `dist/` and production `node_modules`. Native modules (better-sqlite3, bcrypt) require build tools in the build stage but NOT in the production stage since prebuilt binaries exist for Node 22 on Alpine.

**Primary recommendation:** Remove `@botmem/web` from API dependencies, create `.npmrc` with `shamefully-hoist=true`, write a 4-stage Dockerfile using `node:22-alpine` base, and add `.dockerignore` for build context efficiency.

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                            | Research Support                                                                                                        |
| -------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| BUILD-02 | Production Docker image uses multi-stage build with turbo prune for minimal image size | Turbo prune + Docker pattern fully documented; native dep handling verified; web dependency removal strategy identified |

</phase_requirements>

## Standard Stack

### Core

| Tool  | Version         | Purpose          | Why Standard                                                                  |
| ----- | --------------- | ---------------- | ----------------------------------------------------------------------------- |
| node  | 22-alpine       | Base image       | LTS, Alpine for small size (~50MB base), prebuilt binaries for better-sqlite3 |
| turbo | 2.4+ (via pnpm) | Monorepo pruning | `turbo prune --docker` generates optimized partial monorepo                   |
| pnpm  | 9.15            | Package manager  | Must match project's `packageManager` field exactly                           |

### Supporting

| Tool            | Purpose                 | When to Use                                                                |
| --------------- | ----------------------- | -------------------------------------------------------------------------- |
| `.npmrc`        | pnpm hoisting config    | Required in Docker -- `shamefully-hoist=true` for NestJS flat node_modules |
| `.dockerignore` | Build context filtering | Always -- prevents sending node_modules/data to Docker daemon              |

### Alternatives Considered

| Instead of       | Could Use   | Tradeoff                                                                                  |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------- |
| Alpine           | Debian slim | +50MB image size, but zero native module issues; Alpine works fine with Node 22 prebuilts |
| turbo prune      | Manual COPY | Fragile, must manually track workspace deps, lockfile not pruned                          |
| shamefully-hoist | Strict pnpm | NestJS requires hoisted node_modules -- not negotiable                                    |

## Architecture Patterns

### Multi-Stage Dockerfile Structure

```
Stage 1: base         (node:22-alpine + pnpm + turbo)
Stage 2: prune        (turbo prune @botmem/api --docker)
Stage 3: build        (install deps from out/json, build from out/full)
Stage 4: production   (copy dist + prod node_modules only)
```

### Pattern 1: Turbo Prune Docker Split

**What:** `turbo prune --docker` separates output into `out/json` (package manifests + lockfile) and `out/full` (source code). This enables Docker layer caching -- dependency install only reruns when package.json/lockfile changes.
**When to use:** Always for monorepo Docker builds.
**Example:**

```dockerfile
# Stage 1: Base with pnpm + turbo
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN pnpm add -g turbo

# Stage 2: Prune
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @botmem/api --docker

# Stage 3: Build
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY .npmrc .npmrc
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@botmem/api

# Stage 4: Production
FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER nestjs
EXPOSE 12412
CMD ["node", "dist/main.js"]
```

### Pattern 2: Remove @botmem/web from API Dependencies

**What:** The API's package.json lists `@botmem/web` as a dependency, but never imports it. ServeStaticModule uses `join(__dirname, '..', '..', 'web', 'dist')` -- a filesystem path. In production Docker (API-only), this path won't exist and `isDev` is false, but ServeStaticModule is conditionally loaded only in production mode. This needs to be handled: either make ServeStaticModule conditional on the web dist directory existing, or remove it entirely for the Docker image.
**When to use:** Before running turbo prune.
**Critical detail:** The current `app.module.ts` loads ServeStaticModule only when `NODE_ENV === 'production'`, pointing to `../../web/dist`. In the Docker image, this path won't exist. Two options:

1. Remove `@botmem/web` from API deps AND guard ServeStaticModule with a filesystem existence check
2. Remove `@botmem/web` from API deps AND remove ServeStaticModule entirely (API-only image, frontend served by Caddy/nginx)

Option 2 is cleaner -- the production deployment already uses Caddy as a reverse proxy.

### Pattern 3: Native Module Handling

**What:** better-sqlite3 and bcrypt are native Node.js addons requiring compilation. On Alpine, these need build tools during install but ship prebuilt binaries for Node 22.
**When to use:** In the build stage.
**Example:**

```dockerfile
# In build stage, before pnpm install
RUN apk add --no-cache python3 make g++
```

These packages are NOT needed in the production stage since the compiled `.node` files are in `node_modules`.

### Anti-Patterns to Avoid

- **Copying host node_modules into Docker:** Native binaries are architecture-specific. Always `pnpm install` inside the container.
- **Using `latest` Node image tag:** Pin to `22-alpine` for reproducible builds.
- **Running as root:** Use a non-root user in the production stage.
- **Missing .npmrc in Docker:** Without `shamefully-hoist=true`, NestJS will fail to resolve dependencies.

## Don't Hand-Roll

| Problem              | Don't Build             | Use Instead                                             | Why                                                         |
| -------------------- | ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| Monorepo pruning     | Manual COPY per package | `turbo prune --docker`                                  | Automatically resolves workspace dep graph, prunes lockfile |
| Layer caching        | Single COPY + install   | `out/json` then `out/full` split                        | Only reinstalls when deps change, not on every code change  |
| pnpm in Docker       | curl install scripts    | `corepack enable && corepack prepare`                   | Built into Node, version-locked via `packageManager` field  |
| Production deps only | Manual rm of devDeps    | `pnpm install --prod --frozen-lockfile` in runner stage | Correct lockfile subset, no accidental dev deps             |

**Key insight:** The turbo prune + Docker split pattern is well-established and handles all the complexity of workspace dependency resolution, lockfile pruning, and layer caching automatically.

## Common Pitfalls

### Pitfall 1: turbo prune includes @botmem/web

**What goes wrong:** `turbo prune @botmem/api` follows dependency graph and includes `@botmem/web` because it's listed in API's package.json dependencies.
**Why it happens:** API has `"@botmem/web": "workspace:*"` even though it never imports from it.
**How to avoid:** Remove `@botmem/web` from API dependencies. The ServeStaticModule uses a filesystem path, not a module import.
**Warning signs:** Pruned output includes `apps/web/` directory; image size bloated with React/Vite/Tailwind deps.

### Pitfall 2: Missing .npmrc in Docker

**What goes wrong:** `pnpm install` uses default non-hoisted layout; NestJS crashes at runtime with "Cannot find module" errors.
**Why it happens:** `turbo prune` does NOT copy `.npmrc` into the output directory (known issue #2871).
**How to avoid:** Create `.npmrc` with `shamefully-hoist=true` at project root. COPY it explicitly in the Dockerfile.
**Warning signs:** Build succeeds but container crashes on startup.

### Pitfall 3: Native modules built on wrong architecture

**What goes wrong:** better-sqlite3 or bcrypt fails with "invalid ELF header" or similar.
**Why it happens:** node_modules copied from host (macOS ARM) into Linux container.
**How to avoid:** Always run `pnpm install` inside the Docker build stage with build tools available.
**Warning signs:** Works locally, crashes in container.

### Pitfall 4: ServeStaticModule fails on missing web/dist

**What goes wrong:** NestJS crashes at startup because ServeStaticModule can't find the web dist directory.
**Why it happens:** In production mode (`NODE_ENV=production`), `app.module.ts` loads ServeStaticModule pointing to `../../web/dist` which doesn't exist in the API-only image.
**How to avoid:** Either guard with filesystem check or remove ServeStaticModule for Docker builds (let Caddy serve frontend).
**Warning signs:** Container exits immediately with ENOENT error.

### Pitfall 5: pnpm-workspace.yaml catalog references

**What goes wrong:** `catalog:` protocol in package.json not resolved during Docker install.
**Why it happens:** `turbo prune` copies `pnpm-workspace.yaml` which includes catalog definitions, but if the file is malformed or incomplete, resolution fails.
**How to avoid:** Verify `pnpm-workspace.yaml` is included in pruned output (it is, confirmed by testing).
**Warning signs:** pnpm install fails with "catalog: protocol" errors.

### Pitfall 6: Large build context

**What goes wrong:** Docker build takes minutes just to send context to daemon.
**Why it happens:** No `.dockerignore`, so node_modules, .git, data/ are all sent.
**How to avoid:** Create `.dockerignore` excluding node_modules, .git, data/, dist/, .turbo, coverage/.
**Warning signs:** "Sending build context to Docker daemon" takes > 5 seconds.

## Code Examples

### .npmrc (create at project root)

```ini
shamefully-hoist=true
```

### .dockerignore

```
node_modules
.git
.turbo
dist
coverage
data
*.log
.env*
.DS_Store
.planning
.claude
.claude-flow
apps/api/data
```

### Complete Dockerfile

```dockerfile
# ---- Base ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN pnpm add -g turbo@^2.4.0

# ---- Prune ----
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @botmem/api --docker

# ---- Build ----
FROM base AS builder
WORKDIR /app

# Install build tools for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Install deps first (layer cache)
COPY .npmrc .npmrc
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@botmem/api

# Prune dev dependencies
RUN pnpm install --prod --frozen-lockfile

# ---- Production ----
FROM node:22-alpine AS runner
WORKDIR /app

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built application
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json

# Copy production node_modules (includes native binaries built for Alpine)
COPY --from=builder /app/node_modules ./node_modules

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nestjs:nodejs /app/data

USER nestjs

ENV NODE_ENV=production
ENV PORT=12412
EXPOSE 12412

CMD ["node", "dist/main.js"]
```

### docker-compose.prod.yml addition (for local testing)

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - '12412:12412'
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - QDRANT_URL=http://qdrant:6333
      - DB_PATH=/app/data/botmem.db
    depends_on:
      redis:
        condition: service_healthy
      qdrant:
        condition: service_healthy
    volumes:
      - api-data:/app/data
```

## State of the Art

| Old Approach                     | Current Approach                            | When Changed                  | Impact                                          |
| -------------------------------- | ------------------------------------------- | ----------------------------- | ----------------------------------------------- |
| Copy entire monorepo into Docker | `turbo prune --docker` for partial monorepo | Turbo 1.x (2022+)             | 50%+ image size reduction                       |
| Manual pnpm install              | `corepack enable` + `corepack prepare`      | Node 16+                      | Version-locked package manager, no curl scripts |
| tsc for NestJS build             | SWC via `nest build`                        | NestJS 10+                    | ~20x faster builds                              |
| Root user in container           | Non-root user (nestjs)                      | Docker security best practice | Reduced attack surface                          |

**Deprecated/outdated:**

- `turbo prune --scope`: Old flag name, now just `turbo prune <package>`
- `npm install` in pnpm monorepo: Must use pnpm with matching lockfile

## Open Questions

1. **node_modules copy strategy in production stage**
   - What we know: With `shamefully-hoist=true`, all deps are hoisted to root node_modules. The production stage needs the full root node_modules (after dev prune) since NestJS resolves from there.
   - What's unclear: Whether `pnpm deploy` would produce a cleaner output than copying root node_modules. Testing needed.
   - Recommendation: Start with root node_modules copy; optimize later if image size exceeds 500MB target.

2. **ServeStaticModule removal vs guard**
   - What we know: Production deployment uses Caddy for frontend. API-only Docker image has no web/dist.
   - What's unclear: Whether removing ServeStaticModule breaks any existing production deployment flow.
   - Recommendation: Guard with fs.existsSync check so it works with or without web/dist present. This keeps flexibility.

## Validation Architecture

### Test Framework

| Property           | Value                                         |
| ------------------ | --------------------------------------------- |
| Framework          | Vitest 3                                      |
| Config file        | `apps/api/vitest.config.ts` (or package.json) |
| Quick run command  | `pnpm --filter @botmem/api test`              |
| Full suite command | `pnpm test`                                   |

### Phase Requirements -> Test Map

| Req ID    | Behavior                                | Test Type | Automated Command                                             | File Exists? |
| --------- | --------------------------------------- | --------- | ------------------------------------------------------------- | ------------ |
| BUILD-02a | Docker build succeeds                   | smoke     | `docker build -t botmem-api .`                                | -- Wave 0    |
| BUILD-02b | Image size < 500MB                      | smoke     | `docker image inspect botmem-api --format '{{.Size}}'`        | -- Wave 0    |
| BUILD-02c | Container starts and responds to health | e2e       | `docker run -d botmem-api && curl localhost:12412/api/health` | -- Wave 0    |

### Sampling Rate

- **Per task commit:** `docker build -t botmem-api . && docker image ls botmem-api`
- **Per wave merge:** Full build + run + health check
- **Phase gate:** Image builds, < 500MB, health endpoint responds

### Wave 0 Gaps

- [ ] `Dockerfile` -- the entire deliverable
- [ ] `.dockerignore` -- build context optimization
- [ ] `.npmrc` -- pnpm hoisting configuration for Docker
- [ ] Remove `@botmem/web` from API dependencies
- [ ] Guard or remove ServeStaticModule for API-only mode

## Sources

### Primary (HIGH confidence)

- [Turborepo Docker Guide](https://turborepo.dev/docs/guides/tools/docker) - Official turbo prune + Docker pattern
- [Turbo Prune Reference](https://turborepo.dev/docs/reference/prune) - Command flags and output structure
- Local testing: `turbo prune @botmem/api --docker` confirmed output includes @botmem/web

### Secondary (MEDIUM confidence)

- [turbo prune .npmrc issue #2871](https://github.com/vercel/turborepo/issues/2871) - Known issue: .npmrc not copied by prune
- [better-sqlite3 Alpine Discussion](https://github.com/WiseLibs/better-sqlite3/discussions/1270) - Native module Docker compatibility
- [Optimized Docker builds with TurboRepo and PNPM](https://fintlabs.medium.com/optimized-multi-stage-docker-builds-with-turborepo-and-pnpm-for-nodejs-microservices-in-a-monorepo-c686fdcf051f) - Community pattern validation

### Tertiary (LOW confidence)

- MEMORY.md notes about existing production Dockerfile at /opt/botmem/ -- not accessible from this context, but informs that `shamefully-hoist=true` was previously needed

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - turbo prune + pnpm + Docker is well-documented, locally verified
- Architecture: HIGH - multi-stage pattern is standard, confirmed via turbo prune test
- Pitfalls: HIGH - @botmem/web inclusion confirmed by local testing; .npmrc issue verified via upstream bug report

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable tooling, unlikely to change)
