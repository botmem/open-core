# Roadmap: Botmem v1.3 — Test Coverage

**Milestone Goal:** Achieve 80% test coverage across the entire monorepo — fix all failing tests, install coverage tooling, and write tests for all packages without changing any functionality.

**Constraint:** No functionality changes. Tests only.

## Phases

### Phase 7: Test Infrastructure & Fixes
**Goal**: Clean baseline — all existing tests pass, coverage tooling installed and configured
**Depends on**: Nothing (independent of v1.2)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, FIX-01, FIX-02, FIX-03
**Success Criteria** (what must be TRUE):
  1. `@vitest/coverage-v8` is installed and `pnpm test:coverage` produces coverage reports for all packages
  2. All 52 existing test files pass with zero failures (currently 12 failing files, 77 failing tests)
  3. Each workspace vitest config has coverage thresholds set (80/80/80/75)
  4. Coverage reports are generated in both text (terminal) and lcov format
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md -- Install coverage tooling, configure vitest configs, add workspace scripts
- [ ] 07-02-PLAN.md -- Fix all failing tests across API, web, connectors, and SDK

### Phase 8: API Test Coverage
**Goal**: All API source files (services, controllers, processors) have unit tests reaching 80% coverage
**Depends on**: Phase 7 (tests must pass first)
**Requirements**: API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. `apps/api` coverage report shows >=80% statements, lines, and functions
  2. Every NestJS service and controller file in `apps/api/src/` has a corresponding test file
  3. All BullMQ processors (sync, embed, enrich, backfill, file) have comprehensive unit tests
  4. Database schema utilities have test coverage
**Plans**: 3 plans

Plans:
- [ ] 08-01-PLAN.md -- Service unit tests (config, db, accounts, auth, connectors, contacts, logs, events)
- [ ] 08-02-PLAN.md -- Controller and gateway tests (accounts, jobs, connectors, memory, plugins controllers + events gateway)
- [ ] 08-03-PLAN.md -- Processor and memory tests (sync, embed, enrich, backfill, file processors + memory service + ollama + qdrant)

### Phase 9: Frontend Test Coverage
**Goal**: All frontend source files (stores, hooks, pages, components) have tests reaching 80% coverage
**Depends on**: Phase 7
**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04
**Success Criteria** (what must be TRUE):
  1. `apps/web` coverage report shows >=80% statements, lines, and functions
  2. All Zustand stores and custom hooks have unit tests
  3. All page components have render tests verifying key elements
  4. Memory explorer, connector setup, and graph components have interaction tests
**Plans**: 3 plans

Plans:
- [ ] 09-01-PLAN.md -- Store and hook tests (authStore, connectorStore, jobStore, memoryStore + all hooks)
- [ ] 09-02-PLAN.md -- Page and layout component tests (Dashboard, ConnectorsPage, MemoryExplorerPage, Login, Onboarding)
- [ ] 09-03-PLAN.md -- Interactive component tests (connector setup/QR/OAuth, memory search/detail/graph, job table)

### Phase 10: Package Test Coverage
**Goal**: All standalone packages (CLI, shared, connector-sdk, connectors) have tests reaching 80% coverage
**Depends on**: Phase 7
**Requirements**: PKG-01, PKG-02, PKG-03, PKG-04
**Success Criteria** (what must be TRUE):
  1. `packages/cli` has tests for all commands and the client module with >=80% coverage
  2. `packages/shared` has tests for all exported types and utilities with >=80% coverage
  3. `packages/connector-sdk` maintains >=80% coverage
  4. All 5 connector packages have >=80% coverage with mocked external dependencies
**Plans**: 2 plans

Plans:
- [ ] 10-01-PLAN.md -- CLI and shared package tests (all CLI commands + shared utilities)
- [ ] 10-02-PLAN.md -- Connector package tests (gmail, slack, whatsapp, imessage, photos-immich + connector-sdk)

## Progress

**Execution Order:**
Phase 7 first (infrastructure), then Phases 8, 9, 10 can run in parallel.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 7. Test Infrastructure & Fixes | v1.3 | 0/2 | Not started | - |
| 8. API Test Coverage | v1.3 | 0/3 | Not started | - |
| 9. Frontend Test Coverage | v1.3 | 0/3 | Not started | - |
| 10. Package Test Coverage | v1.3 | 0/2 | Not started | - |
