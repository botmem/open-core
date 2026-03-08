# Research Summary: Botmem v1.4 Search Intelligence

**Domain:** Search intelligence layer (NLQ parsing, LLM summarization, entity classification) for personal memory RAG system
**Researched:** 2026-03-08
**Overall confidence:** HIGH

## Executive Summary

The v1.4 Search Intelligence milestone requires surprisingly few stack additions. The existing Ollama infrastructure (qwen3:0.6b text model, already loaded in VRAM on the RTX 3070) handles all three target features: natural language query parsing, search result summarization, and entity type classification. The only new dependency is `chrono-node` (zero-dependency temporal parsing library) because deterministic date parsing is strictly better than LLM-based date extraction for expressions like "last week" or "in January."

The most impactful technical change is adopting Ollama's `format` parameter (available since Ollama v0.5) for structured JSON output. Currently, `enrich.service.ts` uses regex-based extraction (`parseJsonArray`/`parseJsonObject`) to pull JSON from freeform LLM responses. The `format` parameter constrains generation at the grammar level, making invalid JSON impossible. This single change fixes entity type inconsistency (the root cause of the entity classification problem) and enables reliable NLQ query parsing without any new libraries.

The current search pipeline (`MemoryService.search()`) already has the building blocks: entity resolution via `resolveEntities()`, FTS5 text search, Qdrant vector search, and temporal filtering via `timeline()`. The NLQ parser's job is to decompose a freeform query into these existing primitives -- entities, topics, date ranges, and intent -- then route through the existing search infrastructure.

Summarization is a new capability but architecturally simple: take the top N search results, format them as context, and call `ollama.generate()` with a summarization prompt. No new services, no new queues -- just a new prompt and a `summary` field on the search response.

## Key Findings

**Stack:** Add only `chrono-node@^2.9.0`. Use existing Ollama `format` parameter for structured output. No NLP libraries needed.

**Architecture:** NLQ parser is a new service that wraps chrono-node (temporal) + Ollama structured output (entities/topics/intent), feeding results into existing `MemoryService.search()` and `timeline()`. Summarization is a post-processing step on search results.

**Critical pitfall:** qwen3:0.6b summarization quality degrades with context length. Limit to top 5-10 results, each truncated to ~200 chars, keeping total context under 2K tokens.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Entity type taxonomy + structured output** - Lowest risk, highest immediate value
   - Addresses: Entity classification consistency
   - Avoids: Changing search behavior before entities are clean
   - Tasks: Update `entityExtractionPrompt`, add `generateStructured()` to OllamaService, backfill existing entities

2. **Temporal parsing + NLQ decomposition** - Core query intelligence
   - Addresses: Natural language query parsing, temporal reference resolution
   - Avoids: Building summarization before queries are properly parsed
   - Tasks: Add chrono-node, build NLQ parser service, integrate with search pipeline

3. **Search result summarization** - User-facing payoff
   - Addresses: LLM summarization of search results
   - Avoids: Over-engineering (no streaming, no multi-turn)
   - Tasks: Summarization prompt, `summary` field on search response, source citations

**Phase ordering rationale:**
- Entity cleanup first because NLQ parsing quality depends on consistent entity types for filtering
- Temporal parsing before summarization because time-bounded queries are a prerequisite for meaningful summaries
- Summarization last because it builds on top of improved search quality from phases 1-2

**Research flags for phases:**
- Phase 1: Standard pattern, unlikely to need research. Ollama `format` parameter is well-documented.
- Phase 2: chrono-node is battle-tested, but NLQ prompt engineering for qwen3:0.6b may need iteration. Flag for prompt quality validation.
- Phase 3: Summarization prompt quality with 0.6b model is the main risk. May need to test with qwen3:1.7b if quality is insufficient.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 1 new dependency, verified via npm/docs |
| Features | HIGH | All features achievable with existing infrastructure + chrono-node |
| Architecture | HIGH | Clear integration points with existing MemoryService |
| Pitfalls | MEDIUM | qwen3:0.6b quality for summarization is the main unknown |

## Gaps to Address

- **qwen3:0.6b summarization quality**: Not benchmarked for summarizing personal memory search results. If quality is poor, consider upgrading to qwen3:1.7b or 4b for the summarization prompt only.
- **Ollama `format` + array schemas**: The `format` parameter documentation focuses on object schemas. Array schemas (needed for entity extraction) may need testing to confirm they work correctly.
- **NLQ prompt engineering**: The quality of query decomposition depends heavily on prompt design. This needs iterative testing with real queries from the user's data, not just synthetic examples.
