# Botmem — Personal Memory RAG System (Single-Person, Multimodal, Fact/Fiction-Aware)

## Summary

Local-first memory platform that ingests atomic events from multiple data sources (emails, messages, photos, locations), normalizes them into a unified memory schema, and provides cross-modal retrieval with weighted ranking (semantic relevance + recency + importance + trust).
Uses Ollama models on a remote server at `192.168.10.250` — `nomic-embed-text` for embeddings, `qwen3:0.6b` for text enrichment, `qwen3-vl:2b` for vision.
Includes a fact/fiction pipeline that stores all memories but labels confidence and provenance.

## Scope and Goals

1. In scope:
  1. Ingest and normalize messages, emails, photos (textified), and locations.
  2. Store searchable memory with vector + metadata + relationship links.
  3. Retrieve memory from text, message snippets, contact context, image-derived text, and location/time filters.
  4. Compute memory weights for relevance, recency, importance, and trust.
  5. Classify incoming memory as `FACT`, `UNVERIFIED`, or `FICTION` with confidence.
  6. Ship a Docker Compose stack with Redis, Qdrant, and application services.
  7. Contacts as first-class entities: deduplicated across connectors with avatars, metadata, and all identifiers.
2. Out of scope (v1):
  1. Native image embedding retrieval (deferred; image retrieval via OCR/caption/metadata).
  2. Multi-person identity graph (single target person only).
  3. Automatic deletion policy engine (manual/admin-driven in v1).

## System Architecture

### Monorepo Structure (pnpm workspaces + Turbo)

```
apps/
  api/          NestJS 11 backend (REST + WebSocket)
  web/          React 19 + React Router 7 + Zustand 5 + Tailwind 4
packages/
  cli/          CLI tool (`botmem`) — human + JSON output for querying memories
  connector-sdk/   BaseConnector abstract class + ConnectorRegistry
  connectors/
    gmail/         OAuth2, imports emails + contacts
    slack/         User token, workspace messages
    whatsapp/      QR-code auth (Baileys v6), message history
    imessage/      Local tool, reads iMessage DB
    photos-immich/ Local tool, Immich photo library
    locations/     OwnTracks location history
  shared/          Cross-layer types (Memory, Job, ConnectorManifest, etc.)
```

### Services

1. **API** (`apps/api`):
  - NestJS 11 REST + WebSocket gateway (`/events`) for real-time updates.
  - Handles connector orchestration, auth flows, memory search, and job management.
  - Drizzle ORM + SQLite (better-sqlite3, WAL mode) for relational data.
  - BullMQ on Redis for async job processing.
2. **Frontend** (`apps/web`):
  - React 19 + Vite 6 + React Router 7 + Zustand 5 + Tailwind 4.
  - Pages: Dashboard, Connectors, Memory Explorer (force-directed graph), Contacts, Settings, Me.
  - PostHog JS SDK for product analytics (pageview tracking on route change).
3. **CLI** (`packages/cli`):
  - `botmem` binary for humans and AI agents.
  - Supports `--json` flag for machine-readable output, `--api-url` for non-default API.

### Storage

1. **SQLite** (Drizzle ORM, WAL mode) — canonical memory, events, contacts, jobs, settings.
2. **Qdrant** — dense vectors (768d, cosine similarity), auto-created `memories` collection.
3. **Redis** — BullMQ queue backend for async job processing.

### External Dependencies

- **Ollama** (remote at `192.168.10.250:11434`) — embedding, text enrichment, vision models.
- **PostHog** — product analytics (client-side JS SDK, optional).

## Environment Variables


