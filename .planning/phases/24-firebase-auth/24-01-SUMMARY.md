---
phase: 24-firebase-auth
plan: '01'
subsystem: auth
tags: [firebase, authentication, guards, nestjs]
dependency_graph:
  requires: []
  provides: [FirebaseAuthGuard, FirebaseAuthService, FirebaseAuthController, AuthProviderGuard]
  affects: [app.module.ts, users table, all API routes via APP_GUARD]
tech_stack:
  added: [firebase-admin@^12.0.0]
  patterns:
    [
      AuthProviderGuard delegation,
      sentinel passwordHash for firebase users,
      firebaseUid nullable unique column,
    ]
key_files:
  created:
    - apps/api/src/user-auth/firebase-auth.service.ts
    - apps/api/src/user-auth/firebase-auth.guard.ts
    - apps/api/src/user-auth/firebase-auth.controller.ts
    - apps/api/src/user-auth/firebase-auth.module.ts
    - apps/api/src/user-auth/auth-provider.guard.ts
    - apps/api/src/db/migrations/0001_firebase_uid.sql
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/config/config.service.ts
    - apps/api/src/user-auth/users.service.ts
    - apps/api/src/app.module.ts
    - apps/api/package.json
decisions:
  - AuthProviderGuard delegation pattern — single APP_GUARD that selects JWT or Firebase guard at request time based on AUTH_PROVIDER env var
  - Sentinel passwordHash ('firebase:<uid>') for Firebase users — never compared via bcrypt, prevents password login
  - firebaseUid nullable unique column on users table — allows linking Firebase accounts to existing local accounts by email
  - Firebase users auto-linked to existing local accounts by email on first Firebase login
  - POST /api/firebase-auth/sync endpoint — frontend calls this after Firebase signInWith*, gets local user profile; uses Firebase ID token directly as Bearer token for all subsequent API calls
metrics:
  duration: 4min
  completed: '2026-03-09'
  tasks_completed: 2
  files_changed: 11
---

# Phase 24 Plan 01: Firebase Auth Integration Summary

**One-liner:** Firebase Admin SDK integration with switchable auth guard (JWT vs Firebase) via AUTH_PROVIDER env var, plus user auto-provisioning on first Firebase login.

## What Was Built

### FirebaseAuthService (`firebase-auth.service.ts`)

- Initializes Firebase Admin SDK on module init using `firebase-admin` package
- `verifyIdToken(idToken)` — verifies Firebase ID tokens, throws 401 on failure
- `findOrCreateUser(decoded)` — looks up user by `firebaseUid`, falls back to email match (links existing accounts), creates new user on first login with sentinel passwordHash and auto-provisioned default memory bank

### FirebaseAuthGuard (`firebase-auth.guard.ts`)

- Implements `CanActivate` interface
- Respects `@Public()` decorator (skips auth)
- Supports API keys (`bm_sk_*` prefix) with same behavior as JwtAuthGuard
- Verifies Firebase ID tokens via `FirebaseAuthService.verifyIdToken()`
- Sets `request.user = { id, email }` — same shape as JWT user for downstream consumers

### FirebaseAuthController (`firebase-auth.controller.ts`)

- `POST /api/firebase-auth/sync` — marked `@Public()`, exchanges Firebase ID token for local user profile
- Frontend calls this after `signInWith*` to bootstrap local user record

### AuthProviderGuard (`auth-provider.guard.ts`)

- Single delegation guard registered as `APP_GUARD` in AppModule
- Reads `config.authProvider` at request time — delegates to `JwtAuthGuard` (default) or `FirebaseAuthGuard` (when `AUTH_PROVIDER=firebase`)
- Zero impact on existing local auth behavior

### DB Changes

- `users` table: added `firebase_uid text UNIQUE NULL` column
- Migration `0001_firebase_uid.sql` applied to database
- `UsersService.findByFirebaseUid()` and `setFirebaseUid()` methods added

### Config

- `ConfigService.authProvider` getter — returns `'local' | 'firebase'`
- `ConfigService.firebaseProjectId` getter — returns `FIREBASE_PROJECT_ID` env or `'botmem-app'`

## Verification Results

| Check                                                                | Result                                 |
| -------------------------------------------------------------------- | -------------------------------------- |
| `pnpm typecheck @botmem/api`                                         | Passed                                 |
| `GET /api/version` after restart                                     | 200, gitHash: f76bff2                  |
| `POST /api/firebase-auth/sync` with bad token                        | 401 "Invalid Firebase ID token"        |
| `GET /api/memories/search` with invalid Bearer (AUTH_PROVIDER=local) | 401 Unauthorized (JwtAuthGuard active) |

## Decisions Made

1. **AuthProviderGuard delegation pattern** — Instead of a factory provider or two separate APP_GUARD entries, a single `AuthProviderGuard` reads config at request time and delegates to the appropriate guard. Cleanest NestJS approach for runtime guard selection.

2. **Sentinel passwordHash** — Firebase users get `passwordHash = 'firebase:<uid>'`. This is never run through bcrypt comparison, preventing password-based login while keeping the column non-null.

3. **Auto-link by email** — If a Firebase user's email matches an existing local account, we link the `firebaseUid` to that account. This handles users who registered locally before Firebase auth was enabled.

4. **Direct Firebase token as Bearer** — Frontend sends Firebase ID token directly as `Authorization: Bearer <token>` for all API calls. No separate JWT issuance needed in Firebase mode.

5. **FirebaseAuthModule as separate module** — Keeps Firebase concerns isolated from `UserAuthModule` (which owns local JWT auth). Both modules are imported in AppModule.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `apps/api/src/user-auth/firebase-auth.service.ts` exists
- [x] `apps/api/src/user-auth/firebase-auth.guard.ts` exists
- [x] `apps/api/src/user-auth/firebase-auth.controller.ts` exists
- [x] `apps/api/src/user-auth/firebase-auth.module.ts` exists
- [x] `apps/api/src/user-auth/auth-provider.guard.ts` exists
- [x] `apps/api/src/db/migrations/0001_firebase_uid.sql` exists
- [x] Commits: 76482f6 (Task 1), f76bff2 (Task 2)

## Self-Check: PASSED
