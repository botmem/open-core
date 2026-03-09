---
phase: 20
slug: encryption-at-rest
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                             |
| ---------------------- | --------------------------------- |
| **Framework**          | vitest 3.x                        |
| **Config file**        | apps/api/vitest.config.ts         |
| **Quick run command**  | `pnpm --filter api test -- --run` |
| **Full suite command** | `pnpm --filter api test -- --run` |
| **Estimated runtime**  | ~15 seconds                       |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter api test -- --run`
- **After every plan wave:** Run `pnpm --filter api test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type | Automated Command                 | File Exists | Status     |
| -------- | ---- | ---- | ----------- | --------- | --------------------------------- | ----------- | ---------- |
| 20-01-01 | 01   | 1    | ENC-02      | unit      | `pnpm --filter api test -- --run` | ❌ W0       | ⬜ pending |
| 20-01-02 | 01   | 1    | ENC-01      | unit      | `pnpm --filter api test -- --run` | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.
- CryptoService already has tests at `apps/api/src/crypto/__tests__/crypto.service.test.ts`

---

## Manual-Only Verifications

| Behavior                              | Requirement | Why Manual                           | Test Instructions                                           |
| ------------------------------------- | ----------- | ------------------------------------ | ----------------------------------------------------------- |
| Migration encrypts existing plaintext | ENC-02      | Requires real DB with plaintext data | Run migration script against test DB, verify rows encrypted |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
