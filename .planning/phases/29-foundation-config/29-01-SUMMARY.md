---
phase: 29-foundation-config
plan: 01
subsystem: infra
tags: [eslint, prettier, editorconfig, turbo, typescript, linting, formatting]

requires: []
provides:
  - ESLint 9 flat config with typescript-eslint for monorepo-wide linting
  - Prettier config for consistent code formatting
  - Turbo typecheck task for type-checking all packages
  - Complete .env.example documenting all 26 environment variables
affects: [30-ci-pipeline, 31-testing-infrastructure]

tech-stack:
  added: [eslint@9, "@eslint/js@9", typescript-eslint@8, prettier@3, eslint-config-prettier@10]
  patterns: [single-root-eslint-config, turbo-lint-typecheck-format, env-example-as-documentation]

key-files:
  created:
    - eslint.config.mjs
    - .prettierrc
    - .editorconfig
    - .prettierignore
  modified:
    - turbo.json
    - package.json
    - .env.example
    - apps/api/package.json
    - apps/web/package.json
    - packages/cli/package.json
    - packages/connector-sdk/package.json
    - packages/shared/package.json
    - packages/connectors/gmail/package.json
    - packages/connectors/imessage/package.json
    - packages/connectors/locations/package.json
    - packages/connectors/photos-immich/package.json
    - packages/connectors/slack/package.json
    - packages/connectors/whatsapp/package.json

key-decisions:
  - "Single root eslint.config.mjs -- no per-package ESLint configs (monorepo anti-pattern)"
  - "no-explicit-any as warn not error -- codebase uses any extensively"
  - "Web uses tsc --noEmit (not tsc -b --noEmit) to avoid TS6310 with referenced composite projects"
  - "APP_SECRET added to .env.example -- was missing from plan template but present in config.service.ts"

patterns-established:
  - "Root ESLint config: all TypeScript linting via single eslint.config.mjs at repo root"
  - "Per-package scripts: every package has lint and typecheck scripts invoked via Turbo"
  - "Format from root: prettier runs from root package.json, not per-package"

requirements-completed: [QUAL-01, QUAL-02, QUAL-03, DOCK-03]

duration: 4min
completed: 2026-03-08
---

# Phase 29 Plan 01: Foundation Config Summary

**ESLint 9 flat config + Prettier + typecheck tasks across all 11 workspace packages, with complete .env.example documenting 26 environment variables**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-08T17:20:36Z
- **Completed:** 2026-03-08T17:24:50Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- ESLint 9 flat config with typescript-eslint and eslint-config-prettier at repo root
- Prettier, EditorConfig, and .prettierignore for consistent formatting
- Turbo lint/typecheck/format tasks with proper dependency ordering
- All 11 workspace packages have lint and typecheck scripts
- .env.example expanded from 13 to 26 variables with category headers and safe defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ESLint 9, Prettier, and typecheck tooling** - `1eb245f` (feat)
2. **Task 2: Complete .env.example with all environment variables** - `3023db5` (feat)

## Files Created/Modified
- `eslint.config.mjs` - ESLint 9 flat config with typescript-eslint + prettier
- `.prettierrc` - Prettier configuration (singleQuote, trailingComma, printWidth 100)
- `.editorconfig` - Editor-agnostic formatting basics (indent, charset, newlines)
- `.prettierignore` - Prettier ignore patterns (dist, node_modules, data, lock files)
- `turbo.json` - Added typecheck and format tasks
- `package.json` - Added root typecheck and format scripts
- `.env.example` - Complete environment variable documentation with 26 vars
- `apps/api/package.json` - Added lint, typecheck scripts
- `apps/web/package.json` - Added lint, typecheck scripts
- All 7 library package.json files - Added lint, typecheck scripts

## Decisions Made
- Single root eslint.config.mjs instead of per-package configs (avoids monorepo anti-pattern)
- `no-explicit-any` set to `warn` not `error` due to extensive existing usage
- Web package uses `tsc --noEmit` instead of `tsc -b --noEmit` to avoid TS6310 error with composite tsconfig references
- Added `APP_SECRET` to .env.example (was in config.service.ts but missing from plan template)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed web typecheck script**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Plan specified `tsc -b --noEmit` for web package, but TS6310 error occurs because `--noEmit` conflicts with composite referenced projects
- **Fix:** Changed to `tsc --noEmit` (web tsconfig.json already has `noEmit: true`)
- **Files modified:** apps/web/package.json
- **Verification:** `pnpm typecheck` passes for all 20 tasks
- **Committed in:** 1eb245f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary fix for typecheck to work. No scope creep.

## Issues Encountered
None beyond the web typecheck deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Linting, formatting, and type-checking tooling is operational
- Pre-existing lint errors exist in some packages (unused imports, empty blocks) -- these are out of scope for this plan
- Ready for CI pipeline integration (Phase 30)

---
*Phase: 29-foundation-config*
*Completed: 2026-03-08*