| Variable               | Default                       | Purpose                                  |
| ---------------------- | ----------------------------- | ---------------------------------------- |
| `PORT`                 | `12412`                       | API server port                          |
| `REDIS_URL`            | `redis://localhost:6379`      | BullMQ queue backend                     |
| `DB_PATH`              | `./data/botmem.db`            | SQLite database file                     |
| `QDRANT_URL`           | `http://localhost:6333`       | Vector DB                                |
| `OLLAMA_BASE_URL`      | `http://192.168.10.250:11434` | Remote Ollama inference                  |
| `OLLAMA_EMBED_MODEL`   | `nomic-embed-text`            | Embedding model (768d)                   |
| `OLLAMA_TEXT_MODEL`    | `qwen3:0.6b`                  | Text enrichment model (uses /no_think)   |
| `OLLAMA_VL_MODEL`      | `qwen3-vl:2b`                 | Vision-language model (photo enrichment) |
| `FRONTEND_URL`         | `http://localhost:12412`       | CORS / OAuth redirect origin             |
| `PLUGINS_DIR`          | `./plugins`                   | External plugin directory                |
| `VITE_POSTHOG_API_KEY` | (none)                        | PostHog project API key (frontend)       |
| `VITE_POSTHOG_HOST`    | `http://localhost:8000`       | PostHog API host (frontend)              |


## Connectors

A connector is a pluggable data source adapter extending `BaseConnector` from `@botmem/connector-sdk`.

### Implemented Connectors


| Connector             | Auth Type            | Data                  | Contacts                                      |
| --------------------- | -------------------- | --------------------- | --------------------------------------------- |
| Gmail                 | OAuth2               | Emails (full history) | Yes (names, emails, avatars)                  |
| Slack                 | User token           | Workspace messages    | Yes (profiles, avatars)                       |
| WhatsApp              | QR code (Baileys v6) | Message history       | Partial (LID-based, limited phone resolution) |
| iMessage              | Local tool           | iMessage DB           | Yes                                           |
| Photos-Immich         | Local tool           | Immich photo library  | No                                            |
| Locations (OwnTracks) | HTTP auth            | GPS location history  | No                                            |


### Connector Interface

Every connector must implement:

- `manifest` — metadata (id, name, authType, configSchema)
- `initiateAuth(config)` / `completeAuth(params)` / `validateAuth(auth)` / `revokeAuth(auth)`
- `sync(ctx: SyncContext)` — pull data, emit `ConnectorDataEvent` objects via `this.emitData()`

Connectors are EventEmitters. During sync they emit `data`, `progress`, and `log` events.
Default sync behavior: pull maximum data available (full history, not limited/recent).
`BaseConnector.DEBUG_SYNC_LIMIT` must be 0 (disabled) in production.

## Jobs & Queue System (BullMQ)


| Queue      | Worker            | Purpose                                                                                 |
| ---------- | ----------------- | --------------------------------------------------------------------------------------- |
| `sync`     | `SyncProcessor`   | Orchestrates `connector.sync()`, writes to `rawEvents`                                  |
| `embed`    | `EmbedProcessor`  | Parses raw event, creates Memory, generates embedding, resolves contacts                |
| `enrich`   | `EnrichProcessor` | Extracts entities/claims, classifies factuality, computes importance, upserts to Qdrant |
| `backfill` | —                 | Retroactive enrichment of older memories                                                |


Job statuses: `queued → running → done | failed | cancelled`
Jobs table tracks progress (`progress`/`total` fields) and errors.
The `EventsGateway` (WebSocket at `/events`) broadcasts real-time job progress to the frontend.

## Pipeline: Raw Event → Queryable Memory

```
Connector.sync()
  → rawEvents table (immutable payload store)
  → [sync queue] SyncProcessor
  → [embed queue] EmbedProcessor
      ├ Parse raw event payload
      ├ Create Memory record in SQLite
      ├ Generate embedding via Ollama (nomic-embed-text, 768d)
      ├ Resolve participants → Contacts (dedup by email/phone/handle)
      └ Enqueue enrich job
  → [enrich queue] EnrichProcessor
      ├ Extract entities (via Ollama VL + prompts)
      ├ Extract claims
      ├ Classify factuality (FACT / UNVERIFIED / FICTION)
      ├ Compute importance baseline
      ├ Update Memory with metadata
      └ Upsert vector → Qdrant collection
```

## Data Model

### SQLite Tables (Drizzle ORM)

