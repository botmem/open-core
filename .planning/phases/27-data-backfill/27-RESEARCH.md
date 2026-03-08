# Phase 27: Data Backfill - Research

**Researched:** 2026-03-09
**Domain:** BullMQ batch processing, NestJS queue patterns, WebSocket progress tracking
**Confidence:** HIGH

## Summary

Phase 27 needs to re-enrich all existing memories through the corrected entity extraction pipeline from Phase 26 (normalizer, improved prompt, dedup, canonical types). The project already has extensive backfill infrastructure: a `backfill` BullMQ queue, a `BackfillProcessor`, existing backfill endpoints (`POST /memories/backfill-contacts`, `POST /memories/backfill-embeddings`), and WebSocket progress broadcasting via `EventsService` and `EventsGateway`.

The key challenge is NOT infrastructure (it exists) but designing a resumable, filterable backfill that re-runs `EnrichService.enrich()` on existing memories while tracking progress through the existing jobs system and broadcasting via WebSocket. The existing `BackfillProcessor` handles contact backfill only -- it needs to be extended (or a new processor added) to handle entity re-enrichment. The `jobs` table + `EventsService.emitToChannel` pattern is the established way to track and broadcast progress.

**Primary recommendation:** Reuse the existing `backfill` queue and `jobs` table infrastructure. Create a new backfill endpoint that creates a job row, queries target memories, enqueues them individually through the backfill queue, and has the processor call `EnrichService.enrich()` per memory. Use `embeddingStatus` or a new `lastEnrichedAt` field to track which memories have been re-enriched. Broadcast progress through the existing `job:progress` WebSocket pattern.

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                      | Research Support                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BKF-01 | Backfill pipeline re-enriches existing memories with corrected entity extraction | `EnrichService.enrich()` already does full entity extraction + factuality + links + weights. Processor just needs to call it per memory.                 |
| BKF-02 | Backfill is resumable and interruptible (tracks progress, skips completed)       | Use a marker (timestamp or column) to track enriched-by-backfill status. On resume, query only un-backfilled memories. Jobs table tracks progress/total. |
| BKF-03 | Backfill progress visible via WebSocket real-time updates                        | Existing `EventsService.emitToChannel` + `job:progress` event + frontend `jobStore` already handle this pattern.                                         |
| BKF-04 | Backfill supports selective filtering by connector type                          | Query memories with `WHERE connector_type = ?` filter. Pass connectorType in job data and as API parameter.                                              |

</phase_requirements>

## Standard Stack

### Core

| Library        | Version    | Purpose                               | Why Standard                                         |
| -------------- | ---------- | ------------------------------------- | ---------------------------------------------------- |
| BullMQ         | (existing) | Job queue for backfill processing     | Already used for all queue processing in the project |
| @nestjs/bullmq | (existing) | NestJS BullMQ integration             | Already used for all processors                      |
| Drizzle ORM    | (existing) | Database queries for memory selection | Already used throughout the project                  |

### Supporting

| Library        | Version    | Purpose                         | When to Use                           |
| -------------- | ---------- | ------------------------------- | ------------------------------------- |
| ws (WebSocket) | (existing) | Real-time progress broadcasting | Frontend receives job:progress events |

### Alternatives Considered

| Instead of             | Could Use               | Tradeoff                                                            |
| ---------------------- | ----------------------- | ------------------------------------------------------------------- |
| BullMQ individual jobs | Batch SQL update        | Loses resumability and per-memory error handling                    |
| New queue              | Existing backfill queue | New queue is unnecessary -- backfill queue exists and is registered |

## Architecture Patterns

### Recommended Approach

The backfill should follow the exact same pattern as connector sync jobs:

1. **API endpoint** creates a row in the `jobs` table with `progress=0, total=N`
2. **API endpoint** enqueues individual BullMQ jobs for each memory
3. **Processor** calls `EnrichService.enrich()` per memory, then increments job progress
4. **Processor** broadcasts `job:progress` via `EventsService`
5. **Frontend** already listens for `job:progress` and `job:complete` events in `jobStore`

### Key Files to Modify

```
apps/api/src/
  memory/
    backfill.processor.ts    # Extend with re-enrich capability
    memory.controller.ts     # Add POST /memories/backfill-enrich endpoint
  db/
    schema.ts                # Add enrichedAt column to memories (optional)
apps/web/src/
  store/jobStore.ts          # Already handles job:progress -- may need backfill channel subscription
```

### Pattern: Resumable Backfill via Marker Column

