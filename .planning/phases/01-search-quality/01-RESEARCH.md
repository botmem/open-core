# Phase 1: Search Quality - Research

**Researched:** 2026-03-07
**Domain:** Search reranking, memory pinning, importance reinforcement (NestJS + Ollama + SQLite)
**Confidence:** HIGH

## Summary

This phase adds three capabilities to the existing search pipeline: (1) a reranker using Qwen3-Reranker-0.6B via Ollama's generate API with logprobs to fill the 0.30 rerank weight slot, (2) memory pinning with a score floor and recency exemption, and (3) importance reinforcement through recall counting. All changes are scoped to the backend `MemoryService`, `OllamaService`, `MemoryController`, the Drizzle schema, and the frontend search result cards.

The existing codebase is well-structured for these additions. The `SearchResult` interface already has a `rerank: number` field (always 0). The `computeWeights()` method is the single scoring function. The `OllamaService` already has `embed()` and `generate()` methods. Drizzle schema changes require adding two integer columns to the `memories` table.

**Primary recommendation:** Implement the reranker via Ollama generate API with `logprobs: true` and `raw: true` mode, extracting yes/no token probabilities from the Qwen3-Reranker-0.6B model. Process candidates sequentially (not batched) since Ollama processes one request at a time anyway. Add schema columns via Drizzle push (no migration files needed for SQLite).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use Qwen3-Reranker-0.6B via Ollama generate API (no native `/api/rerank` endpoint exists)
- Score top 10-15 Qdrant candidates only -- not the full corpus
- Reranker prompt: present query + candidate text, ask model to rate relevance 0-10, parse score
- Reranking is synchronous during search -- acceptable up to ~3 seconds
- Add `rerankerModel` config to ConfigService (default: `sam860/qwen3-reranker:0.6b-Q8_0`)
- If reranker model is not available on Ollama, fall back gracefully to rerank=0 (current behavior)
- Add `pinned` integer column to `memories` table (0 or 1, default 0)
- Pinned memories get a score floor of 0.75 -- they never rank below this
- Pinned memories are exempt from recency decay (recency stays at 1.0)
- API endpoints: `POST /memories/:id/pin` and `DELETE /memories/:id/pin`
- Frontend: pin/unpin toggle on search result cards and memory detail view
- Add `recallCount` integer column to `memories` table (default 0)
- Each time a memory appears in search results AND the user views/clicks it, increment recallCount
- Importance boost formula: `baseImportance + min(recallCount * 0.02, 0.2)` -- caps at +0.2 after 10 recalls
- Tracking via API: `POST /memories/:id/recall` called from frontend when user expands a search result
- Fire-and-forget write-back -- no queue needed, SQLite WAL handles it
- Current scoring: `final = 0.40*semantic + 0.25*recency + 0.20*importance + 0.15*trust` (no rerank)
- New scoring: `final = 0.40*semantic + 0.30*rerank + 0.15*recency + 0.10*importance + 0.05*trust`
- When reranker unavailable, redistribute: `0.70*semantic + 0.15*recency + 0.10*importance + 0.05*trust`

### Claude's Discretion
- Exact reranker prompt template wording
- Whether to batch reranker calls or make sequential generate requests
- Schema migration approach (add columns vs recreate)
- Error handling for Ollama timeouts during reranking

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | Search results are reranked using Qwen3-Reranker-0.6B via Ollama generate API, filling the 0.30 rerank weight slot | Reranker prompt template, logprobs-based scoring, OllamaService.rerank() method pattern |
| SRCH-02 | Reranking is applied to top 10-15 candidates only, keeping latency under 3 seconds | Sequential processing of candidates; 0.6B model generates ~200ms/call; 15 calls fits in <3s budget |
| SRCH-03 | User can pin a memory, which sets a score floor (pinned memories never drop below 0.75 final score) | Drizzle schema column addition, computeWeights() score floor logic |
| SRCH-04 | Pinned memories are exempt from recency decay | computeWeights() conditional: if pinned, recency = 1.0 |
| SRCH-05 | Each successful search result view increments the memory's recall count, boosting importance score | POST /memories/:id/recall endpoint, frontend onClick handler |
| SRCH-06 | Importance reinforcement is capped at +0.2 after 10 recalls to prevent runaway scores | Formula: baseImportance + min(recallCount * 0.02, 0.2) in computeWeights() |

