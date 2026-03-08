# Phase 29: Foundation Config - Research

**Researched:** 2026-03-08
**Domain:** Monorepo code quality tooling -- ESLint 9, Prettier, TypeScript typecheck, environment documentation
**Confidence:** HIGH

## Summary

Phase 29 is a config-only phase that adds zero-risk quality tooling to the Botmem monorepo. The project currently has no linting, no formatting, no standalone typecheck task, and an incomplete `.env.example`. All four requirements (QUAL-01, QUAL-02, QUAL-03, DOCK-03) are straightforward configuration additions that do not modify any application code or build behavior.

The existing milestone research (SUMMARY.md, STACK.md, FEATURES.md, PITFALLS.md) already covers the full v3.0 domain in depth. This phase-level research synthesizes and narrows that research to just the Phase 29 scope: ESLint 9 flat config at the repo root, Prettier config, `typecheck` and `lint` scripts in every package, updated `turbo.json` with those tasks, and a complete `.env.example`.

**Primary recommendation:** Create root `eslint.config.mjs` + `.prettierrc` + `.editorconfig`, add `lint` and `typecheck` scripts to all 11 workspace packages, register both tasks in `turbo.json`, and update `.env.example` with all 20+ environment variables from `config.service.ts`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QUAL-01 | Developer can run ESLint across all packages with a single command and get consistent TypeScript linting | Root `eslint.config.mjs` with ESLint 9 flat config + typescript-eslint; per-package `lint` scripts; `turbo.json` `lint` task |
| QUAL-02 | All code is auto-formatted on save/commit with Prettier using consistent rules | Root `.prettierrc` + `.editorconfig`; per-package `format` script; Prettier integration with ESLint via eslint-config-prettier |
| QUAL-03 | Developer can run typecheck across all packages as a standalone Turbo task | Per-package `typecheck` scripts (`tsc --noEmit`); `turbo.json` `typecheck` task |
| DOCK-03 | New developers can read `.env.example` to understand all required and optional environment variables | Complete `.env.example` with all 20+ vars from `config.service.ts` including JWT, SMTP, PostHog, reranker, decay cron |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| eslint | ^9.0.0 | Linting engine | ESLint 9 with flat config is the current standard. ESLint 8 is EOL. |
| @eslint/js | ^9.0.0 | Base recommended rules | Official ESLint recommended ruleset |
| typescript-eslint | ^8.0.0 | TypeScript ESLint support | Flat config compatible, replaces old `@typescript-eslint/*` packages |
| prettier | ^3.4.0 | Code formatting | De facto standard for consistent formatting |
| eslint-config-prettier | ^10.0.0 | Disable ESLint rules that conflict with Prettier | Prevents ESLint/Prettier rule fights |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| eslint-plugin-react-hooks | latest | React hooks linting rules | Only needed if web app linting includes React-specific rules |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ESLint 9 | Biome | Biome is faster but ESLint ecosystem is broader, NestJS tooling expects ESLint, Biome is still stabilizing. Explicitly rejected in REQUIREMENTS.md. |
| Root eslint.config.mjs | @botmem/eslint-config package | Overengineered for single-developer monorepo. Root config is simpler, no build step needed. Explicitly rejected in REQUIREMENTS.md. |

**Installation:**
```bash
pnpm add -Dw eslint@^9.0.0 @eslint/js@^9.0.0 typescript-eslint@^8.0.0 prettier@^3.4.0 eslint-config-prettier@^10.0.0
```

## Architecture Patterns

### Recommended Config Structure

```
(repo root)
  eslint.config.mjs       # ESLint 9 flat config -- single file, all packages
  .prettierrc              # Prettier config -- JSON format
  .editorconfig            # Editor-agnostic formatting basics
  .prettierignore          # Exclude dist, node_modules, coverage, data
  .env.example             # Complete env var documentation (UPDATE existing)
  turbo.json               # Add lint + typecheck tasks
  apps/api/package.json    # Add "lint" and "typecheck" scripts
  apps/web/package.json    # Add "lint", "typecheck", "format" scripts
  packages/*/package.json  # Add "lint", "typecheck", "format" scripts (each)
```

### Pattern 1: ESLint 9 Flat Config at Root

