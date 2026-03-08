---
phase: 33
slug: production-docker
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | Vitest 3 + Docker CLI                                                                                                                                                                 |
| **Config file**        | `apps/api/vitest.config.ts`                                                                                                                                                           |
| **Quick run command**  | `docker build -t botmem-api .`                                                                                                                                                        |
| **Full suite command** | `docker build -t botmem-api . && docker run --rm -d --name botmem-test -p 12412:12412 botmem-api && sleep 3 && curl -sf http://localhost:12412/api/health && docker stop botmem-test` |
| **Estimated runtime**  | ~120 seconds (build) + ~10 seconds (smoke test)                                                                                                                                       |

---

## Sampling Rate

- **After every task commit:** Run `docker build -t botmem-api .`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 130 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type | Automated Command                                                                     | File Exists | Status  |
| -------- | ---- | ---- | ----------- | --------- | ------------------------------------------------------------------------------------- | ----------- | ------- |
| 33-01-01 | 01   | 1    | BUILD-02    | smoke     | `docker build -t botmem-api .`                                                        | -- Wave 0   | pending |
| 33-01-02 | 01   | 1    | BUILD-02    | smoke     | `docker image inspect botmem-api --format '{{.Size}}'`                                | -- Wave 0   | pending |
| 33-01-03 | 01   | 1    | BUILD-02    | e2e       | `docker run --rm -d --name botmem-test botmem-api && curl localhost:12412/api/health` | -- Wave 0   | pending |

_Status: pending / green / red / flaky_

---

## Wave 0 Requirements

- [ ] `Dockerfile` — multi-stage build with turbo prune
- [ ] `.dockerignore` — build context optimization
- [ ] `.npmrc` — pnpm hoisting configuration for Docker
- [ ] Remove `@botmem/web` from API dependencies
- [ ] Guard ServeStaticModule for API-only mode

_Existing infrastructure covers unit test requirements. Docker smoke tests are manual CLI commands._

---

## Manual-Only Verifications

| Behavior                 | Requirement | Why Manual                                   | Test Instructions                                                      |
| ------------------------ | ----------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| Image size < 500MB       | BUILD-02    | Requires Docker daemon                       | `docker image ls botmem-api --format '{{.Size}}'` and verify < 500MB   |
| Health endpoint responds | BUILD-02    | Requires running container with Redis/Qdrant | Start container with docker-compose, `curl localhost:12412/api/health` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 130s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
