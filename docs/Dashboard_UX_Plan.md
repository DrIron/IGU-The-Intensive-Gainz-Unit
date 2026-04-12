# IGU Dashboard UX Plan

> **Status:** Initial launch plan drafted Feb 2026. Major streamlining pass Apr 12 2026 (see "Streamlining Pass" section). Current layout reflects the streamlined state.

---

## Design Principles (current)

1. **Each card either (a) shows a clickable number linking to its detail page, or (b) shows an actionable alert.** No display-only filler. If a card doesn't meet one of these two criteria, it doesn't belong on the overview.
2. **Role-appropriate information density** — show what matters most for each role, never duplicate data across cards
3. **Action-oriented** — clear CTAs for common tasks, and every clickable card must look clickable (chevron, hover state, focus ring)
4. **Status at a glance** — most-important metrics visible without scrolling on mobile
5. **Mobile-first** — many users access on phones at the gym; every two-column layout must collapse to single column with `grid-cols-1 lg:grid-cols-2`
6. **Reduce clicks** — most tasks should be 1–2 clicks away
7. **Accessibility is non-negotiable** — clickable cards must be keyboard accessible (see `ClickableCard` primitive below)

---

## Core Component: `ClickableCard`

**Location:** `src/components/ui/clickable-card.tsx`

**Rule:** Never use `<Card onClick={...}>` directly. Always use `<ClickableCard>` for any card that represents navigation or a primary action.

Why: adding `onClick` to `<Card>` directly creates a `<div>` pretending to be a button. No keyboard access, no screen reader announcement, no focus ring. The `ClickableCard` primitive centralizes:

- `role="button"` + `tabIndex={0}` for keyboard focus
- Enter/Space key handler to trigger `onClick`
- Required `ariaLabel` prop so screen readers announce the target
- `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- Hover shadow and border transition (matches existing design)
- `disabled` state support via `aria-disabled`

**Usage:**
```tsx
import { ClickableCard } from "@/components/ui/clickable-card";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";

<ClickableCard
  ariaLabel="View workout history"
  onClick={() => navigate("/client/workout/history")}
>
  <CardHeader>
    <CardTitle>This Week</CardTitle>
  </CardHeader>
  <CardContent>...</CardContent>
