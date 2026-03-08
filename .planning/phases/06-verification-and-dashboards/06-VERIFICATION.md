---
phase: 06-verification-and-dashboards
verified: 2026-03-08T12:00:00Z
status: gaps_found
score: 6/8 must-haves verified
re_verification: false
gaps:
  - truth: "A saved PostHog dashboard exists with searches/day, syncs/day, and memories created insights"
    status: partial
    reason: "The 'Memories created' insight is configured to track 'embed_complete' events, but the backend EmbedProcessor never emits an 'embed_complete' analytics event. The insight will always show zero."
    artifacts:
      - path: "apps/api/src/memory/embed.processor.ts"
        issue: "No analytics.capture('embed_complete', ...) call exists in the embed processor"
    missing:
      - "Add analytics.capture('embed_complete', { memory_id, source_type, connector_type }) to EmbedProcessor after successful memory creation and embedding"
  - truth: "Session recordings are playable in PostHog Replay tab"
    status: partial
    reason: "Code is correctly wired (session_recording config in posthog.ts, initPostHog called in main.tsx). Actual data flow to PostHog cloud cannot be verified programmatically -- requires human confirmation that recordings appear in PostHog Replay tab."
    artifacts: []
    missing:
      - "Human must confirm at least one session recording is playable in PostHog Replay tab"
  - truth: "Heatmap overlay is visible on Botmem pages via PostHog toolbar"
    status: partial
    reason: "Code is correctly wired (enable_heatmaps: true, autocapture: true in posthog.ts). Actual heatmap visibility requires human confirmation via PostHog toolbar."
    artifacts: []
    missing:
      - "Human must confirm heatmap overlay shows click data via PostHog toolbar"
human_verification:
  - test: "Verify session recordings in PostHog Replay tab"
    expected: "At least one session recording exists and is playable with masked text inputs"
    why_human: "Session recordings are stored in PostHog cloud -- cannot verify via codebase inspection"
  - test: "Verify heatmap overlay via PostHog toolbar"
    expected: "Heatmap overlay shows click data on Botmem pages when toolbar is launched"
    why_human: "Heatmap data is visualized in PostHog toolbar UI -- cannot verify programmatically"
  - test: "Verify PostHog dashboard insights populate with data"
    expected: "Botmem Usage dashboard (ID 557423) shows trend lines for searches/day and syncs/day after real usage"
    why_human: "Dashboard data requires actual PostHog events which accumulate over time"
---

# Phase 6: Verification and Dashboards Verification Report

**Phase Goal:** PostHog dashboards provide actionable insights on Botmem usage patterns
**Verified:** 2026-03-08T12:00:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Session recordings are playable in PostHog Replay tab | ? UNCERTAIN | Code wired: `session_recording` config in posthog.ts, `initPostHog()` called in main.tsx. Needs human verification in PostHog cloud. |
| 2 | Heatmap overlay is visible on Botmem pages via PostHog toolbar | ? UNCERTAIN | Code wired: `enable_heatmaps: true`, `autocapture: true` in posthog.ts. Needs human verification. |
| 3 | Errors with stack traces appear in PostHog Error Tracking view | VERIFIED | PostHogExceptionFilter in posthog-exception.filter.ts captures 5xx errors with `$exception_message`, `$exception_stack_trace_raw`. Frontend `capture_exceptions: true` in posthog.ts. Filter wired in main.ts:48. Commit 782b06c fixed the filter crash. |
| 4 | Navigation paths between pages are trackable in PostHog | VERIFIED | `capture_pageleave: true` in posthog.ts, manual `$pageview` capture on route change in App.tsx:39. |
| 5 | PostHog web analytics dashboard shows page views, unique visitors, and session counts | VERIFIED | Built-in PostHog Web Analytics feature. `$pageview` events are sent (App.tsx:39), `capture_pageleave: true` provides session data. User confirmed in 06-02-SUMMARY. |
| 6 | A saved PostHog dashboard exists with searches/day, syncs/day, and memories created insights | PARTIAL | Dashboard ID 557423 exists (per user confirmation). searches/day wired: `trackEvent('search', ...)` in memoryStore.ts:107. syncs/day wired: `analytics.capture('sync_complete', ...)` in sync.processor.ts:188. **Memories created NOT wired**: `embed_complete` event is never emitted by backend code. |
| 7 | A funnel insight tracks connector setup flow | VERIFIED | Funnel steps: `$pageview` (App.tsx:39), `connector_setup` (auth.service.ts:102), `sync_complete` (sync.processor.ts:188). All three events are emitted by actual code. |
| 8 | A retention insight measures how often the user returns to search memories | VERIFIED | Retention configured on `search` event. Frontend emits `trackEvent('search', ...)` in memoryStore.ts:107 on every search. |

