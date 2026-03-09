# Phase 21: End-to-End Encryption (Prod-Core) - Research

**Researched:** 2026-03-09
**Domain:** Cryptography -- per-user key derivation, AES-256-GCM encryption, server-side key management
**Confidence:** HIGH

## Summary

This phase replaces the current APP_SECRET-based memory encryption with per-user key encryption derived from each user's password via Argon2id. The existing `CryptoService` already implements AES-256-GCM with `encryptMemoryFields`/`decryptMemoryFields` wired into all processors and the memory service. The core change is: instead of one global key derived from `APP_SECRET`, each user gets their own 256-bit key derived from their password + a per-user salt using Argon2id. Keys live only in server memory (`Map<userId, Buffer>`), never on disk or in the database.

The architecture is straightforward because the encrypt/decrypt call sites already exist -- only the key source changes. The main complexity is: (1) deriving the key on login and storing it in a server-memory map, (2) passing the correct user key to encrypt/decrypt calls instead of the global key, (3) handling the "no key available" case (server restart, user hasn't logged in) by holding jobs in the queue, and (4) password change re-encryption as a background batch job.

**Primary recommendation:** Use the `argon2` npm package (server-side, native bindings) with `raw: true` to derive 32-byte keys. Extend `CryptoService` with per-user key methods. Add a `UserKeyService` (singleton) that holds the in-memory `Map<userId, Buffer>`. Add `encryptionSalt` and `keyVersion` columns to the `users` table.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Argon2id via WASM library (`argon2-browser` or equivalent) for key derivation from user password
- Key derived on login (server-side), stored in server memory only (`Map<userId, Buffer>`)
- Key cached in browser IndexedDB for client-side decryption (cleared on logout)
- Key stays in server memory until server restart -- no TTL, no eviction
- User keys are NEVER stored in database or on disk -- memory only
- E2EE is always-on for all users -- no opt-in toggle
- Server runs full pipeline as today (embed + enrich via Ollama)
- After enrichment, server encrypts `text`, `entities`, `claims`, `metadata` with USER key (from in-memory Map)
- Embedding vectors remain plaintext in Qdrant -- semantic search continues to work
- Replaces current APP_SECRET encryption of memory fields (APP_SECRET still used for wrapping credentials in accounts/connectorCredentials)
- If user key is NOT in server memory (server restarted, user hasn't logged in): sync jobs are QUEUED until user logs in and key is re-derived
- Current flow change: enrich -> encrypt with APP_SECRET -> store BECOMES enrich -> encrypt with user key (from memory Map) -> store
- If no user key available: job stays in queue, not processed
- On login: derive key -> store in Map -> resume queued jobs
- WhatsApp real-time messages: same rule -- queue if no key, process when key available
- Server decrypts memory fields using in-memory user key, returns plaintext to browser
- API key auth: works only if user key is in server memory (from a prior login)
- Password change: server-side batch re-encryption (server has both old key and derives new key)
- Track key version per memory for resumability
- Non-blocking: syncs and searches continue during re-encryption
- New memories encrypted with new key; search tries new key first, falls back to old key
- Silent background process -- no UI progress indicator
- Password change returns immediately; re-encryption happens asynchronously

### Claude's Discretion

- Argon2id parameter tuning (memory cost, time cost, parallelism)
- In-memory key Map implementation details (cleanup, concurrency)
- Key version column naming and migration approach
- BullMQ queue pausing/resuming mechanism for "queue until login" behavior
- Exact re-encryption batch size and error handling per row

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                                                  | Research Support                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| E2EE-01 | Encryption key derived from user password via Argon2id                                                                                                       | `argon2` npm package with `raw: true` + per-user salt stored in `users` table   |
| E2EE-02 | Memory text + metadata encrypted before storage (server never sees plaintext -- adjusted: server processes plaintext, encrypts with user key before storing) | Extend CryptoService with per-user key encrypt/decrypt methods                  |
| E2EE-03 | Embedding vectors stay plaintext (semantic search continues to work)                                                                                         | No change to Qdrant upsert path -- only text/entities/claims/metadata encrypted |
| E2EE-04 | Password change re-derives key + re-encrypts all user memories (batched, resumable)                                                                          | `keyVersion` column on memories, BullMQ re-encryption job with batch processing |

</phase_requirements>

## Standard Stack

### Core

| Library     | Version  | Purpose                               | Why Standard                                                                                                                                |
| ----------- | -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| argon2      | ^0.44.0  | Argon2id key derivation (server-side) | Most established Node.js Argon2 binding, prebuilt binaries, TypeScript types included, `raw: true` option returns Buffer for key derivation |
| node:crypto | built-in | AES-256-GCM encrypt/decrypt           | Already used by CryptoService, no additional dependency                                                                                     |

### Supporting

| Library | Version | Purpose                                 | When to Use                                                        |
| ------- | ------- | --------------------------------------- | ------------------------------------------------------------------ |
| bullmq  | ^5.0.0  | Queue management for re-encryption jobs | Already installed, use for password-change re-encryption batch job |

### Alternatives Considered

| Instead of      | Could Use             | Tradeoff                                                                                                 |
| --------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| argon2 (native) | @node-rs/argon2       | Rust-based, faster, smaller (476K vs 3.7M), but less community adoption. argon2 is fine for server-side. |
| argon2 (native) | argon2-browser (WASM) | CONTEXT.md mentions WASM but server-side native is better for NestJS. WASM for browser if needed.        |

**Installation:**

```bash
cd apps/api && pnpm add argon2
```

Note: `argon2` may already be installed (bcrypt is used for password hashing currently). Check `package.json` first.

## Architecture Patterns

### Key Derivation Flow

```
User Login (POST /user-auth/login)
  -> UserAuthService.login(email, password)
  -> Verify password with bcrypt (existing)
  -> IF valid: derive encryption key via Argon2id(password, user.encryptionSalt)
  -> Store key in UserKeyService.keys Map<userId, Buffer>
  -> Resume any queued jobs for this user
  -> Return JWT tokens (existing)
```

### UserKeyService (New Singleton)

```typescript
@Injectable()
export class UserKeyService {
  private keys = new Map<string, Buffer>();

  async deriveAndStore(userId: string, password: string, salt: Buffer): Promise<void> {
    const key = await argon2.hash(password, {
      type: argon2.argon2id,
      raw: true, // Returns Buffer, not encoded string
      hashLength: 32, // 256 bits for AES-256
      salt: salt, // Per-user salt from DB
      timeCost: 3, // iterations
      memoryCost: 65536, // 64 MiB
      parallelism: 1, // Single thread (server-side, many concurrent users)
    });
    this.keys.set(userId, key);
  }

  getKey(userId: string): Buffer | undefined {
    return this.keys.get(userId);
  }

  hasKey(userId: string): boolean {
    return this.keys.has(userId);
  }

  removeKey(userId: string): void {
    this.keys.delete(userId);
  }
}
```

### CryptoService Extension

```typescript
// NEW: Per-user encryption (for memory fields)
encryptWithKey(plaintext: string, key: Buffer): string | null {
  // Same AES-256-GCM logic as encrypt(), but using provided key
}

decryptWithKey(ciphertext: string, key: Buffer): string | null {
  // Same logic as decrypt(), but using provided key
}

encryptMemoryFieldsWithKey(fields, key: Buffer) { ... }
decryptMemoryFieldsWithKey(mem, key: Buffer) { ... }

// KEEP: APP_SECRET-based methods for connectorCredentials/accounts
```

### Database Schema Changes

```sql
-- Users table additions
ALTER TABLE users ADD COLUMN encryption_salt TEXT;  -- random 16-byte salt, base64 encoded
ALTER TABLE users ADD COLUMN key_version INTEGER NOT NULL DEFAULT 1;

-- Memories table addition
ALTER TABLE memories ADD COLUMN key_version INTEGER NOT NULL DEFAULT 1;
```

### Queue-Until-Login Pattern (No BullMQ Pro Required)

```
Approach: Job processor checks UserKeyService.hasKey(userId) before processing.
If no key: move job to 'delayed' state with a backoff.
On login: UserKeyService stores key -> manually promote delayed jobs.

Alternative (simpler): Use a custom "pending-key" job status.
  - Processor picks up job, checks for key
  - No key? -> throw specific error, job goes to 'failed' with custom error code
  - On login: re-add failed jobs for the user

Recommended approach: Use BullMQ's built-in delayed job mechanism.
  - When processor finds no user key: throw a specific EncryptionKeyMissing error
  - Configure job with backoff: { type: 'exponential', delay: 30000 }
  - Job retries automatically every 30s, 60s, 120s...
  - Once user logs in and key is in memory, next retry succeeds
  - Set reasonable maxRetries (e.g., 48 = ~24 hours of retries)
```

### Re-Encryption on Password Change

```
POST /user-auth/change-password { oldPassword, newPassword }
  -> Verify old password (bcrypt)
  -> Derive old encryption key: argon2id(oldPassword, user.encryptionSalt)
  -> Generate new salt, derive new key: argon2id(newPassword, newSalt)
  -> Update user: password_hash, encryption_salt, key_version++
  -> Update UserKeyService with new key
  -> Enqueue re-encryption BullMQ job: { userId, oldKey, newKey, newKeyVersion }
  -> Return immediately

Re-encryption job processor:
  - Query memories WHERE key_version < newKeyVersion AND memoryBankId IN (user's banks)
  - Batch 100 at a time
  - For each: decrypt with old key -> encrypt with new key -> update key_version
  - Track progress via job.updateProgress()
  - On error per row: log and continue (never abort batch)
```

### Reading/Search Flow

```
GET /memories/search?q=...
  -> Auth guard extracts userId from JWT
  -> MemoryService queries Qdrant (vector search) -> gets memory IDs
  -> Fetch memory rows from Postgres
  -> Get user key from UserKeyService
  -> If no key: return 503 "Encryption key not available, please re-login"
  -> Decrypt memory fields with user key
  -> For memories with old key_version: try current key first, fall back to old key (during re-encryption window)
  -> Return plaintext to client
```

### Project Structure Changes

```
apps/api/src/
├── crypto/
│   ├── crypto.service.ts          # Extended with per-user key methods
│   ├── crypto.module.ts           # Exports CryptoService + UserKeyService
│   ├── user-key.service.ts        # NEW: In-memory key management
│   └── __tests__/
│       ├── crypto.service.test.ts # Extended tests
│       └── user-key.service.test.ts # NEW
├── user-auth/
│   ├── user-auth.service.ts       # Modified: derive key on login/register
│   └── user-auth.controller.ts    # Modified: add change-password endpoint
├── memory/
│   ├── enrich.processor.ts        # Modified: use per-user key
│   ├── embed.processor.ts         # Modified: no encrypt here (enrich does it)
│   ├── backfill.processor.ts      # Modified: use per-user key
│   ├── memory.service.ts          # Modified: decrypt with per-user key
│   └── reencrypt.processor.ts     # NEW: password change re-encryption
└── db/
    └── schema.ts                  # Modified: add columns to users + memories
```

### Anti-Patterns to Avoid

- **Storing derived keys in the database:** Keys must only exist in process memory. Database theft must not yield decryption capability.
- **Using APP_SECRET as fallback for memory fields:** If user key is unavailable, the correct behavior is to queue/delay, not fall back to a global key.
- **Re-encrypting synchronously during password change:** Must be async background job. Password change endpoint returns immediately.
- **Deriving key on every request:** Derive once on login, cache in Map. Argon2id is intentionally slow (~300ms with recommended params).

## Don't Hand-Roll

| Problem                | Don't Build                     | Use Instead                           | Why                                                                                            |
| ---------------------- | ------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Key derivation         | Custom PBKDF2/scrypt wrapper    | `argon2` npm package with `raw: true` | Argon2id is the gold standard for password-based key derivation; resistant to GPU/ASIC attacks |
| AES-256-GCM            | Custom cipher wrapper           | Extend existing `CryptoService`       | Already proven, tested, format established (iv:ciphertext:tag)                                 |
| Job retry with backoff | Custom polling/timer system     | BullMQ built-in retry + backoff       | Already in the stack, handles edge cases (crashes, restarts)                                   |
| Batch processing       | Custom cursor/offset pagination | Follow backfill.processor pattern     | Existing pattern with `enrichedAt`-style markers for resumability                              |

**Key insight:** The existing CryptoService and pipeline infrastructure handle 90% of this. The new work is (1) a key management service, (2) plumbing user keys through existing encrypt/decrypt call sites, and (3) the queue-until-login behavior.

## Common Pitfalls

### Pitfall 1: Missing User Key After Server Restart

**What goes wrong:** Server restarts, all in-memory keys are lost. Sync jobs and search requests fail.
**Why it happens:** Keys are intentionally memory-only (zero-knowledge design).
**How to avoid:**

- Sync jobs: Use BullMQ retry with backoff. Jobs auto-retry until user logs in.
- Search: Return clear 503 error telling user to re-login.
- On login: Re-derive key and resume pending jobs.
  **Warning signs:** Jobs stuck in retry loop for extended periods.

### Pitfall 2: Race Condition During Re-Encryption

**What goes wrong:** New memories use new key while old memories still have old key. Search must handle both.
**Why it happens:** Re-encryption is async, takes time for large memory sets.
**How to avoid:**

- Store `keyVersion` per memory row.
- On decrypt: check memory's keyVersion vs user's current keyVersion.
- If mismatch: try current key first, then derive old key from stored params.
  **Warning signs:** Decryption failures on memories with mismatched key versions.

### Pitfall 3: Salt Not Persisted Before Key Derivation

**What goes wrong:** Salt generated during registration but not saved to DB. Key cannot be re-derived on next login.
**Why it happens:** Transaction ordering -- must save salt to DB before or atomically with user creation.
**How to avoid:** Generate salt in `register()`, include in `createUser()` call. Salt is stored in `users.encryption_salt` column.
**Warning signs:** "Invalid credentials" after successful registration.

### Pitfall 4: Argon2id Memory Cost Too High for Server

**What goes wrong:** Server OOM when multiple users log in concurrently.
**Why it happens:** Default memoryCost is 64 MiB per hash. 10 concurrent logins = 640 MiB.
**How to avoid:** Use `parallelism: 1` and consider reducing `memoryCost` to 19456 (19 MiB) for server-side. Add a concurrency semaphore for key derivation (max 3 concurrent derivations).
**Warning signs:** Memory spikes during login bursts.

### Pitfall 5: Backfill Processor Decrypt/Encrypt Mismatch

**What goes wrong:** Backfill processor decrypts with APP_SECRET (old) but memory was encrypted with user key (new).
**Why it happens:** Mixed encryption during migration period.
**How to avoid:** Check `keyVersion` column. Version 0 or null = APP_SECRET encryption (legacy). Version >= 1 = user key encryption.
**Warning signs:** Decryption produces garbage text.

## Code Examples

### Deriving a Key with argon2 (raw mode)

```typescript
// Source: argon2 npm package docs + wiki
import argon2 from 'argon2';
import { randomBytes } from 'crypto';

// Generate salt (once per user, at registration)
const salt = randomBytes(16);

// Derive 256-bit key from password
const key: Buffer = await argon2.hash(password, {
  type: argon2.argon2id,
  raw: true, // Returns Buffer, not encoded string
  hashLength: 32, // 256 bits = 32 bytes
  salt: salt,
  timeCost: 3,
  memoryCost: 19456, // ~19 MiB (conservative for server)
  parallelism: 1,
});
// key is a 32-byte Buffer, suitable for AES-256-GCM
```

### Per-User Encrypt/Decrypt in CryptoService

```typescript
encryptWithKey(plaintext: string | null | undefined, key: Buffer): string | null {
  if (plaintext == null) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

decryptWithKey(ciphertext: string | null | undefined, key: Buffer): string | null {
  if (ciphertext == null) return null;
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return ciphertext;
  try {
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    if (iv.length !== 12 || tag.length !== 16) return ciphertext;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return ciphertext;
  }
}
```

### Resolving userId from Memory Context (Existing Pattern)

```typescript
// Already in embed.processor.ts lines 149-153:
const [acct] = await this.dbService.db
  .select({ userId: accounts.userId })
  .from(accounts)
  .where(eq(accounts.id, rawEvent.accountId));
const ownerUserId = acct?.userId || null;
// Then: const key = this.userKeyService.getKey(ownerUserId);
```

### Password Change Endpoint

```typescript
// New endpoint in user-auth.controller.ts
@Post('change-password')
@HttpCode(200)
async changePassword(
  @CurrentUser() user: { id: string },
  @Body() dto: ChangePasswordDto,  // { oldPassword, newPassword }
) {
  await this.authService.changePassword(user.id, dto.oldPassword, dto.newPassword);
  return { ok: true };
}
```

## State of the Art

| Old Approach                                    | Current Approach                   | When Changed | Impact                                           |
| ----------------------------------------------- | ---------------------------------- | ------------ | ------------------------------------------------ |
| APP_SECRET global key for all memory encryption | Per-user key derived from password | This phase   | Server DB theft no longer exposes memory content |
| scryptSync for key derivation                   | Argon2id (memory-hard KDF)         | This phase   | Better resistance to GPU/ASIC attacks            |
| No key version tracking                         | keyVersion per memory + per user   | This phase   | Enables safe password change re-encryption       |

**Deprecated/outdated:**

- APP_SECRET for memory field encryption: Replaced by per-user keys. APP_SECRET remains for connectorCredentials and accounts.authContext only.

## Open Questions

1. **Migration of existing APP_SECRET-encrypted memories**
   - What we know: Existing memories are encrypted with APP_SECRET (keyVersion implicitly = 0)
   - What's unclear: Should migration happen as a one-time script or lazily on first login?
   - Recommendation: On first login after upgrade, if user has memories with keyVersion=0 (or NULL), trigger a background re-encryption from APP_SECRET to user key. Same pattern as password-change re-encryption.

2. **Browser-side key caching in IndexedDB**
   - What we know: CONTEXT.md says cache key in IndexedDB, cleared on logout
   - What's unclear: If server does all encrypt/decrypt, what does the browser need the key for?
   - Recommendation: Skip browser-side key caching for now. Server handles all encrypt/decrypt. If client-side decryption is needed later (true E2EE), that's a future enhancement.

3. **API key authentication + missing user key**
   - What we know: API keys are read-only, scoped to memory banks. CONTEXT.md says "works only if user key is in server memory"
   - What's unclear: Should API key requests fail with 503 or queue somehow?
   - Recommendation: Return 503 with clear message: "Owner must log in to enable memory decryption"

## Validation Architecture

### Test Framework

| Property           | Value                             |
| ------------------ | --------------------------------- |
| Framework          | Vitest 3                          |
| Config file        | `apps/api/vitest.config.ts`       |
| Quick run command  | `pnpm --filter api test -- --run` |
| Full suite command | `pnpm test`                       |

### Phase Requirements -> Test Map

| Req ID  | Behavior                                                                 | Test Type | Automated Command                                                                  | File Exists?                |
| ------- | ------------------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------- | --------------------------- |
| E2EE-01 | Key derived from password via Argon2id, produces 32-byte Buffer          | unit      | `pnpm --filter api test -- --run src/crypto/__tests__/user-key.service.test.ts`    | No -- Wave 0                |
| E2EE-02 | Memory fields encrypted with per-user key (not APP_SECRET)               | unit      | `pnpm --filter api test -- --run src/crypto/__tests__/crypto.service.test.ts`      | Partially (extend existing) |
| E2EE-03 | Embedding vectors remain plaintext after encryption                      | unit      | `pnpm --filter api test -- --run src/memory/__tests__/enrich.processor.test.ts`    | Yes (extend)                |
| E2EE-04 | Password change triggers batched re-encryption with key version tracking | unit      | `pnpm --filter api test -- --run src/memory/__tests__/reencrypt.processor.test.ts` | No -- Wave 0                |

### Sampling Rate

- **Per task commit:** `pnpm --filter api test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/api/src/crypto/__tests__/user-key.service.test.ts` -- covers E2EE-01 (key derivation + in-memory storage)
- [ ] `apps/api/src/memory/__tests__/reencrypt.processor.test.ts` -- covers E2EE-04 (batch re-encryption)
- [ ] Extended tests in `crypto.service.test.ts` for `encryptWithKey`/`decryptWithKey` methods

## Sources

### Primary (HIGH confidence)

- Existing codebase: `apps/api/src/crypto/crypto.service.ts` -- current AES-256-GCM implementation
- Existing codebase: `apps/api/src/memory/enrich.processor.ts` -- encryption call site
- Existing codebase: `apps/api/src/user-auth/user-auth.service.ts` -- login/register flow
- Existing codebase: `apps/api/src/db/schema.ts` -- users table, memories table
- argon2 npm package wiki (Options page) -- `raw: true` returns Buffer, `hashLength: 32` for 256-bit keys

### Secondary (MEDIUM confidence)

- [argon2 npm package](https://www.npmjs.com/package/argon2) -- v0.44.0, prebuilt binaries, TypeScript support
- [node-argon2 GitHub](https://github.com/ranisalt/node-argon2) -- API documentation and options
- [BullMQ pausing queues docs](https://docs.bullmq.io/guide/workers/pausing-queues) -- global pause/resume

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- `argon2` is the established Node.js package, `raw: true` verified via wiki
- Architecture: HIGH -- extending existing CryptoService + existing pipeline, minimal new abstractions
- Pitfalls: HIGH -- well-understood cryptographic patterns, codebase-specific edge cases documented
- Queue-until-login: MEDIUM -- BullMQ retry/backoff is standard but "resume on login" needs careful implementation

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable cryptographic libraries, unlikely to change)
