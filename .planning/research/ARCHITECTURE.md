# Architecture: Search Intelligence Integration

**Domain:** NLQ parsing, LLM summarization, entity classification for personal memory RAG
**Researched:** 2026-03-08
**Confidence:** HIGH (analysis based on direct codebase reading, not external sources)

## Current Search Data Flow

```
User query (string)
  |
  v
MemoryService.search(query, filters, limit, rerank)
  |
  +-- 1. resolveEntities(queryWords)          # greedy span match against contacts cache
  |       returns: { contacts[], topicWords[], contactIds[] }
  |
  +-- 2. ollama.embed(query)                  # embed FULL query string (always)
  |       returns: number[] (768d vector)
  |
  +-- 3. qdrant.search(vector, limit*2)       # Qdrant cosine similarity
  |
  +-- 4. FTS5 search (topicWords or queryWords)  # SQLite full-text on memories_fts
  |
  +-- 5. Contact memory lookup (contactIds)   # memoryContacts table join
  |
  +-- 6. Merge candidates + score             # computeWeights + textBoost + contactBoost
  |
  +-- 7. Filter MIN_SCORE 0.35, sort, limit
  |
  v
SearchResponse { items[], fallback, resolvedEntities? }
```

There is also `AgentService.summarize()` which already does search-then-LLM-summarize but it lives in the agent module, not the memory/search module.

## Integration Analysis

### 1. NLQ Parsing: Where It Fits

**Current state:** The search method receives a raw string `query`. It splits into words, does greedy contact name matching via `resolveEntities()`, and uses leftover words as topic terms. There is NO temporal parsing ("last week", "in January"), NO intent detection ("what did X say about Y"), and NO structured filter extraction.

**Integration point:** NLQ parsing must happen BEFORE the existing search flow, as a pre-processing step that transforms the raw query into structured intent.

```
User query: "what did Assad say about the car last month"
                |
                v
        [NEW] NLQ Parser
                |
                v
ParsedQuery {
  originalQuery: "what did Assad say about the car last month"
  searchText: "Assad car"              // cleaned for embedding
  extractedFilters: {
    contactName: "Assad"               // -> resolved to contactId by existing resolveEntities
    temporal: { from: "2026-02-01", to: "2026-02-28" }
  }
  intent: "retrieve"                   // vs "summarize" vs "count" vs "timeline"
}
```

**Where to put it:**

- **New file:** `apps/api/src/memory/nlq.service.ts` -- standalone NestJS injectable service
- **Modification:** `MemoryService.search()` gains an optional `parsedQuery` parameter, OR a new method `searchNlq(query)` that calls the parser then delegates to `search()` with extracted filters
- **Modification:** `MemoryController` -- the `POST /api/memories/search` endpoint gains NLQ as the default path (raw query in, structured search internally)

**Recommended approach:** Add a `parseQuery()` method call at the TOP of `MemoryService.search()`, before the existing `resolveEntities()` call. The parser output feeds into the existing flow:

```typescript
// In MemoryService.search():
async search(query: string, filters?: SearchFilters, limit = 20, rerank = false): Promise<SearchResponse> {
  if (!query.trim()) return { items: [], fallback: false };

  // [NEW] NLQ parsing -- extract temporal, contact, intent from natural language
  const parsed = await this.nlqService.parse(query);

  // Merge parsed filters with explicit filters (explicit wins)
  const mergedFilters = { ...parsed.filters, ...filters };

  // Use parsed.searchText for embedding (stripped of temporal/stop words)
  // but keep original query for FTS fallback
  const embedQuery = parsed.searchText || query;

  // ... rest of existing flow uses embedQuery for vector search,
  //     mergedFilters for Qdrant/SQL filtering,
  //     parsed.temporal for date range WHERE clause
}
```

**NLQ parser implementation:** Use Ollama (qwen3:0.6b) with a structured extraction prompt. The parser should be FAST (< 200ms target). Two approaches:

1. **LLM-based (recommended for v1):** Single `ollama.generate()` call with a JSON-output prompt that extracts `{contacts, topics, temporal, intent}`. Simple, flexible, handles edge cases.
2. **Rule-based (fallback):** Regex patterns for temporal expressions ("last week", "yesterday", "in March 2025"), stopword removal. Faster but brittle.

Recommendation: LLM-based with rule-based fallback when Ollama is unavailable. Cache parsed queries for repeated searches.

**What NOT to do:** Do NOT replace the existing `resolveEntities()` contact matching. The NLQ parser extracts CANDIDATE contact names from the query text; the existing greedy span matcher resolves them against the actual contacts database. These are complementary, not redundant.

### 2. Summarization: Where It Fits

