---
phase: quick-8
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/connectorMeta.ts
  - apps/web/src/pages/ConnectorsPage.tsx
  - apps/web/src/pages/DashboardPage.tsx
  - apps/web/src/pages/MemoryExplorerPage.tsx
  - apps/web/src/pages/ForgotPasswordPage.tsx
  - apps/web/src/pages/ResetPasswordPage.tsx
  - apps/web/src/pages/OnboardingPage.tsx
  - apps/web/src/pages/ContactsPage.tsx
  - apps/web/src/pages/LandingPage.tsx
  - apps/web/src/pages/SettingsPage.tsx
  - apps/web/src/components/layout/Topbar.tsx
  - apps/web/src/components/layout/Sidebar.tsx
  - apps/web/src/components/memory/SearchResultsBanner.tsx
  - apps/web/src/components/connectors/ConnectorSetupModal.tsx
  - apps/web/src/components/connectors/QrCodeAuth.tsx
  - apps/web/src/components/ui/ReauthModal.tsx
autonomous: true
requirements: [UI-FIX-01]

must_haves:
  truths:
    - 'No emoji characters are used as icons anywhere in the app'
    - 'All status/error colors use nb-* design tokens (no raw Tailwind green-400, yellow-400, red-400, etc.)'
    - 'ForgotPasswordPage and ResetPasswordPage have Logo + ThemeToggle matching Login/Signup layout'
    - 'MemoryExplorerPage action buttons use the neobrutalist border-3 style'
    - 'Sidebar collapse/expand and logout buttons have aria-label attributes'
    - 'ConnectorsPage accordion toggle has aria-expanded and aria-label'
    - 'Contacts search input has an associated label'
    - 'Topbar shows logged-in user initials'
  artifacts:
    - path: 'apps/web/src/lib/connectorMeta.ts'
      provides: 'Connector icon identifiers (no emoji)'
    - path: 'apps/web/src/pages/ForgotPasswordPage.tsx'
      provides: 'Auth page with Logo + ThemeToggle'
    - path: 'apps/web/src/pages/ResetPasswordPage.tsx'
      provides: 'Auth page with Logo + ThemeToggle'
  key_links:
    - from: 'ConnectorsPage.tsx'
      to: 'ConnectorStatusDot'
      via: 'bg-nb-green/yellow/red tokens'
      pattern: 'bg-nb-'
---

<objective>
Fix all UI/UX issues identified in the visual E2E review (UI-REVIEW.md). 28 issues across 12 pages — targeting Critical + High severity first, then Medium polish items.

Purpose: Bring the app to a shippable visual standard — consistent neobrutalist design system, proper accessibility attributes, no emoji icons, correct design tokens throughout.
Output: All modified pages and components with issues resolved.
</objective>

<execution_context>
@/Users/amr/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@/Users/amr/Projects/botmem/.planning/quick/7-full-visual-e2e-review-of-all-app-functi/UI-REVIEW.md

Key design system facts (do not deviate):

- Global CSS: `* { border-radius: 0 !important }` — no `rounded-*` classes on non-spinner elements
- Border weight: `border-3` (neobrutalist) for buttons, cards; `border-2` for smaller elements
- Color tokens: `bg-nb-green`, `bg-nb-yellow`, `bg-nb-red`, `text-nb-red`, `border-nb-red`, `text-nb-yellow`, `border-nb-yellow` — never raw Tailwind `green-400`, `yellow-300`, `red-400`
- Icons: Inline SVG only, `strokeWidth="1.5"`, `strokeLinecap="round"`, `strokeLinejoin="round"`, `viewBox="0 0 16 16"` — follow Sidebar pattern exactly
- No external icon libraries (lucide-react is not installed)
- Logo: `<Logo variant="full" height={28} />` and `<Logo variant="mark" height={40} />`
- ThemeToggle: `<ThemeToggle />` (icon-only variant) in mobile top bars
  </context>

<tasks>

