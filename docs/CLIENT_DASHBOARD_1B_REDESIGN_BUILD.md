# Client dashboard redesign — consolidate to 6 feature cards (1B)

Rework `NewClientOverview.tsx` from ~11 overlapping cards into 6 feature cards, each leading
with its headline stat + one primary action, ordered by daily importance, mobile-first. One
shared dashboard (team + 1:1) that degrades per plan. Mock approved by Hasan 2026-07-17.

Design goals (Hasan): declutter/hierarchy, visual refresh, rebalance what's surfaced, mobile
order, "proper organisation of what's important, easy access to features with their most
important info, quick actions where appropriate."

## Grounding (verified against main 2026-07-17)
- Dashboard body: `src/components/client/NewClientOverview.tsx` (rendered for both team + 1:1 by
  `ClientDashboardLayout.tsx:478,516`). `OverviewSection` at `ClientDashboardLayout.tsx:649` is
  DEAD (never called; the admin layout has its own) — out of scope, leave it.
- Consumer check (grep): `NutritionTargetsCard` is ALSO used by `NutritionProgress.tsx` (team
  nutrition page) — KEEP the component, only unwire from the dashboard. `WeeklyProgressCard`,
  `AdherenceSummaryCard`, `CoachCard`, `WeekConsistencyDots` are dashboard-only — safe to retire.
