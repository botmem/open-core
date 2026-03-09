---
phase: 21-end-to-end-encryption-prod-core
plan: 02
subsystem: crypto
tags: [aes-256-gcm, per-user-key, bullmq, reencrypt, e2ee]

requires:
  - phase: 21-end-to-end-encryption-prod-core/01
    provides: UserKeyService, CryptoService per-user key methods, keyVersion schema columns
provides:
  - Per-user key encryption in enrich processor (replaces APP_SECRET)
  - Dual-mode decryption in memory.service (keyVersion-based routing)
  - ReencryptProcessor for password-change re-encryption
  - EncryptionKeyMissingError for retry signaling
affects: [21-end-to-end-encryption-prod-core, auth, memory-pipeline]

tech-stack:
  added: []
  patterns: [keyVersion-based decrypt routing, EncryptionKeyMissingError retry pattern]

key-files:
  created:
    - apps/api/src/crypto/encryption-key-missing.error.ts
    - apps/api/src/memory/reencrypt.processor.ts
    - apps/api/src/memory/__tests__/reencrypt.processor.test.ts
  modified:
    - apps/api/src/memory/enrich.processor.ts
    - apps/api/src/memory/backfill.processor.ts
    - apps/api/src/memory/memory.service.ts
    - apps/api/src/memory/memory.module.ts

key-decisions:
  - 'decryptMemoryAuto helper routes to correct key based on keyVersion field (0=APP_SECRET, >=1=user key)'
  - 'EncryptionKeyMissingError thrown when user key unavailable -- BullMQ retries with exponential backoff (30s base, 48 attempts)'
  - 'buildGraphDelta (WS fire-and-forget) uses APP_SECRET fallback since no userId in context'
  - 'Per-row error handling in ReencryptProcessor: log + update keyVersion to avoid infinite loops'

patterns-established:
  - 'keyVersion-based decrypt routing: check memory.keyVersion to select APP_SECRET vs per-user key'
  - 'EncryptionKeyMissingError pattern: throw in processors, catch in BullMQ retry loop'

requirements-completed: [E2EE-02, E2EE-03, E2EE-04]

duration: 6min
completed: 2026-03-09
---

# Phase 21 Plan 02: Memory Pipeline Per-User Encryption Summary

**Per-user AES-256-GCM encryption in enrich/backfill processors with keyVersion-based dual-mode decryption and background re-encryption on password change**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-09T08:31:52Z
- **Completed:** 2026-03-09T08:38:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Enrich processor encrypts memory fields with per-user key derived from password (not APP_SECRET)
- Memory service decrypts with correct key based on keyVersion (0=legacy APP_SECRET, >=1=user key)
- ReencryptProcessor handles password-change re-encryption in batches of 100 with per-row error handling
- EncryptionKeyMissingError triggers BullMQ exponential backoff retry (48 attempts over ~24h)
- Embedding vectors remain plaintext in Qdrant for semantic search (E2EE-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace APP_SECRET encryption with per-user key in pipeline** - `3c17558` (feat)
2. **Task 2: Re-encryption processor for password change (TDD)** - `ff70d46` (test)

## Files Created/Modified

- `apps/api/src/crypto/encryption-key-missing.error.ts` - Shared error class for missing user encryption key
- `apps/api/src/memory/reencrypt.processor.ts` - BullMQ processor for password-change re-encryption batches
- `apps/api/src/memory/__tests__/reencrypt.processor.test.ts` - 5 tests: user-key decrypt, legacy decrypt, error handling, progress, empty banks
- `apps/api/src/memory/enrich.processor.ts` - Switched to per-user key encryption with EncryptionKeyMissingError
- `apps/api/src/memory/backfill.processor.ts` - Per-user key encrypt/decrypt with APP_SECRET legacy fallback
- `apps/api/src/memory/memory.service.ts` - decryptMemoryAuto helper for keyVersion-based routing
- `apps/api/src/memory/memory.module.ts` - Registered reencrypt queue, configured enrich queue retry backoff

## Decisions Made

- decryptMemoryAuto routes decryption based on memory.keyVersion field
- EncryptionKeyMissingError thrown when user key unavailable; BullMQ retries with 30s exponential backoff, 48 attempts
- buildGraphDelta uses APP_SECRET fallback since WS context has no userId
- ReencryptProcessor updates keyVersion even on per-row errors to prevent infinite re-processing loops

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed nullable accountId type errors in Drizzle eq() calls**

- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** memories.accountId is `string | null` but Drizzle `eq(accounts.id, mem.accountId)` requires non-null
- **Fix:** Added null check guard before account lookup query
- **Files modified:** enrich.processor.ts, backfill.processor.ts
- **Verification:** TypeScript compiles cleanly (only pre-existing accounts.service.ts error remains)
- **Committed in:** 3c17558

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type safety fix necessary for compilation. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Per-user encryption pipeline complete
- Ready for auth flow integration (login derives key, password change triggers re-encryption)
- Legacy APP_SECRET memories handled transparently during transition period

---

_Phase: 21-end-to-end-encryption-prod-core_
_Completed: 2026-03-09_
