---
phase: quick-6
plan: 6
subsystem: cicd
tags: [github-actions, docker, ghcr, watchtower, deployment]
dependency_graph:
  requires: []
  provides: [automated-ci-cd-pipeline]
  affects: [production-deployment]
tech_stack:
  added: [github-actions, watchtower, ghcr]
  patterns: [build-push-to-registry, watchtower-auto-update]
key_files:
  created:
    - .github/workflows/deploy.yml
  modified:
    - /opt/botmem/docker-compose.prod.yml (VPS)
    - /Users/amr/.claude/projects/-Users-amr-Projects-botmem/memory/MEMORY.md
decisions:
  - "GitHub Actions uses GITHUB_TOKEN (built-in) for GHCR push — no additional secret needed"
  - "Watchtower restricted to `api` container only via command argument"
  - "GHCR_TOKEN PAT (read:packages) required in .env.prod for Watchtower to pull private images"
  - "API stays on current running image until first GitHub Actions push completes"
metrics:
  duration: 5min
  completed_date: "2026-03-09"
  tasks_completed: 3
  files_changed: 3
---

# Quick Task 6: Create GitHub CI/CD Pipeline Summary

**One-liner:** GitHub Actions + Watchtower CI/CD replacing manual rsync+ssh deploy with commit-push-done automation.

## What Was Built

Fully automated deployment pipeline: pushing to `main` is now the entire deploy workflow.

### Task 1: GitHub Actions Workflow

Created `.github/workflows/deploy.yml` that:
- Triggers on every push to `main`
- Uses `docker/setup-buildx-action@v3` for BuildKit layer caching
- Logs in to GHCR using `GITHUB_TOKEN` (built-in, no extra secrets needed)
- Builds from repo root (`context: .`, `file: ./Dockerfile`)
- Pushes two tags: `ghcr.io/botmem/open-core:latest` and SHA-tagged (`ghcr.io/botmem/open-core:${{ github.sha }}`)
- Uses `cache-from: type=gha` / `cache-to: type=gha,mode=max` for fast subsequent builds
- Targets `linux/amd64` (VPS architecture)
- Has correct `permissions: contents: read, packages: write`

Commit: `6540f0c`

### Task 2: VPS docker-compose.prod.yml Updated

Changed on VPS at `/opt/botmem/docker-compose.prod.yml`:
- **api service**: Removed `build:` block, replaced with `image: ghcr.io/botmem/open-core:latest`
- **watchtower service**: Added new service that polls the `api` container every 30 seconds for image updates
  - Uses `REPO_USER=botmem` and `REPO_PASS=${GHCR_TOKEN}` for private registry auth
  - `command: api` restricts Watchtower to only watch the api container
  - `WATCHTOWER_CLEANUP=true` removes old images after update

### Task 3: MEMORY.md Updated

Updated `/Users/amr/.claude/projects/-Users-amr-Projects-botmem/memory/MEMORY.md`:
- Removed `Rebuild:` line (manual `ssh ... docker compose up -d --build`)
- Removed `Source sync:` line (manual `rsync -az --delete ...`)
- Added CI/CD workflow description with Watchtower and GHCR details
- Added manual restart command for emergency use

## Pending Human Steps (Required Before Watchtower Works)

1. **Create GHCR PAT**: Go to https://github.com/settings/tokens/new
   - Name: `botmem-watchtower`
   - Scope: `read:packages` only
   - Copy the token

2. **Add to VPS .env.prod**: `ssh root@65.20.85.57` then add `GHCR_TOKEN=ghp_...` to `/opt/botmem/.env.prod`

3. **Push to trigger first build**: `git push open-core main` — watch https://github.com/botmem/open-core/actions

4. **Make GHCR image public** (optional — skip if GHCR_TOKEN is set): https://github.com/orgs/botmem/packages

5. **Start Watchtower**: `ssh root@65.20.85.57 'cd /opt/botmem && docker compose -f docker-compose.prod.yml up -d watchtower'`

6. **Switch api to GHCR image** (after first Actions build completes):
   `ssh root@65.20.85.57 'cd /opt/botmem && docker compose -f docker-compose.prod.yml pull api && docker compose -f docker-compose.prod.yml up -d api'`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `.github/workflows/deploy.yml` exists: FOUND
- Commit `6540f0c` exists: FOUND
- VPS docker-compose.prod.yml contains `ghcr.io/botmem/open-core:latest`: CONFIRMED
- VPS docker-compose.prod.yml contains `watchtower` service: CONFIRMED
- MEMORY.md no longer contains `rsync` or `--build`: CONFIRMED (grep returns 0)