**What:** Add an `enrichedAt` timestamp column (or reuse/update `embeddingStatus`) to mark memories that have been re-enriched by the backfill.
**When to use:** Resume scenario -- restart after interruption skips already-processed memories.
**Example:**

```typescript
// Query un-backfilled memories, optionally filtered by connector
const targets = await db
  .select({ id: memories.id })
  .from(memories)
  .where(
    and(
      eq(memories.embeddingStatus, 'done'), // only process completed memories
      isNull(memories.enrichedAt), // skip already backfilled
      connectorType ? eq(memories.connectorType, connectorType) : undefined,
    ),
  );
```

### Pattern: Job-Tracked Batch Processing

**What:** Create a jobs row to track overall backfill progress, then enqueue individual BullMQ jobs.
**When to use:** For all batch operations that need progress tracking and frontend visibility.
**Example:**

```typescript
// In controller: create tracking job
const jobId = crypto.randomUUID();
await db.insert(jobs).values({
  id: jobId,
  accountId: 'system', // or user's account
  connectorType: connectorType || 'all',
  status: 'running',
  progress: 0,
  total: targets.length,
  startedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
});

// Enqueue individual memories
for (const target of targets) {
  await backfillQueue.add('backfill-enrich', {
    memoryId: target.id,
    jobId,
  });
}
```

### Pattern: Processor with Progress Tracking

**What:** Each processed memory increments the parent job and broadcasts progress.
**Example:**

```typescript
// In BackfillProcessor.process()
async process(job: Job<{ memoryId: string; jobId?: string }>) {
  const { memoryId, jobId } = job.data;

  // Call the enrichment pipeline
  await this.enrichService.enrich(memoryId);

  // Mark as backfilled
  await db.update(memories)
    .set({ enrichedAt: new Date().toISOString() })
    .where(eq(memories.id, memoryId));

  // Advance parent job progress + broadcast
  if (jobId) {
    const result = await this.jobsService.incrementProgress(jobId);
    this.events.emitToChannel(`job:${jobId}`, 'job:progress', {
      jobId,
      processed: result.progress,
      total: result.total,
    });
    await this.jobsService.tryCompleteJob(jobId);
  }
}
```

### Anti-Patterns to Avoid

- **Processing all memories in a single synchronous loop:** Loses resumability and blocks the event loop. Use individual BullMQ jobs instead.
- **Not checking for existing enrichment before re-enriching:** Without a marker, a restart would re-process everything from scratch.
- **Creating a new queue:** The `backfill` queue already exists and is registered in both `JobsModule` and `MemoryModule`.
- **Skipping Qdrant upsert:** `EnrichService.enrich()` does NOT re-upsert to Qdrant. The enrichment only updates SQLite fields (entities, factuality, weights, links). If Qdrant payload needs updating too (with new entities), that must be done separately.

## Don't Hand-Roll

| Problem                | Don't Build             | Use Instead                                            | Why                                                             |
| ---------------------- | ----------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| Job progress tracking  | Custom progress counter | `JobsService.incrementProgress()` + `tryCompleteJob()` | Already handles atomicity, completion detection                 |
| WebSocket broadcasting | Custom WebSocket logic  | `EventsService.emitToChannel()`                        | Already wired to `EventsGateway` with channel subscriptions     |
| Entity extraction      | New extraction logic    | `EnrichService.enrich()`                               | Already has the corrected prompt, normalizer, factuality, links |
| Queue registration     | New BullMQ queue        | Existing `backfill` queue                              | Already registered in modules, injected in controllers          |

**Key insight:** 90% of the infrastructure for this feature already exists. The work is wiring existing pieces together, not building new systems.

## Common Pitfalls

### Pitfall 1: Jobs table requires accountId (NOT NULL)

**What goes wrong:** The `jobs` table has `accountId` as NOT NULL with a foreign key to `accounts`. A system-level backfill job doesn't naturally belong to an account.
**Why it happens:** The jobs table was designed for connector sync jobs, not system operations.
**How to avoid:** Either (a) accept a user-initiated backfill tied to the requesting user's first account, (b) pass a specific accountId when filtering by connector, or (c) use a synthetic system account. Option (a) is simplest -- the backfill API requires JWT auth anyway, so associate the job with the user rather than an account. Alternatively, make `accountId` nullable in the schema for backfill jobs.
**Warning signs:** Foreign key constraint error when inserting job row.

### Pitfall 2: EnrichService.enrich() does not update Qdrant payloads