</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS | 11 | Backend framework | Already in use |
| Drizzle ORM | latest | SQLite schema + queries | Already in use |
| better-sqlite3 | latest | SQLite driver (WAL mode) | Already in use |
| Ollama HTTP API | v0.12+ | LLM inference (generate + logprobs) | Already in use for embed/generate |

### No New Dependencies
This phase requires zero new npm packages. All functionality is built using:
- Ollama's existing HTTP `/api/generate` endpoint (adding `logprobs` parameter)
- Drizzle ORM schema changes (adding columns)
- NestJS controller endpoints
- React state management with existing Zustand store

## Architecture Patterns

### Reranker Integration Point

The reranker slots into the existing search flow between Qdrant retrieval and `computeWeights()`:

```
Current:  Qdrant.search() → computeWeights() → sort → return
New:      Qdrant.search() → rerank(top15) → computeWeights(with rerank score) → sort → return
```

### Recommended Changes by File

```
apps/api/src/
├── config/config.service.ts        # Add ollamaRerankerModel getter
├── db/schema.ts                    # Add pinned + recallCount columns
├── memory/
│   ├── ollama.service.ts           # Add rerank() method
│   ├── memory.service.ts           # Update computeWeights(), getWeights(), search()
│   └── memory.controller.ts        # Add pin/unpin/recall endpoints
apps/web/src/
├── lib/api.ts                      # Add pinMemory(), unpinMemory(), recordRecall()
├── store/memoryStore.ts            # Add pin state + recall tracking
├── components/memory/
│   ├── MemoryCard.tsx              # Add pin toggle button
│   └── MemoryDetailPanel.tsx       # Add pin toggle button
```

### Pattern: Reranker via Ollama Generate with Logprobs

**What:** Use the Qwen3-Reranker model's chat template with Ollama's `raw` mode and `logprobs` to get yes/no token probabilities as relevance scores.

**Why this approach:** The CONTEXT.md says "ask model to rate relevance 0-10, parse score" but research reveals a significantly better approach -- the Qwen3-Reranker-0.6B is specifically trained to output "yes" or "no" tokens, and Ollama now supports `logprobs` in the generate API (since v0.12.11). Extracting token probabilities is more reliable than parsing free-text numeric scores, and it is what the model was actually trained to do.

