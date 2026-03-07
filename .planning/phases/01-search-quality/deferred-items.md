# Deferred Items - Phase 01 Search Quality

## Pre-existing Test Failures (Out of Scope)

These test failures exist before this phase's changes and are unrelated to search quality work:

1. **`contacts.service.test.ts`** - "table contacts has no column named entity_type" - Schema has `entityType` column that tests reference but in-memory DB schema is stale
2. **`logs.service.test.ts`** - "table logs has no column named stage" - Same schema drift issue
3. **`db.service.test.ts`** - "no such column: stage" - Same schema drift
4. **`accounts.controller.test.ts`** - "findByTypeAndIdentifier is not a function" - Missing mock method
5. **`auth.service.test.ts`** - Same `findByTypeAndIdentifier` issue
6. **`resolveSlackContacts.test.ts`** - "buildSlackIdentifiers is not a function" - Missing export
7. **`ollama.service.test.ts`** - Some tests timeout (5s) due to retry logic in embed/generate; `generate` test expects old model name `qwen3-vl:8b` in body but mock config doesn't set `ollamaTextModel`
