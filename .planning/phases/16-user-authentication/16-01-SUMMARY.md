---
phase: 16-user-authentication
plan: 01
subsystem: auth
tags: [jwt, bcrypt, passport, nestjs, cookie-parser, refresh-token-rotation]

# Dependency graph
requires:
  - phase: 11-repo-infrastructure
    provides: "stable codebase and deployment infrastructure"
provides:
  - "users and refreshTokens DB tables"
  - "UserAuthService with register/login/refresh/logout"
  - "JwtStrategy (Passport Bearer token validation)"
  - "JwtAuthGuard with @Public() decorator support"
  - "@CurrentUser() param decorator"
  - "POST /api/user-auth/register, login, refresh, logout endpoints"
  - "GET /api/user-auth/me endpoint"
affects: [17-api-security, 18-api-keys, 19-memory-banks, 20-encryption, 24-firebase-auth]

# Tech tracking
tech-stack:
  added: ["@nestjs/jwt@11", "@nestjs/passport@11", "passport@0.7", "passport-jwt@4", "bcrypt@5", "cookie-parser@1.4", "@nestjs/testing@11"]
  patterns: ["refresh token rotation with family tracking", "timing-safe login with dummy bcrypt hash", "httpOnly secure cookie for refresh tokens"]

key-files:
  created:
    - apps/api/src/user-auth/user-auth.module.ts
    - apps/api/src/user-auth/user-auth.controller.ts
    - apps/api/src/user-auth/user-auth.service.ts
    - apps/api/src/user-auth/users.service.ts
    - apps/api/src/user-auth/jwt.strategy.ts
    - apps/api/src/user-auth/jwt-auth.guard.ts
    - apps/api/src/user-auth/decorators/current-user.decorator.ts
    - apps/api/src/user-auth/decorators/public.decorator.ts
    - apps/api/src/user-auth/__tests__/user-auth.service.test.ts
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/db/db.service.ts
    - apps/api/src/config/config.service.ts
    - apps/api/src/main.ts
    - apps/api/src/app.module.ts
    - apps/api/package.json
    - packages/shared/src/types/index.ts

key-decisions:
  - "Separate jwtAccessSecret and jwtRefreshSecret instead of single JWT_SECRET for defense-in-depth"
  - "SHA-256 hash of refresh token stored in DB, never the token itself"
  - "Dummy bcrypt hash comparison on non-existent users to prevent timing-based email enumeration"
  - "Token family tracking enables replay detection -- replaying a revoked token kills entire family"

patterns-established:
  - "User-auth module pattern: separate from connector auth (auth/) -- user-auth/ handles user identity"
  - "@Public() decorator + JwtAuthGuard pattern: guards check IS_PUBLIC_KEY metadata to skip auth on decorated endpoints"
  - "Refresh cookie pattern: httpOnly, secure in prod, sameSite strict, path scoped to /api/user-auth"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-05]

# Metrics
duration: 6min
completed: 2026-03-08
---

# Phase 16 Plan 01: Backend Auth Infrastructure Summary

**JWT auth with bcrypt(12) registration, refresh token rotation with family-based replay detection, and Passport guard infrastructure**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-08T13:31:07Z
- **Completed:** 2026-03-08T13:37:43Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Users and refreshTokens tables added to schema with DDL in db.service.ts
- Full register/login/refresh/logout flow with bcrypt-hashed passwords and JWT access tokens
- Refresh token rotation with SHA-256 hashing and family-based replay detection
- Passport JWT strategy and guard infrastructure ready for Phase 17 global guard
- 9 unit tests covering all auth flows including replay attack detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies, add schema tables, and configure JWT** - `7771121` (feat)
2. **Task 2: Build user-auth module with register, login, refresh, logout** - `a86c367` (feat)

## Files Created/Modified
- `apps/api/src/db/schema.ts` - Added users and refreshTokens table definitions
- `apps/api/src/db/db.service.ts` - Added CREATE TABLE SQL for users, refresh_tokens, password_resets
- `apps/api/src/config/config.service.ts` - Added jwtAccessSecret, jwtRefreshSecret getters
- `apps/api/src/main.ts` - Registered cookie-parser middleware
- `apps/api/src/user-auth/user-auth.module.ts` - NestJS module wiring Passport + JWT
- `apps/api/src/user-auth/user-auth.controller.ts` - HTTP endpoints with cookie management
- `apps/api/src/user-auth/user-auth.service.ts` - Core auth logic with token generation
- `apps/api/src/user-auth/users.service.ts` - User and refresh token CRUD
- `apps/api/src/user-auth/jwt.strategy.ts` - Passport JWT Bearer strategy
- `apps/api/src/user-auth/jwt-auth.guard.ts` - Guard with @Public() support
- `apps/api/src/user-auth/decorators/current-user.decorator.ts` - Extracts user from request
- `apps/api/src/user-auth/decorators/public.decorator.ts` - Marks routes as public
- `apps/api/src/user-auth/__tests__/user-auth.service.test.ts` - 9 unit tests
- `apps/api/src/app.module.ts` - Added UserAuthModule import
- `apps/api/package.json` - Added auth dependencies
- `packages/shared/src/types/index.ts` - Added createdAt to User interface

## Decisions Made
- Used separate access and refresh secrets (jwtAccessSecret/jwtRefreshSecret) instead of a single JWT_SECRET for defense-in-depth
- SHA-256 hash stored in DB for refresh tokens -- the raw token is never persisted
- Dummy bcrypt hash comparison runs on non-existent users to prevent timing-based email enumeration
- Token family UUID tracks refresh chain -- replaying a revoked token kills all tokens in the family

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing schema tables with missing fields**
- **Found during:** Task 1
- **Issue:** Schema already had partial users/refreshTokens tables from previous work (missing name, onboarded, family fields)
- **Fix:** Updated existing table definitions to match plan spec (added name, onboarded to users; added family to refreshTokens)
- **Files modified:** apps/api/src/db/schema.ts
- **Committed in:** 7771121

**2. [Rule 3 - Blocking] Installed missing @nestjs/testing dependency**
- **Found during:** Task 2
- **Issue:** @nestjs/testing not installed, tests could not import Test module
- **Fix:** Added @nestjs/testing@^11.0.0 as dev dependency
- **Files modified:** apps/api/package.json, pnpm-lock.yaml
- **Committed in:** a86c367

**3. [Rule 1 - Bug] Fixed TypeScript type errors with @nestjs/jwt v11 StringValue types**
- **Found during:** Task 2
- **Issue:** @nestjs/jwt v11 changed expiresIn type from string to StringValue, causing TS errors
- **Fix:** Cast expiresIn values to `any` where ConfigService returns dynamic string values
- **Files modified:** apps/api/src/user-auth/user-auth.service.ts, apps/api/src/user-auth/user-auth.module.ts
- **Committed in:** a86c367

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed items above.

## User Setup Required
None - no external service configuration required. JWT secrets use dev defaults.

## Next Phase Readiness
- Auth infrastructure complete, ready for Phase 16-02 (password reset)
- JwtAuthGuard and @Public() decorator ready for Phase 17 (global guard)
- UserAuthModule exports JwtAuthGuard and JwtStrategy for use by other modules

## Self-Check: PASSED

All 9 created files verified present. Both task commits (7771121, a86c367) verified in git log.

---
*Phase: 16-user-authentication*
*Completed: 2026-03-08*
