# Phase 35: Data Sync & Pipeline Verification - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Sync all 6 connectors (Gmail, Slack, WhatsApp, iMessage, Photos-Immich, Locations) with real data and verify the full pipeline (raw event → embed → enrich → Qdrant) produces correct, searchable memories. Fix any pipeline issues discovered during validation.

</domain>

<decisions>
## Implementation Decisions

### Data scope

- Start with a FRESH database — wipe existing memories, contacts, raw events for clean validation
- Initial sync: ~50 items per connector using DEBUG_SYNC_LIMIT=50
- After pipeline validation passes: increase to DEBUG_SYNC_LIMIT=500 for search quality validation (Phase 38)
- DEBUG_SYNC_LIMIT must be reset to 0 (disabled) after validation completes

### Sync order

- Sequential: set up auth → sync → verify pipeline → next connector
- Start with Gmail (OAuth already configured, richest data type)
- Order after Gmail: Slack → WhatsApp → iMessage → Photos-Immich → Locations
- Stop-and-fix on connector failure — do NOT skip broken connectors. Every connector must work before moving on.

### Verification method

- Automated verification script that runs after each connector sync
- SQL spot checks: count raw events, verify memories created with correct source_type, check contacts resolved, verify entities extracted, confirm factuality set
- Search checks: per-connector search queries using known content to verify end-to-end retrieval
- Qdrant checks: verify vectors upserted with correct payload fields (memory_id, source_type, connector_type, event_time)
- Script reports pass/fail per check per connector

### Pipeline completion visibility (GOLDEN RULE)

- **No pipeline completion = memory not visible to user anywhere in UI**
- Add a `pipelineComplete` boolean flag on memories
- Memory only appears in search, graph, timeline, and any UI after full pipeline completes (embed + enrich + Qdrant upsert)
- If ANY step fails, it retries (BullMQ auto-retry with exponential backoff)
- Incomplete memories are invisible but not deleted — they remain in queue for retry

### Failure handling

- Pipeline step failures (Ollama timeout, Qdrant down): BullMQ auto-retry with exponential backoff (already configured)
- Connector sync failures (auth expired, service unavailable): stop entire process, debug and fix before continuing
- No silent failures — every error must be logged and visible

### Claude's Discretion

- Exact verification script structure and output format
- DB migration approach for fresh database setup
- Specific search queries for per-connector validation
- Order of Slack/WhatsApp/iMessage/Photos/Locations (after Gmail)

</decisions>

<specifics>
## Specific Ideas

- "Golden rule: no pipeline completion = memory not available anywhere on the UI for the user to see. If any step fails, it gets retried."
- User wants to validate by generating data, forming search assumptions, then actually searching to verify
- Gmail first because OAuth creds are already configured and it has the richest data (emails + contacts + attachments)

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `ConnectorDataEvent` type: already supports all 5 source types (email/message/photo/location/file) and attachments array
- `EmbedProcessor`: handles raw event → Memory creation, embedding generation, contact resolution
- `EnrichProcessor`: handles entity extraction, factuality classification, Qdrant upsert
- `BaseConnector.DEBUG_SYNC_LIMIT`: existing mechanism to cap sync volume — set >0 to abort after N emits
- `botmem` CLI: can be used for search validation queries
- Test credentials in memory: Gmail OAuth (client ID/secret), Slack user token, OwnTracks HTTP auth

### Established Patterns

- BullMQ pipeline: sync queue → embed queue → enrich queue (3-stage async processing)
- Connector packages: each in `packages/connectors/<name>/` with `sync.ts` implementation
- Entity normalizer: pure function in `embed.processor.ts`, enforces canonical 10-type taxonomy
- Contact resolution: via `ContactsService` with identifier-based dedup (skips name-type to prevent false merges)

### Integration Points

- `ConnectorsService.registry`: maps connector type → connector class
- `SyncProcessor`: orchestrates `connector.sync()`, writes rawEvents, enqueues embed jobs
- `MemoryService.search()`: handles Qdrant vector search + scoring formula + filters
- `DbService.db`: Drizzle ORM for direct SQL queries in verification script
- `memories` schema: needs `pipelineComplete` boolean column added

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 35-data-sync-pipeline-verification_
_Context gathered: 2026-03-09_
