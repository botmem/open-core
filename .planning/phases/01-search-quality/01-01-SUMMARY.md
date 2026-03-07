---
phase: 01-search-quality
plan: 01
subsystem: api
tags: [ollama, reranker, qwen3-reranker, logprobs, search-scoring]

requires: []
provides:
  - "OllamaService.rerank() method using Ollama generate API with logprobs"
  - "Updated 5-weight scoring formula: 0.40 semantic + 0.30 rerank + 0.15 recency + 0.10 importance + 0.05 trust"
  - "Reranker integration in search flow (top 15 candidates)"
  - "ollamaRerankerModel config getter"
affects: [01-search-quality]

tech-stack:
  added: ["sam860/qwen3-reranker:0.6b-Q8_0 (Ollama model)"]
  patterns: ["logprobs-based yes/no relevance scoring", "graceful degradation when model unavailable"]

key-files:
  created:
    - "apps/api/src/memory/__tests__/rerank.test.ts"
  modified:
    - "apps/api/src/config/config.service.ts"
    - "apps/api/src/memory/ollama.service.ts"
    - "apps/api/src/memory/memory.service.ts"

key-decisions:
  - "Use logprobs softmax (yes/(yes+no)) for rerank scoring rather than raw probability"
  - "Fallback to 0.70 semantic weight when reranker unavailable (redistributes 0.30 rerank weight)"
  - "Rerank only top 15 candidates sorted by semantic score to limit latency"

patterns-established:
  - "Graceful model degradation: rerank returns zeros on error, scoring adjusts weights automatically"
  - "Sequential document processing for Ollama (single request at a time)"

requirements-completed: [SRCH-01, SRCH-02]

duration: 3min
completed: 2026-03-07
---

# Phase 01 Plan 01: Reranker Integration Summary

**Qwen3-Reranker-0.6B integration via Ollama generate API with logprobs-based yes/no scoring, filling the 0.30 rerank weight slot in the search formula**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-07T16:16:35Z
- **Completed:** 2026-03-07T16:19:54Z
- **Tasks:** 2
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments
- OllamaService.rerank() method that uses Qwen3-Reranker chat template with logprobs to compute relevance scores
- Updated scoring formula uses all 5 weights (semantic, rerank, recency, importance, trust) with proper fallback
- Search flow reranks top 15 Qdrant candidates before final scoring
- 5 unit tests covering logprobs, HTTP errors, timeouts, text fallback, and document count

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reranker config and OllamaService.rerank() method** - `4e96142` (feat + test, TDD)
2. **Task 2: Integrate reranker into search flow and update scoring formula** - `91a4c91` (feat)

## Files Created/Modified
- `apps/api/src/config/config.service.ts` - Added ollamaRerankerModel config getter
- `apps/api/src/memory/ollama.service.ts` - Added rerankerModel field and rerank() method
- `apps/api/src/memory/memory.service.ts` - Updated computeWeights() with rerankScore param, added reranking step in search flow
- `apps/api/src/memory/__tests__/rerank.test.ts` - 5 unit tests for reranker

## Decisions Made
- Used logprobs softmax (yesProb / (yesProb + noProb)) for scoring -- more numerically stable than raw probabilities
- When reranker is unavailable, semantic weight increases from 0.40 to 0.70 (absorbing the 0.30 rerank weight)
- Top 15 candidates are reranked (sorted by semantic score) to bound latency while covering the most relevant results
- 5-second timeout per rerank call via AbortSignal.timeout

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed TypeScript error with `typeof this.fetchMemoryRow` in arrow function**
- **Found during:** Task 2 (Build verification)
- **Issue:** TypeScript disallows `typeof this` in arrow function contexts for type expressions
- **Fix:** Replaced with explicit inline type `{ memory: typeof memories.$inferSelect; accountIdentifier: string | null }`
- **Files modified:** apps/api/src/memory/memory.service.ts
- **Verification:** `pnpm build` succeeds
- **Committed in:** 91a4c91 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor type annotation fix. No scope creep.

## Issues Encountered
- Pre-existing test failures in unrelated modules (contacts, logs, auth, slack) documented in deferred-items.md -- not caused by this plan's changes

## User Setup Required
To use the reranker, pull the model on the Ollama server:
```bash
ollama pull sam860/qwen3-reranker:0.6b-Q8_0
```
Without the model, search continues to work with rerank=0 and semantic weight redistributed to 0.70.

## Next Phase Readiness
- Reranker integration complete, search scoring now uses all 5 weights
- Ready for Plan 02 (if any further search quality improvements)
- Reranker latency benchmarking on RTX 3070 recommended during real usage

---
*Phase: 01-search-quality*
*Completed: 2026-03-07*