**Current state:** `AgentService.summarize()` already implements search-then-summarize. It calls `memoryService.search()`, enriches results, builds a prompt, calls `ollama.generate()`. BUT:
- It lives in `agent/` module (CLI/API for agents), not accessible from the main search endpoint
- It always summarizes -- no streaming, no option to skip
- The prompt is simple and doesn't leverage entity/contact context

**Integration point:** Summarization is a POST-SEARCH operation. It takes search results and produces a natural language answer. It should be exposed through the main search endpoint as an opt-in flag.

**Where to put it:**

- **New file:** `apps/api/src/memory/summarize.service.ts` -- extracted from AgentService, reusable
- **Modification:** `MemoryController` -- `POST /api/memories/search` gains `summarize?: boolean` in the request body
- **Modification:** `SearchResponse` type gains optional `summary?: string` field
- **Refactor:** `AgentService.summarize()` delegates to the new `SummarizeService` instead of duplicating logic

```typescript
// New SummarizeService
@Injectable()
export class SummarizeService {
  constructor(private ollama: OllamaService) {}

  async summarize(query: string, memories: SearchResult[]): Promise<string> {
    const memoriesText = memories
      .map(m => `[${m.eventTime.slice(0, 10)}] [${m.connectorType}] ${m.text}`)
      .join('\n\n');

    return this.ollama.generate(summarizationPrompt(query, memoriesText));
  }
}
```

**Controller integration:**

```typescript
// In MemoryController:
@Post('search')
async search(@Body() body: {
  query: string;
  filters?: Record<string, string>;
  limit?: number;
  rerank?: boolean;
  summarize?: boolean;  // [NEW]
}) {
  const result = await this.memoryService.search(body.query, body.filters, body.limit, body.rerank);

  if (body.summarize && result.items.length > 0) {
    result.summary = await this.summarizeService.summarize(body.query, result.items);
  }

  return result;
}
```

**What NOT to do:** Do NOT create a separate `/api/memories/summarize` endpoint. Summarization is a view over search results, not an independent operation. Keep it as a flag on the search endpoint to avoid the frontend needing to make two sequential calls.

### 3. Entity Classification Fix: Where It Fits

**Current state:** Entity extraction happens in `EnrichService.enrich()` via `extractEntities()` which calls `ollama.generate(entityExtractionPrompt(text))`. The prompt requests types: `person, location, time, organization, amount, product, event, metric`. BUT the actual stored entities are inconsistent because:
- The LLM sometimes returns variations: "Person" vs "person", "place" vs "location", "company" vs "organization"
- Different memory texts produce different type labels for the same semantic category
- The entity search (`searchEntities`) does case-insensitive LIKE search on the JSON, so "Person" and "person" work, but "place" vs "location" is a real inconsistency

**Integration point:** This is a PROMPT FIX + POST-PROCESSING NORMALIZATION in the enrichment pipeline, plus a BACKFILL for existing data.

**Where to put it:**

- **Modification:** `apps/api/src/memory/prompts.ts` -- update `entityExtractionPrompt()` to be more explicit about allowed types, add few-shot examples
- **New function:** Add `normalizeEntityType(type: string): string` in `apps/api/src/memory/enrich.service.ts` that maps variations to canonical types
- **Modification:** `EnrichService.extractEntities()` -- apply normalization after LLM response parsing
- **New endpoint or queue job:** Backfill endpoint to re-classify existing entities without re-running full enrichment

```typescript
// Canonical entity types
const ENTITY_TYPES = ['person', 'organization', 'location', 'event', 'product', 'time', 'amount', 'metric'] as const;

// Normalization map
const TYPE_ALIASES: Record<string, string> = {
  'place': 'location',
  'city': 'location',
  'country': 'location',
  'address': 'location',
  'company': 'organization',
  'org': 'organization',
  'brand': 'organization',
  'human': 'person',
  'name': 'person',
  'date': 'time',
  'datetime': 'time',
  'timestamp': 'time',
  'price': 'amount',
  'cost': 'amount',
  'money': 'amount',
  'currency': 'amount',
  'item': 'product',
  'service': 'product',
  'number': 'metric',
  'quantity': 'metric',
  'percentage': 'metric',
};

function normalizeEntityType(type: string): string {
  const lower = type.toLowerCase().trim();
  return TYPE_ALIASES[lower] || (ENTITY_TYPES.includes(lower as any) ? lower : 'other');
}
```

**Backfill strategy:** Do NOT re-run full enrichment (expensive LLM calls for entity extraction + factuality). Instead:

1. Parse existing `entities` JSON from all memories
2. Apply `normalizeEntityType()` to each entity's type field
3. Write back the normalized JSON
4. This is a pure data migration -- no LLM calls needed