- `accounts` — connector accounts + encrypted auth context + sync cursor
- `jobs` — sync job tracking (status, progress, errors)
- `logs` — per-job log entries (info/warn/error/debug)
- `connectorCredentials` — OAuth credentials cache per connector type
- `rawEvents` — immutable ingested payloads (before normalization)
- `memories` — normalized events with text, weights, entities, claims, factuality
- `memoryLinks` — relationship graph (related / supports / contradicts)
- `contacts` — deduplicated people (displayName, entityType, avatars, metadata)
- `contactIdentifiers` — email/phone/name/slack_id mappings to contact (with confidence)
- `memoryContacts` — memory ↔ contact associations with role (sender/recipient/mentioned/participant)
- `mergeDismissals` — dismissed contact merge suggestions
- `settings` — key-value application settings

### Qdrant Collection

- `memories`: dense vectors (768d, cosine), payload includes `memory_id`, `source_type`, `connector_type`, `event_time`.

### Key Design Decisions

- All IDs are UUIDs (text primary keys in SQLite).
- All timestamps are ISO 8601 strings.
- JSON columns stored as text, parsed at application layer.
- Auth context is encrypted at rest.
- Contact resolution skips `name` type identifiers to prevent false merges.

## Retrieval and Ranking

### Scoring Formula

```
final = 0.40×semantic + 0.30×rerank + 0.15×recency + 0.10×importance + 0.05×trust
recency = exp(-0.015 × age_days)
```

- `semantic` — Qdrant cosine similarity score
- `rerank` — optional second-pass reranker score
- `recency` — exponential decay from event time
- `importance` — boosted by repeated recall, direct mention, user pinning
- `trust` — connector base trust + factuality confidence

### Search Filters

- `sourceType` — email, message, photo, location
- `connectorType` — gmail, slack, whatsapp, imessage, etc.
- `contactId` — filter by associated contact
- `factualityLabel` — FACT, UNVERIFIED, FICTION

## Fact/Fiction Subsystem

1. **Policy:** Always store memories. Label with factuality instead of dropping.
2. **Labels:** `FACT` (corroborated), `UNVERIFIED` (default, single-source), `FICTION` (contradicted).
3. **Each memory carries:** `{label, confidence, rationale}`.

## Docker Compose (Infrastructure)

```yaml
services:
  redis       # Redis 7 Alpine — BullMQ queue backend
  qdrant      # Qdrant latest — vector DB
```

Ollama runs externally at `192.168.10.250:11434` (not containerized).
Application services (API, web) run via `pnpm dev` in development.

## Frontend Pages

- **Me** — personal overview (default route)
- **Dashboard** — system status and stats
- **Connectors** — setup, OAuth, QR auth, sync progress
- **Memory Explorer** — search + force-directed graph visualization (react-force-graph-2d)
- **Contacts** — deduplicated contact list with merge suggestions
- **Settings** — application configuration

## CLI

- Binary: `npx botmem` or `node packages/cli/dist/cli.js`
- Commands: search memories, query contacts
- Flags: `--json` (machine-readable), `--api-url` (non-default API)

## Known Issues & Constraints

- WhatsApp uses LID format (`@lid`) — opaque identifiers, NOT phone numbers. LID→phone resolution is NOT possible through Baileys v6 API.
- WhatsApp history is ONLY delivered to the first socket that links (QR auth). Subsequent connections get nothing.
- NestJS watch mode doesn't detect changes in external packages — touch `apps/api/src/main.ts` to trigger rebuild.
- No git remote configured — commits are local only.

## Rollout Status

- ✓ Phase 0: Skeleton services, schemas, compose stack, health checks.
- ✓ Phase 1: Ingestion + normalization + embedding + ANN retrieval.
- ✓ Phase 2: Weighted scoring + recency/importance.
- ✓ Phase 3: Fact/fiction labeling pipeline + factuality classification.
- ✓ Phase 4: Force-directed graph visualization + memory explorer.
- ✓ Connectors: Gmail, Slack, WhatsApp, iMessage, Photos-Immich, Locations.
- ✓ Contacts: First-class entity with dedup, avatars, identifiers, merge suggestions.
- ✓ CLI: Human + agent queryable interface.
- ◆ Analytics: PostHog JS SDK integrated (frontend), needs API key configuration.