- Hooks that already exist and carry the data (reuse, don't reimplement):
  - `useCanonicalWeeklyAdherence(userId)` → `{ weeklyCompletionPct, weeklyCompleted, weeklyScheduled, modules }`.
  - `useWeeklyConsistency(userId)` → `{ loading, weekDates, activeDates, activeCount }`.
  - `useFoodLog(clientUserId, today)` → `{ totals, target, loading, loadError, reload }` (TodayFoodCard).
  - Weight trend + nutrition-days-this-week: the reads live in `WeeklyProgressCard.tsx`
    (`weight_logs`, Mon–Sun window, 14-day `calculateRollingAverage`) — lift them into the new card.
  - Coach WhatsApp: `get_coach_whatsapp_for_client` RPC (in `CoachCard.tsx`).

## New order
**Mobile (single column):** PaymentAttentionBanner → AlertsCard → Today's workout (hero) →
Today's nutrition → Log today → This week → Your team → Explore → Account.

**Desktop:** Banner → Alerts → hero (full width) → 2-col grid `[1.6fr_1fr]` — main: Today's
nutrition, This week; rail: Log today, Your team → Explore (full width) → Account.

## Card changes

### Keep as-is
- **Today's workout** — `TodaysWorkoutHero` (the dominant hero, correct).
- **Log today** — `LogTodayCard`, unchanged; place top of the desktop rail / high in the mobile
  stack (Hasan: own card, high up).
- **Explore** — `QuickActionsGrid`, unchanged, under a new `Explore` section heading
  (`text-sm font-semibold text-muted-foreground`, mirrors the existing Account heading).
- **Account** — `PlanBillingCard`, unchanged (already demoted).
- **Banners** — `PaymentAttentionBanner` + `AlertsCard`, unchanged, top.

### Today's nutrition (absorb NutritionTargetsCard)
- Dashboard already renders `TodayFoodCard` (intake-vs-target donut → `/nutrition-diary`). It
  now IS the nutrition card. **Remove `NutritionTargetsCard` from the dashboard** (its target is
  already in the donut). Keep the component + its import in `NutritionProgress.tsx`.
- Small add (recommended): surface the goal-type pill (Fat loss / Muscle gain / Maintenance) on
  `TodayFoodCard`. `useFoodLog` already calls `getActiveNutritionTarget` internally (which returns
  `goalType`) but maps it away — expose `goalType` from the hook and render a small
  `bg-accent`/`text-accent` pill in the card header. If it balloons scope, skip it.

### This week (NEW — merge WeeklyProgressCard + AdherenceSummaryCard + WeekConsistencyDots)
- New component `src/components/client/ThisWeekCard.tsx`, a `ClickableCard` →
  `/client/workout/history`. Composes the existing hooks — do not re-query from scratch:
  - Headline: `weeklyCompletionPct` big % (keep AdherenceSummaryCard's green/amber/red color
    thresholds), label "adherence".
  - The 7 Mon→Sun consistency dots from `useWeeklyConsistency` (crimson filled = trained,
    neutral outline = not).
  - A stat row: `Workouts {weeklyCompleted}/{weeklyScheduled}` · `Nutrition {daysLogged}/7` ·
    `Weight {↑/↓/–}{Δkg}` (weight trend only when a real 14-day trend exists).
- HONESTY (carry the existing guards — do not regress):
  - Suppress the 0% headline ring when no workouts are scheduled this week; show
    AdherenceSummaryCard's empty copy instead ("No workouts scheduled this week yet").
  - Consistency dots render nothing while loading / on read error — never a fabricated empty week.
  - Weight trend hidden when the window has no real weigh-in.
- Then **remove `WeeklyProgressCard`, `AdherenceSummaryCard`, and the `WeeklyConsistencyRow`
  wrapper + `WeekConsistencyDots`** from the dashboard.

### Your team (merge CoachCard into MyCareTeamCard)
- `MyCareTeamCard` already renders the primary coach + specialists. Fold in `CoachCard`'s primary
  action: a **Message** button on the primary-coach row — WhatsApp deep-link via
  `get_coach_whatsapp_for_client` when a number exists, else the existing "your coach will reach
  out" note. Retitle the card **"Your team"**.
- Remove the standalone `CoachCard` from the dashboard. (Keep the WhatsApp copy/behavior identical
  — it's a move, not a rewrite.)
- Degrade per plan: a team member with no assigned specialists still shows the primary coach (or,
  if none, the card's existing empty state) — no fabricated rows.

### Retire (dashboard-only — delete component + test + barrel export in `components/client/index.ts`)
`WeeklyProgressCard`, `AdherenceSummaryCard`, `CoachCard`, `WeekConsistencyDots` +
`WeeklyConsistencyRow` (the inline wrapper in NewClientOverview). Confirm zero other consumers by
grep before deleting; if any surfaces, unwire-only instead. Do NOT delete `NutritionTargetsCard`
(team page uses it) or the shared hooks (`useCanonicalWeeklyAdherence`, `useWeeklyConsistency` —
now consumed by `ThisWeekCard`).

## NewClientOverview layout sketch
```
PaymentAttentionBanner
AlertsCard
{programCount===0 ? "coach preparing program" ClickableCard : <TodaysWorkoutHero/>}
grid [1.6fr_1fr] (lg):
  main:  <TodayFoodCard/>            <ThisWeekCard/>
  rail:  <LogTodayCard/>             <YourTeamCard/>   (MyCareTeamCard retitled + coach message)
<section Explore>  <QuickActionsGrid/>
<section Account>  <PlanBillingCard/>
```
(Single column on mobile in the order under "New order" above.)

## Conventions / guards
- `ClickableCard` for any nav card (never `<Card onClick>`); required `ariaLabel`.
- Destructure `{ error }` + throw on any new Supabase call; `.maybeSingle()` for optional rows.
- Flat IGU system: crimson `font-display` numbers, JetBrains Mono labels, flat cards (12px
  radius, no shadow, weight ≤500), `status-*`/semantic tokens. Must work in light + dark.
- Match the files' existing plain-string convention (no `t()` today); Arabic rides CC11-b.
- `--` never `—`.

## Tests
- `ThisWeekCard.test.tsx`: renders adherence % + dots + stat row from mocked hooks; NO 0% ring
  when zero scheduled (assert the empty copy, assert the big % is absent); dots absent on
  loading/error (no fabricated week); weight-trend row hidden with no weigh-in.
- `MyCareTeamCard` (now "Your team"): Message button present with a WhatsApp number, falls back to
  the note without one; no specialist rows when none assigned.
- `NewClientOverview`: the retired cards no longer render (assert their distinctive text/testids
  absent); the 6-card set renders for an active client.
- Update/remove the deleted components' test files.

## Verify
- `tsc -p tsconfig.app.json --noEmit` → zero NEW errors vs the 292 baseline (root `tsc` is a no-op).
- Vitest new/updated green; confirm CI green (supabase-env false-green trap).
- Live smoke (after deploy, Hasan signs in), desktop + mobile:
  - `+online` (1:1): 6-card dashboard in the new order; This week shows adherence/dots/stats;
    Your team shows coach + Message; nutrition card intact; no duplicate/removed cards.
  - Team client: same layout degrades — self-set (or absent) nutrition target, team-appropriate
    Your team, no crashes. Confirm the empty/honesty states (0 scheduled → no 0% ring).

## Notes
- This is a larger PR than 1A (new card + two merges + deletions). If CC prefers, it can land in
  two commits (1: ThisWeekCard + nutrition/consistency consolidation; 2: Your team merge +
  retire/cleanup) — but one reviewed commit is fine.