<task type="auto">
  <name>Task 1: Fix emoji icons and critical colors (Critical severity issues)</name>
  <files>
    apps/web/src/lib/connectorMeta.ts
    apps/web/src/pages/ConnectorsPage.tsx
    apps/web/src/pages/DashboardPage.tsx
    apps/web/src/pages/MemoryExplorerPage.tsx
  </files>
  <action>
**1a. `apps/web/src/lib/connectorMeta.ts`** — Replace all emoji icons with letter abbreviations following the same convention as the existing Slack entry (`'#'`). Use ASCII characters only:

```typescript
export const CONNECTOR_ICONS: Record<string, string> = {
  gmail: 'G',
  whatsapp: 'W',
  slack: '#',
  imessage: 'i',
  'photos-immich': 'Ph',
  photos: 'Ph',
  locations: 'Lo',
};
```

The `getConnectorIcon` fallback should return `'?'` (already fine). Remove the Unicode escape sequences `\u2709`, `\uD83D\uDCAC`, etc.

**1b. `apps/web/src/pages/ConnectorsPage.tsx`** — Two fixes:

Fix 1 — `ConnectorStatusDot`: Replace `bg-green-400`, `bg-yellow-400 animate-pulse`, `bg-red-400` with `bg-nb-green`, `bg-nb-yellow animate-pulse`, `bg-nb-red`.

Fix 2 — `EmptyState` emoji icon: Change `icon="⚡"` to `icon="+"` (a neutral placeholder character that isn't an emoji).

Fix 3 — Heading size: Change `font-display text-xl font-bold uppercase` to `font-display text-3xl font-bold uppercase`.

Fix 4 — Accordion accessibility: The `<button onClick={() => toggle(cfg.type)}>` toggle button currently has no `aria-label` or `aria-expanded`. Add:

```tsx
aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${cfg.label} connector`}
aria-expanded={isExpanded}
```

**1c. `apps/web/src/pages/DashboardPage.tsx`** — Replace the lock emoji overlay:

Replace:

```tsx
<span className="text-4xl">&#x1F512;</span>
```

With an inline SVG lock icon:

```tsx
<svg
  width="40"
  height="40"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth="1.5"
  strokeLinecap="round"
  strokeLinejoin="round"
  className="text-nb-text"
>
  <rect x="3" y="11" width="18" height="11" rx="0" />
  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
</svg>
```

Also add `aria-label="Unlock encryption key"` to the existing "Unlock" button.

**1d. `apps/web/src/pages/MemoryExplorerPage.tsx`** — Three fixes:

Fix 1 — Lock emoji in overlay (line 126): Replace `<span className="text-5xl">&#x1F512;</span>` with the same SVG lock as above but `width="48" height="48"`.

Fix 2 — Action buttons: The two raw `<button>` elements ("Retry Failed" and "Re-enrich All") use `rounded-lg border border-nb-border`. Replace their className with the proper neobrutalist style:

```
className="shrink-0 border-3 border-nb-border bg-nb-surface px-3 py-2 text-xs font-mono uppercase tracking-wider text-nb-text hover:bg-nb-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
```

(Remove `rounded-lg`, change `border` to `border-3`.)

Fix 3 — Backfill message container: Change `rounded-md` to nothing (remove the class entirely) and keep the rest: `mt-2 bg-nb-surface border border-nb-border px-3 py-1.5 text-xs font-mono text-nb-muted`.

Fix 4 — EmptyState: Change `icon="*"` to `icon="0"` (neutral non-emoji).
</action>
<verify>
Run: `cd /Users/amr/Projects/botmem && grep -r "\\\\u2709\|\\\\uD83D\|&#x1F512;\|bg-green-400\|bg-yellow-400\|bg-red-400\|rounded-lg.*border.*nb-border\|icon=\"⚡\"" apps/web/src/ --include="*.tsx" --include="*.ts"`
Expected: zero matches.
Also verify: `grep -n "aria-expanded\|aria-label" apps/web/src/pages/ConnectorsPage.tsx` shows the accordion button has both attributes.
</verify>
<done> - No emoji characters or Unicode escape sequences remain in UI icon positions - ConnectorStatusDot uses nb-\* color tokens - Lock overlays use SVG icons - MemoryExplorer action buttons have border-3 (no rounded-lg) - Connector accordion has aria-expanded + aria-label - ConnectorsPage heading is text-3xl
</done>
</task>