**What:** Single `eslint.config.mjs` at the repo root that covers all packages. ESLint 9 flat config resolves from the config file location upward, so a root config applies to all subdirectories.

**When to use:** Always for this project. No per-package ESLint configs needed.

**Example:**
```javascript
// eslint.config.mjs (root)
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/data/**",
      "**/*.js",        // Only lint .ts/.tsx files
      "**/*.mjs",       // Skip config files themselves
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",  // API uses CJS require
    },
  }
);
```

**Key decisions:**
- `no-explicit-any` is `warn` not `error` -- the codebase uses `any` extensively, making it an error would produce hundreds of failures and block adoption
- `no-require-imports` is `off` -- the NestJS API uses CommonJS requires
- `argsIgnorePattern: "^_"` -- standard pattern for intentionally unused parameters
- Ignore `**/*.js` and `**/*.mjs` -- only TypeScript files are linted

### Pattern 2: Per-Package Scripts for Turbo

**What:** Each package gets `lint` and `typecheck` scripts. Turbo runs them in parallel via `turbo lint` and `turbo typecheck`.

**Example for a library package (e.g., packages/shared):**
```json
{
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write src"
  }
}
```

**Example for apps/api (NestJS CJS):**
```json
{
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  }
}
```

**Example for apps/web (React):**
```json
{
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc -b --noEmit"
  }
}
```

Note: The web app uses `tsc -b` because it has a `tsconfig.node.json` for Vite config alongside its main tsconfig. The `-b` flag builds both project configs.

### Pattern 3: Turbo Task Registration

**What:** Add `lint` and `typecheck` tasks to `turbo.json` with proper inputs.

```jsonc
{
  "tasks": {
    "lint": {
      "dependsOn": ["^build"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "tsconfig.json"]
    }
  }
}
```

**Why `dependsOn: ["^build"]`:** Linting and typechecking workspace packages requires that their upstream dependencies are built first (so `.d.ts` files exist for type resolution). Without this, `tsc --noEmit` in the API would fail because `@botmem/shared`'s types are not available.

**IMPORTANT:** Do NOT make `build` depend on `lint` or `typecheck`. That would slow down every build. Keep them as independent, parallel tasks. The planner will add a `check` meta-task in a later phase (Phase 32) when git hooks are introduced.

### Pattern 4: Complete .env.example

**What:** Update the existing `.env.example` with ALL variables from `config.service.ts`.

