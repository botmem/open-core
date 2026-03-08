# Phase 09: Temporal Reasoning & Memory Chains — Validation

## Status: COMPLETE (code changes, needs UAT)

## Changes Made

### TEMP-01: Timeline API
- `GET /api/memories/timeline?from=&to=&query=&connectorType=&sourceType=&limit=`
- Returns memories in chronological (ASC) order within date range
- Supports text filtering (AND logic across words)
- **File**: `apps/api/src/memory/memory.service.ts` (timeline method)
- **File**: `apps/api/src/memory/memory.controller.ts` (GET timeline endpoint)

### TEMP-02: Relative Temporal Queries (via related)
- `GET /api/memories/:id/related?limit=`
- Combines: graph links + vector similarity + co-participant overlap
- Scores: graph link (0.5) > vector similarity (0.3) > co-participant (0.2)
- **File**: `apps/api/src/memory/memory.service.ts` (getRelated method)

### CHAIN-01 & CHAIN-02: Memory Chains
- Related endpoint surfaces cross-source connections automatically
- Uses existing memoryLinks table + Qdrant recommend + contact co-occurrence
- Thread links already exist from embed processor (same-thread memories linked with strength 0.8)

### CHAIN-03: CLI Commands
- `botmem timeline --from 2025-01-01 --to 2025-01-31` — chronological timeline view with date headers
- `botmem related <memory-id>` — shows related memories with relationship type
- **Files**: `packages/cli/src/commands/timeline.ts`, `packages/cli/src/commands/entities.ts`
- **Wired in**: `packages/cli/src/cli.ts`

## Client Methods Added
- `BotmemClient.getTimeline(params)`
- `BotmemClient.getRelated(memoryId, limit)`