<task type="auto">
  <name>Task 2: Fix auth pages (Logo/ThemeToggle) and high-severity UX issues</name>
  <files>
    apps/web/src/pages/ForgotPasswordPage.tsx
    apps/web/src/pages/ResetPasswordPage.tsx
    apps/web/src/pages/OnboardingPage.tsx
    apps/web/src/pages/ContactsPage.tsx
    apps/web/src/pages/SettingsPage.tsx
    apps/web/src/components/layout/Topbar.tsx
    apps/web/src/components/layout/Sidebar.tsx
  </files>
  <action>
**2a. `apps/web/src/pages/ForgotPasswordPage.tsx`** — Add Logo + ThemeToggle to match Login/Signup pages.

Add imports at top: `import { Logo } from '../components/ui/Logo';` and `import { ThemeToggle } from '../components/ui/ThemeToggle';`

Add mobile top bar (before the `<div className="min-h-screen flex">`):

```tsx
{
  /* Mobile top bar — matches Login/Signup pattern */
}
<div className="md:hidden flex items-center justify-between px-4 py-3 border-b-4 border-nb-border bg-nb-surface">
  <Logo variant="full" height={24} />
  <ThemeToggle />
</div>;
```

Wrap the entire page in a fragment `<>...</>` if needed.

Add Logo to the right decorative panel (after the `<h1>` block, before the closing `</div></div>`):

```tsx
<div className="mt-8">
  <Logo variant="full" height={24} />
  <div className="mt-4">
    <ThemeToggle />
  </div>
</div>
```

**2b. `apps/web/src/pages/ResetPasswordPage.tsx`** — Same pattern as ForgotPasswordPage.

Add same imports. Add same mobile top bar before the outer `<div className="min-h-screen flex">` (wrap in fragment). Add Logo + ThemeToggle to the right decorative panel.

For the "Invalid Link" state (the `if (!token)` branch), wrap it in the fragment and include the mobile top bar, then update the centered error box to use the dual-panel layout:

```tsx
return (
  <>
    <div className="md:hidden flex items-center justify-between px-4 py-3 border-b-4 border-nb-border bg-nb-surface">
      <Logo variant="full" height={24} />
      <ThemeToggle />
    </div>
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-8 bg-nb-surface">
        <div className="w-full max-w-sm text-center">
          <h2 className="font-display text-3xl font-bold uppercase text-nb-text mb-4">
            INVALID LINK
          </h2>
          <p className="font-mono text-sm text-nb-text mb-6">
            This reset link is invalid or has already been used.
          </p>
          <Link
            to="/forgot-password"
            className="font-mono text-sm font-bold underline decoration-3 hover:text-nb-pink text-nb-text"
          >
            Request a new reset link
          </Link>
        </div>
      </div>
      <div className="flex-1 bg-nb-bg text-nb-text flex items-center justify-center p-8 border-l-4 border-nb-border">
        <div>
          <h1 className="font-display text-7xl font-bold leading-tight">
            NEW
            <br />
            <span className="text-nb-lime">PASSWORD.</span>
            <br />
            NEW
            <br />
            START.
          </h1>
          <div className="mt-6 w-24 h-2 bg-nb-pink" />
          <div className="mt-8">
            <Logo variant="full" height={24} />
          </div>
        </div>
      </div>
    </div>
  </>
);
```

**2c. `apps/web/src/pages/OnboardingPage.tsx`** — Add Logo and ThemeToggle to page header.