**Current state:** 13 variables documented. Missing: `OLLAMA_RERANKER_MODEL`, `SYNC_DEBUG_LIMIT`, `POSTHOG_HOST`, `DECAY_CRON`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`.

**Structure:** Group by category with comments. Required vars uncommented with safe defaults, optional vars commented out.

### Anti-Patterns to Avoid

- **Per-package ESLint configs:** Do NOT create separate `eslint.config.mjs` in each package. Root config covers everything via Turbo.
- **Making `no-explicit-any` an error immediately:** The codebase uses `any` extensively. Start with `warn`, tighten to `error` in a future phase after cleanup.
- **Adding `.npmrc` with `shamefully-hoist=true`:** This is a Docker-only concern (Phase 33). Adding it at the root leaks phantom dependencies. Explicitly excluded from this phase per PITFALLS.md Pitfall 11.
- **Adding `lint`/`typecheck` as build dependencies:** Do NOT put them in `build.dependsOn`. They are separate quality gates, not build prerequisites. See PITFALLS.md Pitfall 14.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ESLint configuration | Custom rule sets from scratch | `eslint.configs.recommended` + `tseslint.configs.recommended` | Covers 95% of useful rules; hand-picked rules drift and miss common issues |
| Prettier-ESLint conflict resolution | Manual rule disabling | `eslint-config-prettier` | Automatically disables conflicting rules; maintained by Prettier team |
| Cross-package task orchestration | Shell scripts with `--filter` chains | Turbo `tasks` in `turbo.json` | Turbo handles dependency ordering, parallelism, and caching |

## Common Pitfalls

### Pitfall 1: ESLint Flat Config Import Syntax
**What goes wrong:** Using CommonJS `require()` in `eslint.config.mjs` or mixing old `.eslintrc` format with flat config.
**Why it happens:** Most online examples still show ESLint 8 / `.eslintrc` format.
**How to avoid:** Use `.mjs` extension and ES module imports. The `typescript-eslint` package exports a `config()` helper specifically for flat config composition.
**Warning signs:** `eslint.config.mjs` throws "Cannot use import statement" or ESLint ignores the config file entirely.

### Pitfall 2: TypeScript ESLint Requires Built Dependencies
**What goes wrong:** `eslint src` in a package that imports from `@botmem/shared` fails because ESLint's type-aware rules cannot resolve types from unbuilt packages.
**Why it happens:** Type-aware ESLint rules use the TypeScript compiler API, which needs `.d.ts` files from dependencies.
**How to avoid:** Set `dependsOn: ["^build"]` on the `lint` task in turbo.json. This ensures upstream packages are built before linting downstream packages.
**Warning signs:** ESLint errors like "Unable to resolve path to module" or TypeScript parsing errors in lint output.

### Pitfall 3: Incomplete .env.example Causes Silent Failures
**What goes wrong:** New developer copies `.env.example` to `.env` but missing variables cause runtime errors (e.g., JWT secret defaults to a dev-only string, SMTP silently fails).
**Why it happens:** `.env.example` was created early and never updated as new features added variables.
**How to avoid:** Derive `.env.example` directly from `config.service.ts`. Every getter with a `process.env.*` reference must have a corresponding entry in `.env.example`.
**Warning signs:** Developer runs the app and gets cryptic errors about missing configuration.

### Pitfall 4: Web App Typecheck Needs Special Handling
**What goes wrong:** `tsc --noEmit` in the web app fails because it has both `tsconfig.json` and `tsconfig.node.json` (for Vite config).
**Why it happens:** Vite projects use a separate tsconfig for the build tool config (`vite.config.ts`).
**How to avoid:** Use `tsc -b --noEmit` for the web app, which respects the `references` field in tsconfig.json.
**Warning signs:** Type errors in `vite.config.ts` or "cannot find module 'vite'" during typecheck.

## Code Examples

### Root eslint.config.mjs

```javascript
// Source: ESLint 9 flat config docs + typescript-eslint docs
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/data/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
      "drizzle/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
```

### Root .prettierrc

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### Root .editorconfig

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

### Root .prettierignore

```
dist
node_modules
coverage
data
pnpm-lock.yaml
*.db
*.db-shm
*.db-wal
```

### Updated turbo.json (additions only)

```jsonc
{
  "tasks": {
    // ... existing tasks unchanged ...
    "lint": {
      "dependsOn": ["^build"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "tsconfig.json"]
    },
    "format": {
      "cache": false
    }
  }
}
```

### Complete .env.example

```bash
# ===========================
# Botmem Environment Variables
# Copy this file to .env and adjust values for your setup
# ===========================

# --- Core ---
PORT=12412
DB_PATH=./data/botmem.db
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
FRONTEND_URL=http://localhost:12412
PLUGINS_DIR=./plugins

# --- Ollama (AI Inference) ---
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_TEXT_MODEL=qwen3:0.6b
OLLAMA_VL_MODEL=qwen3-vl:2b
OLLAMA_RERANKER_MODEL=sam860/qwen3-reranker:0.6b-Q8_0

# --- Auth (JWT) ---
# IMPORTANT: Change these in production!
JWT_ACCESS_SECRET=dev-access-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# --- SMTP (Password Reset Emails) ---
# Leave empty to use console fallback in dev
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=
# SMTP_FROM=noreply@botmem.xyz

# --- Sync ---
SYNC_DEBUG_LIMIT=500

# --- Scheduled Tasks ---
DECAY_CRON=0 3 * * *

# --- PostHog Analytics (optional) ---
# POSTHOG_API_KEY=
# POSTHOG_HOST=https://us.i.posthog.com

# --- Gmail OAuth (optional) ---
# GMAIL_CLIENT_ID=your-google-client-id
# GMAIL_CLIENT_SECRET=your-google-client-secret

