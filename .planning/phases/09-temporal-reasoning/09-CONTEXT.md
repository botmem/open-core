# Phase 9: NLQ Parsing - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can search with natural language containing temporal references, person/place names, and varying intents, and get intelligently filtered results within 500ms. All parsing is deterministic (chrono-node for temporal, rule-based for intent) — no LLM calls in the search hot path. Entity resolution from queries already exists and is extended, not replaced.

</domain>

<decisions>
## Implementation Decisions

### Temporal parsing scope
- Use chrono-node for all temporal extraction (locked by PERF-01)
- Ambiguous month/season references resolve to the most recent past occurrence ("January" in March 2026 = January 2026)
- Support both simple references ("last week", "yesterday", "in January") AND explicit ranges ("between March and June", "from Jan to Mar")
- Temporal filters are strict: only return memories within the parsed date range
- When strict temporal filter returns zero results, fallback to unfiltered search with `fallback: true` and `parsed.temporalFallback: true` in response so clients can show "No results for last Tuesday — showing all matches"
- Confidence threshold on chrono-node output: only apply temporal filter for high-confidence parses; low-confidence parses are ignored and words stay in semantic query

### Query decomposition output
- API response includes a new top-level `parsed` field: `{ temporal: {from, to} | null, entities: [...], intent: "recall"|"browse"|"find", cleanQuery: "..." }`
- Existing `resolvedEntities` field kept for backward compatibility — `parsed` extends, not replaces
- The cleaned query (temporal/entity references stripped) is used for the semantic embedding, not the full original query — avoids noise in vector search
- CLI (`botmem search`) runs NLQ parsing on every query by default — no --nlq flag needed. If nothing is extracted, falls through to raw search silently

### Intent classification behavior
- Rule-based deterministic keyword/pattern matching (no LLM, fits PERF-01):
  - "what did"/"who said"/"tell me about" → recall
  - "show me"/"list"/"recent" → browse
  - "find"/possessive "'s" → find
- Default intent when classification can't determine: recall (matches current search behavior)
- **Find** intent: returns top 5 results with strict entity matching, higher precision
- **Recall** intent: returns default 20 results with broad semantic matching (current behavior)
- **Browse** intent: boosts recency weight significantly, filters by sourceType if detectable ("photos" → sourceType=photo)

### Combo queries (temporal + entity)
- AND logic: both temporal and entity filters apply simultaneously
- "emails from Sarah last week" → results must match Sarah AND be from last week
- Existing entity resolution handles the entity part, chrono-node handles temporal, both constrain the Qdrant/SQL queries

### Fallback behavior
- No temporal references detected → silent passthrough, no date filter, search runs as today
- No user-facing message when parsing extracts nothing — `parsed.temporal` is null in response
- Parse feedback displayed in existing search result box (no new chip/tag UI components)

### Claude's Discretion
- Exact chrono-node confidence threshold value
- How to strip temporal tokens from the query string before embedding
- Internal architecture of the NLQ parser module (single function vs service class)
- Exact keyword patterns for intent classification rules
- How browse intent adjusts the scoring formula weights

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MemoryService.search()` at `memory.service.ts:176` — main search pipeline, already has entity-aware hybrid search with `resolveEntities()`
- `SearchFilters` interface at `memory.service.ts:11` — has sourceType, connectorType, contactId, factualityLabel; needs temporal (from/to) fields added
- `SearchResponse` interface at `memory.service.ts:53` — has `items`, `fallback`, `resolvedEntities`; extend with `parsed` field
- `OllamaService.embed()` — generates embeddings; will receive cleaned query instead of raw
- `buildQdrantFilter()` at `memory.service.ts:1090` — builds Qdrant filter object; needs temporal filter support
- `resolveEntities()` — greedy multi-word span matching for contacts; already working, NLQ parser runs before this

### Established Patterns
- Entity resolution uses greedy multi-word span matching against contacts/identifiers
- Scoring formula: 0.40 semantic + 0.30 rerank + 0.15 recency + 0.10 importance + 0.05 trust
- `fallback: boolean` already exists in SearchResponse for fallback scenarios
- Search filters passed via POST body to `/search` endpoint

### Integration Points
- `POST /search` controller at `memory.controller.ts:297` — NLQ parsing happens before calling `memoryService.search()`
- `GET /memories` at `memory.controller.ts:205` — already has `from`/`to` query params for date filtering
- CLI `botmem search` command — NLQ runs transparently on input query
- Qdrant filter needs `event_time` range condition for temporal filtering
- Frontend search result box — reused to display parse feedback (no new components)

</code_context>

<specifics>
## Specific Ideas

- Parse feedback uses the existing search result box — no new chip/tag components needed
- Success criteria example: "emails from Sarah last week" filters to correct date range AND boosts Sarah's contact
- Success criteria example: "where did I go in January" returns location-type memories filtered to most recent January
- The `parsed` field in API response enables the CLI `--json` mode to show structured parse output

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-temporal-reasoning*
*Context gathered: 2026-03-08*
