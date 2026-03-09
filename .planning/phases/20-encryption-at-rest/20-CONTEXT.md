# Phase 20: Encryption at Rest - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning
**Source:** Auto-advance (codebase analysis — infrastructure phase, no user-facing decisions)

<domain>
## Phase Boundary

Close the remaining gaps in encryption at rest for connector credentials. CryptoService (AES-256-GCM) already exists and is already wired into accounts.service.ts (authContext) and auth.service.ts (connectorCredentials). Two items remain: (1) a migration script to encrypt existing plaintext credential data, and (2) making APP_SECRET required at startup with a fail-fast error.

</domain>

<decisions>
## Implementation Decisions

### Migration script

- Idempotent migration: use CryptoService.isEncrypted() to skip already-encrypted rows
- Migrate both `accounts.authContext` and `connectorCredentials.credentials` columns
- Log count of migrated vs skipped rows for auditability
- Follow same pattern as `apps/api/scripts/migrate-banks.ts` (standalone script, uses Drizzle directly)

### APP_SECRET enforcement

- Fail fast at startup if APP_SECRET is missing or equals the default dev value in production
- Use OnModuleInit pattern (same as DATABASE_URL validation from Phase 22)
- Dev mode: allow the default secret for local development convenience

### Claude's Discretion

- Migration script naming and exact CLI invocation
- Whether to add a dry-run flag to the migration
- Error handling for rows that fail to encrypt (skip and log, or abort)

</decisions>

<code_context>

## Existing Code Insights

### Reusable Assets

- `CryptoService` (apps/api/src/crypto/crypto.service.ts): Full AES-256-GCM with encrypt/decrypt/isEncrypted — ready to use
- `migrate-banks.ts` (apps/api/scripts/): Migration script pattern — standalone, uses Drizzle, idempotent

### Established Patterns

- Encrypt on write, decrypt on read — already implemented in accounts.service.ts and auth.service.ts
- Plaintext passthrough in decrypt() — handles mixed encrypted/plaintext data gracefully
- OnModuleInit for startup validation (config.service.ts, db.service.ts)

### Integration Points

- `config.service.ts` line 110: appSecret getter — needs fail-fast guard
- `accounts` table: authContext column (text, already being encrypted on new writes)
- `connectorCredentials` table: credentials column (text, already being encrypted on new writes)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — the implementation is almost entirely mechanical given existing infrastructure.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 20-encryption-at-rest_
_Context gathered: 2026-03-09 via auto-advance codebase analysis_
