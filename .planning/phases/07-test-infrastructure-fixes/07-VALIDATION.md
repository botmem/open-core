# Phase 07: Search & Data Fixes — Validation

## Status: COMPLETE (code changes)

## Changes Made

### FIX-01: Qdrant HNSW Index Not Building
- **Root cause**: Default `indexing_threshold` is 10,000 but collection has ~3,064 points, so HNSW index never built
- **Fix**: Lowered `indexing_threshold` to 1,000 in `ensureCollection()` and added `ensureIndexed()` on module init
- **Files**: `apps/api/src/memory/qdrant.service.ts`
- **Note**: Search was actually returning results (20 items with fallback=true), but without HNSW index it uses brute-force which is slower

### FIX-02: SYNC_DEBUG_LIMIT Default
- **Status**: Kept at 500 per user request — will change to 0 after UAT
- **Added**: `sync_debug_limit` setting in SettingsService for runtime configurability
- **Files**: `apps/api/src/settings/settings.service.ts`, `apps/api/src/jobs/sync.processor.ts`

### FIX-03: CLI Entity Display `[object Object]`
- **Root cause**: `e.name || e` — entities have `value` field, not `name`
- **Fix**: Changed to `e.value || e.name || e.id || String(e)`
- **File**: `packages/cli/src/format.ts:107`

### FIX-04: Photos Connector
- **Status**: Account exists (https://photos.home.covidvpn.me) but has never synced (items_synced=0)
- **Action**: Needs manual re-sync after service restart

### FIX-05: Backfill Embeddings Endpoint
- **Added**: `POST /api/memories/backfill-embeddings` — checks SQLite done memories vs Qdrant, re-embeds missing ones
- **Added**: `GET /api/memories/qdrant-info` — returns Qdrant collection stats
- **Added**: `QdrantService.pointExists()`, `QdrantService.getCollectionInfo()`, `QdrantService.ensureIndexed()`
- **File**: `apps/api/src/memory/memory.controller.ts`, `apps/api/src/memory/qdrant.service.ts`

## Data State at Time of Fix
- SQLite memories: 2,762 (all embedding_status='done')
- Qdrant points: 3,064 (indexed_vectors_count: 0)
- Accounts: gmail×2, slack, whatsapp, imessage, locations, photos (never synced)