**Score:** 6/8 truths verified (2 need human verification, 1 has a wiring gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/lib/posthog.ts` | PostHog SDK init with session replay, heatmaps, error tracking | VERIFIED | All features configured: session_recording, autocapture, enable_heatmaps, capture_exceptions, capture_pageleave. Privacy masking in place. |
| `apps/api/src/analytics/posthog-exception.filter.ts` | Backend exception filter sending 5xx errors to PostHog | VERIFIED | Captures `$exception` with message, type, stack trace, source. Only fires for status >= 500. |
| `apps/api/src/analytics/analytics.service.ts` | Server-side PostHog client wrapper | VERIFIED | Wraps posthog-node, captures events with distinctId 'server'. Graceful shutdown. |
| `apps/api/src/main.ts` | Exception filter wired globally | VERIFIED | Line 48: `app.useGlobalFilters(new PostHogExceptionFilter(analyticsService, httpAdapterHost))` |
| PostHog Dashboard (ID 557423) | Saved dashboard with 5 insights | VERIFIED (external) | Per user confirmation: 5 insights created. Cannot verify externally. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Web app | PostHog SDK | `initPostHog()` in main.tsx | WIRED | main.tsx:7 calls `initPostHog()` |
| App.tsx | PostHog pageview | `posthog.capture('$pageview')` | WIRED | App.tsx:39 on route change |
| memoryStore | PostHog search event | `trackEvent('search', ...)` | WIRED | memoryStore.ts:107 |
| SyncProcessor | PostHog sync_complete | `analytics.capture('sync_complete', ...)` | WIRED | sync.processor.ts:188 |
| AuthService | PostHog connector_setup | `analytics.capture('connector_setup', ...)` | WIRED | auth.service.ts:102 |
| EmbedProcessor | PostHog embed_complete | `analytics.capture('embed_complete', ...)` | NOT WIRED | No analytics capture in embed.processor.ts |
| PostHogExceptionFilter | PostHog $exception | `analytics.capture('$exception', ...)` | WIRED | posthog-exception.filter.ts:28 |
| posthog.ts | PostHog errors | `capture_exceptions: true` | WIRED | posthog.ts:37 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REPLAY-02 | 06-01 | Session recordings appear in PostHog Replay tab and can be played back | ? NEEDS HUMAN | Code wired correctly. Data flow to PostHog cloud needs human confirmation. |
| HEAT-02 | 06-01 | Heatmap data is viewable in PostHog toolbar overlay on Botmem pages | ? NEEDS HUMAN | Code wired correctly. Toolbar overlay needs human confirmation. |
| ERR-02 | 06-01 | Errors appear in PostHog Error Tracking view with stack traces | SATISFIED | PostHogExceptionFilter captures 5xx with stack traces. Frontend capture_exceptions enabled. Filter crash fixed in commit 782b06c. |
| WEB-01 | 06-02 | PostHog web analytics dashboard shows page views, unique visitors, and session counts | SATISFIED | Built-in PostHog Web Analytics. $pageview events sent. User confirmed in 06-02-SUMMARY. |
| WEB-02 | 06-01 | Navigation paths between pages are trackable in PostHog | SATISFIED | $pageview on route change + capture_pageleave. Paths insight possible. |
| PROD-01 | 06-02 | A PostHog dashboard exists with saved insights for key Botmem metrics | PARTIAL | Dashboard exists (ID 557423) with 5 insights. However, "Memories created" insight tracks `embed_complete` which is never emitted. 2 of 3 trend insights are wired. |
| PROD-02 | 06-02 | A funnel insight tracks the connector setup flow | SATISFIED | All 3 funnel steps ($pageview, connector_setup, sync_complete) are emitted by code. |
| PROD-03 | 06-02 | A retention insight measures how often the user returns to search memories | SATISFIED | Retention on `search` event. Frontend emits search events on every query. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| apps/api/src/memory/embed.processor.ts | - | Missing `embed_complete` analytics event | Warning | "Memories created" dashboard insight will always show zero data |

### Human Verification Required

### 1. Session Replay Playback

**Test:** Open PostHog EU (eu.i.posthog.com) -> Replay tab. Find and play a session recording.
**Expected:** At least one recording exists and plays back user interactions. Text inputs should appear masked.
**Why human:** Session recordings are stored in PostHog cloud and can only be verified through the PostHog UI.

### 2. Heatmap Overlay

**Test:** Navigate to a Botmem page (e.g., http://localhost:5173/memory). Launch PostHog toolbar from PostHog settings. Enable heatmap overlay.
**Expected:** Heatmap shows click density on page elements.
**Why human:** Heatmap visualization is a PostHog toolbar feature that renders in-browser.

### 3. Dashboard Data Population

**Test:** Open PostHog EU -> Dashboards -> "Botmem Usage" (ID 557423). Check that insights show data after performing searches and syncs.
**Expected:** Searches/day and syncs/day trend lines populate after real usage. Funnel shows conversion data.
**Why human:** Dashboard data accumulates over time from PostHog events.

### Gaps Summary

**1 code-level gap found:**

The "Memories created" insight on the PostHog dashboard is configured to track `embed_complete` events, but the EmbedProcessor (`apps/api/src/memory/embed.processor.ts`) never calls `analytics.capture('embed_complete', ...)`. This means one of the three core trend insights in the PROD-01 dashboard will permanently show zero data. The fix is straightforward: inject AnalyticsService into EmbedProcessor and emit `embed_complete` after successful memory creation and embedding.

The remaining items flagged as UNCERTAIN (REPLAY-02, HEAT-02) are inherently cloud-side verification items that cannot be confirmed through code inspection alone. The code instrumentation is correct -- these need human confirmation that data is flowing to PostHog cloud.

---

_Verified: 2026-03-08T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
