---
phase: 2
slug: operational-maturity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3 |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | OPS-01 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/decay.test.ts -x` | W0 | pending |
| 02-01-02 | 01 | 1 | OPS-02 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/decay.test.ts -x` | W0 | pending |
| 02-02-01 | 02 | 1 | OPS-03 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/analytics.test.ts -x` | W0 | pending |
| 02-02-02 | 02 | 1 | OPS-04 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/analytics.test.ts -x` | W0 | pending |
| 02-02-03 | 02 | 1 | OPS-05 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/analytics.test.ts -x` | W0 | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/memory/__tests__/decay.test.ts` — stubs for OPS-01, OPS-02 (test decay processor batching, pinned exemption, weight refresh)
- [ ] `apps/api/src/memory/__tests__/analytics.test.ts` — stubs for OPS-03, OPS-04, OPS-05 (test analytics service no-op, event capture)

*Existing Vitest infrastructure covers framework setup — only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PostHog dashboard shows events | OPS-03 | Requires PostHog account + API key | Configure VITE_POSTHOG_API_KEY, trigger search/sync, check PostHog dashboard |
| Decay job runs at scheduled time | OPS-01 | Requires waiting for cron trigger | Set DECAY_CRON to short interval (e.g., every minute), watch logs for execution |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