</ClickableCard>
```

**Decorative icons inside ClickableCard**: always add `aria-hidden="true"` so screen readers don't duplicate the announcement.

Current consumers (Apr 2026): `WeeklyProgressCard`, `AdherenceSummaryCard`, `CoachCard`, `CoachOverviewStats`, `CoachTeamsSummaryCard`.

---

## Current Layouts (Apr 2026, post-streamlining)

### CLIENT Dashboard — `NewClientOverview.tsx`

**Primary goals:** know today's workout, track nutrition compliance, see progress over time

1. `PaymentAttentionBanner` — conditional payment urgency (hidden when current)
2. `AlertsCard` — conditional action-required alerts (cancelled sub, failed payment, missing weight logs). Payment reminders handled by the banner above, not duplicated here.
3. `TodaysWorkoutHero` — today's workout with Start/Continue CTA
4. Two-column: `NutritionTargetsCard` + `CoachCard` (clickable → `/meet-our-team`) | `WeeklyProgressCard` (clickable → `/client/workout/history`) + `QuickActionsGrid`
5. `AdherenceSummaryCard` — clickable → `/client/workout/calendar`
6. Two-column: `PlanBillingCard` | `MyCareTeamCard`

**Mobile priority stack:** alerts → workout hero → nutrition → coach → weekly progress → quick actions → adherence → billing → care team. Everything stacks via `grid-cols-1 lg:grid-cols-2`.

**Removed in Apr 2026 streamlining:** `ProgressSummaryCard` (duplicate nutrition gauges), `PaymentDueCard` (redundant with banner). Removed payment alert from `AlertsCard` (also duplicate).

### COACH Dashboard — `CoachDashboardOverview.tsx`

**Primary goals:** see clients needing attention, track today's tasks, monitor capacity

1. `NeedsAttentionAlerts` — dismissible, top priority
2. `CoachOverviewStats` — 3 clickable cards (Active Clients, Programs Created, Workouts This Week)
3. Two-column: `CoachTodaysTasks` | `ClientActivityFeed`
4. Two-column: `EnhancedCapacityCard` | (`CoachTeamsSummaryCard` head-coach-only + `CoachCompensationSummary`)

**Removed in Apr 2026 streamlining:** `CoachKPIRow` (100% redundant), `CoachQuickActions` (sidebar duplicate), `CoachStatsCards` (replaced by inline `CoachOverviewStats`), legacy `CoachActivityFeed` (merged into `ClientActivityFeed` which has better data), full `CoachCompensationCard` (replaced with summary on overview; full table moved to dedicated page).

### ADMIN Dashboard — `OverviewSection` in `AdminDashboardLayout.tsx`

**Primary goals:** triage what needs attention, system health at a glance, revenue/subscription metrics, coach capacity, client pipeline

1. `AdminRequiresAttention` — top priority triage
2. `AdminMetricsCards` — 4 KPI cards (Active Clients, Active Coaches, Monthly Revenue, Pending Approvals). All clickable.
3. Two-column: `SubscriptionBreakdown` + `SystemHealthCard` | `CoachWorkloadPanel`
4. `ClientPipelineSection` — full-width pipeline funnel with segmented bar + stuck clients table

**Removed in Apr 2026 streamlining:** `AdminQuickActions` (6 static links duplicating sidebar). Deleted `RefinedAdminDashboard.tsx` (839 lines of dead code with hardcoded fake coach data).

**Promoted from dead code in Apr 2026:** `SystemHealthCard` and `ClientPipelineSection` were inside `RefinedAdminDashboard` (never rendered). Now live in the real overview.

---

## Mobile Navigation

- All 3 roles have `MobileBottomNav` with 4 visible items + "More" overflow (client: Dashboard, Nutrition, Calendar, Library; coach: Dashboard, Clients, Programs, Profile; admin: Overview, Clients, Coaches, Billing)
- Bottom nav is `h-16` → content areas must use `pb-24 md:pb-8`
- Hamburger menu in top navigation: Sign Out button lives inside the `overflow-y-auto` scrollable area (not fixed bottom) so it's always reachable on short viewports
- Mobile menu dialog has: `aria-labelledby` pointing at sr-only heading, Escape key handler, `overscroll-behavior:contain`, `focus-visible` ring on close

---

## Streamlining Pass (Apr 12, 2026)

Major redesign that removed ~2,500 lines net. Triggered by assessing that dashboards showed too much redundant data. 6 commits on main:

1. `e1c4c4f` — streamline all 3 dashboards
2. `b6c0980` — docs update (first pass)
3. `7ccd4aa` — wire up client cancel subscription button + delete 7 unused components
4. `6caf105` — fix CoachWorkloadPanel N+1 + make CoachCard clickable
5. `948b548` — audit findings (2nd pipeline nav bug, nested FK join, N+1 RPC regression, silent failures, systemic a11y gap)
6. `4a6ef84` — docs update (second pass)

**Audits run:** `web-design-guidelines` skill (Vercel Web Interface Guidelines) and `pr-review-toolkit:code-reviewer` agent in parallel. They caught issues the streamlining pass missed — including a critical bug on its second occurrence, a perf regression I introduced (N+1 RPC in `CoachCompensationSummary`), and a systemic a11y gap around clickable cards. **Recommendation: always run both audits after any dashboard redesign.**

---

## Dashboard Change Checklist

Before shipping any dashboard change, verify:

- [ ] Does the card link somewhere? If yes, is it using `<ClickableCard>` with an `ariaLabel`?
- [ ] Decorative icons have `aria-hidden="true"`?
- [ ] Does the layout stack to single column on mobile (`grid-cols-1 lg:grid-cols-2`)?
- [ ] Supabase mutations destructure `{ error }` and throw on failure?
- [ ] `useEffect` data fetches guarded with `hasFetched` ref (Phase 16 pattern)?
- [ ] No nested PostgREST FK joins on `client_programs`/`profiles` — separate queries (CLAUDE.md rule)?
- [ ] RPC loops parallelized with `Promise.all` instead of sequential `for`?
- [ ] `.single()` only on guaranteed rows — `.maybeSingle()` for optional?
- [ ] Numeric displays use `tabular-nums` for alignment?
- [ ] Icon-only buttons have `aria-label`?
- [ ] Run `web-design-guidelines` skill on the changed files
- [ ] Run `pr-review-toolkit:code-reviewer` agent on the commits
- [ ] Test on mobile viewport (390×844 iPhone baseline)

---

## Historical Context (Feb 2026 pre-launch)

Earlier launch plan targeted these improvements before the Feb 2026 launch:

- Client dashboard: Today's workout hero section ✅
- Coach dashboard: Needs attention alerts ✅
- All dashboards: Consistent quick actions grid ✅ (later removed in Apr 2026 as redundant with sidebar)
- Mobile responsive testing ✅

The launch layout had significant redundancy (three "Recent Activity" feeds in one place, quick action cards duplicating sidebar nav, etc.) which was streamlined in Apr 2026. Metrics, attention alerts, and mobile stacking all carried forward cleanly.

---

## New Components Added

| Component | Purpose | Used By |
|-----------|---------|---------|
| `ClickableCard` (`ui/clickable-card.tsx`) | Accessible wrapper for any clickable Card — keyboard handler, focus ring, aria-label | 5 dashboard cards |
| `TodaysWorkoutHero` | Client's primary workout CTA | Client dashboard |
| `NeedsAttentionAlerts` | Coach top-priority alerts | Coach dashboard |
| `AdminRequiresAttention` | Admin triage banner | Admin dashboard |
| `AdminMetricsCards` | 4-KPI clickable grid | Admin dashboard |
| `SystemHealthCard` | Admin health snapshot | Admin dashboard (promoted from dead code Apr 2026) |
| `ClientPipelineSection` | Admin client funnel + stuck clients | Admin dashboard (promoted from dead code Apr 2026) |
| `CoachOverviewStats` | Coach 3-card KPI row (inline in `CoachDashboardOverview`) | Coach dashboard |
| `CoachCompensationSummary` | Slim compensation card (inline in `CoachDashboardOverview`) | Coach dashboard |