**What goes wrong:** After re-enrichment, Qdrant vector payloads still have old metadata.
**Why it happens:** `EnrichService.enrich()` updates SQLite (entities, factuality, weights, links) but does NOT call `QdrantService.upsert()` -- that happens in the embed pipeline.
**How to avoid:** After calling `enrich()`, optionally update the Qdrant payload with the new entity data if needed. For Phase 27, this may not be critical since the Qdrant payload only stores `source_type`, `connector_type`, `event_time`, and `account_id` -- not entities.
**Warning signs:** Entity searches that rely on Qdrant payload filtering show stale data.

### Pitfall 3: Enrich concurrency and Ollama rate limiting

**What goes wrong:** Enqueueing thousands of backfill jobs overwhelms the Ollama inference server.
**Why it happens:** `EnrichProcessor` has configurable concurrency (default: 8). If backfill and normal enrichment compete for the same Ollama endpoint, latency spikes.
**How to avoid:** The backfill processor should have lower concurrency than the main enrich processor. Use BullMQ's `concurrency` option or a rate limiter on the queue. The `backfill` queue already has its own worker with independent concurrency.
**Warning signs:** Ollama timeouts, queue backup, all inference grinding to a halt.

### Pitfall 4: Memory encryption at rest

**What goes wrong:** After re-enrichment, memory fields may be double-encrypted or decrypted incorrectly.
**Why it happens:** `EnrichProcessor` calls `encryptMemoryAtRest()` after enrichment. If the backfill processor also calls `EnrichService.enrich()` on already-encrypted memories, the text passed to Ollama is ciphertext.
**How to avoid:** The backfill processor must decrypt memory fields before enrichment (or ensure `enrich()` receives plaintext). Check if `CryptoService` is transparent or if explicit decrypt is needed. Looking at the code, `EnrichService.enrich()` reads directly from the DB -- if fields are encrypted, it will try to extract entities from ciphertext. Need to ensure decryption happens before enrichment and re-encryption after.
**Warning signs:** Garbage entities extracted from encrypted text, empty entity arrays.

### Pitfall 5: BullMQ job deduplication on resume

**What goes wrong:** Restarting a backfill after interruption re-enqueues jobs that are already in the queue.
**Why it happens:** BullMQ does not deduplicate by default.
**How to avoid:** Use the memory ID as the BullMQ job ID (`{ jobId: memoryId }`) to prevent duplicate jobs. Or, query only un-enriched memories when creating the backfill.
**Warning signs:** Same memory processed multiple times, progress count exceeds total.

## Code Examples

### Existing Backfill Contact Endpoint (reference pattern)

```typescript
// Source: apps/api/src/memory/memory.controller.ts
@RequiresJwt()
@Post('backfill-contacts')
async backfillContacts() {
  const db = this.dbService.db;
  const unlinked = await db
    .select({ id: memories.id })
    .from(memories)
    .where(
      sql`${memories.id} NOT IN (SELECT DISTINCT ${memoryContacts.memoryId} FROM ${memoryContacts})`,
    );
  let enqueued = 0;
  for (const { id } of unlinked) {
    await this.backfillQueue.add(
      'backfill-contact',
      { memoryId: id },
      { attempts: 2, backoff: { type: 'exponential', delay: 500 } },
    );
    enqueued++;
  }
  return { enqueued, total: unlinked.length };
}
```

### Existing Job Progress Pattern (from EnrichProcessor)

```typescript
// Source: apps/api/src/memory/enrich.processor.ts
private async advanceAndComplete(jobId: string | null | undefined) {
  if (!jobId) return;
  const result = await this.jobsService.incrementProgress(jobId);
  this.events.emitToChannel(`job:${jobId}`, 'job:progress', {
    jobId,
    processed: result.progress,
    total: result.total,
  });
  const done = await this.jobsService.tryCompleteJob(jobId);
  if (done) {
    this.events.emitToChannel(`job:${jobId}`, 'job:complete', { jobId, status: 'done' });
  }
}
```

### Frontend WebSocket Listener (already handles job:progress)

```typescript
// Source: apps/web/src/store/jobStore.ts
if (msg.event === 'job:progress') {
  set((state) => ({
    jobs: state.jobs.map((j) =>
      j.id === msg.data.jobId
        ? {
            ...j,
            progress: msg.data.processed ?? msg.data.progress ?? j.progress,
            total: msg.data.total || j.total,
          }
        : j,
    ),
  }));
}
```

## State of the Art

| Old Approach                                         | Current Approach                 | When Changed | Impact                                            |
| ---------------------------------------------------- | -------------------------------- | ------------ | ------------------------------------------------- |
| One-off migration scripts (backfill-entity-types.ts) | BullMQ queue-based backfill      | Phase 27     | Resumable, trackable, filterable                  |
| Contact-only backfill processor                      | Multi-purpose backfill processor | Phase 27     | Single processor handles different backfill types |

