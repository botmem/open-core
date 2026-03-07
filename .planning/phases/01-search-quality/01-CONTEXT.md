# Phase 1: Search Quality - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve search result quality through reranker scoring, memory pinning, and importance reinforcement. The reranker fills the empty 0.30 weight slot in the scoring formula. Pinning allows users to lock important memories to always surface. Importance reinforcement boosts memories that are frequently accessed. No UI changes beyond pin/unpin controls; no new pages or connectors.

</domain>

<decisions>
## Implementation Decisions

### Reranker integration
- Use Qwen3-Reranker-0.6B via Ollama generate API (no native `/api/rerank` endpoint exists)
- Score top 10-15 Qdrant candidates only — not the full corpus
- Reranker prompt: present query + candidate text, ask model to rate relevance 0-10, parse score
- Reranking is synchronous during search — acceptable up to ~3 seconds
- Add `rerankerModel` config to ConfigService (default: `sam860/qwen3-reranker:0.6b-Q8_0`)
- If reranker model is not available on Ollama, fall back gracefully to rerank=0 (current behavior)

### Memory pinning
- Add `pinned` integer column to `memories` table (0 or 1, default 0)
- Pinned memories get a score floor of 0.75 — they never rank below this
- Pinned memories are exempt from recency decay (recency stays at 1.0)
- API endpoints: `POST /memories/:id/pin` and `DELETE /memories/:id/pin`
- Frontend: pin/unpin toggle on search result cards and memory detail view

### Importance reinforcement
- Add `recallCount` integer column to `memories` table (default 0)
- Each time a memory appears in search results AND the user views/clicks it, increment recallCount
- Importance boost formula: `baseImportance + min(recallCount * 0.02, 0.2)` — caps at +0.2 after 10 recalls
- Tracking via API: `POST /memories/:id/recall` called from frontend when user expands a search result
- Fire-and-forget write-back — no queue needed, SQLite WAL handles it

### Scoring formula update
- Current: `final = 0.40*semantic + 0.25*recency + 0.20*importance + 0.15*trust` (no rerank)
- New: `final = 0.40*semantic + 0.30*rerank + 0.15*recency + 0.10*importance + 0.05*trust`
- When reranker unavailable, redistribute rerank weight to semantic: `0.70*semantic + 0.15*recency + 0.10*importance + 0.05*trust`

### Claude's Discretion
- Exact reranker prompt template wording
- Whether to batch reranker calls or make sequential generate requests
- Schema migration approach (add columns vs recreate)
- Error handling for Ollama timeouts during reranking

</decisions>

<specifics>
## Specific Ideas

- The scoring formula weights from plan.md (`0.40 semantic + 0.30 rerank + 0.15 recency + 0.10 importance + 0.05 trust`) are the target — current code uses different weights because rerank doesn't exist yet
- Research flagged: existing code computes weights at search time but also stores stale weights in the `weights` JSON column at ingest time — ensure consistency
- Research flagged: BullMQ `repeat` API deprecated since v5.16.0 — use `upsertJobScheduler()` (relevant for Phase 2 but good to know)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OllamaService` (`apps/api/src/memory/ollama.service.ts`): Has `embed()` and `generate()` methods — reranker can add a `rerank()` method using the same generate endpoint
- `computeWeights()` in `MemoryService` (line 697): Current scoring logic — needs update to include rerank score
- `getWeights()` in `MemoryService` (line 89): Per-connector weight configuration — needs rerank weight added
- `SearchResult` interface (line 22): Already has `rerank: number` in weights — just always 0

### Established Patterns
- Scoring: `computeWeights()` computes at search time, returns `{ score, weights }` object
- Trust: Per-connector trust scores from connector manifests
- Schema: Drizzle ORM with SQLite, migrations via schema changes + push
- Config: `ConfigService` holds all env vars with defaults

### Integration Points
- `MemoryService.search()`: Insert reranker step between Qdrant retrieval and `computeWeights()`
- `MemoryController`: Add `/memories/:id/pin` and `/memories/:id/recall` endpoints
- `apps/api/src/db/schema.ts`: Add `pinned` and `recallCount` columns to `memories` table
- `apps/web/src/lib/api.ts`: Add `pinMemory()`, `unpinMemory()`, `recordRecall()` API calls
- Frontend search results component: Add pin toggle button + recall tracking on result click

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-search-quality*
*Context gathered: 2026-03-07*
