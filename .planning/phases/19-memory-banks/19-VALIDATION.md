---
phase: 19
slug: memory-banks
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                             |
| ---------------------- | --------------------------------- |
| **Framework**          | Vitest 3                          |
| **Config file**        | `apps/api/vitest.config.ts`       |
| **Quick run command**  | `pnpm --filter api test -- --run` |
| **Full suite command** | `pnpm test`                       |
| **Estimated runtime**  | ~30 seconds                       |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter api test -- --run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type   | Automated Command                                 | File Exists | Status     |
| -------- | ---- | ---- | ----------- | ----------- | ------------------------------------------------- | ----------- | ---------- |
| 19-01-01 | 01   | 1    | BANK-01     | unit        | `pnpm --filter api test -- --run memory-banks`    | ❌ W0       | ⬜ pending |
| 19-02-01 | 02   | 1    | BANK-02     | unit        | `pnpm --filter api test -- --run sync.processor`  | ❌ W0       | ⬜ pending |
| 19-02-02 | 02   | 1    | BANK-02     | unit        | `pnpm --filter api test -- --run embed.processor` | ❌ W0       | ⬜ pending |
| 19-03-01 | 03   | 2    | BANK-03     | unit        | `pnpm --filter api test -- --run memory.service`  | ❌ W0       | ⬜ pending |
| 19-03-02 | 03   | 2    | BANK-03     | unit        | `pnpm --filter api test -- --run api-keys`        | ❌ W0       | ⬜ pending |
| 19-04-01 | 04   | 2    | BANK-04     | integration | `pnpm --filter api test -- --run migrate-banks`   | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `apps/api/src/memory-banks/__tests__/memory-banks.service.test.ts` — stubs for BANK-01 CRUD
- [ ] Update `apps/api/src/jobs/__tests__/sync.processor.test.ts` — stubs for BANK-02 memoryBankId threading
- [ ] Update `apps/api/src/memory/__tests__/embed.processor.test.ts` — stubs for BANK-02 bank assignment
- [ ] `apps/api/src/api-keys/__tests__/api-keys.service.test.ts` — stubs for BANK-03 bank scoping

_Existing infrastructure covers framework setup. Only test file stubs needed._

---

## Manual-Only Verifications

| Behavior                             | Requirement | Why Manual              | Test Instructions                                                                  |
| ------------------------------------ | ----------- | ----------------------- | ---------------------------------------------------------------------------------- |
| Frontend bank selector during sync   | BANK-02     | UI interaction flow     | Click Sync on connector, verify bank dropdown appears, select bank, trigger sync   |
| Frontend API key bank multi-select   | BANK-03     | UI interaction flow     | Create API key, verify bank multi-select appears, select banks, create key         |
| Sidebar bank switcher filters search | BANK-03     | UI + search integration | Switch active bank in sidebar, search memories, verify results match selected bank |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
