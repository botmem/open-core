---
name: botmem-cli
description: Query and manage Botmem personal memory system via CLI. Use for searching memories, checking contacts, monitoring pipeline status.
triggers:
  - botmem
  - memory search
  - search memories
  - personal memory
  - check contacts
  - sync status
---

# Botmem CLI

The `botmem` CLI provides access to the Botmem personal memory system. It lives in `packages/cli/`.

## Setup

```bash
# Ensure built
pnpm build
# Or use directly
npx botmem --help
```

Set `BOTMEM_API_URL` env var or pass `--api-url` to point to a non-default API.

## Common Commands

```bash
# Search memories (POST /memories/search — uses semantic + FTS + entity resolution)
npx botmem search "coffee with Ahmed"
npx botmem search "meeting" --connector gmail --limit 5

# Check status
npx botmem status

# List/search contacts
npx botmem contacts
npx botmem contacts search "Amr"

# Get contact details + their memories
npx botmem contact <id>
npx botmem contact <id> memories

# Timeline — date-range queries
npx botmem timeline --from 2026-01-01 --to 2026-02-01
npx botmem timeline --query "meeting" --connector gmail

# Related memories — graph links + vector similarity
npx botmem related <memoryId>

# Entity search and graph
npx botmem entities search "AWS"
npx botmem entities graph "Bahrain"

# View pipeline jobs
npx botmem jobs

# Trigger sync
npx botmem sync <accountId>

# Retry all failed
npx botmem retry

# Memory stats
npx botmem stats
```

## JSON Mode (for agents/scripts)

Add `--json` to any command:

```bash
npx botmem search "project update" --json | jq '.items[].text'
npx botmem status --json | jq '.stats.total'
npx botmem accounts --json | jq '.accounts[].id'
npx botmem timeline --json --from 2026-03-01 | jq '.items | length'
```

## API Notes

- Search uses POST `/api/memories/search` with `{ query, filters?, limit?, rerank? }`
- Default API port is 12412
- Reranker is opt-in (pass `rerank: true` for higher accuracy at ~5s cost)
- Search returns `{ items, fallback, resolvedEntities? }`

## Typical Workflow

1. `botmem status` - check system health
2. `botmem search "topic"` - find relevant memories
3. `botmem memory <id>` - drill into a result
4. `botmem related <id>` - find connected memories
5. `botmem contact <id>` - check who was involved
6. `botmem contact <id> memories` - see all their interactions
7. `botmem timeline --from <date>` - browse by date range

## Error Handling

- API unreachable: shows connection error with hint to run `pnpm dev`
- No results: shows "No results found" message
- Bad arguments: shows command-specific help
