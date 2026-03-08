# Phase 16: User Authentication - Research

**Researched:** 2026-03-08
**Domain:** NestJS user authentication (JWT + bcrypt + httpOnly refresh cookies)
**Confidence:** HIGH

## Summary

Phase 16 adds real user authentication to Botmem, replacing the current localStorage-based fake auth with server-side JWT access tokens and httpOnly refresh cookies. The codebase currently has zero auth infrastructure -- no guards, no user model in the database, no password hashing. The existing `auth/` module handles only connector OAuth flows (Gmail/Slack) and must remain untouched; user auth gets its own module (`user-auth/`).

The implementation requires: (1) a `users` table and `refresh_tokens` table in the existing SQLite schema, (2) a new `user-auth` NestJS module with bcrypt password hashing and JWT signing, (3) a `password_resets` table with email-based reset flow, (4) replacing the frontend Zustand auth store with real API calls and in-memory token management, and (5) a refresh token rotation scheme that invalidates old tokens on use.

**Primary recommendation:** Use `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` for the standard NestJS auth pattern, `bcrypt` for password hashing (per requirements), and `cookie-parser` for httpOnly refresh cookie handling. Name the new module `user-auth` to avoid conflict with the existing connector `auth` module. Do NOT apply a global auth guard in this phase -- that is Phase 17 (SEC-01).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Register with email + password (bcrypt hash, minimum 8 chars) | Standard Stack (bcrypt, @nestjs/jwt), Architecture (users table, UserAuthService.register), Code Examples (bcrypt hashing pattern) |
| AUTH-02 | Login -> JWT access token (15min) + httpOnly refresh cookie (7d) | Architecture (token pair generation, cookie config), Code Examples (login flow, cookie settings), Pitfalls (timing attacks, Secure flag in dev) |
| AUTH-03 | Refresh access token via POST /auth/refresh using refresh cookie | Architecture (refresh token rotation), Code Examples (refresh endpoint, cookie-parser setup), Pitfalls (race conditions on concurrent refresh) |
| AUTH-04 | Password reset via email link (cryptographic token, 1hr expiry) | Architecture (password_resets table, MailService), Code Examples (token generation, nodemailer pattern), Pitfalls (email enumeration, rate limiting) |
| AUTH-05 | Session persistence via refresh token rotation (old token invalidated on use) | Architecture (refresh_tokens table with family tracking), Code Examples (rotation flow), Pitfalls (replay attack detection via family revocation) |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/jwt` | `^11.0.0` | JWT signing/verification as NestJS module | Official NestJS auth package, wraps `jsonwebtoken`, integrates with DI |
| `@nestjs/passport` | `^11.0.0` | Strategy-based auth framework | Official NestJS auth integration, standard pattern in NestJS docs |
| `passport` | `^0.7.0` | Core passport (peer dep) | Required by @nestjs/passport |
| `passport-jwt` | `^4.0.1` | JWT strategy for Bearer token validation | Standard JWT extraction from Authorization header |
| `bcrypt` | `^5.1.1` | Password hashing (bcrypt algorithm) | Specified in requirements (AUTH-01); battle-tested, native bindings |
| `cookie-parser` | `^1.4.7` | Parse cookies in Express requests | Required to read httpOnly refresh cookie from request |
| `nodemailer` | `^6.9.0` | SMTP email sending | Standard Node.js email library for password reset emails |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `passport-local` | `^1.0.0` | Username/password strategy | Optional -- can use passport-local for login or handle manually in controller |
| `@types/passport-jwt` | `^4.0.1` | TypeScript types | Dev dependency |
| `@types/bcrypt` | `^5.0.2` | TypeScript types | Dev dependency |
| `@types/cookie-parser` | `^1.4.7` | TypeScript types | Dev dependency |
| `@types/nodemailer` | `^6.4.0` | TypeScript types | Dev dependency |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `bcrypt` | `argon2` | Argon2id is memory-hard (better GPU resistance), OWASP primary recommendation -- but requirements explicitly say bcrypt |
| `@nestjs/jwt` | `jose` | jose is ESM-native, Web Crypto based -- overkill for NestJS where @nestjs/jwt handles everything |
| `passport-local` | Manual validation in controller | passport-local adds boilerplate; manual validation in service is simpler for email+password |
| `nodemailer` | `@nestjs-modules/mailer` | NestJS mailer module wraps nodemailer with template support -- unnecessary for a single reset email |

**Installation:**

```bash
# API dependencies
pnpm --filter @botmem/api add @nestjs/jwt@^11.0.0 @nestjs/passport@^11.0.0 passport@^0.7.0 passport-jwt@^4.0.1 bcrypt@^5.1.1 cookie-parser@^1.4.7 nodemailer@^6.9.0

