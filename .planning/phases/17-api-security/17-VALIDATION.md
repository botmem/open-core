---
phase: 17
slug: api-security
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3 |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && pnpm test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && pnpm test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | SEC-01 | integration | `cd apps/api && pnpm vitest run src/user-auth/__tests__/global-guard.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | SEC-01 | integration | `cd apps/api && pnpm vitest run src/user-auth/__tests__/global-guard.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 1 | SEC-02 | integration | `cd apps/api && pnpm vitest run src/__tests__/cors.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-01-04 | 01 | 1 | SEC-01 | integration | `cd apps/api && pnpm vitest run src/events/__tests__/ws-auth.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/user-auth/__tests__/global-guard.test.ts` — stubs for SEC-01 (guard blocks unauthenticated, allows public)
- [ ] `apps/api/src/__tests__/cors.test.ts` — stubs for SEC-02 (CORS headers + credentials)
- [ ] `apps/api/src/events/__tests__/ws-auth.test.ts` — stubs for SEC-01 WebSocket auth

*No new framework install needed — Vitest 3 already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OAuth callback flow works after global guard | SEC-01 | Requires real OAuth redirect from Google/Slack | 1. Start sync for a connected account 2. Verify OAuth redirect completes without 401 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
