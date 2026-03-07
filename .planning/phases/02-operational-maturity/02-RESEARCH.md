# Phase 2: Operational Maturity - Research

**Researched:** 2026-03-07
**Domain:** BullMQ job scheduling, PostHog analytics integration
**Confidence:** HIGH

## Summary

Phase 2 adds two independent capabilities: (1) a nightly decay job that refreshes recency-based weights for all memories, ensuring old unpinned memories naturally rank lower, and (2) PostHog analytics integration for both frontend and backend event tracking. Both are well-understood patterns with mature library support already present in the codebase.

The decay job follows the existing BullMQ processor pattern (extend `WorkerHost`, implement `process()`), but uses the new `upsertJobScheduler()` API instead of the deprecated `repeat` option. PostHog frontend SDK (`posthog-js` v1.225+) is already initialized with no-op behavior when unconfigured; backend needs `posthog-node` added. Both integrations are strictly additive -- no existing code needs to change beyond adding new modules and event capture calls.

**Primary recommendation:** Build the decay processor first (OPS-01/02), then add the analytics service (OPS-03/04/05). Keep them as independent work streams since they share no code paths.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use BullMQ job scheduler for the nightly decay job -- existing `SchedulerService` pattern
- Use `upsertJobScheduler()` instead of deprecated `repeat` API (BullMQ v5.16.0+ deprecation)
- Decay job runs on its own queue (`maintenance`) separate from sync/embed/enrich
- Process memories in batches of 500-1000 to avoid SQLite writer contention
- Recency formula: `exp(-0.015 * age_days)` -- same as `computeWeights()`
- Decay job updates `weights` JSON column in memories table
- Pinned memories exempt from decay (recency stays at 1.0)
- Job runs at 3:00 AM local time by default -- configurable via env var
- If job fails mid-batch, resume from where it left off on next run (idempotent)
- PostHog cloud free tier (1M events/month) -- self-hosting rejected
- Frontend: `posthog-js` already installed and initialized -- add event tracking calls
- Backend: Add `posthog-node` for server-side event tracking
- PostHog integration is no-op when API key is not configured
- Frontend events: search (query + result count), pin/unpin, sync trigger, page views (already done)
- Backend events: sync completion (connector type, duration, item count), sync error, enrich completion, decay job completion
- No PII in events -- anonymous distinct IDs, no email/name in properties
- `POSTHOG_API_KEY` env var for backend (separate from `VITE_POSTHOG_API_KEY` for frontend)

### Claude's Discretion
- Exact event names and property schemas for PostHog events
- Whether to create a shared analytics service or inline posthog calls
- Batch size tuning for decay job (500 vs 1000)
- Whether decay job should also refresh Qdrant payload metadata
- Error retry strategy for failed PostHog event sends

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OPS-01 | Nightly decay job recomputes recency scores for all memories via BullMQ job scheduler | BullMQ 5.70.1 `upsertJobScheduler()` API verified; existing processor pattern documented; `computeWeights()` formula identified in `memory.service.ts` lines 718-751 |
| OPS-02 | Decay job processes memories in batches of 500-1000 to avoid SQLite writer contention | SQLite WAL mode single-writer constraint documented; batch SELECT + UPDATE pattern with offset tracking |
| OPS-03 | PostHog analytics tracks pageviews and key user events (search, sync, pin) via cloud free tier | `posthog-js` v1.225+ already installed and initialized with no-op; `posthog.capture()` API ready; pageview tracking already active |
| OPS-04 | PostHog integration is no-op when API key is not configured | Frontend already handles this (posthog.ts checks `VITE_POSTHOG_API_KEY`); backend needs conditional PostHog client init |
| OPS-05 | Backend emits server-side analytics events for sync completions and errors via posthog-node | `posthog-node` v5.26.2 available; uses internal queue, non-blocking, batched flush |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | 5.70.1 | Job scheduling and processing | Already installed; `upsertJobScheduler()` API available |
| @nestjs/bullmq | 11.x | NestJS BullMQ integration | Already installed; `@Processor` decorator pattern |
| posthog-js | 1.225+ | Frontend analytics SDK | Already installed and initialized |
| posthog-node | 5.26.x | Backend analytics SDK | Official PostHog Node.js library; internal queue, non-blocking |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-orm | existing | SQLite batch updates for decay | Already used everywhere; batch UPDATE with WHERE clauses |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| posthog-node | Custom HTTP calls to PostHog API | posthog-node handles batching, retries, queue flushing -- no reason to hand-roll |
| BullMQ upsertJobScheduler | node-cron / setInterval | BullMQ already in stack, provides persistence, retry, monitoring via Redis |

