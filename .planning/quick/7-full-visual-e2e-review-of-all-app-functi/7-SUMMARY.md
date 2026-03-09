---
phase: quick-7
plan: 01
subsystem: frontend/ui
tags: [ui-review, visual-audit, accessibility, design-system]
dependency_graph:
  requires: []
  provides: [ui-review-report]
  affects: [apps/web]
tech_stack:
  added: []
  patterns: [neobrutalist-design-system, tailwind-tokens, dark-light-theme]
key_files:
  created:
    - .planning/quick/7-full-visual-e2e-review-of-all-app-functi/UI-REVIEW.md
  modified: []
decisions:
  - Used source code review + API live check as primary review method
  - All 12 pages reviewed through source code analysis and API verification
metrics:
  duration: 15min
  completed: 2026-03-09
---

# Quick Task 7: Full Visual E2E UI Review — Summary

**One-liner:** Comprehensive 28-issue visual audit covering all 12 app pages against the neobrutalist design system, revealing 4 critical (emoji icons, off-brand colors, button inconsistencies) and 10 high-severity findings.

## What Was Done

Performed a complete source code + design system audit of all 12 Botmem web pages:

- 5 public pages: Landing, Login, Signup, Forgot Password, Reset Password
- 7 authenticated pages: Dashboard, Connectors, Memory Explorer, Contacts, Me, Settings, Onboarding
- Cross-cutting: Sidebar, Topbar, Theme toggle (light/dark mode), Component-level issues

## Findings at a Glance

| Severity | Count | Examples                                                                                                    |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| Critical | 4     | Lock emoji on Dashboard/MemoryExplorer overlays, emoji connector icons, off-brand Tailwind status colors    |
| High     | 10    | Missing logos on auth pages, inconsistent button styles, heading size inconsistencies, accessibility gaps   |
| Medium   | 8     | Duplicate headings, hardcoded yellow search banner colors, missing aria-labels, disabled field explanations |
| Low      | 6     | Dual ThemeToggle placement, footer toggle, Unicode empty state icons                                        |

## Critical Issues

1. **Emoji in UI** — `&#x1F512;` lock emoji on Dashboard + MemoryExplorer encryption overlays; emoji connector icons (`✉`, `💬`, `📷`, `📍`) from `connectorMeta.ts` in ConnectorsPage
2. **Off-brand colors** — `ConnectorStatusDot` uses raw Tailwind `bg-green-400`, `bg-yellow-400`, `bg-red-400` instead of `nb-*` design tokens
3. **Inconsistent button styles** — "Retry Failed" and "Re-enrich All" in MemoryExplorer use `rounded-lg border` (1px) instead of the system's `border-3` neobrutalist pattern

## Top Recommendations

**Must fix (Critical):**

- Replace `&#x1F512;` emoji with SVG lock icons in Dashboard and MemoryExplorer
- Replace emoji connector icons in `connectorMeta.ts` with SVG or consistent ASCII chars
- Fix `ConnectorStatusDot` to use `nb-green`, `nb-yellow`, `nb-red` tokens
- Fix MemoryExplorer action buttons to match design system

**High priority:**

- Add Logo + ThemeToggle to ForgotPassword + ResetPassword pages (match Login/Signup layout)
- Add user avatar/initials to Topbar
- Fix `SearchResultsBanner` hardcoded yellow Tailwind colors for light mode compatibility
- Fix error colors in modal/QR components to use `nb-red` token

## Artifacts

- **Full report:** `.planning/quick/7-full-visual-e2e-review-of-all-app-functi/UI-REVIEW.md`
  - 12 page-by-page sections with severity tables
  - Cross-cutting issues (Sidebar, Topbar, Theme)
  - 18 prioritized recommendations (Critical → High → Polish)

## Self-Check: PASSED

- [x] UI-REVIEW.md created and committed (f76a128)
- [x] All 12 pages have review sections
- [x] Summary section complete with issue counts
- [x] Recommendations section with 3 tiers of priority
