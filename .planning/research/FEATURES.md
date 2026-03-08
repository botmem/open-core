# Feature Landscape

**Domain:** Search intelligence layer for a personal memory RAG system (NLQ parsing, LLM summarization, entity classification)
**Researched:** 2026-03-08

## Table Stakes

Features users expect from an intelligent search layer in a personal memory system. Missing any of these makes the search feel "dumb" compared to asking ChatGPT.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Natural language query decomposition | Users type "what did Harry say about the project?" not keyword searches. System must extract entities + topics from freeform text | Med | Already partially done: `resolveEntities()` in MemoryService does greedy span matching against contacts. Needs expansion to extract temporal refs, topics, and intent. |
| Temporal reference parsing | "last week", "in January", "yesterday" must resolve to date ranges automatically | Med | Pure rule-based approach via chrono-node. No LLM needed. Feeds directly into existing `timeline()` API's `from`/`to` params. |
| Search result summarization | Top N memories returned as a coherent paragraph, not just a raw list. Users want "Harry mentioned security concerns about the API on Jan 15" not 20 JSON objects | Med | Use qwen3:0.6b (already available) to summarize top results. Keep raw results available alongside summary for transparency. |
| Consistent entity type taxonomy | Currently entities have random types (the prompt says "person, location, time, organization, amount, product, event, metric" but qwen3:0.6b output is inconsistent). Entities must have a fixed, closed set of types | Low | Fix the prompt + use Ollama structured output (`format` param with JSON schema) to enforce `{type: enum, value: string, confidence: number}`. Backfill existing entities via a migration job. |
| Entity-filtered search | "messages from Harry" should automatically filter by contact, not just boost. "meetings in London" should filter by location entity | Low | Contact filtering already works (`contactId` filter path in search). Entity type filtering needs a new code path that queries the `entities` JSON column by type + value. |
| Query intent classification | Distinguish "recall" (find specific memory), "summarize" (aggregate answer), "count" (how many), "timeline" (chronological) intents to route queries differently | Med | Simple classification: if query starts with "how many" -> count intent; "when did" -> timeline; "what did X say about Y" -> recall + summarize. Rule-based first, LLM fallback for ambiguous queries. |

## Differentiators

Features that set Botmem apart from generic RAG search. Not expected, but create real value for a personal memory system.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cross-connector corroboration in summaries | Summary notes when the same event appears in email AND Slack, boosting confidence | Low | Already have factuality labels and connector tracking. Summarization prompt can mention "confirmed across N sources" when multiple connectors reference the same event/topic. |
| Negative/absence answers | "Did I ever discuss X with Y?" -> "No matching memories found for X with Y" as a clear negative rather than empty results | Low | When search returns 0 results with resolved entities, generate an explicit "I found no memories about {topic} involving {contact}" response instead of empty JSON. |
| Source attribution in summaries | Each claim in the summary links back to the specific memory ID that supports it | Med | Summarization prompt instructs model to cite `[1]`, `[2]` etc. Post-process to map citations to memory IDs. Critical for trust in a factuality-aware system. |
| Entity type normalization across existing data | Backfill all existing memories with consistent entity types using the new taxonomy | Med | Batch job via BullMQ. Re-run entity extraction with improved prompt + structured output on all memories where `entities` column has inconsistent types. Use `backfill` queue. |

## Anti-Features

Features to explicitly NOT build during this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full SQL/structured query language | Building a query DSL ("from:harry topic:security after:2024-01-01") adds parser complexity and confuses users who just want to type naturally | Decompose natural language into the existing filter structure (contactId, sourceType, connectorType, date range). The NLQ parser IS the query language. |
| Multi-turn conversation with persistent memory | Chat-style interaction with memory of previous queries requires session management, context windows, and significantly more LLM calls | Single-query-in, answer-out for this milestone. Conversational follow-up is a future milestone. |
| Fine-tuning qwen3:0.6b for entity extraction | Fine-tuning requires training data, GPU time, and creates a model dependency that complicates updates | Use better prompts + Ollama structured output (JSON schema enforcement). The 0.6B model is good enough with proper constraints. |
| External NER service (spaCy, Hugging Face NER pipeline) | Adds a Python dependency to a TypeScript monorepo, complicates deployment, and the LLM already does NER adequately | Keep NER in the Ollama generate call. Use structured output to enforce consistency. |
| Real-time streaming summaries | SSE/WebSocket streaming of the summary as it generates looks cool but adds complexity for a single-user system | Return the complete summary in the HTTP response. Summarization of 5-10 memories via qwen3:0.6b takes <3 seconds -- streaming is unnecessary. |
| Agentic search (multi-step retrieval with tool use) | The system deciding to run multiple searches, check facts, and compose answers is a rabbit hole of complexity | Keep it simple: one NLQ parse -> one search -> one summarization pass. |

## Feature Dependencies

```
Temporal parsing ------> NLQ parser (temporal refs feed date range filters)
Entity type taxonomy --> Structured output enforcement --> Entity extraction prompt update
Entity extraction prompt update --> Backfill job (re-extract entities for existing memories)
NLQ parser --> Intent classification (parser output determines intent routing)
Intent classification --> Search result summarization (only "recall" and "summarize" intents get LLM summary)
Entity-filtered search --> NLQ parser (parser identifies entity filters to apply)
Contact resolution (EXISTING) --> NLQ parser (reuses resolveEntities() logic)
Search pipeline (EXISTING) --> Summarization (summary operates on search results)
Ollama generate (EXISTING) --> Summarization (uses same qwen3:0.6b model)
Ollama structured output --> Entity extraction (enforces consistent JSON schema)
```

Critical path: **Entity type taxonomy** must come first (makes entity data reliable), then **NLQ parser** (central dependency for temporal parsing, intent classification, and entity filtering), then **summarization** (builds on improved search quality).

## MVP Recommendation

Prioritize in this order:

1. **Entity type taxonomy + structured output enforcement** -- Lowest risk, highest immediate value. Fix the `entityExtractionPrompt` to use a closed enum, add Ollama `format` param with JSON schema. This makes all entity data consistent going forward.
2. **Temporal reference parsing** -- Rule-based via chrono-node, no LLM calls, predictable behavior. Parse "last week", "in January 2025", "yesterday" into `{from, to}` date ranges.
3. **NLQ query decomposition** -- Core feature. Parse freeform queries into `{entities: [], topics: [], temporal: {from, to}, intent: string}`. Extend existing `resolveEntities()` to also extract topics and temporal refs.
4. **Intent classification** -- Route queries to the right handler. Rule-based for obvious patterns, LLM fallback for ambiguous.
5. **Search result summarization** -- The user-facing payoff. Take top 10 search results, format as context, ask qwen3:0.6b to produce a 2-3 sentence answer with source citations.
6. **Entity backfill job** -- Re-extract entities for all existing memories using the improved prompt + structured output.
7. **Negative/absence answers** -- Small but important UX win.

Defer:
- **Conversational follow-up**: Requires session state management. Future milestone.
- **Smart query expansion**: Marginal value since vector search already handles synonyms.

## Sources

- [Ollama Structured Outputs](https://docs.ollama.com/capabilities/structured-outputs) -- HIGH confidence
- [chrono-node on npm](https://www.npmjs.com/package/chrono-node) -- HIGH confidence
- Existing codebase: `apps/api/src/memory/prompts.ts`, `enrich.service.ts`, `memory.service.ts`, `ollama.service.ts` -- HIGH confidence