```typescript
// New endpoint: POST /api/memories/backfill-entity-types
// Pure SQL/JS operation, no Ollama needed
async backfillEntityTypes() {
  const rows = await db.select({ id: memories.id, entities: memories.entities })
    .from(memories)
    .where(sql`${memories.entities} != '[]'`);

  let updated = 0;
  for (const row of rows) {
    const entities = JSON.parse(row.entities);
    let changed = false;
    for (const e of entities) {
      const normalized = normalizeEntityType(e.type);
      if (normalized !== e.type) { e.type = normalized; changed = true; }
    }
    if (changed) {
      await db.update(memories)
        .set({ entities: JSON.stringify(entities) })
        .where(eq(memories.id, row.id));
      updated++;
    }
  }
  return { updated, total: rows.length };
}
```

## Component Inventory: New vs Modified

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| NlqService | `apps/api/src/memory/nlq.service.ts` | Parse natural language queries into structured intent |
| SummarizeService | `apps/api/src/memory/summarize.service.ts` | Generate LLM summaries from search results |
| NLQ prompt | `apps/api/src/memory/prompts.ts` (addition) | New `nlqParsePrompt()` function |
| Summarization prompt | `apps/api/src/memory/prompts.ts` (addition) | New `summarizationPrompt()` function |

### Modified Components

| Component | File | Change |
|-----------|------|--------|
| MemoryService | `apps/api/src/memory/memory.service.ts` | Add NLQ parsing at top of `search()`, add temporal filter support |
| MemoryController | `apps/api/src/memory/memory.controller.ts` | Add `summarize` flag to search endpoint, add backfill-entity-types endpoint |
| SearchResponse | `apps/api/src/memory/memory.service.ts` | Add optional `summary` and `parsedQuery` fields |
| SearchFilters | `apps/api/src/memory/memory.service.ts` | Add `dateFrom`, `dateTo` temporal filter fields |
| EnrichService | `apps/api/src/memory/enrich.service.ts` | Add `normalizeEntityType()` post-processing |
| entityExtractionPrompt | `apps/api/src/memory/prompts.ts` | Improve prompt with explicit type list and few-shot examples |
| AgentService | `apps/api/src/agent/agent.service.ts` | Refactor `summarize()` to use new SummarizeService |
| MemoryModule | `apps/api/src/memory/memory.module.ts` | Register NlqService and SummarizeService |

### NOT Modified (explicitly)

| Component | Reason |
|-----------|--------|
| OllamaService | Already has `generate()` and `embed()` -- no new methods needed |
| QdrantService | No changes -- NLQ adds filters at the MemoryService level, not Qdrant level |
| EmbedProcessor | No changes -- entity classification fix is in EnrichService only |
| EnrichProcessor | No changes -- it delegates to EnrichService |
| Database schema | No schema changes needed -- entities JSON column already flexible |

## Data Flow Changes

### Before (current)

```
POST /api/memories/search { query: "what did Assad say about cars last month" }
  |
  v
search("what did Assad say about cars last month")
  |-- resolveEntities(["what", "did", "assad", "say", "about", "cars", "last", "month"])
  |   -> contacts: [Assad Mansoor], topicWords: ["what", "did", "say", "about", "cars", "last", "month"]
  |-- embed("what did Assad say about cars last month")  <- noisy embedding with stop words
  |-- FTS5("what" AND "did" AND "say" AND ...)           <- matches too broadly
  v
Results: mixed quality, no temporal filtering, stop words dilute results
```

### After (with search intelligence)

```
POST /api/memories/search { query: "what did Assad say about cars last month", summarize: true }
  |
  v
[NEW] nlqService.parse("what did Assad say about cars last month")
  -> ParsedQuery {
       searchText: "Assad cars",
       temporal: { from: "2026-02-01", to: "2026-02-28" },
       intent: "retrieve",
       contactHints: ["Assad"]
     }
  |
  v
search() with parsed context:
  |-- resolveEntities(["assad", "cars"])                 <- cleaner input
  |   -> contacts: [Assad Mansoor], topicWords: ["cars"]
  |-- embed("Assad cars")                                <- focused embedding
  |-- FTS5("cars")                                       <- precise text match
  |-- SQL WHERE eventTime >= '2026-02-01' AND <= '2026-02-28'  <- temporal filter
  |-- Qdrant filter for date range (payload filter)
  v
SearchResponse with higher precision results
  |
  v
[NEW] summarizeService.summarize(query, results)
  -> "Assad mentioned his car needed an oil change on Feb 12th and discussed selling it on Feb 20th."
  |
  v
{ items: [...], summary: "Assad mentioned...", parsedQuery: { temporal: {...} } }
```

## Suggested Build Order

Build order is driven by dependencies and incremental value:

### Phase 1: Entity Classification Fix (no dependencies, pure data quality)

