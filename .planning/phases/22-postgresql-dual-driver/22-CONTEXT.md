# Phase 22: PostgreSQL Migration - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace SQLite entirely with PostgreSQL across the codebase. This is NOT a dual-driver phase — SQLite is being removed completely. The application runs on PostgreSQL only, for both open-core and prod-core deployments. Docker Compose provides Postgres for dev alongside Redis + Qdrant.

</domain>

<decisions>
## Implementation Decisions

### Driver strategy

- PostgreSQL only — no dual-driver, no SQLite fallback
- Remove better-sqlite3 dependency entirely
- Use drizzle-orm/node-postgres (or drizzle-orm/postgres-js)
- DB_DRIVER env var removed — DATABASE_URL is the only config needed
- Startup fails fast if DATABASE_URL is missing (OnModuleInit validation, consistent with Phase 34 pattern)

### Schema management

- Single schema file for PostgreSQL (replaces schema.ts)
- Use native Postgres types: serial, text[], jsonb, timestamp with timezone
- Auto-create tables on startup (OnModuleInit pattern, CREATE TABLE IF NOT EXISTS)
- No Drizzle migration step required — tables created automatically on first run

### Deployment model

- SQLite is for nobody — Postgres everywhere (open-core + prod-core)
- Same codebase, same driver, just different DATABASE_URL values
- Docker Compose includes Postgres service alongside Redis + Qdrant
- Fresh deployments get bootstrap: run migrations + create Qdrant collection

### Full-text search

- tsvector + GIN index for standard full-text search (replaces FTS5)
- pg_trgm for fuzzy/partial matching (additional capability over old SQLite FTS)
- Always combine both: tsvector first, trigram fallback — single search endpoint, best results automatically
- English + Arabic language support (tsvector configured with both dictionaries)
- pg_trgm handles any script automatically

### Interface design

- Drizzle query builder only — no raw SQL escape hatch
- Dialect-specific SQL (FTS, transactions) handled inside DbService
- Application code is Postgres-native, not dialect-agnostic

### Claude's Discretion

- Specific Postgres Docker image version
- Connection pooling strategy (pgBouncer vs native pool)
- Index strategy beyond FTS (when to add indexes)
- Transaction isolation level choices

</decisions>

<specifics>
## Specific Ideas

- Phase originally scoped as "dual-driver" but user decided to drop SQLite entirely — simplifies everything
- Production VPS already runs Docker — adding Postgres container is straightforward
- Bootstrap command should work for both dev (docker compose up) and prod deployments
- The existing raw SQL in DbService.createTables() needs full rewrite for Postgres syntax

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `DbService` (apps/api/src/db/db.service.ts): OnModuleInit pattern with raw SQL table creation — rewrite for Postgres
- `schema.ts` (apps/api/src/db/schema.ts): Drizzle schema — rewrite with Postgres types
- `ConfigService`: Already has dbPath — needs DATABASE_URL instead

### Established Patterns

- OnModuleInit for DB initialization — keep this pattern
- Drizzle ORM for all queries — continue using
- Raw SQL for FTS5 in memory.service.ts — replace with tsvector queries
- Transaction wrapping in accounts.service.ts (Phase 34) — Postgres transactions are native

### Integration Points

- `db.service.ts` → used by every service in the app
- `memory.service.ts` → FTS5 queries need tsvector rewrite
- `docker-compose.yml` → add postgres service
- `.env` → replace DB_PATH with DATABASE_URL
- `config.service.ts` → replace dbPath with databaseUrl

</code_context>

<deferred>
## Deferred Ideas

- PostgreSQL RLS policies (Phase 23) — depends on this phase completing first
- Connection pooling optimization — can tune after initial migration works

</deferred>

---

_Phase: 22-postgresql-dual-driver_
_Context gathered: 2026-03-09_
