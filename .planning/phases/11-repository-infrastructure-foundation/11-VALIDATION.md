---
phase: 11
slug: repository-infrastructure-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-08
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification (infrastructure phase, no code tests) |
| **Config file** | N/A |
| **Quick run command** | `git log --all -p \| grep -cE 'GOCSPX\|xoxp-8252\|349660224573'` |
| **Full suite command** | See Per-Task Verification Map below |
| **Estimated runtime** | ~30 seconds (per command) |

---

## Sampling Rate

- **After every task commit:** Run relevant verification command from task map
- **After every plan wave:** Run all verification commands for that wave
- **Before `/gsd:verify-work`:** All 6 verification commands must pass
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | REPO-04 | automated | `grep -rnE 'GOCSPX\|xoxp-8252\|349660224573\|571fe0c3\|cJ5wnFUyeAF' --include='*.ts' --include='*.md' .` (must be 0) | N/A | ⬜ pending |
| 11-01-02 | 01 | 1 | REPO-04 | automated | `git log --all -p \| grep -cE 'GOCSPX\|xoxp-8252\|349660224573\|571fe0c3\|cJ5wnFUyeAF'` (must be 0) | N/A | ⬜ pending |
| 11-02-01 | 02 | 1 | REPO-01 | smoke | `gh api /orgs/botmem --jq .login` (returns "botmem") | N/A | ⬜ pending |
| 11-02-02 | 02 | 1 | REPO-02 | smoke | `gh repo view botmem/open-core --json visibility --jq .visibility` (returns "PUBLIC") | N/A | ⬜ pending |
| 11-02-03 | 02 | 1 | REPO-03 | smoke | `gh repo view botmem/prod-core --json visibility --jq .visibility` (returns "PRIVATE") | N/A | ⬜ pending |
| 11-03-01 | 03 | 2 | DEP-01 | smoke | `ssh root@<IP> 'docker --version && swapon --show && ufw status'` | N/A | ⬜ pending |
| 11-03-02 | 03 | 2 | DEP-05 | smoke | `dig +short botmem.xyz` (returns VPS IP) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. This is an infrastructure phase — verification is command-based, no test framework needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DNS resolution | DEP-05 | Depends on Spaceship registrar propagation | Set A record, wait, verify with `dig +short botmem.xyz` |
| VPS SSH access | DEP-01 | User provisions VPS manually | User confirms SSH access before Claude configures |

---

## Validation Sign-Off

- [x] All tasks have automated verify or manual verification instructions
- [x] Sampling continuity: verification after each task
- [x] Wave 0 not needed (infrastructure phase)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
