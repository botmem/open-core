---
phase: 16
slug: user-authentication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter api test -- --run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter api test -- --run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | AUTH-01 | unit | `pnpm --filter api test -- --run auth` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | AUTH-02 | unit | `pnpm --filter api test -- --run auth` | ❌ W0 | ⬜ pending |
| 16-01-03 | 01 | 1 | AUTH-03 | unit | `pnpm --filter api test -- --run auth` | ❌ W0 | ⬜ pending |
| 16-01-04 | 01 | 1 | AUTH-04 | unit | `pnpm --filter api test -- --run auth` | ❌ W0 | ⬜ pending |
| 16-01-05 | 01 | 1 | AUTH-05 | unit | `pnpm --filter api test -- --run auth` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 2 | AUTH-02 | integration | browser test | ❌ W0 | ⬜ pending |
| 16-02-02 | 02 | 2 | AUTH-05 | integration | browser test | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/user-auth/__tests__/` — test directory for auth service + controller tests
- [ ] Test fixtures for user creation, JWT mocking, cookie parsing

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| httpOnly cookie set correctly | AUTH-02 | Browser cookie inspection needed | Login via browser, check DevTools > Application > Cookies |
| Password reset email delivery | AUTH-04 | Requires SMTP or console log verification | Trigger forgot-password, verify email/console output |
| React login/register UI flow | AUTH-05 | Visual UI verification | Navigate to /login, /register, complete flows |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
