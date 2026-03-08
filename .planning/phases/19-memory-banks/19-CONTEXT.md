# Phase 19: Memory Banks — Context

## Goal
Memories are organized into banks for logical data isolation, with bank selection at sync time and search scoping.

## Requirements
- **BANK-01**: Create, list, rename, and delete memory banks per user
- **BANK-02**: Select target memory bank at sync time (connector sync config)
- **BANK-03**: Search scoped to accessible bank(s) — user's own banks + API key bank scope
- **BANK-04**: Default bank created on registration + migration of existing data into default bank

## Critical Pre-requisite: User-Data Ownership
The current system has NO userId on accounts, memories, contacts, or rawEvents.
Phase 19 must first establish user ownership before adding bank scoping.

### Current State
- `accounts` table: no userId column — accounts are standalone
- `memories` table: references accountId but not userId
- `contacts` table: no userId — shared globally
- Search (Qdrant + SQLite): no user filtering whatsoever
- `/search` endpoint: no @RequiresJwt(), anyone can search everything

### What Phase 19 Must Build (in order)

**Plan 01: User-Data Ownership (backend)**
1. Add `userId` column to `accounts` table (FK → users.id)
2. Add `userId` column to `contacts` table (FK → users.id)
3. Migration: assign all existing accounts/contacts to the single existing user
4. Add userId filtering to ALL data access: accounts, memories (via account), contacts, jobs, search
5. Add userId to Qdrant payloads on new upserts
6. Add @RequiresJwt() or user scoping to search endpoint
7. Thread userId from @CurrentUser() through all service methods

**Plan 02: Memory Banks Schema + CRUD (backend)**
1. Create `memory_banks` table (id, userId, name, isDefault, createdAt, updatedAt)
2. MemoryBanks CRUD service + controller (create, list, rename, delete)
3. Add `memoryBankId` column to `memories` table (FK → memory_banks.id)
4. Add `memoryBankId` to Qdrant payloads
5. Default memory bank created on user registration
6. Migration: create default memory bank for existing user, assign all memories to it

**Plan 03: Memory Bank Scoping (backend)**
1. Sync accepts memoryBankId parameter — all ingested memories go into specified memory bank
2. Search scoped by memoryBankId (Qdrant filter + SQLite WHERE)
3. API key memoryBankIds enforcement (non-nullable, validated against user's memory banks)
4. Delete memory bank cascades to memories + Qdrant vectors

**Plan 04: Frontend**
1. Bank selector in sidebar/topbar (global context)
2. Bank management page/modal (create, rename, delete)
3. Bank selection during connector sync
4. API key creation shows bank multi-select
5. Search results show bank context

## Dependencies
- Phase 18 (API keys) — memoryBankIds field ready for population
- Phase 16 (user auth) — @CurrentUser() decorator exists

## Risks
- Large migration surface — every query in the system needs userId scoping
- Qdrant backfill needed for existing vectors (no userId in payload)
- Single-user assumption baked into many service methods
