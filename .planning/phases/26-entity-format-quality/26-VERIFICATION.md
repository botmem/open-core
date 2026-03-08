---
phase: 26-entity-format-quality
verified: 2026-03-08T21:45:00Z
status: passed
score: 9/9 must-haves verified
gaps: []
---

# Phase 26: Entity Format & Quality Verification Report

**Phase Goal:** Entity extraction produces clean, correctly-typed, deduplicated entities in a single consistent format across the entire pipeline
**Verified:** 2026-03-08T21:45:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Entities with hallucinated types are mapped to canonical types | VERIFIED | `TYPE_MAP` in entity-normalizer.ts maps 12 legacy types (topic, pet, group, device, greeting, schedule, time, amount, metric, currency, email, url) to canonical |
| 2 | Garbage values (empty, single chars, pronouns, URLs, generic terms) are stripped | VERIFIED | `isGarbage()` function with PRONOUNS (26 entries), GENERIC_TERMS (17 entries), URL_RE regex, length<=1 check |
| 3 | Duplicate entities within a memory are collapsed to one entry | VERIFIED | Dedup via `seen` Set keyed by `${type}::${value.toLowerCase()}` (entity-normalizer.ts line 152) |
| 4 | Entity count capped at 30 per memory | VERIFIED | `maxEntities=30` default param, early break at line 157 |
| 5 | Both embed-shape and enrich-shape produce unified {type, value} output | VERIFIED | `extractValueFromId()` handles compound IDs; fallback chain `value ?? name ?? id` (lines 138-141) |
| 6 | Extraction prompt includes negative examples and connector-aware hints | VERIFIED | prompts.ts lines 49-53: explicit "Do NOT extract" list with greetings, pronouns, generic terms, URLs |
| 7 | Enrich-step entities are normalized before storage | VERIFIED | enrich.service.ts line 129: `return normalizeEntities(parsed.entities \|\| [])` |
| 8 | createLinks checks for existing link before insert (both directions) | VERIFIED | enrich.service.ts lines 189-213: forward + reverse link existence check before insert |
| 9 | Embed-step entities converted to {type, value} and persisted in metadata.embedEntities | VERIFIED | embed.processor.ts lines 100-107: normalizeEntities call; line 112: spread into mergedMetadata |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/memory/entity-normalizer.ts` | normalizeEntities, CANONICAL_ENTITY_TYPES, NormalizedEntity | VERIFIED | 161 lines, all exports present, substantive implementation |
| `apps/api/src/memory/__tests__/entity-normalizer.test.ts` | Unit tests (min 80 lines) | VERIFIED | 217 lines, 35 test cases covering type mapping, garbage filtering, dedup, cap, format unification |
| `apps/api/src/memory/prompts.ts` | Updated ENTITY_FORMAT_SCHEMA with canonical types, contains "concept" | VERIFIED | 10-type enum matches CANONICAL_ENTITY_TYPES; old types (topic, pet, group, device) removed |
| `apps/api/src/memory/enrich.service.ts` | Normalized entity extraction, duplicate-safe createLinks | VERIFIED | imports normalizeEntities (line 12), uses it in extractEntities (line 129), bidirectional link dedup (lines 189-213) |
| `apps/api/src/memory/embed.processor.ts` | Embed entity persistence in metadata | VERIFIED | imports normalizeEntities (line 21), converts entities (lines 100-107), stores in mergedMetadata (line 112) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| enrich.service.ts | entity-normalizer.ts | import normalizeEntities | WIRED | Line 12: `import { normalizeEntities } from './entity-normalizer'` + called at line 129 |
| enrich.service.ts | schema.ts (memoryLinks) | select with and() before insert | WIRED | Lines 189-204: forward + reverse existence checks using `and(eq(...), eq(...))` |
| embed.processor.ts | entity-normalizer.ts | import normalizeEntities | WIRED | Line 21: `import { normalizeEntities } from './entity-normalizer'` + called at line 100 |
| entity-normalizer.ts | entity-normalizer.test.ts | test import | WIRED | Line 4-6: `import { normalizeEntities, CANONICAL_ENTITY_TYPES, NormalizedEntity }` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FMT-01 | 26-01 | Entity format unified to single {type, value} shape | SATISFIED | normalizeEntities() accepts both embed-shape and enrich-shape, outputs unified {type, value} |
| FMT-02 | 26-02 | createLinks duplicate link bug fixed with existence check | SATISFIED | Bidirectional existence check in enrich.service.ts createLinks() (lines 189-213) |
| FMT-03 | 26-02 | Embed-step entities persisted in metadata for traceability | SATISFIED | embedEntities stored in mergedMetadata (embed.processor.ts line 112) |
| ENT-01 | 26-01 | Entity extraction enforces canonical 10-type taxonomy | SATISFIED | CANONICAL_ENTITY_TYPES (10 types), TYPE_MAP for legacy mapping, unknown->other fallback |
| ENT-02 | 26-01 | Garbage entity values stripped | SATISFIED | isGarbage() checks: empty, length<=1, pronouns, generic terms, URLs |
| ENT-03 | 26-01 | Duplicate entities deduplicated by normalized value+type | SATISFIED | Case-insensitive dedup via `${type}::${value.toLowerCase()}` key |
| ENT-04 | 26-01 | Extraction prompt improved with examples and stricter instructions | SATISFIED | entityExtractionPrompt rewritten with per-type examples and explicit exclusion rules |
| ENT-05 | 26-01 | Entity count capped per memory | SATISFIED | maxEntities=30 default, enforced at line 157 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No anti-patterns found in any modified file |

### Human Verification Required

### 1. Entity Extraction Quality with Real Data

**Test:** Sync a Gmail or Slack connector and inspect entities on newly created memories
**Expected:** Entities should have only canonical types, no garbage values, no duplicates within a single memory, and count <= 30
**Why human:** LLM output quality cannot be verified statically -- depends on actual model behavior with real text

### 2. embedEntities in Metadata

**Test:** After a sync, query a memory via API and inspect `metadata.embedEntities` field
**Expected:** Field contains normalized {type, value} entities from the connector's embed step
**Why human:** Requires running the actual pipeline with a real connector to verify end-to-end data flow

### Gaps Summary

No gaps found. All 9 observable truths verified. All 8 requirements (FMT-01 through FMT-03, ENT-01 through ENT-05) satisfied with evidence in the codebase. All 4 commits verified in git history. No anti-patterns detected.

---

_Verified: 2026-03-08T21:45:00Z_
_Verifier: Claude (gsd-verifier)_
