# Phase 32: Build Optimization - Research

**Researched:** 2026-03-08
**Domain:** pnpm catalogs, git hooks (Husky + lint-staged), monorepo build tooling
**Confidence:** HIGH

## Summary

Phase 32 has two distinct deliverables: (1) centralizing dependency versions via pnpm catalogs, and (2) enforcing code quality via git hooks. Both are well-understood patterns with mature tooling and no experimental risk.

The project currently declares `typescript`, `vitest`, and `vite` independently in 11+ package.json files (all at the same version ranges). pnpm 9.5+ supports the `catalog:` protocol natively -- defining versions once in `pnpm-workspace.yaml` and referencing them via `catalog:` in each package.json. No pnpm upgrade is needed (project uses 9.15.0).

For git hooks, Husky 9 + lint-staged is the standard stack. The pre-commit hook runs `lint-staged` (ESLint fix + Prettier on staged files only), and the pre-push hook runs `turbo typecheck test --filter=...[origin/main...HEAD]` to check only changed packages.

**Primary recommendation:** Use pnpm's default catalog (singular `catalog:` field) for TypeScript/Vitest/Vite, Husky 9 for git hooks, and lint-staged for pre-commit file targeting.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUILD-01 | TypeScript, Vitest, and Vite versions defined once in pnpm catalogs, referenced everywhere | pnpm catalog protocol supported in 9.15.0; catalog: field in pnpm-workspace.yaml + catalog: protocol in package.json |
| QUAL-04 | Committing code automatically runs lint+format on staged files; pushing runs typecheck+tests on changed packages | Husky 9 pre-commit/pre-push hooks + lint-staged + turbo --filter |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pnpm catalogs | built-in (9.5+) | Centralize dependency versions | Native pnpm feature, no extra deps, replaces manual version sync |
| husky | ^9.0.0 | Git hook management | De-facto standard, 32k+ GitHub stars, `husky init` scaffolds everything |
| lint-staged | ^15.0.0 | Run linters on staged files only | Pairs with Husky, runs only on changed files (fast), 13k+ stars |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| turbo (existing) | ^2.4.0 | Filter tasks to changed packages | Pre-push hook uses `--filter=...[origin/main...HEAD]` |
| eslint (existing) | ^9.0.0 | Lint TypeScript | Already configured in Phase 29, used by lint-staged |
| prettier (existing) | ^3.4.0 | Format code | Already configured in Phase 29, used by lint-staged |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| lint-staged | Raw `git diff --cached` in shell | lint-staged handles edge cases (partial staging, binary files, concurrent runs) |
| Husky | simple-git-hooks | Husky is more established; simple-git-hooks is lighter but less documented |
| pnpm catalogs | syncpack | Catalogs are native to pnpm, no extra tooling needed |

**Installation:**
```bash
pnpm add -Dw husky lint-staged
pnpm exec husky init
```

## Architecture Patterns

### BUILD-01: pnpm Catalog Setup

**pnpm-workspace.yaml** becomes the single source of truth for shared versions:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "packages/connectors/*"
  - "docs"

catalog:
  typescript: ^5.7.0
  vitest: ^3.0.0
  vite: ^6.1.0
  "@vitest/coverage-v8": ^3.2.4
