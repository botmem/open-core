---
phase: 09
slug: temporal-reasoning
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && pnpm vitest run src/memory/__tests__/nlq-parser.test.ts` |
| **Full suite command** | `cd apps/api && pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && pnpm vitest run src/memory/__tests__/nlq-parser.test.ts`
- **After every plan wave:** Run `cd apps/api && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | NLQ-01 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/nlq-parser.test.ts -t "temporal"` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | NLQ-01 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/nlq-parser.test.ts -t "filter"` | ❌ W0 | ⬜ pending |
| 09-01-03 | 01 | 1 | NLQ-01 | integration | `cd apps/api && pnpm vitest run src/memory/__tests__/memory.service.test.ts -t "temporal fallback"` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 1 | NLQ-02 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/memory.service.test.ts -t "entity"` | ✅ partial | ⬜ pending |
| 09-02-02 | 02 | 1 | NLQ-03 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/nlq-parser.test.ts -t "intent"` | ❌ W0 | ⬜ pending |
| 09-02-03 | 02 | 1 | NLQ-03 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/nlq-parser.test.ts -t "find"` | ❌ W0 | ⬜ pending |
| 09-02-04 | 02 | 1 | NLQ-03 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/nlq-parser.test.ts -t "browse"` | ❌ W0 | ⬜ pending |
| 09-02-05 | 02 | 1 | PERF-01 | integration | `cd apps/api && pnpm vitest run src/memory/__tests__/nlq-parser.test.ts -t "perf"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/memory/__tests__/nlq-parser.test.ts` — stubs for NLQ-01, NLQ-03, PERF-01
- [ ] Extend `apps/api/src/memory/__tests__/memory.service.test.ts` — temporal fallback, intent-based limits
- [ ] `chrono-node` package install: `cd apps/api && pnpm add chrono-node`

*Existing test infrastructure covers framework setup. New test files needed for NLQ parser module.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frontend search result box shows parse feedback | NLQ-03 | UI visual check | Search "emails from Sarah last week", verify parsed info displayed in result box |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