**Installation:**
```bash
cd apps/api && pnpm add posthog-node
```

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
  analytics/
    analytics.module.ts       # NestJS module, exports AnalyticsService
    analytics.service.ts      # Wraps posthog-node, no-op when unconfigured
  memory/
    decay.processor.ts        # @Processor('maintenance') extends WorkerHost
  jobs/
    scheduler.service.ts      # Add decay scheduler alongside sync schedulers
  config/
    config.service.ts         # Add posthogApiKey, decayCron getters
apps/web/src/
  lib/
    posthog.ts                # Add trackEvent() wrapper (already has init)
```

### Pattern 1: Decay Processor (BullMQ WorkerHost)
**What:** A processor on the `maintenance` queue that iterates all memories in batches, recomputes weights, and writes them back.
**When to use:** Nightly scheduled job via `upsertJobScheduler()`.
**Example:**
```typescript
// Source: Existing pattern from backfill.processor.ts + enrich.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { sql, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { memories } from '../db/schema';
import { ConnectorsService } from '../connectors/connectors.service';

@Processor('maintenance')
export class DecayProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private dbService: DbService,
    private connectors: ConnectorsService,
  ) {
    super();
  }

  onModuleInit() {
    this.worker.on('error', (err) => console.warn('[decay worker]', err.message));
  }

  async process(job: Job) {
    const BATCH_SIZE = 500;
    let offset = 0;
    let updated = 0;

    while (true) {
      const batch = await this.dbService.db
        .select({ id: memories.id, eventTime: memories.eventTime, pinned: memories.pinned,
                   recallCount: memories.recallCount, connectorType: memories.connectorType,
                   entities: memories.entities, weights: memories.weights })
        .from(memories)
        .where(eq(memories.embeddingStatus, 'done'))
        .limit(BATCH_SIZE)
        .offset(offset);

      if (!batch.length) break;

      for (const mem of batch) {
        const isPinned = mem.pinned === 1;
        const ageDays = (Date.now() - new Date(mem.eventTime).getTime()) / (1000 * 60 * 60 * 24);
        const recency = isPinned ? 1.0 : Math.exp(-0.015 * ageDays);

        let entityCount = 0;
        try { entityCount = JSON.parse(mem.entities).length; } catch {}
        const baseImportance = 0.5 + Math.min(entityCount * 0.1, 0.4);
        const importance = baseImportance + Math.min((mem.recallCount || 0) * 0.02, 0.2);

        let trust = 0.7;
        try { trust = this.connectors.get(mem.connectorType).manifest.trustScore; } catch {}

        // Parse existing weights to preserve semantic/rerank scores
        let existing = { semantic: 0, rerank: 0 };
        try { existing = JSON.parse(mem.weights); } catch {}

        const semantic = existing.semantic || 0;
        const rerank = existing.rerank || 0;
        const final = rerank > 0
          ? 0.40 * semantic + 0.30 * rerank + 0.15 * recency + 0.10 * importance + 0.05 * trust
          : 0.70 * semantic + 0.15 * recency + 0.10 * importance + 0.05 * trust;

        const newWeights = JSON.stringify({ semantic, rerank, recency, importance, trust, final });

        await this.dbService.db.update(memories)
          .set({ weights: newWeights })
          .where(eq(memories.id, mem.id));
        updated++;
      }

      offset += BATCH_SIZE;
      await job.updateProgress(offset);
    }

    return { updated, batches: Math.ceil(offset / BATCH_SIZE) };
  }
}
```

### Pattern 2: upsertJobScheduler for Decay Scheduling
**What:** Register a repeatable job scheduler that fires at 3:00 AM.
**When to use:** In `SchedulerService.onModuleInit()`.
**Example:**
```typescript
// Source: BullMQ docs - https://docs.bullmq.io/guide/job-schedulers
// Register in SchedulerService alongside sync schedules
@InjectQueue('maintenance') private maintenanceQueue: Queue,