# --- Slack (optional) ---
# SLACK_CLIENT_ID=your-slack-client-id
# SLACK_CLIENT_SECRET=your-slack-client-secret
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.eslintrc.json` / `.eslintrc.js` | `eslint.config.mjs` (flat config) | ESLint 9 (Apr 2024) | Flat config is now default; legacy format deprecated |
| `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` (separate) | `typescript-eslint` (unified package) | typescript-eslint v8 | Single import, flat config native |
| Per-package ESLint configs | Root flat config + Turbo | ESLint 9 flat config | Config inheritance works from root by default |

**Deprecated/outdated:**
- `.eslintrc.*` format: Deprecated since ESLint 9. Will be removed in ESLint 10.
- `@typescript-eslint/parser` as a standalone package: Still works but `typescript-eslint` unified package is the recommended import for flat config.

## Open Questions

1. **React-specific ESLint rules for web app**
   - What we know: The web app uses React 19. `eslint-plugin-react-hooks` is commonly added for hooks linting.
   - What's unclear: Whether to add React-specific plugins in this phase or defer to a later cleanup pass.
   - Recommendation: Defer React-specific plugins. The base `typescript-eslint` config catches most issues. Adding React plugins is additive and can be done anytime without breaking changes.

2. **Exact `no-explicit-any` rule strictness**
   - What we know: The codebase uses `any` extensively. Starting with `warn` is safe.
   - What's unclear: How many warnings this will produce -- could be hundreds.
   - Recommendation: Start with `warn`. If overwhelming, add `// eslint-disable-next-line` to the worst offenders or tighten gradually.

3. **`locations` connector missing test/coverage scripts**
   - What we know: `@botmem/connector-locations` has only `build` and `dev` scripts, no `test` or `test:coverage`.
   - What's unclear: Whether it has any test files at all.
   - Recommendation: Add `lint` and `typecheck` scripts regardless. Skip `test` if no test files exist.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | Per-package `vitest.config.ts` (10 files) |
| Quick run command | `pnpm test` (root, runs via Turbo) |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAL-01 | `pnpm lint` runs ESLint across all packages | smoke | `pnpm lint 2>&1 \| head -5` | N/A -- config validation, not unit test |
| QUAL-02 | `pnpm format` formats code consistently | smoke | `pnpm exec prettier --check "apps/api/src/main.ts"` | N/A -- config validation |
| QUAL-03 | `pnpm typecheck` runs tsc --noEmit across all packages | smoke | `pnpm typecheck 2>&1 \| head -5` | N/A -- config validation |
| DOCK-03 | `.env.example` has all env vars from config.service.ts | manual | Compare `.env.example` entries against `config.service.ts` getters | N/A -- manual review |

### Sampling Rate

- **Per task commit:** Run `pnpm lint` and `pnpm typecheck` to confirm no config errors
- **Per wave merge:** Run full `pnpm lint && pnpm typecheck && pnpm build` to confirm no regressions
- **Phase gate:** All three commands pass cleanly; `.env.example` covers all `config.service.ts` variables

### Wave 0 Gaps

None -- this phase creates configuration files only. No test files needed. Validation is via running the configured commands (`pnpm lint`, `pnpm typecheck`, `pnpm format`) and confirming they execute without config errors.

## Sources

### Primary (HIGH confidence)
- ESLint 9 flat config documentation: https://eslint.org/docs/latest/use/configure/configuration-files
- typescript-eslint flat config: https://typescript-eslint.io/getting-started/typed-linting
- Prettier configuration: https://prettier.io/docs/en/configuration.html
- eslint-config-prettier: https://github.com/prettier/eslint-config-prettier
- Turborepo task configuration: https://turborepo.dev/docs/reference/configuration
- Direct codebase analysis: `config.service.ts` (20+ env vars), `turbo.json`, all `package.json` files, all `tsconfig.json` files

### Secondary (MEDIUM confidence)
- Prior milestone research: `.planning/research/STACK.md`, `FEATURES.md`, `PITFALLS.md`, `SUMMARY.md` (all from 2026-03-08, comprehensive and verified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- ESLint 9 flat config, Prettier, typescript-eslint are well-established with clear official documentation
- Architecture: HIGH -- Single root config pattern is the documented recommended approach for monorepos with ESLint 9 flat config
- Pitfalls: HIGH -- All pitfalls identified from prior milestone research and direct codebase analysis
- .env.example: HIGH -- Derived directly from reading `config.service.ts` (authoritative source of truth)

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable tooling, unlikely to change)