# Dev dependencies (types)
pnpm --filter @botmem/api add -D @types/passport-jwt@^4.0.1 @types/bcrypt@^5.0.2 @types/cookie-parser@^1.4.7 @types/nodemailer@^6.4.0
```

## Architecture Patterns

### Recommended Project Structure

```
apps/api/src/
  user-auth/                     # NEW module (separate from existing auth/)
    user-auth.module.ts
    user-auth.controller.ts      # /api/user-auth/* endpoints
    user-auth.service.ts         # Registration, login, refresh, reset logic
    users.service.ts             # User CRUD, refresh token management
    jwt.strategy.ts              # Passport JWT strategy (Bearer header extraction)
    jwt-auth.guard.ts            # Guard for protecting endpoints (used per-controller in Phase 16, global in Phase 17)
    decorators/
      current-user.decorator.ts  # @CurrentUser() param decorator
      public.decorator.ts        # @Public() metadata decorator (used in Phase 17)
  mail/                          # NEW module
    mail.module.ts
    mail.service.ts              # sendResetEmail(to, resetUrl)
  db/
    schema.ts                    # ADD: users, refreshTokens, passwordResets tables
  config/
    config.service.ts            # ADD: jwtAccessSecret, jwtRefreshSecret, smtp* getters
  main.ts                        # ADD: cookie-parser middleware
apps/web/src/
  store/authStore.ts             # REWRITE: real API calls, in-memory token, refresh flow
  lib/api.ts                     # ADD: Authorization header injection, 401 interceptor
  pages/LoginPage.tsx            # UPDATE: use real API login
  pages/SignupPage.tsx           # UPDATE: use real API register
  pages/ForgotPasswordPage.tsx   # NEW
  pages/ResetPasswordPage.tsx    # NEW
  components/auth/LoginForm.tsx  # UPDATE: error handling, loading states
