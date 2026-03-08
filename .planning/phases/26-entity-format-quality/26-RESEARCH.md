# Phase 26: Entity Format & Quality - Research

**Researched:** 2026-03-08
**Domain:** NLP entity extraction pipeline, data normalization, Ollama structured output
**Confidence:** HIGH

## Summary

Phase 26 addresses five distinct but interrelated problems in the entity extraction pipeline: (1) format mismatch between embed-step and enrich-step entities, (2) no garbage filtering on entity values, (3) no within-memory deduplication, (4) a weak extraction prompt that produces hallucinated types, and (5) a duplicate `memoryLinks` insert bug. All problems are well-scoped to files already identified in the codebase, and the fixes are straightforward data normalization and validation work.

The embed step (connector-sdk `BaseConnector.embed()`) produces entities with shape `{type, id, role}` for contact resolution purposes. The enrich step (`EnrichService.extractEntities()`) produces entities with shape `{type, value}` via Ollama structured output. These two formats serve different purposes and currently coexist without reconciliation. The embed-step entities are used transiently for contact linking but never persisted to the memory record -- only enrich-step entities are stored.

The taxonomy also needs updating: Phase 8 established `person, organization, location, event, product, topic, pet, group, device, other` but the requirements for this phase define a new canonical 10-type set: `PERSON, ORGANIZATION, LOCATION, DATE, EVENT, PRODUCT, CONCEPT, QUANTITY, LANGUAGE, OTHER`. However, the contact system heavily depends on the lowercase taxonomy (especially `person`, `organization`, `group`, `device`). The safest approach is to keep entity types lowercase in storage but update the canonical set to match the requirements, and map the old types to new ones.

**Primary recommendation:** Create a shared `normalizeEntities()` function that validates types against the canonical taxonomy, strips garbage values, deduplicates by normalized type+value, and caps entity count. Apply it as a post-processing step after both embed and enrich entity extraction.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FMT-01 | Entity format unified to single `{type, value}` shape across embed and enrich steps | Embed produces `{type, id, role}`, enrich produces `{type, value}`. Need converter function and unified storage. See Architecture Patterns section. |
| FMT-02 | `createLinks` duplicate link bug fixed with existence check before insert | `enrich.service.ts:187` inserts without checking existing links. The `linkThread` method in embed.processor.ts already has the correct pattern (line 446-454). Copy that pattern. |
| FMT-03 | Embed-step entities persisted in memory metadata for traceability | Embed entities are currently used only for contact resolution then discarded. Store them in `metadata.embedEntities` during memory insert. |
| ENT-01 | Entity extraction enforces canonical 10-type taxonomy via post-processing validation | Current schema enum has 10 types but they differ from requirements. Need type mapping + validation in normalizer. |
| ENT-02 | Garbage entity values stripped (empty strings, single chars, pronouns, URLs, generic terms) | No filtering exists. Need blocklist + regex patterns in normalizer. |
| ENT-03 | Duplicate entities within a single memory are deduplicated by normalized value+type | No dedup exists. Normalizer should deduplicate by lowercase type+value. |
| ENT-04 | Entity extraction prompt improved with connector-aware examples and stricter instructions | Current prompt in `prompts.ts:22-33` is minimal. Need examples, negative examples, and connector-specific hints. |
| ENT-05 | Entity count capped per memory to prevent extraction bloat | No cap exists. Add configurable limit (e.g., 30) in normalizer, keeping highest-signal entities. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Ollama (qwen3:0.6b) | current | Entity extraction via structured output | Already in use, `ENTITY_FORMAT_SCHEMA` passed to `ollama.generate()` |
| Drizzle ORM | current | SQLite reads/writes for memories table | Already in use throughout |
| Vitest | 3 | Unit tests for normalizer | Already the project test framework |

### Supporting
No new libraries needed. All work is pure TypeScript normalization logic.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Post-processing normalizer | Fine-tuned model | Model changes are fragile; post-processing is deterministic and testable |
| Regex garbage filter | NLP stopword library | `stopword` already in project but overkill for entity filtering; simple blocklist is sufficient |

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/memory/
  entity-normalizer.ts     # NEW: normalizeEntities() + type mappings + garbage filter
  enrich.service.ts        # MODIFY: apply normalizer after extractEntities()
  embed.processor.ts       # MODIFY: convert embed entities to {type, value}, persist in metadata
  prompts.ts               # MODIFY: improved prompt + updated ENTITY_FORMAT_SCHEMA
  __tests__/
    entity-normalizer.test.ts  # NEW: unit tests for normalizer
```

### Pattern 1: Entity Normalizer Module
**What:** A pure function module that takes raw entities and returns cleaned, validated, deduplicated entities.
**When to use:** After any entity extraction (embed or enrich step).
**Example:**
```typescript
// apps/api/src/memory/entity-normalizer.ts

