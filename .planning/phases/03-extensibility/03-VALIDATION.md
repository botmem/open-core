---
phase: 3
slug: extensibility
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3 |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && npx vitest run src/plugins/ --reporter=verbose` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && npx vitest run src/plugins/ --reporter=verbose`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | EXT-01 | unit | `cd apps/api && npx vitest run src/plugins/__tests__/plugin-registry.test.ts -x` | W0 | pending |
| 03-01-02 | 01 | 1 | EXT-02 | unit | `cd apps/api && npx vitest run src/plugins/__tests__/plugin-registry.test.ts -x` | W0 | pending |
| 03-01-03 | 01 | 1 | EXT-03 | unit | `cd apps/api && npx vitest run src/plugins/__tests__/plugins.service.test.ts -x` | W0 | pending |
| 03-01-04 | 01 | 1 | EXT-04 | unit | `cd apps/api && npx vitest run src/plugins/__tests__/sample-plugin.test.ts -x` | W0 | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/plugins/__tests__/plugin-registry.test.ts` — stubs for EXT-01, EXT-02 (registry loading, hook firing, error isolation)
- [ ] `apps/api/src/plugins/__tests__/sample-plugin.test.ts` — stubs for EXT-04 (sample plugin manifest + hook execution)
- [ ] Extend `apps/api/src/plugins/__tests__/plugins.service.test.ts` — stubs for EXT-03 (manifest-based loading)

*Existing Vitest infrastructure covers framework setup — only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sample enricher logs entities during real sync | EXT-04 | Requires running connector sync with plugin dir | Place sample-enricher in plugins/, run Gmail sync, check console for `[sample-enricher]` output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