```

Each package.json replaces the version range with `catalog:`:

```json
{
  "devDependencies": {
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

**Current duplication (what changes):**

| Dependency | Currently declared in | Count |
|------------|----------------------|-------|
| `typescript` | root, api, web, shared, cli, connector-sdk, gmail, imessage, locations, photos-immich, slack, whatsapp | 12 |
| `vitest` | root, api, web, shared, connector-sdk, gmail, imessage, locations, photos-immich, slack, whatsapp | 11 |
| `vite` | api, web | 2 |
| `@vitest/coverage-v8` | root | 1 |

**Important:** The root `package.json` devDependencies for typescript and vitest should also switch to `catalog:`. Root package.json supports catalogs.

### QUAL-04: Git Hook Setup

**File structure after setup:**
```
.husky/
  pre-commit          # lint-staged
  pre-push            # turbo typecheck + test on changed
package.json          # lint-staged config added
```

### Pattern: Pre-Commit Hook (lint-staged)
**What:** Run ESLint --fix and Prettier --write on staged .ts/.tsx files only.
**Hook file:** `.husky/pre-commit`

```bash
pnpm exec lint-staged
```

**lint-staged config in root package.json:**
```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yaml,yml}": [
      "prettier --write"
    ]
  }
}
```

**Why root-level config:** This project uses a single root ESLint config (decision from Phase 29: "Single root eslint.config.mjs -- no per-package ESLint configs"). Root lint-staged config matches this pattern.

### Pattern: Pre-Push Hook (typecheck + test on changed)
**What:** Before pushing, run typecheck and tests only on packages with changes since origin/main.
**Hook file:** `.husky/pre-push`

```bash
pnpm turbo typecheck test --filter='...[origin/main...HEAD]'
```

**Why `...[origin/main...HEAD]`:** The `...` prefix means "include dependencies of changed packages too" -- if `@botmem/shared` changed, this also typechecks/tests `@botmem/api` and `@botmem/web` since they depend on it. The `origin/main...HEAD` range covers all commits on the current branch.

**Fallback for fresh repos:** If `origin/main` does not exist (e.g., fresh clone before first push), the hook should gracefully fall back to running on all packages.

### Anti-Patterns to Avoid
- **Running full turbo lint/test in pre-commit:** Too slow. Pre-commit should only touch staged files via lint-staged.
- **Using `--no-verify` escape hatch:** Defeats the purpose. But users can use it for emergency hotfixes -- Husky does not prevent this.
- **Per-package lint-staged configs:** Unnecessary complexity for a single-developer monorepo with one ESLint config.
- **Adding commitlint:** Explicitly out of scope per v3.0 requirements ("commitlint / conventional commits -- Nice-to-have but adds friction without team coordination need").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Running linters on staged files | Shell script with `git diff --cached` | lint-staged | Handles partial staging, binary file detection, concurrent git operations, error recovery |
| Git hook installation | Manual `.git/hooks/` scripts | Husky | Hooks are versioned in repo, auto-installed on `pnpm install`, portable across machines |
| Dependency version sync | syncpack or manual grep-replace | pnpm catalogs | Native to package manager, zero runtime overhead, replaced on publish |
| Filtering changed packages | Custom shell diff logic | turbo `--filter=...[origin/main...HEAD]` | Turbo understands workspace dependency graph, handles transitive deps |

**Key insight:** All four problems have built-in or near-built-in solutions. Zero custom tooling needed.

## Common Pitfalls

### Pitfall 1: Catalog entries not in lockfile
**What goes wrong:** Adding `catalog:` to pnpm-workspace.yaml but not running `pnpm install` means the lockfile is stale.
**Why it happens:** The catalog: protocol resolves at install time, not at runtime.
**How to avoid:** Run `pnpm install` after modifying pnpm-workspace.yaml catalogs. Verify with `pnpm list typescript` that all packages resolve to the same version.
**Warning signs:** `pnpm install` shows "Lockfile is up to date" but packages have different resolved versions.

### Pitfall 2: Root package.json catalog support
**What goes wrong:** Some developers assume catalogs only work in workspace packages, not in the root.
**Why it happens:** Documentation focuses on workspace packages.
**How to avoid:** Root package.json supports `catalog:` protocol. Use it for root devDependencies too.

### Pitfall 3: Husky hooks not installed after clone
**What goes wrong:** New developer clones repo, runs `pnpm install`, but hooks are not active.
**Why it happens:** Husky 9 requires a `prepare` script in root package.json.
**How to avoid:** Add `"prepare": "husky"` to root package.json scripts. The `pnpm exec husky init` command does this automatically.
**Warning signs:** `.git/hooks/pre-commit` still points to sample, not Husky.

### Pitfall 4: ESLint --fix in lint-staged can fail on type-aware rules
**What goes wrong:** ESLint fix fails because lint-staged passes individual files, and type-aware rules need the full project context.
**Why it happens:** lint-staged invokes `eslint --fix file1.ts file2.ts` -- if ESLint uses typescript-eslint type-aware rules, it needs tsconfig.
**How to avoid:** The current ESLint config uses `tseslint.configs.recommended` (not `recommendedTypeChecked`), so this is NOT a problem for this project. No type-aware rules are in use.

### Pitfall 5: Pre-push hook blocks on long test suites
**What goes wrong:** Developer pushes, waits 5 minutes for tests, gets frustrated.
**Why it happens:** Running full test suite across all packages.
**How to avoid:** Use `--filter=...[origin/main...HEAD]` to run only changed packages. Most pushes will run 0-2 packages.

### Pitfall 6: Packages that don't have a vitest/vite dep forget catalog
**What goes wrong:** Not all packages need vitest or vite. Only add `catalog:` where the dependency already exists.
**Why it happens:** Blindly replacing all package.json files.
**How to avoid:** Only convert existing dependencies. The cli package does NOT have vitest -- leave it alone. Check each package.json.

## Code Examples

### pnpm-workspace.yaml with catalogs

```yaml
# Source: https://pnpm.io/catalogs
packages:
  - "apps/*"
  - "packages/*"
  - "packages/connectors/*"
  - "docs"

catalog:
  typescript: ^5.7.0
  vitest: ^3.0.0
  vite: ^6.1.0
  "@vitest/coverage-v8": ^3.2.4
```

### Package.json with catalog references

```json
{
  "devDependencies": {
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

### Husky init and hook files

```bash
# Installation
pnpm add -Dw husky lint-staged
pnpm exec husky init

# .husky/pre-commit (created by init, then modified)
pnpm exec lint-staged

# .husky/pre-push (create manually)
pnpm turbo typecheck test --filter='...[origin/main...HEAD]'
```

### lint-staged config in root package.json

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yaml,yml}": [
      "prettier --write"
    ]
  }
}
```

### Pre-push hook with fallback

```bash
#!/usr/bin/env sh

# Run typecheck and tests on packages changed since origin/main
# Falls back to all packages if origin/main doesn't exist
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  pnpm turbo typecheck test --filter='...[origin/main...HEAD]'
else
  pnpm turbo typecheck test
fi
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| syncpack / manypkg for version sync | pnpm catalogs (native) | pnpm 9.5 (2024) | No extra tooling, first-class support |
| husky v4 (package.json config) | husky v9 (.husky/ directory) | 2023 | Simpler, faster, no package.json hooks field |
| pre-commit: run all linters | lint-staged (staged files only) | Established pattern | 10-100x faster pre-commit |

**Deprecated/outdated:**
- `husky install` command: replaced by `husky init` in v9
- `.huskyrc` config file: no longer used in v9
- `lint-staged` in husky config field of package.json: v4 pattern, not v9

## Open Questions

1. **Should `@vitest/coverage-v8` be in the catalog?**
   - What we know: Currently only in root package.json. Could be moved to catalog for consistency.
   - What's unclear: Whether any workspace package will need it directly.
   - Recommendation: Include it in the catalog. Even if only root uses it now, it establishes the pattern.

2. **Should other shared devDependencies be cataloged?**
   - What we know: `@types/node`, `@eslint/js`, `eslint`, `prettier`, `turbo` are also shared.
   - What's unclear: Whether to catalog everything or just the three specified (TypeScript, Vitest, Vite).
   - Recommendation: Stick to the three specified in requirements (BUILD-01). Cataloging more is a future enhancement.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | Per-package vitest.config.ts or inline |
| Quick run command | `pnpm turbo test --filter=@botmem/api` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUILD-01 | All packages resolve typescript/vitest/vite from catalog | smoke | `pnpm list typescript --recursive --depth 0` | N/A (manual verification) |
| BUILD-01 | pnpm install succeeds with catalog references | smoke | `pnpm install --frozen-lockfile` | N/A |
| QUAL-04 | Pre-commit hook runs lint-staged | manual | Create file with bad format, attempt commit | N/A (manual-only -- git hooks cannot be unit tested) |
| QUAL-04 | Pre-push hook runs typecheck+test | manual | Introduce type error, attempt push | N/A (manual-only) |

### Sampling Rate
- **Per task commit:** `pnpm install --frozen-lockfile && pnpm typecheck`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Manual test of both hooks (commit with bad format, push with type error)

### Wave 0 Gaps
None -- this phase is configuration-only and does not require test infrastructure. Validation is through manual hook testing and `pnpm install` verification.

## Sources

### Primary (HIGH confidence)
- [pnpm Catalogs docs](https://pnpm.io/catalogs) - catalog: protocol syntax, pnpm-workspace.yaml format, publish behavior
- [Husky get-started](https://typicode.github.io/husky/get-started.html) - v9 init command, hook file format, pnpm integration
- [Turbo run reference](https://turborepo.dev/docs/reference/run) - --filter flag syntax for git-based filtering

### Secondary (MEDIUM confidence)
- [pnpm 9.5 catalogs announcement](https://socket.dev/blog/pnpm-9-5-introduces-catalogs-shareable-dependency-version-specifiers) - feature availability confirmed in 9.5+
- [lint-staged GitHub](https://github.com/lint-staged/lint-staged) - monorepo configuration patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all tools are mature, well-documented, widely used
- Architecture: HIGH - patterns verified against official docs, project state inspected
- Pitfalls: HIGH - based on known issues from official docs and community experience

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable tooling, low churn)
