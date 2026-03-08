# Phase 17: API Security - Research

**Researched:** 2026-03-08
**Domain:** NestJS global auth guards, CORS configuration, WebSocket JWT authentication
**Confidence:** HIGH

## Summary

Phase 17 enforces authentication on all API endpoints (except explicitly public ones) and locks CORS to the frontend origin. The existing codebase already has all the building blocks: a `JwtAuthGuard` that respects `@Public()` decorators, a `JwtStrategy` for passport-jwt validation, and `ConfigService.frontendUrl` for CORS origin. The work is purely wiring -- registering the guard globally via `APP_GUARD`, configuring `enableCors()` with proper options, and adding JWT verification to the WebSocket gateway handshake.

This is a low-risk, high-impact phase. The guard and decorator patterns are already proven in the `user-auth` module. The main pitfall is breaking the OAuth callback flow (`/api/auth/:type/callback`) and forgetting to mark certain controllers as `@Public()`.

**Primary recommendation:** Register `JwtAuthGuard` as a global guard via `APP_GUARD` provider in `AppModule`, mark public endpoints with `@Public()`, configure CORS with explicit origin/credentials, and add JWT token verification in the WebSocket `handleConnection` hook.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-01 | Auth guard on all endpoints (except `/health`, `/version`, `/auth/*`) | Global `APP_GUARD` registration of existing `JwtAuthGuard` + `@Public()` decorator on exempt endpoints |
| SEC-02 | CORS locked to `FRONTEND_URL` origin(s), credentials mode enabled | Replace bare `app.enableCors()` with explicit `{ origin, credentials: true }` config in `main.ts` |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/passport` | ^11.0.0 | Passport integration for NestJS | Already in use, provides `AuthGuard` base class |
| `passport-jwt` | ^4.0.1 | JWT extraction + validation strategy | Already in use via `JwtStrategy` |
| `@nestjs/jwt` | ^11.0.0 | JWT signing/verification | Already in use for token generation |
| `@nestjs/platform-ws` | ^11.0.0 | Raw WebSocket adapter | Already in use for `/events` gateway |
| `ws` | ^8.19.0 | WebSocket library | Already in use, provides `IncomingMessage` for handshake access |

### No New Dependencies Required

All required functionality exists in the current dependency tree. No new packages needed.

## Architecture Patterns

### Pattern 1: Global Guard via APP_GUARD

**What:** Register `JwtAuthGuard` as a global guard using NestJS `APP_GUARD` injection token. Every route is protected by default; opt-out with `@Public()`.

**When to use:** When the default posture should be "authenticated" and public routes are the exception.

**Example:**
```typescript
// app.module.ts
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './user-auth/jwt-auth.guard';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  // ... existing imports
})
export class AppModule {}
```

**Why APP_GUARD over useGlobalGuards():** `APP_GUARD` participates in NestJS dependency injection, so the guard can inject `Reflector` (needed for `@Public()` metadata). `app.useGlobalGuards()` in `main.ts` does NOT support DI -- the `Reflector` would be undefined.

### Pattern 2: @Public() Decorator for Exempt Routes

**What:** The existing `@Public()` decorator sets metadata that `JwtAuthGuard.canActivate()` checks before invoking passport. Already implemented and working.

**Endpoints that MUST be marked @Public():**
| Controller | Route(s) | Reason |
|------------|----------|--------|
| `VersionController` | `GET /api/version` | Health/status check, no auth needed |
| `AuthController` | All routes (`/api/auth/*`) | OAuth callbacks from external providers |
| `UserAuthController` | `register`, `login`, `refresh`, `logout`, `forgot-password`, `reset-password` | Auth flow endpoints (already marked) |

**Endpoints that do NOT exist yet but are mentioned in requirements:**
- `/health` -- does not exist in the codebase. If needed, create a simple `HealthController` with `@Public()`.

### Pattern 3: CORS Configuration with Credentials

**What:** Replace the current bare `app.enableCors()` (allows all origins) with explicit configuration.

**Example:**
```typescript
// main.ts
const config = app.get(ConfigService);
app.enableCors({
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

**Key detail:** `credentials: true` is required because the frontend sends `httpOnly` refresh cookies. Without it, cookies are stripped by the browser.

### Pattern 4: WebSocket JWT Authentication in Handshake

**What:** Verify JWT token during the WebSocket `handleConnection` lifecycle hook. The token is passed as a query parameter in the connection URL (standard pattern since WebSocket API does not support custom headers).

**Frontend sends:**
```typescript
const token = authStore.getState().accessToken;
new WebSocket(`ws://host/events?token=${token}`);
```

**Backend verifies:**
```typescript
// events.gateway.ts
import { JwtService } from '@nestjs/jwt';
import { IncomingMessage } from 'http';

handleConnection(client: WebSocket, req: IncomingMessage) {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token) {
    client.close(4401, 'Unauthorized');
    return;
  }
  try {
    const payload = this.jwtService.verify(token, { secret: this.config.jwtAccessSecret });
    // Optionally attach user to client metadata
    this.subscriptions.set(client, new Set());
  } catch {
    client.close(4401, 'Invalid token');
  }
}
```

**Why query param, not header:** Browser WebSocket API (`new WebSocket(url)`) does not support custom headers. The `protocols` parameter hack is non-standard. Query param is the established pattern. The token is short-lived (15min) so URL logging risk is minimal.

### Anti-Patterns to Avoid
- **Using `app.useGlobalGuards(new JwtAuthGuard())` in main.ts:** Breaks DI -- `Reflector` is not injected, so `@Public()` decorator stops working. Always use `APP_GUARD` provider.
- **Checking auth in every controller manually:** Defeats the purpose of a global guard. Use `@Public()` to opt out, not `@UseGuards()` to opt in.
- **Passing JWT in WebSocket subprotocol:** Non-standard, fragile, and confusing for debugging. Use query parameter.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT verification | Custom `jsonwebtoken.verify()` calls | `@nestjs/passport` + `passport-jwt` strategy | Already integrated, handles expiry, algorithm, extraction |
| CORS handling | Custom middleware | `app.enableCors()` with options | NestJS wraps the `cors` npm package, handles preflight correctly |
| Route-level auth bypass | Per-route if/else logic | `@Public()` decorator + Reflector | Declarative, discoverable, already implemented |

## Common Pitfalls

### Pitfall 1: OAuth Callbacks Return 401
**What goes wrong:** After enabling global guard, `/api/auth/:type/callback` returns 401 because the browser redirect from Google/Slack does not carry a JWT.
**Why it happens:** `AuthController` does not have `@Public()` decorator.
**How to avoid:** Add `@Public()` at the class level on `AuthController`.
**Warning signs:** OAuth flows fail after deploying this phase.

### Pitfall 2: CORS Blocks Credential Cookies
**What goes wrong:** Refresh token cookie is not sent by the browser.
**Why it happens:** `credentials: true` in CORS config requires the `origin` to be an explicit string, not `*`. If `FRONTEND_URL` is not set or is `*`, cookies are blocked.
**How to avoid:** Always set explicit origin. Validate `ConfigService.frontendUrl` is a real URL, not wildcard.
**Warning signs:** 401 on token refresh, `Set-Cookie` header ignored by browser.

### Pitfall 3: WebSocket Connection Rejected Before Auth Store Initialized
**What goes wrong:** Frontend connects to WebSocket before the access token is available (e.g., during page load before refresh completes).
**Why it happens:** `sharedWs.connect()` is called on first `subscribe()`, which may happen before auth is ready.
**How to avoid:** Only call `sharedWs.connect()` after auth store has a valid access token. Add a guard in the WsClient or in the hooks that call `subscribe()`.
**Warning signs:** WebSocket connects, immediately closes with 4401, reconnect loop.

### Pitfall 4: APP_GUARD Requires UserAuthModule to be Global or Imported in AppModule
**What goes wrong:** `JwtAuthGuard` depends on `Reflector` (auto-provided by NestJS) and `JwtStrategy` (provided by `UserAuthModule`). If `JwtStrategy` is not available in the root injector, passport fails.
**Why it happens:** `APP_GUARD` runs in the root module scope. The strategy must be resolvable there.
**How to avoid:** Either make `UserAuthModule` global, or add `JwtStrategy` + `PassportModule` to `AppModule` imports/providers. The simplest approach: export `PassportModule` and `JwtStrategy` from `UserAuthModule` (already exports `JwtStrategy`) and ensure `AppModule` imports `UserAuthModule` (it already does).
**Warning signs:** "Unknown authentication strategy 'jwt'" error at startup.

## Code Examples

### 1. AppModule with APP_GUARD Registration
```typescript
// app.module.ts - add to providers array
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './user-auth/jwt-auth.guard';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  // ... keep all existing imports
})
export class AppModule {}
```

### 2. Mark AuthController as Public
```typescript
// auth/auth.controller.ts
import { Public } from '../user-auth/decorators/public.decorator';

@Public()
@Controller('auth')
export class AuthController {
  // All routes in this controller are public (OAuth callbacks)
}
```

### 3. Mark VersionController as Public
```typescript
// version.controller.ts
import { Public } from './user-auth/decorators/public.decorator';

@Public()
@Controller('version')
export class VersionController {
  // ...
}
```

### 4. CORS Configuration in main.ts
```typescript
// main.ts - replace app.enableCors()
const config = app.get(ConfigService);
app.enableCors({
  origin: config.frontendUrl,
  credentials: true,
});
```

### 5. WebSocket JWT Verification
```typescript
// events/events.gateway.ts - updated handleConnection
import { IncomingMessage } from 'http';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '../config/config.service';

constructor(
  private events: EventsService,
  private jwtService: JwtService,
  private config: ConfigService,
) {}

handleConnection(client: WebSocket, req: IncomingMessage) {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token) {
    client.close(4401, 'Unauthorized');
    return;
  }
  try {
    this.jwtService.verify(token, { secret: this.config.jwtAccessSecret });
    this.subscriptions.set(client, new Set());
  } catch {
    client.close(4401, 'Invalid token');
    return;
  }
}
```

### 6. Frontend WebSocket Token Passing
```typescript
// apps/web/src/lib/ws.ts - update connect()
connect(token?: string) {
  if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const tokenParam = token ? `?token=${token}` : '';
  this.ws = new WebSocket(`${protocol}//${window.location.host}/events${tokenParam}`);
  // ... rest unchanged
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-route `@UseGuards()` | Global `APP_GUARD` + `@Public()` opt-out | NestJS standard since v6+ | Less boilerplate, secure by default |
| `app.enableCors()` no args | Explicit origin + credentials | Always recommended for production | Prevents credential leakage |
| No WS auth | JWT in handshake query param | Standard practice | Prevents unauthorized real-time data access |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3 |
| Config file | `apps/api/vitest.config.ts` (inferred from package.json) |
| Quick run command | `cd apps/api && pnpm test` |
| Full suite command | `pnpm test` (root, runs all workspaces) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | Unauthenticated requests to protected endpoints return 401 | integration | `cd apps/api && pnpm vitest run src/user-auth/__tests__/global-guard.test.ts -x` | No -- Wave 0 |
| SEC-01 | Public endpoints (/version, /auth/*, /user-auth/login) return 200 without auth | integration | same file | No -- Wave 0 |
| SEC-02 | CORS returns correct Access-Control-Allow-Origin header | integration | `cd apps/api && pnpm vitest run src/__tests__/cors.test.ts -x` | No -- Wave 0 |
| SEC-02 | CORS returns Access-Control-Allow-Credentials: true | integration | same file | No -- Wave 0 |
| SEC-01 | WebSocket rejects connection without valid JWT | integration | `cd apps/api && pnpm vitest run src/events/__tests__/ws-auth.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && pnpm test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/user-auth/__tests__/global-guard.test.ts` -- covers SEC-01 (guard blocks/allows correctly)
- [ ] `apps/api/src/__tests__/cors.test.ts` -- covers SEC-02 (CORS headers)
- [ ] `apps/api/src/events/__tests__/ws-auth.test.ts` -- covers SEC-01 WebSocket auth

## Open Questions

1. **Should `/health` endpoint be created?**
   - What we know: Requirements mention `/health` as public, but no `HealthController` exists in the codebase.
   - What's unclear: Whether this is needed now or deferred.
   - Recommendation: Create a minimal `HealthController` with `@Public()` returning `{ status: 'ok' }`. Low effort, useful for monitoring.

2. **Multiple FRONTEND_URL origins?**
   - What we know: `ConfigService.frontendUrl` returns a single string. Requirements say "origin(s)" (plural).
   - What's unclear: Whether multiple origins are needed (e.g., `localhost` + production domain).
   - Recommendation: Support comma-separated values in `FRONTEND_URL` and pass as array to CORS `origin`. Trivial to implement: `config.frontendUrl.split(',').map(s => s.trim())`.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `apps/api/src/user-auth/jwt-auth.guard.ts`, `jwt.strategy.ts`, `decorators/public.decorator.ts` -- existing guard + public decorator pattern
- Codebase inspection: `apps/api/src/main.ts` -- current CORS config (bare `enableCors()`)
- Codebase inspection: `apps/api/src/events/events.gateway.ts` -- current WebSocket gateway (no auth)
- Codebase inspection: `apps/api/src/app.module.ts` -- module structure, no global guard registered yet

### Secondary (MEDIUM confidence)
- NestJS documentation on guards: `APP_GUARD` provider pattern is the standard approach for global guards with DI support
- NestJS CORS documentation: `enableCors()` accepts standard `cors` package options

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use
- Architecture: HIGH -- patterns are standard NestJS, guard already exists, just needs global registration
- Pitfalls: HIGH -- identified from direct codebase analysis of existing code

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable -- NestJS 11 patterns unlikely to change)
