# Technology Stack: Search Intelligence Layer

**Project:** Botmem v1.4 Search Intelligence
**Researched:** 2026-03-08
**Scope:** Additions/changes for NLQ parsing, LLM summarization, entity type classification

## Recommended Stack Additions

### NLQ Temporal Parsing
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| chrono-node | ^2.9.0 | Extract temporal references from natural language queries | Zero dependencies, TypeScript native, handles "last week", "in January", "3 days ago" etc. deterministically without LLM. Parsing dates via LLM is wasteful when a 0-dependency library does it perfectly. |

### Structured LLM Output (NO new dependency)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Ollama `format` parameter | Ollama v0.5+ (already deployed) | Force JSON schema compliance from qwen3:0.6b | Already available in current Ollama. Pass `format: { type: "object", properties: {...}, required: [...] }` to `/api/chat`. Eliminates regex-based JSON extraction in `enrich.service.ts` (`parseJsonArray`/`parseJsonObject`). |

### NO new NLP library needed
| Considered | Why Not |
|------------|---------|
| compromise (NLP) | Entity extraction already done by Ollama in EnrichProcessor. Adding a second NER system creates conflicting outputs. Compromise's entity types (person/place/organization) are a subset of what Ollama already extracts (person, location, time, organization, amount, product, event, metric). |
| wink-nlp | Same reasoning. Ollama is already the NER engine. |
| nlp.js | Overkill; requires training data, intent classification we don't need. |

## Existing Stack (Use As-Is, No Changes)

### Ollama qwen3:0.6b for NLQ Parsing and Summarization
| Capability | How to Use | Why Not Add a Separate Model |
|------------|-----------|------------------------------|
| NLQ intent parsing | New prompt in `prompts.ts`: parse query into `{entities, topics, temporal, intent}` | qwen3:0.6b is already loaded in VRAM, ~100ms inference. Adding a separate model would double VRAM usage for marginal quality gain on short queries. |
| Search result summarization | New prompt in `prompts.ts`: summarize top-N results into a natural language answer | Same model, same reasoning. Summarization of 5-10 search results is well within 0.6b capability for personal memory context. |
| Entity type classification | Update `entityExtractionPrompt()` with stricter type enum + use Ollama `format` parameter | Current prompt allows freeform types. Constraining via JSON schema + clearer prompt fixes inconsistency without any new tech. |

**Key insight:** The existing Ollama infrastructure handles all three features. The only code-level addition is `chrono-node` for temporal parsing, because regex/heuristic date parsing is more reliable and faster than LLM for temporal expressions.

## Integration Architecture

### Where Each Piece Fits

```
User Query: "What did Assad tell me about the car last week?"
          |
          v
  [chrono-node] --> temporal: { from: "2026-03-01", to: "2026-03-08" }
          |
          v
  [Ollama qwen3:0.6b + format param] --> { entities: ["Assad"], topics: ["car"], intent: "recall" }
          |
          v
  [Existing MemoryService.search()] --> with temporal filter + entity resolution
          |
          v
  [Ollama qwen3:0.6b] --> summarize top results into answer
          |
          v
  Response: { answer: "Assad mentioned...", items: [...], parsedQuery: {...} }
```

### OllamaService Changes

Add a `generateStructured<T>()` method alongside existing `generate()`:

```typescript
async generateStructured<T>(prompt: string, schema: object): Promise<T> {
  const res = await fetch(`${this.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: this.textModel,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      think: false,
      format: schema,  // Ollama v0.5+ JSON schema constraint
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json();
  return JSON.parse(data.message.content);
}
```

This replaces the brittle `parseJsonArray()` / `parseJsonObject()` regex extraction in `enrich.service.ts` with schema-enforced output.

**Known issue:** Ollama has a bug with `think: true` + `format` producing malformed JSON. The existing code already sets `think: false`, so this is not a concern.

### NLQ Query Parsing Schema

```typescript
const NLQ_SCHEMA = {
  type: "object",
  properties: {
    entities: {
      type: "array",
      items: { type: "string" },
      description: "Person names, organization names mentioned"
    },
    topics: {
      type: "array",
      items: { type: "string" },
      description: "Subject matter keywords"
    },
    temporalExpression: {
      type: "string",
      description: "Any time reference like 'last week', 'in January', 'yesterday'"
    },
    intent: {
      type: "string",
      enum: ["recall", "find", "summarize", "count", "list"],
      description: "What the user wants to do"
    },
    sourceHint: {
      type: "string",
      enum: ["email", "message", "photo", "location", "any"],
      description: "Implied data source"
    }
  },
  required: ["entities", "topics", "intent"]
};
```

### Entity Type Classification Fix

Current `entityExtractionPrompt` allows freeform types. Fix by:

1. Using Ollama `format` parameter with strict schema:

```typescript
const ENTITY_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["person", "organization", "location", "event", "product", "date", "amount"] },
      value: { type: "string" },
      confidence: { type: "number" }
    },
    required: ["type", "value", "confidence"]
  }
};
```

2. This eliminates inconsistent types like "metric", "time" vs "date", or freeform strings that currently pollute the entities column.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Temporal parsing | chrono-node | LLM-based date extraction | LLM is slower (100ms+), non-deterministic, can hallucinate dates. chrono-node is instant and correct. |
| Temporal parsing | chrono-node | date-fns / dayjs parse | These parse formatted dates, not natural language ("last Tuesday"). |
| NLQ parsing | Ollama qwen3:0.6b | Separate NLQ model (e.g., T5-small) | Adds model management complexity, extra VRAM. qwen3:0.6b is already loaded and handles short prompt parsing fine. |
| NLQ parsing | Ollama qwen3:0.6b | Rule-based regex parser | Too brittle for varied natural language. "emails from John about invoices" vs "what John said about invoices in emails" -- regex can't handle this reliably. |
| Summarization | Ollama qwen3:0.6b | Upgrade to qwen3:1.7b or larger | 0.6b is sufficient for summarizing 5-10 short memory snippets (personal context, not academic papers). Larger model doubles VRAM for marginal quality gain. |
| Structured output | Ollama `format` param | Zod + manual validation | Ollama's grammar-constrained generation is strictly better -- invalid JSON literally cannot be produced. Zod validation is a fallback, not a replacement. |
| Entity classification | Prompt + schema fix | Separate classification model | Over-engineering. The current model extracts entities fine; the problem is freeform type labels, solved by constraining the schema. |

## Installation

```bash
# Only ONE new dependency
cd /Users/amr/Projects/botmem
pnpm --filter @botmem/api add chrono-node
```

No other packages needed. Everything else is prompt engineering + using existing Ollama `format` parameter.

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| LangChain / LlamaIndex | Massive dependency for what amounts to 3 prompt templates and 1 Ollama API call. Botmem already has direct Ollama integration. |
| OpenAI SDK | Project uses local Ollama; adding OpenAI SDK adds unnecessary abstraction. v2.0 will use OpenRouter which is OpenAI-compatible anyway. |
| Vector DB query language | Qdrant's filter API is already sufficient. No need for a query DSL layer. |
| compromise / wink-nlp | Duplicate NER engine alongside Ollama. Creates conflicting entity outputs. |
| Zod | Not needed for runtime validation when Ollama `format` parameter guarantees schema compliance at generation time. If needed later, it's a dev-time convenience, not a search intelligence dependency. |
| Instructor (structured output lib) | Python-first library. The JS port wraps OpenAI SDK. Ollama's native `format` parameter does the same thing with zero dependencies. |

## Confidence Assessment

| Decision | Confidence | Reasoning |
|----------|------------|-----------|
| chrono-node for temporal | HIGH | Zero-dependency, TypeScript, 7M+ weekly downloads, handles all needed temporal expressions. Verified via npm and GitHub. |
| Ollama `format` parameter | HIGH | Documented in official Ollama docs since v0.5. Already works with qwen3:0.6b (with `think: false`). Verified via official docs. |
| qwen3:0.6b for NLQ parsing | MEDIUM | Not benchmarked for short-query intent parsing specifically, but the model is already proven for entity extraction and factuality in this codebase. Query parsing prompts are simpler than entity extraction. |
| qwen3:0.6b for summarization | MEDIUM | 0.6b models can summarize short texts well, but quality degrades with longer context. Limiting to top 5-10 results (each truncated to ~200 chars) keeps total context under 2K tokens, well within capability. |
| No NLP library needed | HIGH | Examined compromise, wink-nlp, nlp.js. All would duplicate existing Ollama NER. The entity type problem is a prompt/schema issue, not a library issue. |

## Sources

- [Ollama Structured Outputs Documentation](https://docs.ollama.com/capabilities/structured-outputs)
- [Ollama Blog: Structured Outputs](https://ollama.com/blog/structured-outputs)
- [chrono-node on npm](https://www.npmjs.com/package/chrono-node)
- [chrono-node GitHub](https://github.com/wanasit/chrono)
- [Ollama JSON + thinking mode issue #10929](https://github.com/ollama/ollama/issues/10929)
- [Constraining LLMs with Structured Output: Ollama + Qwen3](https://medium.com/@rosgluk/constraining-llms-with-structured-output-ollama-qwen3-python-or-go-2f56ff41d720)
- [qwen3:0.6b on Ollama](https://ollama.com/library/qwen3:0.6b)
- [compromise NLP on GitHub](https://github.com/spencermountain/compromise)