```

### Pattern 1: Separate User Auth Module

**What:** Create a `user-auth/` module completely separate from the existing `auth/` module (which handles connector OAuth).

**When to use:** When an existing module has a different responsibility (connector OAuth) and adding user auth to it would create confusion.

**Why:** The existing `auth/` module at `apps/api/src/auth/` handles connector OAuth flows (Gmail, Slack callbacks). Its controller maps `POST /api/auth/:type/initiate`, `GET /api/auth/:type/callback`, etc. User auth endpoints (register, login, refresh) are a different domain. Using a separate module avoids naming collisions and keeps concerns clean.

**Endpoint prefix:** Use `/api/user-auth/` to avoid conflict with `/api/auth/:type/*` connector routes.

### Pattern 2: Access Token in Memory + Refresh Cookie

**What:** Access tokens (15min) stored only in JavaScript memory (Zustand store, NOT persisted). Refresh tokens (7d) stored as httpOnly cookies.

**When to use:** SPAs that need XSS protection for auth tokens.

**Example flow:**
```
1. Login:   POST /api/user-auth/login -> { accessToken } + Set-Cookie: refresh_token=...
2. API call: Authorization: Bearer <accessToken>
3. 401:     POST /api/user-auth/refresh (cookie auto-sent) -> { accessToken }
4. Retry:   Authorization: Bearer <newAccessToken>
5. Page refresh: accessToken lost -> call /refresh -> restored
```

### Pattern 3: Refresh Token Rotation with Family Tracking

**What:** Each refresh generates a new token and invalidates the old one. Tokens share a `family` ID. If a revoked token is replayed, all tokens in the family are revoked (indicates theft).

**Data model:**
```
refreshTokens table:
  id         - UUID
  userId     - FK to users
  tokenHash  - SHA-256 of the token value
  family     - UUID (shared across rotations)
  expiresAt  - ISO timestamp
  revokedAt  - ISO timestamp (null if active)
  createdAt  - ISO timestamp
```

### Pattern 4: Password Reset Token

**What:** Cryptographic random token, stored as SHA-256 hash in DB, sent as URL parameter in email. 1-hour expiry.

**Flow:**
```
1. POST /api/user-auth/forgot-password { email }
   -> Always returns 200 (no email enumeration)
   -> If user exists: generate token, store hash, send email
2. User clicks link: {FRONTEND_URL}/reset-password?token=<token>
3. POST /api/user-auth/reset-password { token, newPassword }
   -> Hash submitted token, look up in DB
   -> If valid + not expired + not used: update password, mark token used, revoke all refresh tokens
```

### Anti-Patterns to Avoid

- **Storing JWT in localStorage:** Any XSS vulnerability exposes the token. Use in-memory storage for access token, httpOnly cookie for refresh token.
- **Using the same secret for access and refresh tokens:** If access token secret leaks, attacker can forge refresh tokens. Use separate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
- **Returning different errors for "email not found" vs "wrong password":** Enables email enumeration attacks. Always return generic "Invalid credentials" for both cases.
- **Adding user auth to the existing auth/ module:** The existing `auth/` module handles connector OAuth. Mixing user auth in would create route conflicts (`/api/auth/:type/*` collides with `/api/auth/login`).
- **Applying global auth guard in Phase 16:** Phase 17 (SEC-01) handles the global guard. Phase 16 should add the guard infrastructure but only apply it per-controller where needed for testing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing/verification | Custom crypto-based JWT | `@nestjs/jwt` (wraps `jsonwebtoken`) | JWT has subtle security requirements (algorithm confusion, clock skew); the official module handles all edge cases |
| Password hashing | Custom salt+hash | `bcrypt` package | bcrypt has built-in salt generation, configurable cost factor, and constant-time comparison |
| Cookie parsing | Manual `req.headers.cookie` parsing | `cookie-parser` middleware | Cookie parsing has edge cases (encoding, multiple values, signed cookies) |
| Email sending | Raw SMTP via `net.Socket` | `nodemailer` | SMTP is complex (TLS, authentication, connection pooling, retry) |
| Bearer token extraction | Manual `Authorization` header parsing | `passport-jwt` ExtractJwt | Handles edge cases (missing header, malformed tokens, case sensitivity) |

**Key insight:** Auth is the single most security-critical feature. Every custom implementation introduces risk. Use standard libraries for every step.

## Common Pitfalls

### Pitfall 1: Refresh Cookie Not Sent in Dev (Secure Flag)

**What goes wrong:** Setting `secure: true` on the refresh cookie prevents it from being sent over HTTP. In development (localhost without HTTPS), the cookie is silently not set. Login works but refresh always fails.

**Why it happens:** Secure flag is a production requirement but breaks local dev.

**How to avoid:** Conditionally set `secure` based on NODE_ENV:
```typescript
res.cookie('refresh_token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/user-auth/refresh',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
```

**Warning signs:** Login succeeds but subsequent refresh calls fail with "no token" errors.

### Pitfall 2: Timing Attacks on Login (Email Enumeration)

**What goes wrong:** If the login endpoint returns immediately when the email is not found (skipping bcrypt), but takes 100-200ms when the email exists (running bcrypt.compare), an attacker can enumerate valid emails by measuring response times.

**Why it happens:** bcrypt is intentionally slow. Skipping it for non-existent users creates a measurable timing difference.

**How to avoid:** Always run bcrypt even when the user is not found:
```typescript
async login(email: string, password: string) {
  const user = await this.findByEmail(email);
  // Always hash to prevent timing attacks
  const hash = user?.passwordHash ?? '$2b$12$invalidhashpadding000000000000000000000000000000';
  const valid = await bcrypt.compare(password, hash);
  if (!user || !valid) throw new UnauthorizedException('Invalid credentials');
  return user;
}
```

**Warning signs:** Login response times differ by >50ms between valid and invalid emails.

### Pitfall 3: Concurrent Refresh Race Condition

**What goes wrong:** With refresh token rotation, if two browser tabs both detect expired access token simultaneously, both send the old refresh token to `/refresh`. The first succeeds (rotates token), the second fails (token now revoked). The second tab gets logged out.

**Why it happens:** Token rotation invalidates the old token immediately, but multiple in-flight requests may hold the same old token.

**How to avoid:** Frontend: implement a refresh mutex -- queue all 401 responses, let exactly one request perform the refresh, replay queued requests with the new token. Backend: keep revoked refresh tokens valid for a 30-second grace period after rotation.

**Warning signs:** Users get randomly logged out, especially when they have multiple tabs open.

### Pitfall 4: cookie-parser Not Registered Before NestJS

**What goes wrong:** If `cookie-parser` middleware is not registered before NestJS handles requests, `req.cookies` is `undefined`. The refresh endpoint cannot read the refresh token cookie.

**Why it happens:** NestJS middleware ordering matters. `app.use(cookieParser())` must be called before `app.listen()`.

**How to avoid:** Add `app.use(cookieParser())` in `main.ts` right after creating the NestJS app, before any route registration.

### Pitfall 5: Access Token Lost on Page Refresh

**What goes wrong:** Since access tokens are stored in Zustand memory (not persisted), every page refresh or new tab loses the token. If the frontend does not immediately call `/refresh` on boot, the user appears logged out.

**Why it happens:** This is by design (prevents XSS exfiltration), but requires handling.

**How to avoid:** On app initialization, immediately call `POST /api/user-auth/refresh`. If the refresh cookie is valid, this returns a new access token, restoring the session seamlessly. Show a loading state until this check completes.

### Pitfall 6: NestJS Global Prefix and Cookie Path Mismatch

**What goes wrong:** The app uses `app.setGlobalPrefix('api')`, so the refresh endpoint is at `/api/user-auth/refresh`. But if the cookie path is set to `/user-auth/refresh` (without the prefix), the browser won't send the cookie.

**Why it happens:** Cookie `path` must match the actual URL path the browser requests.

**How to avoid:** Set cookie path to `/api/user-auth/refresh` (include the global prefix).

## Code Examples

### Database Schema Additions

```typescript
// apps/api/src/db/schema.ts -- ADD these tables

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),                    // UUID
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),   // bcrypt output
  name: text('name').notNull(),
  onboarded: integer('onboarded').notNull().default(0),
  createdAt: text('created_at').notNull(),         // ISO 8601
  updatedAt: text('updated_at').notNull(),         // ISO 8601
});

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),                     // UUID
  userId: text('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull(),          // SHA-256 of token
  family: text('family').notNull(),                 // rotation family UUID
  expiresAt: text('expires_at').notNull(),          // ISO 8601
  revokedAt: text('revoked_at'),                    // set on rotation/logout
  createdAt: text('created_at').notNull(),          // ISO 8601
});

export const passwordResets = sqliteTable('password_resets', {
  id: text('id').primaryKey(),                     // UUID
  userId: text('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull(),          // SHA-256 of token
  expiresAt: text('expires_at').notNull(),          // ISO 8601, now + 1hr
  usedAt: text('used_at'),                          // set when consumed
  createdAt: text('created_at').notNull(),          // ISO 8601
});
```

### ConfigService Additions

```typescript
// apps/api/src/config/config.service.ts -- ADD these getters

get jwtAccessSecret(): string {
  return process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production';
}

get jwtRefreshSecret(): string {
  return process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';
}

get smtpHost(): string { return process.env.SMTP_HOST || ''; }
get smtpPort(): number { return parseInt(process.env.SMTP_PORT || '587', 10); }
get smtpUser(): string { return process.env.SMTP_USER || ''; }
get smtpPass(): string { return process.env.SMTP_PASS || ''; }
get smtpFrom(): string { return process.env.SMTP_FROM || this.smtpUser || 'noreply@botmem.xyz'; }
```

### main.ts Cookie Parser Setup

```typescript
// apps/api/src/main.ts -- ADD after NestFactory.create()
import cookieParser from 'cookie-parser';

// After: const app = await NestFactory.create(...)
app.use(cookieParser());
```

### JWT Strategy

```typescript
// apps/api/src/user-auth/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '../config/config.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwtAccessSecret,
      algorithms: ['HS256'], // Prevent algorithm confusion attacks
    });
  }

  validate(payload: { sub: string; email: string }) {
    return { id: payload.sub, email: payload.email };
  }
}
```

### Refresh Token Rotation

```typescript
// Key logic in user-auth.service.ts
async refresh(oldToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  // 1. Verify the refresh token JWT
  const payload = this.jwt.verify(oldToken, { secret: this.config.jwtRefreshSecret });

  // 2. Look up token hash in DB
  const tokenHash = createHash('sha256').update(oldToken).digest('hex');
  const stored = await this.users.findRefreshToken(tokenHash);

  if (!stored) throw new UnauthorizedException('Invalid refresh token');

  // 3. If token was already revoked -> replay attack, revoke entire family
  if (stored.revokedAt) {
    await this.users.revokeTokenFamily(stored.family);
    throw new UnauthorizedException('Token reuse detected');
  }

  // 4. If expired
  if (new Date(stored.expiresAt) < new Date()) {
    throw new UnauthorizedException('Refresh token expired');
  }

  // 5. Revoke old token
  await this.users.revokeRefreshToken(stored.id);

  // 6. Issue new token pair (same family)
  return this.generateTokenPair(payload.sub, payload.email, stored.family);
}
```

### Frontend Auth Store (Zustand)

```typescript
// apps/web/src/store/authStore.ts -- conceptual rewrite
interface AuthState {
  user: User | null;
  accessToken: string | null;  // In-memory only, NOT persisted
  isLoading: boolean;
  isRefreshing: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  initialize: () => Promise<void>;
}

// Use persist middleware but EXCLUDE accessToken from persistence
persist(
  (set, get) => ({
    // ...
    initialize: async () => {
      // On app boot, try to refresh session via cookie
      try {
        const res = await fetch('/api/user-auth/refresh', {
          method: 'POST',
          credentials: 'include', // Send httpOnly cookie
        });
        if (res.ok) {
          const { accessToken, user } = await res.json();
          set({ accessToken, user, isLoading: false });
        } else {
          set({ user: null, accessToken: null, isLoading: false });
        }
      } catch {
        set({ user: null, accessToken: null, isLoading: false });
      }
    },
  }),
  {
    name: 'botmem-auth',
    partialize: (state) => ({ user: state.user }), // Only persist user, NOT accessToken
  }
)
```

### API Client Auth Header Injection

```typescript
// apps/web/src/lib/api.ts -- modify request() function
let refreshPromise: Promise<boolean> | null = null;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { accessToken, refreshSession } = useAuthStore.getState();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // For refresh cookie
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options?.headers,
    },
  });

  // On 401, try refresh exactly once (mutex to prevent concurrent refreshes)
  if (res.status === 401) {
    if (!refreshPromise) {
      refreshPromise = refreshSession().finally(() => { refreshPromise = null; });
    }
    const refreshed = await refreshPromise;
    if (refreshed) {
      // Retry with new token
      return request(path, options);
    }
    // Redirect to login
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage JWT | In-memory access token + httpOnly refresh cookie | ~2022 | XSS protection; page refresh requires /refresh call |
| Single JWT (no refresh) | Access + refresh token pair | ~2020 | Short-lived access limits exposure window |
| bcrypt only | Argon2id preferred, bcrypt acceptable | OWASP 2024 | Requirements lock bcrypt; future migration to argon2 is straightforward |
| passport-local for login | Manual validation in service | NestJS convention | passport-local adds boilerplate for simple email+password; manual is cleaner |

**Current best practices:**
- Refresh token rotation with family tracking (detect replay attacks)
- httpOnly + SameSite=Strict cookies for refresh tokens
- Short-lived access tokens (5-15 min) in memory only
- bcrypt cost factor 12 for server-side hashing

## Open Questions

1. **Email sending in dev/staging**
   - What we know: nodemailer needs SMTP credentials. Production can use Gmail SMTP or a transactional service.
   - What's unclear: Should dev mode skip actual email sending and log the reset URL to console instead?
   - Recommendation: In dev, log the reset URL to server console. Only send real emails when SMTP_HOST is configured.

2. **Existing data ownership during transition**
   - What we know: The current schema has no `userId` column on accounts/memories/contacts. Phase 16 adds user auth but does NOT add userId to existing tables (that's Phase 19 - Memory Banks).
   - What's unclear: Should Phase 16 add a userId FK to the accounts table, or defer all ownership to Phase 19?
   - Recommendation: Defer. Phase 16 focuses on auth mechanics. All existing data remains accessible to any authenticated user. Phase 17 (global guard) ensures you must be logged in, and Phase 19 adds per-user data ownership.

3. **bcrypt cost factor on VPS**
   - What we know: The VPS has 2GB RAM. bcrypt cost factor 12 takes ~250ms per hash. Factor 13 takes ~500ms.
   - What's unclear: Is 250ms acceptable for login/register on the VPS?
   - Recommendation: Use cost factor 12. It's the standard recommendation and 250ms is acceptable for login (happens rarely). Registration is even rarer.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3 |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @botmem/api test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Register creates user with bcrypt hash, returns JWT + cookie | unit + integration | `pnpm --filter @botmem/api test -- --run user-auth` | No - Wave 0 |
| AUTH-02 | Login validates credentials, returns 15min JWT + 7d refresh cookie | unit + integration | `pnpm --filter @botmem/api test -- --run user-auth` | No - Wave 0 |
| AUTH-03 | POST /user-auth/refresh with valid cookie returns new access token | unit + integration | `pnpm --filter @botmem/api test -- --run user-auth` | No - Wave 0 |
| AUTH-04 | Forgot-password sends email; reset-password with valid token changes password | unit | `pnpm --filter @botmem/api test -- --run user-auth` | No - Wave 0 |
| AUTH-05 | Refresh rotation invalidates old token; replayed revoked token kills family | unit | `pnpm --filter @botmem/api test -- --run user-auth` | No - Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @botmem/api test -- --run user-auth`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/api/src/user-auth/__tests__/user-auth.service.test.ts` -- covers AUTH-01, AUTH-02, AUTH-03, AUTH-05
- [ ] `apps/api/src/user-auth/__tests__/user-auth.controller.test.ts` -- covers AUTH-02, AUTH-03 (cookie behavior)
- [ ] `apps/api/src/user-auth/__tests__/password-reset.test.ts` -- covers AUTH-04
- [ ] `apps/api/src/mail/__tests__/mail.service.test.ts` -- covers AUTH-04 (email sending)
- [ ] Framework install: `pnpm --filter @botmem/api add -D @types/bcrypt @types/cookie-parser @types/passport-jwt @types/nodemailer`

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis: `schema.ts`, `main.ts`, `config.service.ts`, `app.module.ts`, `auth.controller.ts`, `authStore.ts`, `api.ts` -- all read and analyzed
- `.planning/research/STACK.md` -- NestJS auth library recommendations, JWT token architecture, cookie configuration patterns
- `.planning/research/FEATURES.md` -- User registration/login flow, password reset flow, data model design, frontend patterns
- `.planning/research/ARCHITECTURE.md` -- Auth guard design, provider abstraction, global guard + @Public() pattern
- `.planning/research/PITFALLS.md` -- JWT security mistakes, refresh token race conditions, timing attacks, CORS issues

### Secondary (MEDIUM confidence)

- NestJS official documentation patterns (from training data, consistent with codebase research findings)
- bcrypt npm package documentation (cost factor recommendations)

### Tertiary (LOW confidence)

- None -- all findings verified against codebase or project research documents

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- packages verified against NestJS 11 compatibility and project research docs
- Architecture: HIGH -- patterns derived from direct codebase analysis of existing module structure
- Pitfalls: HIGH -- documented from project's own PITFALLS.md research + codebase state analysis

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable domain, well-established patterns)