async onModuleInit() {
  await this.syncAllSchedules();
  await this.scheduleDecay();
}

private async scheduleDecay() {
  const cron = this.config.decayCron; // default: '0 3 * * *'
  await this.maintenanceQueue.upsertJobScheduler(
    'nightly-decay',
    { pattern: cron },
    { name: 'decay', data: {}, opts: { attempts: 2, backoff: { type: 'fixed', delay: 60000 } } },
  );
}
```

### Pattern 3: Analytics Service (no-op when unconfigured)
**What:** A NestJS injectable service that wraps `posthog-node`, initialized only when `POSTHOG_API_KEY` is set.
**When to use:** Inject into any service/processor that needs to emit server-side events.
**Example:**
```typescript
// Source: posthog-node docs - https://posthog.com/docs/libraries/node
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PostHog } from 'posthog-node';
import { ConfigService } from '../config/config.service';

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private client: PostHog | null = null;
  private readonly distinctId = 'server'; // anonymous, no PII

  constructor(private config: ConfigService) {
    const apiKey = this.config.posthogApiKey;
    if (apiKey) {
      this.client = new PostHog(apiKey, { host: 'https://us.i.posthog.com' });
    }
  }

  capture(event: string, properties?: Record<string, unknown>) {
    this.client?.capture({ distinctId: this.distinctId, event, properties });
  }

  async onModuleDestroy() {
    await this.client?.shutdown();
  }
}
```

### Pattern 4: Frontend Event Tracking Wrapper
**What:** A helper function that wraps `posthog.capture()` for consistent event naming.
**When to use:** In frontend components for search, pin, sync events.
**Example:**
```typescript
// In apps/web/src/lib/posthog.ts
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  posthog.capture(event, properties);
  // posthog-js already handles no-op when not initialized
}
```

### Anti-Patterns to Avoid
- **Importing posthog-node directly in processors/services:** Create a shared `AnalyticsService` to centralize config and ensure proper shutdown. Direct imports scatter initialization logic.
- **Running decay as a synchronous blocking loop:** Use batches with progress tracking. A single transaction updating 100K+ rows would lock SQLite for seconds.
- **Using deprecated `repeat` option for new schedulers:** BullMQ deprecated `repeat` in v5.16.0. Use `upsertJobScheduler()` which is idempotent and prevents duplicate schedulers on restart.
- **Including PII in PostHog events:** No emails, names, or user identifiers in event properties. Use generic `distinctId: 'server'` for backend, let posthog-js handle frontend anonymization.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job scheduling | Custom setTimeout/setInterval cron | BullMQ `upsertJobScheduler()` | Persistence across restarts, retry on failure, monitoring via Redis |
| Analytics batching | Custom event queue + HTTP sender | `posthog-node` internal queue | Handles batching, retry, flush on shutdown automatically |
| Frontend analytics no-op | Custom feature flag for tracking | `posthog-js` built-in behavior | Already no-ops when API key absent; no custom logic needed |
| Cron parsing | Custom schedule parser | BullMQ `pattern` field | Accepts standard cron syntax directly |

**Key insight:** Both BullMQ and PostHog SDKs handle the hard parts (persistence, batching, retry, graceful shutdown) internally. The implementation work is wiring them into the NestJS module system, not building infrastructure.

## Common Pitfalls

### Pitfall 1: SQLite Write Contention During Decay
**What goes wrong:** Updating all memories in a single transaction locks the WAL writer, blocking embed/enrich processors from writing.
**Why it happens:** SQLite WAL allows concurrent reads but only one writer at a time.
**How to avoid:** Process in batches of 500. Each batch is its own transaction. Add a small yield (`await new Promise(r => setTimeout(r, 10))`) between batches if write pressure is observed.
**Warning signs:** Embed/enrich jobs failing with "database is locked" errors during decay window.

### Pitfall 2: Duplicate Job Schedulers on Restart
**What goes wrong:** Each NestJS restart registers a new repeatable job, leading to multiple decay jobs running simultaneously.
**Why it happens:** The old `repeat` API creates new jobs on each `add()` call unless explicitly removed first.
**How to avoid:** Use `upsertJobScheduler()` which is idempotent -- same scheduler ID always updates, never duplicates.
**Warning signs:** Multiple decay jobs running in the same time window visible in BullMQ dashboard.

### Pitfall 3: PostHog Client Not Flushing on Shutdown
**What goes wrong:** Backend events captured just before shutdown are lost because the internal queue hasn't flushed.
**Why it happens:** `posthog-node` batches events and sends them periodically. If the process exits before flush, events are dropped.
**How to avoid:** Call `await client.shutdown()` in the NestJS `OnModuleDestroy` lifecycle hook.
**Warning signs:** Missing backend events for the last few seconds before a restart.

### Pitfall 4: Stale Semantic Scores in Weights Column
**What goes wrong:** Decay job overwrites the `weights` JSON column, accidentally zeroing out semantic/rerank scores stored at search time.
**Why it happens:** The `weights` column stores the complete weight breakdown. Decay only knows recency/importance/trust -- not semantic/rerank (which are query-dependent).
**How to avoid:** Parse existing weights JSON, preserve `semantic` and `rerank` fields, only update `recency`, `importance`, `trust`, and recompute `final`. Or only store decay-computable weights and compute semantic/rerank fresh at search time (current behavior in `computeWeights()`).
**Warning signs:** All search results showing identical scores; semantic weight always 0.

### Pitfall 5: ConfigService Missing New Env Vars
**What goes wrong:** New env vars (`POSTHOG_API_KEY`, `DECAY_CRON`) are not exposed via ConfigService, leading to hardcoded values.
**Why it happens:** Forgetting to add getters to the centralized config.
**How to avoid:** Add getters to `ConfigService` for every new env var before using them in services.
**Warning signs:** Code using `process.env.X` directly instead of `this.config.x`.

## Code Examples

### Registering a New Queue in NestJS Modules
```typescript
// Source: apps/api/src/jobs/jobs.module.ts (existing pattern)
// In jobs.module.ts - add alongside existing queue registrations:
BullModule.registerQueue({ name: 'maintenance' }),