export const CANONICAL_ENTITY_TYPES = [
  'person', 'organization', 'location', 'date',
  'event', 'product', 'concept', 'quantity',
  'language', 'other',
] as const;

export type CanonicalEntityType = typeof CANONICAL_ENTITY_TYPES[number];

const TYPE_MAP: Record<string, CanonicalEntityType> = {
  // Old Phase 8 types -> new canonical types
  topic: 'concept',
  pet: 'other',
  group: 'organization',
  device: 'product',
  // Common LLM hallucinations
  greeting: 'other',
  schedule: 'event',
  time: 'date',
  amount: 'quantity',
  metric: 'quantity',
  currency: 'quantity',
  email: 'other',
  url: 'other',
};

const GARBAGE_VALUES = new Set([
  '', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their',
  'hello', 'hi', 'hey', 'thanks', 'thank you', 'bye', 'ok', 'okay',
  'yes', 'no', 'maybe', 'sure', 'please',
  'the', 'a', 'an', 'this', 'that',
]);

const MAX_ENTITIES_DEFAULT = 30;

export interface NormalizedEntity {
  type: CanonicalEntityType;
  value: string;
}

export function normalizeEntities(
  raw: Array<{ type?: string; value?: string; name?: string; id?: string }>,
  maxEntities = MAX_ENTITIES_DEFAULT,
): NormalizedEntity[] {
  const seen = new Set<string>();
  const result: NormalizedEntity[] = [];

  for (const entity of raw) {
    // Extract value from various shapes
    let value = (entity.value ?? entity.name ?? entity.id ?? '').trim();
    if (!value || value.length <= 1) continue;

    // Check garbage values
    if (GARBAGE_VALUES.has(value.toLowerCase())) continue;

    // Strip bare URLs
    if (/^https?:\/\//i.test(value)) continue;

    // Normalize type
    const rawType = (entity.type || 'other').toLowerCase();
    const type: CanonicalEntityType = CANONICAL_ENTITY_TYPES.includes(rawType as any)
      ? (rawType as CanonicalEntityType)
      : (TYPE_MAP[rawType] || 'other');

    // Dedup by normalized key
    const key = `${type}::${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({ type, value });
    if (result.length >= maxEntities) break;
  }

  return result;
}
```

### Pattern 2: Embed Entity Conversion
**What:** Convert embed-step `{type, id, role}` entities to `{type, value}` format for persistence.
**When to use:** In `embed.processor.ts` before inserting the memory record.
**Example:**
```typescript
// Convert embed entities to {type, value} for metadata persistence
function embedEntitiesToNormalized(
  embedEntities: Array<{ type: string; id: string; role: string }>
): Array<{ type: string; value: string }> {
  return embedEntities
    .filter(e => e.type === 'person' || e.type === 'group')
    .map(e => {
      // Extract display name from compound ID (e.g., "name:John|email:john@x.com" -> "John")
      const namePart = e.id.split('|').find(p => p.startsWith('name:'));
      const value = namePart ? namePart.slice(5) : e.id.split('|')[0].replace(/^\w+:/, '');
      return { type: e.type, value };
    });
}
```

### Pattern 3: createLinks Existence Check
**What:** Check for existing link before insert to prevent duplicate constraint errors.
**When to use:** In `enrich.service.ts createLinks()`.
**Example:**
```typescript
// Already proven pattern from embed.processor.ts linkThread()
const existingLink = await this.dbService.db
  .select({ id: memoryLinks.id })
  .from(memoryLinks)
  .where(and(
    eq(memoryLinks.srcMemoryId, memoryId),
    eq(memoryLinks.dstMemoryId, result.id),
  ))
  .limit(1);
if (!existingLink.length) {
  await this.dbService.db.insert(memoryLinks).values({ /* ... */ });
}
```

### Anti-Patterns to Avoid
- **Changing entity types to uppercase in storage:** The contact system uses lowercase types (`person`, `organization`, etc.) extensively. Changing to uppercase would require cascading changes across contacts, graph visualization, and search. Keep lowercase.
- **Modifying the Ollama model or parameters:** The requirements explicitly say "Test improvements with current model first" (v2.1 Out of Scope). Improve the prompt and post-processing only.
- **Filtering entities in the prompt only:** LLMs are unreliable at following type constraints even with structured output. Always post-process.
- **Global entity dedup across memories:** Explicitly out of scope per requirements. Only deduplicate within a single memory.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured JSON output | Custom JSON parser | Ollama `format` parameter (already used via `ENTITY_FORMAT_SCHEMA`) | Ollama handles JSON schema enforcement natively |
| Entity type validation | Per-call type checking | Shared `normalizeEntities()` function | Single source of truth, easily testable |

**Key insight:** The normalizer must be a pure function with no dependencies -- this makes it trivially testable and reusable from both embed and enrich paths.

## Common Pitfalls

### Pitfall 1: Contact System Type Mismatch
**What goes wrong:** Changing entity types breaks contact resolution and the contact entity_type column.
**Why it happens:** The contact system uses the same type taxonomy as entities. Contacts have `entityType` column with values like `person`, `organization`, `group`, `device`.
**How to avoid:** The new canonical taxonomy maps `group` -> `organization`, `device` -> `product`, `pet` -> `other`. Contact entityType column should NOT be changed in this phase -- it has its own separate taxonomy. Only memory entity types change.
**Warning signs:** Contact resolution tests failing, contacts not linking to memories.

### Pitfall 2: Structured Output Still Produces Bad Types
**What goes wrong:** Even with `ENTITY_FORMAT_SCHEMA` enum constraint, Ollama qwen3:0.6b sometimes outputs types not in the enum (especially with short or unusual text).
**Why it happens:** Small models have weaker instruction following. The structured output `format` parameter helps but is not 100% reliable.
**How to avoid:** The normalizer must always run as post-processing. Never trust raw model output.
**Warning signs:** Entities with types like `greeting`, `schedule`, `action`, `reference` appearing in production data.

### Pitfall 3: Embed Entity ID Format is Compound
**What goes wrong:** Naively converting embed entity `id` to `value` produces ugly strings like `email:john@example.com|name:John Doe`.
**Why it happens:** Embed entities use compound IDs for contact resolution (`name:X|email:Y|phone:Z`).
**How to avoid:** Parse the compound ID to extract the human-readable name part. If no name part exists, extract the first meaningful identifier.
**Warning signs:** Entity values containing pipes (`|`) or colon-prefixed segments.

### Pitfall 4: Re-enrichment Creates Duplicate Links
**What goes wrong:** Re-processing a memory (e.g., during backfill in Phase 27) creates duplicate `memoryLinks` rows.
**Why it happens:** `createLinks()` currently has no existence check before insert.
**How to avoid:** Add the existence check (Pattern 3 above). Also consider: when re-enriching, should old links be deleted first? For this phase, just prevent duplicates; Phase 27 (backfill) will handle the full re-enrichment flow.
**Warning signs:** SQLite UNIQUE constraint violations, or duplicate edges in the memory graph.

### Pitfall 5: Taxonomy Change Breaks Existing Data
**What goes wrong:** Existing memories have entities with old types (`topic`, `pet`, `group`, `device`) that become invalid.
**Why it happens:** The canonical taxonomy changes from Phase 8's set to the new Phase 26 set.
**How to avoid:** This phase should NOT retroactively update existing data -- that is Phase 27 (backfill). The normalizer should handle both old and new types gracefully via `TYPE_MAP`. New data will use the new taxonomy; old data will be fixed during backfill.
**Warning signs:** Graph visualization showing unexpected entity types, search filtering missing entities.

## Code Examples

### Current Entity Extraction Flow (enrich.service.ts)
```typescript
// Source: apps/api/src/memory/enrich.service.ts:124-132
private async extractEntities(text: string): Promise<Array<{ type: string; value: string }>> {
  try {
    const response = await this.ollama.generate(entityExtractionPrompt(text), undefined, 2, ENTITY_FORMAT_SCHEMA);
    const parsed = JSON.parse(response);
    return parsed.entities || [];
  } catch {
    return [];
  }
}
```

### Current Embed Entity Format (connector-sdk types.ts)
```typescript
// Source: packages/connector-sdk/src/types.ts:98-102
export interface EmbedResult {
  text: string;
  entities: Array<{ type: string; id: string; role: string }>;
  metadata?: Record<string, unknown>;
}
```

### Current ENTITY_FORMAT_SCHEMA (prompts.ts)
```typescript
// Source: apps/api/src/memory/prompts.ts:1-20
export const ENTITY_FORMAT_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['person', 'organization', 'location', 'event', 'product', 'topic', 'pet', 'group', 'device', 'other'],
          },
          value: { type: 'string' },
        },
        required: ['type', 'value'],
      },
    },
  },
  required: ['entities'],
};
```

### createLinks Bug (enrich.service.ts)
```typescript
// Source: apps/api/src/memory/enrich.service.ts:187-194
// BUG: No existence check before insert -- will create duplicates on re-processing
await this.dbService.db.insert(memoryLinks).values({
  id: randomUUID(),
  srcMemoryId: memoryId,
  dstMemoryId: result.id,
  linkType,
  strength: result.score,
  createdAt: new Date().toISOString(),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 8 taxonomy: person, organization, location, event, product, topic, pet, group, device, other | Phase 26 taxonomy: person, organization, location, date, event, product, concept, quantity, language, other | This phase | More semantically meaningful types; removes pet/group/device as entity types |
| No post-processing on LLM entities | Normalizer validates, filters, deduplicates | This phase | Deterministic quality regardless of model output |
| Embed entities discarded after contact linking | Embed entities persisted in metadata | This phase | Traceability of what the connector extracted |

## Open Questions

1. **Taxonomy case: uppercase vs lowercase?**
   - What we know: Requirements list types in UPPERCASE (`PERSON`, `ORGANIZATION`). Codebase uses lowercase everywhere. Contact `entityType` column uses lowercase.
   - What's unclear: Should stored entity types be uppercase or lowercase?
   - Recommendation: Keep lowercase in storage to maintain compatibility with contacts and existing data. The success criteria uses uppercase for readability only. Document the canonical types as lowercase in code.

2. **Should `EmbedResult` type interface change?**
   - What we know: `EmbedResult.entities` has shape `{type, id, role}` which serves contact resolution. Changing it would require updating all 6 connector embed methods.
   - What's unclear: Should we change `EmbedResult` to `{type, value}` or keep it for backward compatibility?
   - Recommendation: Keep `EmbedResult` as-is for contact resolution. Add a conversion step in embed.processor.ts that extracts `{type, value}` entities from the embed result for metadata persistence. This is the least invasive approach.

3. **Entity cap: what is the right number?**
   - What we know: Some memories (especially long emails) can produce 50+ entities, most of which are noise.
   - What's unclear: What cap balances completeness vs noise?
   - Recommendation: Cap at 30 entities per memory. This is generous enough for complex documents while preventing bloat. Make it configurable via a constant.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3 |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @botmem/api test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FMT-01 | Embed and enrich entities both produce `{type, value}` shape | unit | `pnpm --filter @botmem/api test -- --run apps/api/src/memory/__tests__/entity-normalizer.test.ts` | No -- Wave 0 |
| FMT-02 | createLinks skips existing links (no duplicates) | unit | `pnpm --filter @botmem/api test -- --run apps/api/src/memory/__tests__/enrich.processor.test.ts` | Yes (partial) |
| FMT-03 | Embed entities persisted in memory metadata | unit | `pnpm --filter @botmem/api test -- --run apps/api/src/memory/__tests__/embed.processor.test.ts` | Yes (partial) |
| ENT-01 | Only canonical types pass through normalizer | unit | `pnpm --filter @botmem/api test -- --run apps/api/src/memory/__tests__/entity-normalizer.test.ts` | No -- Wave 0 |
| ENT-02 | Garbage values stripped (empty, pronouns, URLs, generic) | unit | `pnpm --filter @botmem/api test -- --run apps/api/src/memory/__tests__/entity-normalizer.test.ts` | No -- Wave 0 |
| ENT-03 | Duplicate entities deduplicated by type+value | unit | `pnpm --filter @botmem/api test -- --run apps/api/src/memory/__tests__/entity-normalizer.test.ts` | No -- Wave 0 |
| ENT-04 | Improved prompt produces better entities | integration | Manual verification with real Ollama | No -- manual |
| ENT-05 | Entity count capped at limit | unit | `pnpm --filter @botmem/api test -- --run apps/api/src/memory/__tests__/entity-normalizer.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @botmem/api test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/memory/__tests__/entity-normalizer.test.ts` -- covers FMT-01, ENT-01, ENT-02, ENT-03, ENT-05
- No framework install needed -- Vitest 3 already configured

## Sources

### Primary (HIGH confidence)
- `packages/connector-sdk/src/types.ts:98-102` -- EmbedResult interface definition
- `apps/api/src/memory/prompts.ts:1-33` -- ENTITY_FORMAT_SCHEMA and entityExtractionPrompt
- `apps/api/src/memory/enrich.service.ts:124-200` -- extractEntities and createLinks implementation
- `apps/api/src/memory/embed.processor.ts:94-175` -- embed entity usage for contact resolution
- `apps/api/src/migrations/backfill-entity-types.ts` -- Phase 8 entity type normalization
- `.planning/REQUIREMENTS.md:149-163` -- v2.1 entity requirements

### Secondary (MEDIUM confidence)
- Success criteria taxonomy (PERSON, ORGANIZATION, etc.) interpreted as canonical but case convention set by codebase precedent (lowercase)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing code
- Architecture: HIGH - normalizer pattern is straightforward pure-function design
- Pitfalls: HIGH - all identified from direct code analysis of current implementation

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable domain, no external dependency changes expected)
