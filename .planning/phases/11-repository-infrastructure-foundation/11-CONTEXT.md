# Phase 11: Repository & Infrastructure Foundation - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up the GitHub org, split the codebase into public open-core and private prod-core repos with sanitized git history, and configure DNS. VPS is provisioned manually by the user — Claude configures it via SSH.

</domain>

<decisions>
## Implementation Decisions

### History Sanitization
- Use `git-filter-repo` to rewrite history and remove secrets
- Push only main branch to the public repo (no feature branches)
- Credentials are test-only — no rotation needed after push
- One-time secret pattern grep before push (no CI check for this phase)
- Patterns to scan: OAuth client secrets (`GOCSPX-*`), Slack tokens (`xoxp-*`), any API keys

### Open-Core / Prod-Core Split
- Open-core is the primary repo with the full working application
- Prod-core is a thin private repo with production configs only
- Prod-core consumes open-core via Docker image from GitHub Container Registry (GHCR)
- Prod-core never clones or contains open-core source code
- Prod-core contains: docker-compose.prod.yml, Caddyfile, .env.prod.example, business docs, monitoring configs
- No deploy scripts in prod-core (deferred — Phase 15 handles CI/CD)
- Open-core includes a basic `docker-compose.yml` for self-hosters (SQLite + Ollama + Redis + Qdrant)

### Inline Secret Cleanup
- Replace all hardcoded secrets with environment variables + `.env.example` with placeholders
- Test files use mocked/stubbed values — no real credentials needed to run tests, CI works without secrets
- Clean CLAUDE.md — remove 'Test Credentials' section
- MEMORY.md is user-specific (~/.claude) — already excluded from repo
- Clean PROJECT_OVERVIEW.md — redact credential values, keep the file
- Files requiring cleanup: `slack.test.ts`, `oauth.ts`, `quickstart.md`, `connectors.md`, `slack.md`, `PROJECT_OVERVIEW.md`, `CLAUDE.md`

### VPS Provisioning
- User provisions the Vultr VPS manually and provides SSH access
- Claude configures the box: Docker, Docker Compose, 2GB swap, firewall (ports 22, 80, 443)
- No scripted provisioning (cloud-init/Ansible) — direct SSH commands

### Claude's Discretion
- Exact git-filter-repo expressions and replacement patterns
- Order of operations (clean secrets first vs split repos first)
- Docker Compose structure for the self-hoster compose file
- VPS configuration commands and security hardening details

</decisions>

<code_context>
## Existing Code Insights

### Files with Inline Secrets (8 files identified)
- `packages/connectors/slack/src/__tests__/slack.test.ts` — Slack user token
- `packages/connectors/slack/src/oauth.ts` — OAuth credentials
- `packages/connectors/slack/src/index.ts` — token references
- `docs/guide/quickstart.md` — credential examples
- `docs/api/connectors.md` — API key examples
- `docs/connectors/slack.md` — Slack token examples
- `PROJECT_OVERVIEW.md` — mixed credentials
- `.planning/ROADMAP.md` — may reference test creds

### Existing Infrastructure
- `.gitignore` covers `.env` files but not inline secrets
- `docker-compose.yml` exists for dev (Redis + Qdrant only)
- No Dockerfile exists yet — needed for GHCR image (Phase 14 scope)
- `business/` directory already gitignored — ready to move to prod-core

### Integration Points
- GitHub org `botmem` — already referenced in git remote and PROJECT.md
- Domain `botmem.xyz` on Spaceship — DNS A record needed
- GHCR integration requires GitHub Actions in open-core (Phase 15 builds the image, but repo structure set here)

</code_context>

<specifics>
## Specific Ideas

- Self-hoster docker-compose.yml should make the project immediately usable with a single `docker compose up`
- Prod-core is intentionally thin — just configs that reference the GHCR image
- The separation should be clean enough that open-core works perfectly standalone without any prod-core dependency

</specifics>

<deferred>
## Deferred Ideas

- CI secret scanning check on every push — could add in Phase 15 with CI/CD setup
- Deploy scripts — Phase 15 handles CI/CD and deployment automation
- Dockerfile for GHCR image — Phase 14 handles Docker production stack

</deferred>

---

*Phase: 11-repository-infrastructure-foundation*
*Context gathered: 2026-03-08*