Add imports: `Logo` and `ThemeToggle`.

Replace the existing header div:

```tsx
<div className="flex items-center justify-between mb-8">
  <Logo variant="full" height={32} />
  <ThemeToggle />
</div>
<div className="text-center mb-4">
  <h1 className="font-display text-4xl font-bold uppercase text-nb-text">BOTMEM SETUP</h1>
  <div className="w-16 h-1 bg-nb-pink mx-auto mt-2" />
</div>
```

**2d. `apps/web/src/pages/ContactsPage.tsx`** — Fix search input accessibility.

The bare `<input>` element (line ~84) has no `<label>`. Replace the raw `<input>` with a labeled wrapper:

```tsx
<label htmlFor="contacts-search" className="sr-only">Search people</label>
<input
  id="contacts-search"
  type="text"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  placeholder="Search people..."
  aria-label="Search people"
  className="w-full border-3 border-nb-border bg-nb-surface font-mono text-sm text-nb-text px-4 py-3 mb-4 shadow-nb placeholder:text-nb-muted"
/>
```

Also wrap `<MergeTinder ... />` in a conditional: `{filteredSuggestions.length > 0 && <MergeTinder ... />}`

**2e. `apps/web/src/pages/SettingsPage.tsx`** — Add explanation for disabled profile inputs.

In the Profile tab `<Card>`, after the `<p className="font-mono text-xs text-nb-muted mb-4">` description, update the description text to explain why fields are disabled:

```tsx
<p className="font-mono text-xs text-nb-muted mb-4">
  Your account information. Name and email are managed through your auth provider and cannot be
  changed here.
</p>
```

**2f. `apps/web/src/components/layout/Topbar.tsx`** — Add user initials badge to topbar right section.

Add import: `import { useAuth } from '../../hooks/useAuth';`

Inside the component, add: `const { user } = useAuth();`

Then add a user initials badge in the right section (`<div className="flex items-center gap-3">`), before the ThemeToggle:

```tsx
{
  user && (
    <div
      className="w-8 h-8 border-2 border-nb-border bg-nb-surface flex items-center justify-center font-display text-xs font-bold uppercase text-nb-text"
      title={user.name || user.email}
      aria-label={`Logged in as ${user.name || user.email}`}
    >
      {(user.name || user.email || '?')[0].toUpperCase()}
    </div>
  );
}
```

**2g. `apps/web/src/components/layout/Sidebar.tsx`** — Add aria-labels to collapse/expand button and collapsed logout button.

Collapse/expand button (the `hidden md:flex` button that shows `←`/`→`):

```tsx
aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
```

Collapsed logout button — the `<span className={cn('hidden', collapsed && 'md:inline')}>⏻</span>` power icon has no accessible label. Add `aria-label="Logout"` to the parent `<button>` element (it already renders LOGOUT text when expanded, but the aria-label makes it explicit for the collapsed state):

```tsx
aria-label="Logout"
```

  </action>
  <verify>
    Run: `cd /Users/amr/Projects/botmem && grep -n "aria-label\|aria-expanded\|htmlFor\|sr-only" apps/web/src/pages/ContactsPage.tsx apps/web/src/components/layout/Topbar.tsx apps/web/src/components/layout/Sidebar.tsx`
    Expected: contacts search shows `aria-label` + `htmlFor`, Topbar shows user initials `aria-label`, Sidebar shows collapse + logout `aria-label`.

    Run: `grep -n "Logo\|ThemeToggle" apps/web/src/pages/ForgotPasswordPage.tsx apps/web/src/pages/ResetPasswordPage.tsx apps/web/src/pages/OnboardingPage.tsx`
    Expected: all three files import and use Logo + ThemeToggle.

  </verify>
  <done>
    - ForgotPasswordPage: mobile top bar (Logo+ThemeToggle) + Logo in right panel
    - ResetPasswordPage: same, including the "Invalid Link" branch with dual-panel layout
    - OnboardingPage: Logo + ThemeToggle in page header
    - ContactsPage search: has `<label>` element and `aria-label`; MergeTinder conditionally rendered
    - SettingsPage profile: explains why fields are disabled
    - Topbar: shows user initials badge
    - Sidebar: collapse button has aria-label; logout button has aria-label
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix hardcoded off-brand colors and Landing page icons</name>
  <files>
    apps/web/src/components/memory/SearchResultsBanner.tsx
    apps/web/src/components/connectors/ConnectorSetupModal.tsx
    apps/web/src/components/connectors/QrCodeAuth.tsx
    apps/web/src/components/ui/ReauthModal.tsx
    apps/web/src/pages/LandingPage.tsx
  </files>
  <action>