// In memory.module.ts (or a new maintenance.module.ts):
BullModule.registerQueue({ name: 'maintenance' }),
```

### ConfigService New Getters
```typescript
// Add to apps/api/src/config/config.service.ts
get posthogApiKey(): string {
  return process.env.POSTHOG_API_KEY || '';
}

get decayCron(): string {
  return process.env.DECAY_CRON || '0 3 * * *';
}
```

### Frontend Event Capture Points
```typescript
// In memoryStore.ts searchMemories:
posthog.capture('search', { query_length: query.length, result_count: mems.length, fallback: result.fallback });

// In memoryStore.ts pinMemory/unpinMemory:
posthog.capture('memory_pin', { action: 'pin' });
posthog.capture('memory_pin', { action: 'unpin' });

// In jobStore.ts or sync trigger:
posthog.capture('sync_trigger', { connector_type: connectorType });
```

### Backend Event Capture Points
```typescript
// In SyncProcessor after successful sync:
this.analytics.capture('sync_complete', {
  connector_type: connectorType,
  duration_ms: Date.now() - startTime,
  item_count: itemCount,
});

// In SyncProcessor on error:
this.analytics.capture('sync_error', {
  connector_type: connectorType,
  error_type: err.name,
});

// In DecayProcessor after completion:
this.analytics.capture('decay_complete', {
  updated_count: updated,
  duration_ms: Date.now() - startTime,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `queue.add(name, data, { repeat: { pattern } })` | `queue.upsertJobScheduler(id, { pattern }, template)` | BullMQ v5.16.0 | Idempotent, no duplicate schedulers |
| `getRepeatableJobs()` + `removeRepeatableByKey()` | `removeJobScheduler(id)` | BullMQ v5.16.0 | Simpler management by scheduler ID |

**Deprecated/outdated:**
- `repeat` option in `queue.add()`: Deprecated since BullMQ v5.16.0. Still works but logs warnings. The existing `SchedulerService` uses this deprecated API -- decay job should use the new API, and optionally migrate sync scheduling too.

## Open Questions

1. **Should the decay job also update Qdrant payload metadata?**
   - What we know: Qdrant stores `event_time` in payload but not weights. Weights are computed at search time from SQLite.
   - What's unclear: Whether Qdrant payload includes any score/weight data that goes stale.
   - Recommendation: Skip Qdrant updates for now. The `computeWeights()` function already computes recency fresh at search time. The decay job's value is pre-computing the `weights` JSON for non-search use cases (graph display, list views). Qdrant payload doesn't need refreshing.

2. **Should the existing `SchedulerService` be migrated from deprecated `repeat` to `upsertJobScheduler`?**
   - What we know: Current sync scheduling uses `queue.add(name, data, { repeat: { pattern } })` with manual `removeRepeatableByKey()`.
   - What's unclear: Whether migrating sync scheduling is in scope for Phase 2.
   - Recommendation: Use `upsertJobScheduler` for the new decay job. Optionally migrate sync scheduling in the same phase since the code is small (50 lines) and it removes deprecation warnings. Claude's discretion applies here.

3. **Batch size: 500 or 1000?**
   - What we know: SQLite WAL handles concurrent reads well, but writer is exclusive. More memories per batch = fewer transactions but longer lock time per transaction.
   - Recommendation: Start with 500. With ~30K memories, that's 60 batches -- still completes in under a minute. Can be tuned later based on observed lock contention.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3 |
| Config file | `vitest.config.ts` per workspace |
| Quick run command | `pnpm --filter @botmem/api test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-01 | Decay processor recomputes recency weights | unit | `pnpm --filter @botmem/api test -- --run apps/api/src/memory/__tests__/decay.processor.test.ts` | No - Wave 0 |
| OPS-02 | Decay processes in batches, handles partial failure | unit | Same as above | No - Wave 0 |
| OPS-03 | Frontend tracks search/pin/sync events | unit | `pnpm --filter @botmem/web test -- --run` | No - Wave 0 |
| OPS-04 | PostHog no-op when API key absent | unit | `pnpm --filter @botmem/api test -- --run apps/api/src/analytics/__tests__/analytics.service.test.ts` | No - Wave 0 |
| OPS-05 | Backend emits server-side events | unit | Same as OPS-04 | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @botmem/api test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/memory/__tests__/decay.processor.test.ts` -- covers OPS-01, OPS-02
- [ ] `apps/api/src/analytics/__tests__/analytics.service.test.ts` -- covers OPS-04, OPS-05
- [ ] `posthog-node` package install: `cd apps/api && pnpm add posthog-node`

## Sources

### Primary (HIGH confidence)
- BullMQ 5.70.1 installed in project -- `upsertJobScheduler()` method verified via runtime inspection
- [BullMQ Job Schedulers docs](https://docs.bullmq.io/guide/job-schedulers) -- API signature and usage
- Codebase inspection: `SchedulerService`, `computeWeights()`, `posthog.ts`, all processor patterns
- [PostHog Node.js docs](https://posthog.com/docs/libraries/node) -- posthog-node API
- [posthog-node on npm](https://www.npmjs.com/package/posthog-node) -- v5.26.2, actively maintained

### Secondary (MEDIUM confidence)
- PostHog cloud free tier: 1M events/month (from user decision, consistent with PostHog pricing page)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed or verified on npm; versions confirmed
- Architecture: HIGH - follows existing processor/module patterns exactly; BullMQ API verified at runtime
- Pitfalls: HIGH - SQLite WAL constraints well-understood from existing codebase; BullMQ deprecation documented

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable libraries, no fast-moving changes expected)
