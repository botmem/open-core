---
phase: 23-row-level-security
plan: 02
subsystem: db / rls
tags: [rls, nestjs, interceptor, async-local-storage, postgresql, security]
dependency_graph:
  requires:
    - 23-01 (RLS policies in PostgreSQL)
  provides:
    - RlsContext (AsyncLocalStorage wrapper for userId propagation)
    - RlsInterceptor (global HTTP interceptor wiring userId into ALS context)
    - DbService.withUserId() (explicit RLS scope for BullMQ processors)
    - DbService.withCurrentUser() (ALS-based RLS scope for HTTP services)
  affects:
    - All NestJS HTTP handlers (via global APP_INTERCEPTOR)
    - BullMQ processors (via withUserId explicit calls)
    - All Drizzle ORM queries (when wrapped via withUserId/withCurrentUser)
tech_stack:
  added:
    - AsyncLocalStorage (Node built-in, async_hooks)
    - APP_INTERCEPTOR (NestJS global interceptor registration)
  patterns:
    - AsyncLocalStorage for request-scoped userId propagation
    - SET LOCAL for transaction-scoped PostgreSQL session variable
    - Optional DI injection to avoid circular dependency risk
key_files:
  created:
    - apps/api/src/db/rls.context.ts
    - apps/api/src/db/rls.interceptor.ts
  modified:
    - apps/api/src/db/db.service.ts
    - apps/api/src/db/db.module.ts
    - apps/api/src/app.module.ts
decisions:
  - RlsInterceptor uses AsyncLocalStorage (not pool-based transactions) so it is non-blocking and compatible with Observable/RxJS response streams
  - withUserId uses SET LOCAL so the session variable is scoped to the transaction duration only — resets on COMMIT/ROLLBACK, preventing pool connection bleed
  - RlsContext injected as @Optional() in DbService to avoid circular dependency risk (DbModule is Global)
  - Interceptor skips non-HTTP contexts (WebSocket) and unauthenticated requests gracefully
  - BullMQ processors must call withUserId() explicitly — withCurrentUser() falls back to non-scoped db if no ALS context
metrics:
  duration: 2min
  completed_date: '2026-03-09'
  tasks_completed: 2
  files_modified: 5
---

# Phase 23 Plan 02: RLS Session Variable Wiring Summary

AsyncLocalStorage-based RLS context propagation wiring `app.current_user_id` into every authenticated HTTP request via a global NestJS interceptor, plus explicit `withUserId()` helpers for BullMQ processors.

## Objective

Wire the `app.current_user_id` PostgreSQL session variable into every authenticated HTTP request so the RLS policies from Plan 01 can correctly filter rows by user. Also provide `withUserId()` and `withCurrentUser()` helpers on DbService for WebSocket and BullMQ processor contexts that bypass the HTTP interceptor.

## Tasks Completed

| Task | Name                                                                           | Commit  | Files                                           |
| ---- | ------------------------------------------------------------------------------ | ------- | ----------------------------------------------- |
| 1    | Add RlsContext, connectionPool getter, withUserId/withCurrentUser to DbService | bcdd9fb | db.service.ts, rls.context.ts                   |
| 2    | Create RlsInterceptor, register globally, update DbModule and AppModule        | c403523 | rls.interceptor.ts, db.module.ts, app.module.ts |

## Architecture

### AsyncLocalStorage Flow

```
HTTP Request arrives
  → JwtAuthGuard validates token → sets request.user.id
  → RlsInterceptor.intercept() reads request.user.id
  → rlsContext.run(userId, fn) — stores userId in AsyncLocalStorage
    → NestJS controller → service → dbService.withCurrentUser(fn)
      → rlsContext.getCurrentUserId() reads ALS → returns userId
      → withUserId(userId, fn) executes:
        → pool.connect()
        → BEGIN
        → SET LOCAL app.current_user_id = userId
        → fn(txDb)    ← Drizzle queries here see userId in pg session
        → COMMIT
        → client.release()
```

### BullMQ Processor Flow

```
BullMQ job processes
  → processor has job.data.userId
  → await dbService.withUserId(userId, async (db) => {
      // all Drizzle queries here run with SET LOCAL
    })
```

### Public Route Flow

```
Unauthenticated request (e.g. POST /api/auth/login)
  → JwtAuthGuard sets @Public() → request.user is undefined
  → RlsInterceptor sees userId=undefined → returns next.handle() directly
  → No ALS context set — no SET LOCAL issued
  → Queries run without RLS filtering (auth queries bypass RLS by design)
```

## Key Decisions

1. **AsyncLocalStorage over pool-based transactions in interceptor**: Using ALS in the interceptor means the interceptor itself doesn't hold a DB connection open for the full request lifecycle. Services call `withCurrentUser()` on-demand when they need a DB transaction.

2. **SET LOCAL scoping**: `SET LOCAL` resets when the transaction ends (COMMIT or ROLLBACK), so even if a pool connection is reused, the next consumer starts with a clean state. This is pool-safe.

3. **@Optional() for RlsContext in DbService**: DbModule is `@Global()` and DbService is already in DbModule. Injecting RlsContext as `@Optional()` prevents any potential circular dependency issue during module initialization ordering.

4. **Interceptor returns Observable wrapper**: NestJS interceptors with `Observable` return type require wrapping `next.handle()` subscription inside the ALS `run()` call, otherwise the async continuations escape the ALS scope.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- API restarted with commit `c403523` (confirmed via `/api/version`)
- Health check: postgres connected, redis connected, qdrant connected
- TypeScript: no new errors introduced (2 pre-existing errors in unrelated files)
- RLS policies applied on startup (logged by `createRlsPolicies()` in DbService)

## Self-Check

Files created/modified:

- apps/api/src/db/rls.context.ts: EXISTS
- apps/api/src/db/rls.interceptor.ts: EXISTS
- apps/api/src/db/db.service.ts: MODIFIED (withUserId, withCurrentUser, connectionPool)
- apps/api/src/db/db.module.ts: MODIFIED (exports RlsContext, RlsInterceptor)
- apps/api/src/app.module.ts: MODIFIED (APP_INTERCEPTOR registration)
