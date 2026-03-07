# Requirements: Botmem v1.3 — Test Coverage

**Defined:** 2026-03-08
**Core Value:** Every piece of personal communication is searchable, connected, and queryable — with factuality labeling so the user knows what's verified vs. hearsay.

**Constraint:** No functionality changes. Tests only — no refactoring, no new features, no behavior modifications.

## v1.3 Requirements

Requirements for 80% test coverage across the entire monorepo.

### Test Infrastructure

- [ ] **INFRA-01**: Coverage tooling (`@vitest/coverage-v8`) installed and configured across all workspace packages
- [ ] **INFRA-02**: Each workspace package has vitest config with coverage thresholds (80% statements, 80% lines, 80% functions, 75% branches)
- [ ] **INFRA-03**: `pnpm test:coverage` script runs coverage for all packages and reports combined results
- [ ] **INFRA-04**: Coverage reports generated in lcov + text format for local review

### Test Fixes

- [ ] **FIX-01**: All 26 API test files pass (currently 12 failing)
- [ ] **FIX-02**: All 13 web test files pass
- [ ] **FIX-03**: All connector and SDK test files pass

### API Coverage

- [ ] **API-01**: All NestJS service files have unit tests with >=80% coverage
- [ ] **API-02**: All NestJS controller files have unit tests with >=80% coverage
- [ ] **API-03**: All BullMQ processor files have unit tests with >=80% coverage
- [ ] **API-04**: Database schema and migrations have unit tests

### Frontend Coverage

- [ ] **WEB-01**: All Zustand stores have unit tests with >=80% coverage
- [ ] **WEB-02**: All custom hooks have unit tests with >=80% coverage
- [ ] **WEB-03**: All page components have render/integration tests
- [ ] **WEB-04**: Key interactive components (connectors, memory explorer) have unit tests

### Package Coverage

- [ ] **PKG-01**: `packages/cli` has unit tests for all commands with >=80% coverage
- [ ] **PKG-02**: `packages/shared` has unit tests for all exports with >=80% coverage
- [ ] **PKG-03**: `packages/connector-sdk` maintains >=80% coverage
- [ ] **PKG-04**: All connector packages (`gmail`, `slack`, `whatsapp`, `imessage`, `photos-immich`) have >=80% coverage

## Out of Scope

| Feature | Reason |
|---------|--------|
| Integration/E2E tests | Focus on unit tests for coverage target |
| Functionality changes | Pure testing milestone — no refactoring or behavior changes |
| CI/CD pipeline setup | No git remote configured; local coverage enforcement only |
| Performance benchmarks | Separate concern from test coverage |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 7 | Pending |
| INFRA-02 | Phase 7 | Pending |
| INFRA-03 | Phase 7 | Pending |
| INFRA-04 | Phase 7 | Pending |
| FIX-01 | Phase 7 | Pending |
| FIX-02 | Phase 7 | Pending |
| FIX-03 | Phase 7 | Pending |
| API-01 | Phase 8 | Pending |
| API-02 | Phase 8 | Pending |
| API-03 | Phase 8 | Pending |
| API-04 | Phase 8 | Pending |
| WEB-01 | Phase 9 | Pending |
| WEB-02 | Phase 9 | Pending |
| WEB-03 | Phase 9 | Pending |
| WEB-04 | Phase 9 | Pending |
| PKG-01 | Phase 10 | Pending |
| PKG-02 | Phase 10 | Pending |
| PKG-03 | Phase 10 | Pending |
| PKG-04 | Phase 10 | Pending |

**Coverage:**
- v1.3 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-08*
*Last updated: 2026-03-08 after initial definition*