**Key insight from existing code:** The project has two backfill patterns -- migration scripts (direct SQL, one-shot, no progress tracking) and queue-based backfill (resumable, tracked). Phase 27 should use the queue-based pattern since requirements explicitly demand resumability and progress tracking.

## Open Questions

1. **Encryption handling during re-enrichment**
   - What we know: `EnrichProcessor` encrypts fields after enrichment. `EnrichService.enrich()` reads raw DB fields.
   - What's unclear: Are memory fields currently stored encrypted? If so, the backfill processor must decrypt before enrichment.
   - Recommendation: Check if `CryptoService.encryptMemoryFields()` is a no-op in dev mode or actually encrypts. If fields are encrypted, add a decrypt step before calling `enrich()`.

2. **Jobs table accountId constraint**
   - What we know: `accountId` is NOT NULL with foreign key to accounts.
   - What's unclear: How to handle a system-wide backfill that spans multiple accounts.
   - Recommendation: Use the authenticated user's first account, or make accountId nullable for backfill jobs. Simplest: create a backfill-specific job that doesn't use the jobs table, tracking progress purely in-memory and via WebSocket. But this loses persistence. Best: make the accountId field accept a sentinel value or make it nullable.

3. **Should Qdrant payloads be updated during backfill?**
   - What we know: Qdrant payload contains `source_type`, `connector_type`, `event_time`, `account_id` -- NOT entities.
   - What's unclear: Whether entity data needs to be in Qdrant payloads for any search filtering.
   - Recommendation: Skip Qdrant payload update since entities are stored in SQLite and searched there. Qdrant is only used for vector similarity.

## Validation Architecture

### Test Framework

| Property           | Value                                |
| ------------------ | ------------------------------------ |
| Framework          | Vitest 3                             |
| Config file        | vitest.config.ts (per package)       |
| Quick run command  | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm test`                          |

### Phase Requirements -> Test Map

| Req ID | Behavior                                                 | Test Type | Automated Command                                                             | File Exists? |
| ------ | -------------------------------------------------------- | --------- | ----------------------------------------------------------------------------- | ------------ |
| BKF-01 | Re-enrichment calls EnrichService.enrich for each memory | unit      | `pnpm vitest run apps/api/src/memory/__tests__/backfill.processor.test.ts -x` | No - Wave 0  |
| BKF-02 | Resume skips already-enriched memories                   | unit      | `pnpm vitest run apps/api/src/memory/__tests__/backfill.processor.test.ts -x` | No - Wave 0  |
| BKF-03 | Progress events emitted via WebSocket                    | unit      | `pnpm vitest run apps/api/src/memory/__tests__/backfill.processor.test.ts -x` | No - Wave 0  |
| BKF-04 | Connector type filter limits memory selection            | unit      | `pnpm vitest run apps/api/src/memory/__tests__/backfill.processor.test.ts -x` | No - Wave 0  |

### Sampling Rate

- **Per task commit:** `pnpm vitest run apps/api/src/memory/__tests__/backfill.processor.test.ts -x`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/api/src/memory/__tests__/backfill.processor.test.ts` -- covers BKF-01, BKF-02, BKF-03, BKF-04
- [ ] Test mocks for EnrichService, JobsService, EventsService, DbService

## Sources

### Primary (HIGH confidence)

- Project source code: `apps/api/src/memory/backfill.processor.ts` -- existing backfill processor
- Project source code: `apps/api/src/memory/enrich.processor.ts` -- enrich pipeline with progress tracking
- Project source code: `apps/api/src/memory/enrich.service.ts` -- enrichment logic (entity extraction, factuality, links)
- Project source code: `apps/api/src/memory/memory.controller.ts` -- existing backfill endpoints
- Project source code: `apps/api/src/jobs/jobs.service.ts` -- job progress tracking
- Project source code: `apps/api/src/events/events.service.ts` -- WebSocket broadcasting
- Project source code: `apps/api/src/events/events.gateway.ts` -- WebSocket channel subscriptions
- Project source code: `apps/web/src/store/jobStore.ts` -- frontend job progress handling

### Secondary (MEDIUM confidence)

- BullMQ documentation for job deduplication and concurrency options

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - all infrastructure already exists in the codebase
- Architecture: HIGH - follows established patterns already used for sync jobs and contact backfill
- Pitfalls: HIGH - identified from direct code inspection of encryption, DB constraints, and Ollama concurrency

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- internal patterns unlikely to change)