**Why first:** Zero risk, no new infrastructure, immediate data quality improvement. All subsequent features (NLQ, summarization) benefit from consistent entity types. Also serves as a warmup change to the enrichment pipeline.

**Tasks:**
1. Add `normalizeEntityType()` to `enrich.service.ts`
2. Update `entityExtractionPrompt()` with explicit types and few-shot examples
3. Apply normalization in `extractEntities()` post-processing
4. Add `POST /api/memories/backfill-entity-types` endpoint
5. Run backfill on existing data
6. Verify entity search results are consistent

**Estimated scope:** Small. ~2 files modified, ~1 new endpoint, no LLM calls for backfill.

### Phase 2: NLQ Parsing (depends on nothing, enables Phase 3)

**Why second:** NLQ parsing improves search quality directly. It provides the structured query that makes summarization more effective (Phase 3 summarizes better results = better summaries).

**Tasks:**
1. Create `nlq.service.ts` with `parse(query)` method
2. Add `nlqParsePrompt()` to `prompts.ts`
3. Integrate parser into `MemoryService.search()` -- add temporal filter support to `SearchFilters`
4. Add temporal WHERE clause to the SQL queries in search
5. Add date range filter to `buildQdrantFilter()` for Qdrant payload filtering
6. Add `parsedQuery` to `SearchResponse` so frontend can show "Showing results from February 2026"
7. Tests for temporal parsing, contact extraction, edge cases

**Estimated scope:** Medium. 1 new file, 2-3 modified files.

**Key risk:** LLM parsing latency. The qwen3:0.6b model should be fast enough (< 200ms for short prompts on RTX 3070), but measure it. If too slow, implement rule-based temporal parsing as primary with LLM fallback for complex queries.

### Phase 3: Summarization (depends on Phase 2 for best results)

**Why third:** Summarization is highest user-facing value but depends on good search results to be useful. With NLQ parsing improving precision, summaries will be meaningful rather than summarizing irrelevant results.

**Tasks:**
1. Create `summarize.service.ts` with `summarize(query, results)` method
2. Add `summarizationPrompt()` to `prompts.ts`
3. Add `summarize` flag to `MemoryController.search()`
4. Add `summary` field to `SearchResponse`
5. Refactor `AgentService.summarize()` to delegate to new service
6. Frontend: show summary banner above search results when present
7. Tests for summarization prompt, empty results, Ollama failure fallback

**Estimated scope:** Medium. 1 new file, 2-3 modified files, frontend changes.

**Key risk:** Summarization latency. With qwen3:0.6b and 10-20 memory texts, expect 1-3 seconds. Consider making it async (return search results immediately, stream summary via WebSocket, or return summary in a follow-up poll).

## Architectural Principles

### 1. Layer Cake, Not Monolith

Each feature is a separate injectable service. NlqService and SummarizeService are independent -- they can be tested, replaced, or disabled without touching search logic.

### 2. Opt-In, Not Mandatory

NLQ parsing can be bypassed (pass `skipParse: true`). Summarization is opt-in (`summarize: true`). Entity normalization is transparent (always runs, no flag needed).

### 3. Graceful Degradation

If Ollama is down: NLQ parser falls back to rule-based temporal extraction. Summarization returns `null` (frontend shows raw results). Entity normalization is pure JS, no LLM dependency.

### 4. No New Infrastructure

All three features use existing Ollama (already deployed), existing SQLite schema (entities JSON is flexible), existing Qdrant (payload filters already supported). Zero new services to deploy.

### 5. Backward Compatible API

The search endpoint gains optional fields (`summarize`, `parsedQuery` in response). Existing clients that don't send `summarize: true` get identical behavior. No breaking changes.

## Scalability Considerations

| Concern | Current (10K memories) | At 100K memories | At 1M memories |
|---------|----------------------|-------------------|----------------|
| NLQ parse latency | ~150ms (LLM) | Same | Same (query-dependent, not corpus-dependent) |
| Summarization latency | ~1-3s (10 results) | Same | Same (limited by result count, not corpus) |
| Entity backfill | ~5s | ~50s | ~500s (batch in chunks) |
| Temporal filter | Instant (SQLite index) | Add index on event_time if not exists | Consider partitioning |

## Sources

- Direct codebase analysis of all files listed in milestone_context
- `AgentService.summarize()` at `apps/api/src/agent/agent.service.ts:307-347` -- existing summarization pattern
- `EnrichService.extractEntities()` at `apps/api/src/memory/enrich.service.ts:124-131` -- existing entity extraction
- `MemoryService.search()` at `apps/api/src/memory/memory.service.ts:176-374` -- complete search flow
- `entityExtractionPrompt()` at `apps/api/src/memory/prompts.ts:1-7` -- current entity prompt