**3a. `apps/web/src/components/memory/SearchResultsBanner.tsx`** — Replace all hardcoded Tailwind color tokens with nb-* equivalents.

Replace every occurrence of:

- `border-yellow-500/40` → `border-nb-yellow/40`
- `bg-yellow-500/10` → `bg-nb-yellow/10`
- `text-yellow-300` → `text-nb-yellow`
- `text-yellow-100` → `text-nb-text` (for emphasized text inside yellow banners)
- `text-yellow-400` → `text-nb-yellow`
- `border-cyan-500/40` → `border-nb-blue/40`
- `bg-cyan-500/10` → `bg-nb-blue/10`
- `text-cyan-300` → `text-nb-blue`
- `text-cyan-100` → `text-nb-text`

Note: There are ~8 banner divs using these patterns — replace all consistently throughout the file including the `ResolvedEntitiesBanner` sub-component at the bottom.

**3b. `apps/web/src/components/connectors/ConnectorSetupModal.tsx`** — Fix the error display block.

Find the error block (around line 328):

```tsx
<div className="border-3 border-red-500 bg-red-500/10 p-3 font-mono text-sm text-red-400">
```

Replace with:

```tsx
<div className="border-3 border-nb-red bg-nb-red/10 p-3 font-mono text-sm text-nb-red">
```

**3c. `apps/web/src/components/connectors/QrCodeAuth.tsx`** — Fix failed state colors.

Find the failed state block (around line 87-92):

```tsx
<div className="w-10 h-10 border-3 border-red-500 rounded-full flex items-center justify-center">
  <svg className="w-6 h-6 text-red-500" ...>
...
<p className="font-mono text-sm text-red-400">
```

Replace:

- `border-red-500` → `border-nb-red`
- `text-red-500` → `text-nb-red`
- `text-red-400` → `text-nb-red`

Also remove `rounded-full` from the icon wrapper div (global `border-radius: 0 !important` already overrides it, but for code intent consistency, use a plain div or accept the override).

**3d. `apps/web/src/components/ui/ReauthModal.tsx`** — Fix error text color.

Find:

```tsx
<p className="mt-2 font-mono text-xs text-red-400">{error}</p>
```

Replace `text-red-400` with `text-nb-red`.

**3e. `apps/web/src/pages/LandingPage.tsx`** — Replace Unicode character feature icons.

The `FEATURES` array (around line 232) uses `'⬡'`, `'⊞'`, `'⊛'`, `'◈'`, `'⬢'`, `'⌘'` as icon strings. Replace the `icon` field in each object with a short SVG element. The FeaturesSection renders them via something like `<span>{f.icon}</span>` — update both the data structure and render code.

Change the FEATURES array `icon` field from a string to a ReactNode (SVG), and update the FeaturesSection render to output `{f.icon}` directly (no string wrapping). Use the project's SVG style (`strokeWidth="1.5"`, `strokeLinecap="round"`, 16x16 viewBox). Map features to sensible icons:

1. "6 CONNECTORS" → plug/link icon (two circles linked)
2. "FULLY LOCAL" → server/database icon (cylinder)
3. "CONTACT GRAPH" → people icon (two circles, person silhouette)
4. "FACTUALITY" → checkmark/shield icon
5. "MEMORY GRAPH" → three connected nodes (brain/graph)
6. "AGENT API" → terminal/code icon (`</>`)