**Recommended approach (Claude's discretion on prompt template):**

```typescript
// OllamaService.rerank() method
async rerank(query: string, documents: string[]): Promise<number[]> {
  const scores: number[] = [];
  const instruction = 'Given a personal memory search query, retrieve relevant memories that answer the query';

  for (const doc of documents) {
    const prompt = [
      '<|im_start|>system',
      'Judge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".',
      '<|im_end|>',
      '<|im_start|>user',
      `<Instruct>: ${instruction}`,
      `<Query>: ${query}`,
      `<Document>: ${doc}`,
      '<|im_end|>',
      '<|im_start|>assistant',
      '<think>\n\n</think>\n\n',
    ].join('\n');

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.rerankerModel,
          prompt,
          raw: true,
          stream: false,
          logprobs: true,
          top_logprobs: 5,
          options: { num_predict: 1, temperature: 0 },
        }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) { scores.push(0); continue; }

      const data = await res.json();
      // Extract yes/no probabilities from logprobs
      const topTokens = data.logprobs?.[0]?.top_logprobs || [];
      const yesEntry = topTokens.find((t: any) => t.token.toLowerCase().trim() === 'yes');
      const noEntry = topTokens.find((t: any) => t.token.toLowerCase().trim() === 'no');

      if (yesEntry && noEntry) {
        // Softmax over yes/no logprobs
        const yesProb = Math.exp(yesEntry.logprob);
        const noProb = Math.exp(noEntry.logprob);
        scores.push(yesProb / (yesProb + noProb));
      } else if (yesEntry) {
        scores.push(Math.exp(yesEntry.logprob));
      } else {
        // Fallback: check if generated token is "yes"
        scores.push(data.response?.toLowerCase().trim() === 'yes' ? 0.8 : 0.2);
      }
    } catch {
      scores.push(0); // Timeout or error -- graceful degradation
    }
  }
  return scores;
}
```

**Key design decisions (Claude's discretion):**
- **Sequential, not batched:** Ollama processes one request at a time. Sending requests in sequence avoids queuing. With `num_predict: 1` and a 0.6B model, each call takes ~100-200ms. 15 candidates = ~1.5-3 seconds.
- **`raw: true` mode:** Required to send the exact chat template without Ollama adding its own formatting.
- **`num_predict: 1`:** We only need the first token (yes/no), so limit generation to 1 token for speed.
- **`temperature: 0`:** Deterministic scoring -- same query+doc always gets the same score.
- **5-second timeout per call:** Aggressive timeout; if one call hangs, skip it with score 0.

### Pattern: Score Floor for Pinned Memories

```typescript
private computeWeights(semanticScore: number, mem: any): { score: number; weights: ... } {
  const isPinned = mem.pinned === 1;

  // Pinned memories exempt from recency decay
  const ageDays = (Date.now() - new Date(mem.eventTime).getTime()) / (1000 * 60 * 60 * 24);
  const recency = isPinned ? 1.0 : Math.exp(-0.015 * ageDays);

  // Importance with recall boost
  const recallCount = mem.recallCount || 0;
  const baseImportance = 0.5 + Math.min(entityCount * 0.1, 0.4);
  const importance = baseImportance + Math.min(recallCount * 0.02, 0.2);

  // ... compute final score ...

  // Pinned floor
  const final = isPinned ? Math.max(computedFinal, 0.75) : computedFinal;

  return { score: final, weights: { ... } };
}
```

### Anti-Patterns to Avoid

- **Do NOT parse free-text numeric scores from the reranker.** The Qwen3-Reranker is trained to output yes/no, not 0-10. Using logprobs of yes/no is the correct extraction method. If logprobs are unavailable (older Ollama), fall back to checking if the text output is "yes" or "no" and mapping to 0.8/0.2.
- **Do NOT send all candidates through the reranker.** The 3-second budget only allows ~15 candidates. Qdrant's vector search already filters down to semantically relevant results.
- **Do NOT use a BullMQ queue for recall tracking.** The CONTEXT.md explicitly says fire-and-forget SQLite writes. WAL mode handles concurrent reads + one write.
- **Do NOT add the `pinned` and `recallCount` columns as JSON inside the existing `weights` column.** They are query-filter-able properties that belong as proper columns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reranker score extraction | Custom 0-10 text parser | Ollama logprobs + yes/no probability | Model was trained for this; text parsing is fragile |
| Schema migration | Custom ALTER TABLE SQL | `pnpm drizzle-kit push` | Drizzle handles SQLite column addition safely |
| Concurrent writes | Custom locking | SQLite WAL mode | Already configured; handles concurrent read + single write |

## Common Pitfalls

### Pitfall 1: Ollama Model Not Pulled
**What goes wrong:** Reranker calls fail because `sam860/qwen3-reranker:0.6b-Q8_0` is not available on the remote Ollama instance.
**Why it happens:** The model must be pulled separately; it is not the same as the existing qwen3:0.6b text model.
**How to avoid:** The `rerank()` method must catch HTTP errors and return score 0 for all candidates. The `computeWeights()` fallback redistributes the 0.30 rerank weight to semantic (0.70 total).
**Warning signs:** All rerank scores are 0; search results are ordered purely by semantic score.

### Pitfall 2: Logprobs Not Available (Older Ollama)
**What goes wrong:** The `logprobs` field is undefined in the response because the Ollama instance is older than v0.12.11.
**Why it happens:** Logprobs support was added in Ollama v0.12.11 (late 2025).
**How to avoid:** Check if `data.logprobs` exists. If not, fall back to parsing the text response (check if it starts with "yes" or "no").
**Warning signs:** logprobs is undefined; scores cluster at 0.8 or 0.2.

### Pitfall 3: Reranker Adds Latency Beyond 3 Seconds
**What goes wrong:** Search becomes visibly slow.
**Why it happens:** Network latency to remote Ollama (192.168.10.250) or model loading time on first call.
**How to avoid:** Use `num_predict: 1` (single token), 5-second per-call timeout, and limit to 15 candidates max. If total reranking exceeds 3 seconds, implement an early-exit: score whatever candidates have been processed and return.
**Warning signs:** Search response times above 3 seconds in logs.

### Pitfall 4: Schema Push Drops Data
**What goes wrong:** Running `drizzle-kit push` on a table with existing data could theoretically recreate the table.
**Why it happens:** Drizzle's SQLite push uses `ALTER TABLE ADD COLUMN` for adding columns (safe), but if you also rename or change column types, it recreates.
**How to avoid:** ONLY add new columns. Do not modify existing columns in the same push. Verify with `drizzle-kit push --dry-run` first.
**Warning signs:** Memory count drops to 0 after schema push.

### Pitfall 5: Stale `weights` JSON Column
**What goes wrong:** The `weights` text column in the memories table stores stale scoring weights from ingest time. These should NOT be confused with the live search-time weights.
**Why it happens:** The `computeWeights()` method computes fresh scores at search time, but the DB column `weights` was set during the embed/enrich pipeline.
**How to avoid:** Do NOT read from `mem.weights` for scoring. Always compute fresh in `computeWeights()`. The `pinned` and `recallCount` columns are separate from this JSON.
**Warning signs:** Scores don't change after pinning or recalling.

## Code Examples

### Adding Schema Columns (Drizzle)

```typescript
// In apps/api/src/db/schema.ts, add to memories table:
export const memories = sqliteTable('memories', {
  // ... existing columns ...
  pinned: integer('pinned').notNull().default(0),       // 0 or 1
  recallCount: integer('recall_count').notNull().default(0),
});
```

Then run: `pnpm drizzle-kit push` from `apps/api/`.

### ConfigService Addition

```typescript
// In apps/api/src/config/config.service.ts
get ollamaRerankerModel(): string {
  return process.env.OLLAMA_RERANKER_MODEL || 'sam860/qwen3-reranker:0.6b-Q8_0';
}
```

### Controller Endpoints

```typescript
// In memory.controller.ts
@Post(':id/pin')
async pin(@Param('id') id: string) {
  await this.dbService.db.update(memories)
    .set({ pinned: 1 })
    .where(eq(memories.id, id));
  return { ok: true };
}

@Delete(':id/pin')
async unpin(@Param('id') id: string) {
  await this.dbService.db.update(memories)
    .set({ pinned: 0 })
    .where(eq(memories.id, id));
  return { ok: true };
}

@Post(':id/recall')
async recall(@Param('id') id: string) {
  await this.dbService.db.update(memories)
    .set({ recallCount: sql`${memories.recallCount} + 1` })
    .where(eq(memories.id, id));
  return { ok: true };
}
```

### Frontend API Client Additions

```typescript
// In apps/web/src/lib/api.ts
pinMemory: (id: string) =>
  request<{ ok: boolean }>(`/memories/${id}/pin`, { method: 'POST' }),
unpinMemory: (id: string) =>
  request<{ ok: boolean }>(`/memories/${id}/pin`, { method: 'DELETE' }),
recordRecall: (id: string) =>
  request<{ ok: boolean }>(`/memories/${id}/recall`, { method: 'POST' }),
```

### Updated computeWeights() Signature

```typescript
private computeWeights(
  semanticScore: number,
  rerankScore: number,   // NEW -- from OllamaService.rerank()
  mem: any,
): { score: number; weights: SearchResult['weights'] } {
  const isPinned = mem.pinned === 1;
  const recallCount = mem.recallCount || 0;

  const ageDays = (Date.now() - new Date(mem.eventTime).getTime()) / (1000 * 60 * 60 * 24);
  const recency = isPinned ? 1.0 : Math.exp(-0.015 * ageDays);

  let entityCount = 0;
  try { entityCount = JSON.parse(mem.entities).length; } catch {}
  const baseImportance = 0.5 + Math.min(entityCount * 0.1, 0.4);
  const importance = baseImportance + Math.min(recallCount * 0.02, 0.2);

  const trust = this.getTrustScore(mem.connectorType);

  let final: number;
  if (rerankScore > 0) {
    // Full formula with reranker
    final = 0.40 * semanticScore + 0.30 * rerankScore + 0.15 * recency + 0.10 * importance + 0.05 * trust;
  } else {
    // Fallback: redistribute rerank weight to semantic
    final = 0.70 * semanticScore + 0.15 * recency + 0.10 * importance + 0.05 * trust;
  }

  // Pinned floor
  if (isPinned) final = Math.max(final, 0.75);

  return {
    score: final,
    weights: { semantic: semanticScore, rerank: rerankScore, recency, importance, trust, final },
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No Ollama logprobs | `logprobs: true` in generate API | Ollama v0.12.11 (late 2025) | Enables proper reranker score extraction via token probabilities |
| Custom rerank API needed | Qwen3-Reranker works via generate endpoint | June 2025 (model release) | No native /api/rerank needed; generate + logprobs suffices |
| Parse text "0-10" scores | Extract yes/no token logprobs | Model design | More reliable, matches model training objective |

**Deprecated/outdated:**
- The embedding-based reranking approach (from the Go blog post) is a workaround for when logprobs were unavailable. Now that Ollama supports logprobs, use the proper token probability approach.
- Ollama PR #7219 for native `/api/rerank` endpoint has been stalled since mid-2025. Do not wait for it.

## Open Questions

1. **Ollama version on remote instance (192.168.10.250)**
   - What we know: Ollama is running remotely with nomic-embed-text and qwen3 models
   - What's unclear: Whether the instance is v0.12.11+ (has logprobs support)
   - Recommendation: Implement logprobs extraction with fallback to text parsing. Check version at startup via `GET /api/version`.

2. **Reranker model availability**
   - What we know: The model `sam860/qwen3-reranker:0.6b-Q8_0` must be pulled on the remote Ollama
   - What's unclear: Whether it has been pulled already
   - Recommendation: Add a startup check in OllamaService that verifies model availability. Log a warning if not available, but do not fail startup.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3 |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01 | Reranker scores populated in search results | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/rerank.test.ts -x` | Wave 0 |
| SRCH-02 | Reranking limited to top 15 candidates, completes in time | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/rerank.test.ts -x` | Wave 0 |
| SRCH-03 | Pinned memory gets score floor of 0.75 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/scoring.test.ts -x` | Wave 0 |
| SRCH-04 | Pinned memory has recency = 1.0 | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/scoring.test.ts -x` | Wave 0 |
| SRCH-05 | Recall count increments and boosts importance | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/scoring.test.ts -x` | Wave 0 |
| SRCH-06 | Importance boost caps at +0.2 after 10 recalls | unit | `cd apps/api && pnpm vitest run src/memory/__tests__/scoring.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && pnpm vitest run --reporter=verbose`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/memory/__tests__/rerank.test.ts` -- covers SRCH-01, SRCH-02 (mock Ollama, verify rerank() method)
- [ ] `apps/api/src/memory/__tests__/scoring.test.ts` -- covers SRCH-03, SRCH-04, SRCH-05, SRCH-06 (test computeWeights() with pinned/recall scenarios)

## Sources

### Primary (HIGH confidence)
- [Qwen/Qwen3-Reranker-0.6B HuggingFace](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B) - Official model card with prompt template, score extraction via yes/no logprobs
- [Ollama Generate API docs](https://docs.ollama.com/api/generate) - Confirmed logprobs + top_logprobs parameters, raw mode, response format
- Existing codebase: `memory.service.ts`, `ollama.service.ts`, `schema.ts`, `memory.controller.ts` -- direct source inspection

### Secondary (MEDIUM confidence)
- [Ollama v0.12.11 release](https://github.com/ollama/ollama/releases/tag/v0.12.11) - Confirmed logprobs support added
- [Reranking with Ollama and Qwen3 (Go blog)](https://www.glukhov.org/rag/reranking/reranking-with-ollama-qwen3-reranker-golang/) - Embedding-based workaround (superseded by logprobs approach)
- [Ollama PR #7219](https://github.com/ollama/ollama/pull/7219) - Native rerank API still not merged; confirms generate-based approach is necessary

### Tertiary (LOW confidence)
- [sam860/qwen3-reranker Ollama page](https://ollama.com/sam860/qwen3-reranker) - Model availability confirmed but quantization performance not independently verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new dependencies
- Architecture: HIGH - direct codebase inspection, clear integration points identified
- Reranker approach: HIGH - HuggingFace official docs + Ollama API docs both verified
- Pitfalls: HIGH - based on direct code analysis and known Ollama limitations

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable -- all components are released and documented)
