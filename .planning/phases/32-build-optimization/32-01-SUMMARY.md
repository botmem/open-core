---
phase: 32-build-optimization
plan: 01
subsystem: build-tooling
tags: [pnpm-catalogs, husky, lint-staged, git-hooks, developer-experience]
dependency_graph:
  requires: [29-01, 30-01]
  provides: [centralized-dependency-versions, pre-commit-linting, pre-push-typecheck]
  affects: [all-package-json-files, pnpm-workspace-yaml]
tech_stack:
  added: [husky, lint-staged, pnpm-catalogs]
  patterns: [catalog-protocol, git-hooks-for-quality-gates]
key_files:
  created:
    - .husky/pre-commit
    - .husky/pre-push
  modified:
    - pnpm-workspace.yaml
    - package.json
    - apps/api/package.json
    - apps/web/package.json
    - packages/shared/package.json
    - packages/cli/package.json
    - packages/connector-sdk/package.json
    - packages/connectors/gmail/package.json
    - packages/connectors/imessage/package.json
    - packages/connectors/locations/package.json
    - packages/connectors/photos-immich/package.json
    - packages/connectors/slack/package.json
    - packages/connectors/whatsapp/package.json
    - pnpm-lock.yaml
decisions:
  - 'pnpm catalog for typescript, vitest, vite, @vitest/coverage-v8 -- four deps centralized'
  - 'Pre-push hook uses turbo filter to only check changed packages, not full monorepo'
  - 'lint-staged runs eslint --fix then prettier --write on .ts/.tsx files'
metrics:
  duration: 3min
  completed: '2026-03-08T19:34:00Z'
  tasks_completed: 2
  tasks_total: 2
  files_modified: 14
---

# Phase 32 Plan 01: pnpm Catalogs + Husky Git Hooks Summary

pnpm catalog: protocol centralizes typescript/vitest/vite/@vitest/coverage-v8 versions in pnpm-workspace.yaml; Husky pre-commit runs ESLint+Prettier via lint-staged, pre-push runs turbo typecheck+test on changed packages.

## What Was Done

### Task 1: pnpm Catalogs (890207d)

Added `catalog:` section to `pnpm-workspace.yaml` with four shared dependency versions. Updated all 12 package.json files (root, api, web, shared, cli, connector-sdk, gmail, imessage, locations, photos-immich, slack, whatsapp) to use `"catalog:"` protocol instead of inline version ranges. All packages now resolve identical versions from a single source of truth.

Verified: `pnpm install` succeeds, `pnpm list typescript --recursive --depth 0` shows all 12 packages at typescript 5.9.3.

### Task 2: Husky + lint-staged (4e02cab)

Installed husky and lint-staged as root devDependencies. Created `.husky/pre-commit` (runs `pnpm exec lint-staged`) and `.husky/pre-push` (runs `pnpm turbo typecheck test` filtered to changed packages since origin/main). Added `lint-staged` config to root package.json targeting `.ts/.tsx` files (ESLint fix + Prettier) and `.json/.md/.yaml/.yml` files (Prettier). The `prepare` script ensures hooks are installed on `pnpm install`.

Verified: Pre-commit hook ran successfully during this commit itself -- lint-staged formatted staged files.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `pnpm install` succeeds with catalog resolution
2. `pnpm list typescript --recursive --depth 0` shows 5.9.3 for all 12 packages
3. All expected package.json files contain `"catalog:"` references
4. `.husky/pre-commit` contains `lint-staged`
5. `.husky/pre-push` contains `turbo typecheck test`
6. `package.json` has `prepare` script, `lint-staged` config, and `catalog:` references
7. Pre-commit hook ran and passed during Task 2 commit (live verification)

## Commits

| Task | Commit  | Description                                      |
| ---- | ------- | ------------------------------------------------ |
| 1    | 890207d | Centralize dependency versions via pnpm catalogs |
| 2    | 4e02cab | Add Husky pre-commit and pre-push git hooks      |
