---
status: complete
phase: 23-row-level-security
source: [23-01-SUMMARY.md, 23-02-SUMMARY.md, 23-03-SUMMARY.md]
started: 2026-03-09T09:45:00Z
updated: 2026-03-09T09:52:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test

expected: All data dropped. API healthy at http://localhost:12412/api/health — status "ok", postgres/redis/qdrant connected. RLS policies re-applied on startup with no errors.
result: issue
reported: "API crashed on startup due to stale Redis BullMQ job for deleted user — EncryptionKeyMissingError in enrich.processor.ts (fire-and-forget, uncaught). Also: SET LOCAL $1 param syntax error in withUserId."
severity: blocker
fixes:

- "fix(23): SET LOCAL does not support $1 params — inline userId with quote-escaping (360195e)"
- "fix(23): catch EncryptionKeyMissingError in fire-and-forget encryptMemoryAtRest (e53b097)"

### 2. Register User A

expected: Register new account. Registration succeeds, user is logged in.
result: pass

### 3. User A Sees Only Their Own Data

expected: GET /api/accounts, GET /api/jobs — returns empty arrays (fresh DB).
result: pass

### 4. Register User B — Isolation Check

expected: User B sees 0 accounts (not User A's). User A unaffected.
result: pass

### 5. Connect a Connector as User A

expected: Immich connector connects successfully. Account appears under User A. Sync job created.
result: pass

### 6. User B Cannot See User A's Connector/Data

expected: User B GET /api/accounts returns 0. User B GET /api/jobs returns 0.
result: pass

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "API starts cleanly after data drop with no uncaught exceptions"
  status: failed
  reason: "User reported: API crashed with EncryptionKeyMissingError (fire-and-forget in enrich.processor) and SET LOCAL $1 syntax error in withUserId"
  severity: blocker
  test: 1
  root_cause: "Two bugs: (1) SET LOCAL does not accept parameterized $1 placeholders in PostgreSQL — must inline value. (2) encryptMemoryAtRest called without await and without .catch(), making it a fire-and-forget that crashes process on EncryptionKeyMissingError."
  artifacts:
  - path: "apps/api/src/db/db.service.ts"
    issue: "SET LOCAL app.current_user_id = $1 — invalid syntax, fixed to inline with quote-escaping"
  - path: "apps/api/src/memory/enrich.processor.ts"
    issue: "encryptMemoryAtRest() called without await or .catch() — fixed with .catch() handler"
    missing: []
    debug_session: ""
    fixed: true
    fix_commits: ["360195e", "e53b097"]
