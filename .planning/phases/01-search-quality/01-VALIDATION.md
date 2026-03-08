---
phase: 1
slug: search-quality
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3 |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | SRCH-01 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/rerank.test.ts -x` | W0 | pending |
| 01-01-02 | 01 | 1 | SRCH-02 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/rerank.test.ts -x` | W0 | pending |
| 01-02-01 | 02 | 1 | SRCH-03 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/scoring.test.ts -x` | W0 | pending |
| 01-02-02 | 02 | 1 | SRCH-04 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/scoring.test.ts -x` | W0 | pending |
| 01-02-03 | 02 | 1 | SRCH-05 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/scoring.test.ts -x` | W0 | pending |
| 01-02-04 | 02 | 1 | SRCH-06 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/scoring.test.ts -x` | W0 | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/memory/__tests__/rerank.test.ts` — stubs for SRCH-01, SRCH-02 (mock Ollama, verify rerank() method)
- [ ] `apps/api/src/memory/__tests__/scoring.test.ts` — stubs for SRCH-03, SRCH-04, SRCH-05, SRCH-06 (test computeWeights() with pinned/recall scenarios)

*Existing Vitest infrastructure covers framework setup — only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pin toggle visible on search result cards | SRCH-03 | UI visual check | Search for a term, verify pin icon appears on each result card, click to toggle |
| Reranking latency under 3s | SRCH-02 | Requires remote Ollama | Run search with reranker enabled, observe network timing in browser devtools |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
