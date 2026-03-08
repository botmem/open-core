# Botmem — Personal Memory RAG System

## What This Is

A local-first personal memory platform that ingests events from multiple data sources (emails, messages, photos, locations), normalizes them into a unified memory schema, and provides cross-modal retrieval with weighted ranking. Built as a pnpm monorepo with NestJS API, React frontend, and pluggable connector architecture. Designed for a single person to query their entire digital life through semantic search and a force-directed graph visualization.

## Core Value

Every piece of personal communication and digital interaction is searchable, connected, and queryable — with factuality labeling so the user always knows what's verified vs. hearsay.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Ingest and normalize messages, emails, photos, and locations — existing
- ✓ Store searchable memory with vector + metadata + relationship links — existing
- ✓ Retrieve memory via semantic search with weighted scoring — existing
- ✓ Classify memory as FACT / UNVERIFIED / FICTION with confidence — existing
- ✓ Gmail connector (OAuth2, emails + contacts) — existing
- ✓ Slack connector (user token, workspace messages + contacts) — existing
- ✓ WhatsApp connector (QR auth, Baileys v6, message history) — existing
- ✓ iMessage connector (local tool, reads iMessage DB) — existing
- ✓ Photos-Immich connector (local tool, Immich photo library) — existing
- ✓ Locations connector (OwnTracks, HTTP auth, GPS history) — existing
- ✓ Contacts as first-class entities with dedup, avatars, identifiers, merge suggestions — existing
- ✓ Force-directed graph visualization for memory exploration — existing
- ✓ CLI tool (`botmem`) for humans and AI agents — existing
- ✓ BullMQ job pipeline: sync → embed → enrich — existing
- ✓ Real-time WebSocket updates for job progress — existing
- ✓ Docker Compose infrastructure (Redis + Qdrant) — existing
- ✓ Reranker integration for second-pass scoring (logprobs yes/no) — v1.0
- ✓ Importance reinforcement (repeated recall boosts rank, capped +0.2) — v1.0
- ✓ Nightly decay job for recency/importance score refresh — v1.0
- ✓ Memory pinning with score floor 0.75 — v1.0
- ✓ Plugin/extension system (3 types: connector, scorer, lifecycle) — v1.0
- ✓ PostHog SDK integration (frontend + backend, no-op when unconfigured) — v1.0
- ✓ PostHog cloud analytics activation and end-to-end event verification — v1.1
- ✓ Configurable PostHog host (EU/US) via POSTHOG_HOST env var — v1.1
- ✓ connector_setup, graph_view, graph_node_click tracking events — v1.1

### Active

<!-- Current scope. Building toward these. -->

- [ ] Natural language query parsing (entity/topic/temporal extraction from freeform questions)
- [ ] LLM summarization of search results (assistant-style answers)
- [ ] Entity type classification cleanup (consistent typing across enrichment pipeline)

## Current Milestone: v1.4 Search Intelligence

**Goal:** Make Botmem's search layer intelligent enough for a personal AI assistant — parse natural language queries into structured filters, summarize search results via LLM, and fix inconsistent entity type classification so entities are reliable for filtering and display.

**Target features:**
- Natural language query parsing (extract entities, topics, temporal references from freeform questions)
- LLM summarization of search results (assistant-style answers, not just raw memory list)
- Entity type classification cleanup (consistent typing: person, organization, location, event, product)

## Queued Milestone: v2.0 Production Deployment & Open-Core Split

**Goal:** Deploy Botmem to production on a Vultr VPS with proper infrastructure (Postgres, Firebase auth, Caddy SSL, OpenRouter inference), split the monorepo into open-core (public) and prod-core (private) under a GitHub org, and wire CI/CD pipelines for automatic deployment.

**Target features:**
- GitHub org (`botmem`) with public open-core repo and private prod-core repo
- SQLite → PostgreSQL migration for production
- Firebase authentication (project under amroessams@gmail.com)
- OpenRouter API integration for production inference (keep Ollama for open-core)
- Vultr $5 VPS provisioning and server configuration
- Docker Compose production stack (API, web, Postgres, Redis, Qdrant, Caddy)
- Caddy reverse proxy with automatic SSL (Let's Encrypt)
- DNS configuration on Spaceship (botmem.xyz → Vultr IP)
- GitHub Actions CI/CD pipelines for both open-core and prod-core builds
- End-to-end production verification

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Native image embedding retrieval — deferred; image retrieval via OCR/caption/metadata for v1
- Multi-person identity graph — single target person only in v1
- Automatic deletion policy engine — manual/admin-driven in v1
- Mobile app — web-first
- Real-time chat ingestion — batch sync only in v1

## Context

- **Monorepo**: pnpm 9.15 workspaces + Turbo 2.4, TypeScript (ES2022, strict, ESNext modules)
- **Backend**: NestJS 11, Drizzle ORM + SQLite (better-sqlite3, WAL mode), BullMQ on Redis
- **Frontend**: React 19, Vite 6, React Router 7, Zustand 5, Tailwind 4, react-force-graph-2d
- **AI**: Ollama (remote at 192.168.10.250) — nomic-embed-text (768d embeddings), qwen3:0.6b (text), qwen3-vl:2b (vision)
- **Vector DB**: Qdrant (cosine similarity, auto-created collection)
- **Port**: API on 12412, web on 5173
- **WhatsApp limitation**: LID format only, no phone number resolution possible via Baileys v6
- **Git remote**: github.com/botmem org (open-core public, prod-core private)
- **Domain**: botmem.xyz (Spaceship, DNS not yet configured)
- 6 connectors implemented and working
- Contacts system fully operational with cross-connector dedup

## Constraints

- **AI Infrastructure**: Ollama runs externally on 192.168.10.250 (RTX 3070) — not containerized, configured by env var
- **Storage**: SQLite only (no PostgreSQL) — WAL mode for concurrent reads, simple deployment
- **Embedding**: nomic-embed-text produces 768d vectors — model change requires re-embedding all memories
- **WhatsApp**: Baileys v6 LID format means phone numbers are not resolvable; history only delivered to first QR-linked socket

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite over PostgreSQL | Simpler deployment, single-user system, WAL mode sufficient | ✓ Good |
| NestJS over FastAPI | TypeScript monorepo consistency, better ecosystem fit | ✓ Good |
| BullMQ over Celery | Native Node.js, no Python dependency, Redis-backed | ✓ Good |
| nomic-embed-text over Qwen embedding | Available on Ollama, 768d vectors, good quality | ✓ Good |
| Contacts as first-class entities | Rich cross-connector identity needed for meaningful search | ✓ Good |
| Store all memories, label factuality | Never lose data, let user filter by confidence | ✓ Good |
| PostHog for analytics | Self-hostable, privacy-respecting, generous free tier | ✓ Good |
| PostHog cloud over self-hosted | 16GB RAM requirement disproportionate for single-user | ✓ Good |

| SQLite → PostgreSQL for production | Production needs concurrent writes, proper migrations, multi-connection support | — Pending |
| Firebase for auth | Google ecosystem, generous free tier, easy integration | — Pending |
| OpenRouter for prod inference | API-based, no GPU needed on VPS, keeps open-core Ollama-compatible | — Pending |
| Open-core / prod-core split | Public OSS version + private production with business docs | — Pending |
| Caddy over Nginx | Automatic HTTPS, simpler config, built-in Let's Encrypt | — Pending |

---
*Last updated: 2026-03-08 after v1.4 milestone start*
