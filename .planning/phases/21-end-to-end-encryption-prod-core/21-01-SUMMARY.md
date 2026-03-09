---
phase: 21-end-to-end-encryption-prod-core
plan: 01
subsystem: crypto
tags: [argon2id, aes-256-gcm, e2ee, key-derivation, bullmq]

requires:
  - phase: 20-encryption-at-rest
    provides: CryptoService AES-256-GCM encrypt/decrypt with APP_SECRET
provides:
  - UserKeyService in-memory per-user key management singleton
  - CryptoService per-user key encrypt/decrypt methods (encryptWithKey, decryptWithKey)
  - Schema columns encryptionSalt + keyVersion on users, keyVersion on memories
  - POST /api/user-auth/change-password endpoint with re-encryption queue
  - Key derivation wired into login and register flows
affects: [21-02-memory-pipeline-e2ee, 21-03-reencrypt-processor]

tech-stack:
  added: [argon2]
  patterns: [per-user-key-derivation, in-memory-key-cache, reencrypt-queue]

key-files:
  created:
    - apps/api/src/crypto/user-key.service.ts
    - apps/api/src/crypto/__tests__/user-key.service.test.ts
    - apps/api/src/user-auth/dto/change-password.dto.ts
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/crypto/crypto.service.ts
    - apps/api/src/crypto/crypto.module.ts
    - apps/api/src/user-auth/user-auth.service.ts
    - apps/api/src/user-auth/user-auth.controller.ts
    - apps/api/src/user-auth/users.service.ts
    - apps/api/src/user-auth/user-auth.module.ts
    - apps/api/package.json

key-decisions:
  - 'Argon2id with timeCost=3, memoryCost=19456, parallelism=1 for key derivation (OWASP recommended params)'
  - 'Legacy users without encryptionSalt get salt generated on first login (backward compatible)'
  - 'Re-encryption enqueued via BullMQ reencrypt queue (processor built in Plan 02)'
  - 'keyVersion 0 on memories means APP_SECRET encrypted, >=1 means per-user key encrypted'

patterns-established:
  - 'Per-user key derivation: password + per-user salt -> Argon2id -> 32-byte AES-256 key'
  - 'In-memory key cache: keys stored in Map, never persisted to disk or DB'
  - 'Change-password re-encryption: enqueue async job, revoke all tokens, force re-login'

requirements-completed: [E2EE-01]

duration: 4min
completed: 2026-03-09
---

# Phase 21 Plan 01: Per-User Key Derivation Summary

**Argon2id per-user key derivation with in-memory cache, CryptoService per-user encrypt/decrypt methods, and change-password re-encryption queue**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T08:25:18Z
- **Completed:** 2026-03-09T08:29:26Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- UserKeyService singleton deriving 32-byte AES-256 keys via Argon2id with per-user salt
- CryptoService extended with encryptWithKey/decryptWithKey and memory field variants
- Login and register both derive and cache user encryption keys in memory
- Change-password endpoint enqueues re-encryption job and revokes all sessions
- Schema updated with encryptionSalt + keyVersion on users, keyVersion on memories
- 19 passing tests covering UserKeyService and CryptoService per-user methods

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema changes + UserKeyService + CryptoService per-user key methods** - `dbd2c75` (feat)
2. **Task 2: Wire key derivation into login, register, and add change-password endpoint** - `3e6d4a8` (feat)

## Files Created/Modified

- `apps/api/src/crypto/user-key.service.ts` - In-memory per-user key management (deriveAndStore, getKey, hasKey, removeKey)
- `apps/api/src/crypto/__tests__/user-key.service.test.ts` - 6 tests for UserKeyService
- `apps/api/src/crypto/__tests__/crypto.service.test.ts` - Extended with 7 per-user key tests (19 total)
- `apps/api/src/crypto/crypto.service.ts` - Added encryptWithKey, decryptWithKey, and memory field variants
- `apps/api/src/crypto/crypto.module.ts` - Added UserKeyService to global providers/exports
- `apps/api/src/db/schema.ts` - Added encryptionSalt + keyVersion to users, keyVersion to memories
- `apps/api/src/user-auth/user-auth.service.ts` - Key derivation in login/register, changePassword method
- `apps/api/src/user-auth/user-auth.controller.ts` - POST change-password endpoint
- `apps/api/src/user-auth/users.service.ts` - Encryption salt/key version CRUD methods
- `apps/api/src/user-auth/dto/change-password.dto.ts` - Validation DTO
- `apps/api/src/user-auth/user-auth.module.ts` - BullMQ reencrypt queue registration
- `apps/api/package.json` - argon2 dependency

## Decisions Made

- Argon2id parameters follow OWASP recommendations (timeCost=3, memoryCost=19456, parallelism=1)
- Legacy users created before E2EE get encryption salt generated on first login
- Re-encryption on password change is async via BullMQ queue (processor in Plan 02)
- keyVersion=0 on memories indicates APP_SECRET encryption, >=1 indicates per-user key

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DTO property initializer assertions**

- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** class-validator DTO properties need definite assignment assertions (!) with strict TypeScript
- **Fix:** Added `!` to oldPassword and newPassword properties in ChangePasswordDto
- **Files modified:** apps/api/src/user-auth/dto/change-password.dto.ts
- **Committed in:** 3e6d4a8 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial TS strictness fix. No scope creep.

## Issues Encountered

- Pre-existing TypeScript error in accounts.service.ts (missing 'logs' export from schema) -- not from our changes, out of scope

## User Setup Required

None - no external service configuration required. Database migration needed for new columns (encryptionSalt, keyVersion).

## Next Phase Readiness

- UserKeyService and CryptoService per-user methods ready for Plan 02 to wire into memory pipeline
- BullMQ reencrypt queue registered but no processor yet (Plan 02 responsibility)
- Schema columns defined but DB migration not yet applied

---

_Phase: 21-end-to-end-encryption-prod-core_
_Completed: 2026-03-09_