Example for "FULLY LOCAL":

```tsx
icon: (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="7" rx="8" ry="3" />
    <path d="M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7" />
    <path d="M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" />
  </svg>
),
```

In the `FeaturesSection` render, wherever `f.icon` is displayed (likely inside a `<span>` or `<div>`), ensure it renders as JSX directly. Update the TypeScript type of the FEATURES array from `string` to `ReactNode` if needed, adding `import type { ReactNode } from 'react';` at the top.
</action>
<verify>
Run: `cd /Users/amr/Projects/botmem && grep -rn "text-red-4\|border-red-5\|text-yellow-3\|text-yellow-1\|text-yellow-4\|border-yellow-5\|bg-yellow-5\|text-cyan-3\|text-cyan-1\|border-cyan-5\|bg-cyan-5" apps/web/src/ --include="*.tsx"`
Expected: zero matches.

    Run: `grep -n "⬡\|⊞\|⊛\|◈\|⬢\|⌘" apps/web/src/pages/LandingPage.tsx`
    Expected: zero matches.

  </verify>
  <done>
    - SearchResultsBanner: all banners use nb-yellow and nb-blue tokens
    - ConnectorSetupModal error: uses border-nb-red and text-nb-red
    - QrCodeAuth failed state: uses nb-red tokens
    - ReauthModal error: uses text-nb-red
    - LandingPage features: Unicode glyphs replaced with SVG icons
  </done>
</task>

</tasks>

<verification>
After all 3 tasks complete:

1. Visual token check — no off-brand colors remain:

   ```bash
   grep -rn "text-red-4\|border-red-5\|text-yellow-3\|text-yellow-4\|text-cyan-3\|bg-green-400\|bg-yellow-400\|bg-red-400" apps/web/src/ --include="*.tsx"
   ```

   Expected: zero results.

2. No emoji icons:

   ```bash
   grep -rn "&#x1F512;\|⚡\|⬡\|⊞\|⊛\|◈\|⬢\|⌘" apps/web/src/ --include="*.tsx" --include="*.ts"
   ```

   Expected: zero results.

3. Aria attributes present:

   ```bash
   grep -n "aria-expanded\|aria-label\|htmlFor" apps/web/src/pages/ConnectorsPage.tsx apps/web/src/components/layout/Sidebar.tsx apps/web/src/components/layout/Topbar.tsx apps/web/src/pages/ContactsPage.tsx
   ```

   Expected: all four files show hits.

4. Logo on auth pages:

   ```bash
   grep -n "Logo\|ThemeToggle" apps/web/src/pages/ForgotPasswordPage.tsx apps/web/src/pages/ResetPasswordPage.tsx apps/web/src/pages/OnboardingPage.tsx
   ```

   Expected: all three files import both components.

5. TypeScript compiles:
   ```bash
   cd apps/web && npx tsc --noEmit 2>&1 | head -20
   ```
   Expected: clean or only pre-existing errors (none introduced by this PR).
   </verification>

<success_criteria>

- All 4 Critical issues resolved (emoji lock icons, emoji connector icons, off-brand status dot colors, rounded action buttons)
- All 10 High issues resolved (auth page logos, heading sizes, error colors, aria attributes, contacts label, topbar user badge, SearchResultsBanner colors, LandingPage icons)
- Key Medium issues resolved (Sidebar aria labels, settings explanation, onboarding logo, MergeTinder conditional, backfill message styling, QrCodeAuth colors)
- TypeScript compilation is clean
- No emoji characters or raw Tailwind color classes in any of the modified files
  </success_criteria>

<output>
After completion, create `.planning/quick/8-fix-all-ui-ux-issues-from-visual-e2e-rev/8-SUMMARY.md` summarizing what was changed, which issues were resolved, and any deferred items.
</output>
