# CL2 — Client dashboard visual polish (bring CL1 up to coach-grade language)

**Status:** Drop-in spec (2026-06-24, Cowork). **Priority / effort:** P2 / M. Visual/consistency pass — the IA from CL1 stays. Files: `src/components/client/ClientDashboardLayout.tsx` (the active branch + wrapper), `src/components/client/NewClientOverview.tsx`, and the cards it composes (`TodaysWorkoutHero`, `NutritionTargetsCard`, `WeeklyProgressCard`, `AdherenceSummaryCard`, `LogTodayCard`, `CoachCard`, `PlanBillingCard`).

## The problem
CL1 already nailed the **information architecture** — a single-column, importance-ranked stack (payment banner → alerts → today's workout hero → log-today → nutrition targets → weekly progress → adherence → coach → care team → quick actions → billing demoted). What's behind the coach side now is the **visual language**: flat dark surfaces, emerald status rails, CC1 metric/glance cards, rounded status pills, and the red/amber/blue macro ribbon. The client dashboard still uses a gradient background (`bg-gradient-to-br from-background via-background to-primary/5`) and generic `border-border/50` cards, so it reads as a different product from the coach surfaces and the (shipped) coach Nutrition tab.

## Target (approved mock — visual deltas, keep the IA)
1. **Flat surface.** Drop the `bg-gradient-to-br …` wrapper in `ClientDashboardLayout` (all branches) for the flat page background the coach shell uses. No gradients anywhere on the dashboard.
2. **Glance row (new, top of overview).** A compact CC1 metric-card row under the greeting: **Today** (session name, e.g. "Push A"), **Target** (kcal), **Check-ins** (`1/3 this wk`). Same `background:secondary`, `radius-md`, muted-label-over-value pattern as the coach Overview cards. Reuses data `NewClientOverview` already loads (`activePhase`, `weeklyLogsCount`, today's program day).
3. **Today's workout hero** → emerald `w-1`/`w-4` status rail + the barbell icon, session title, exercise/muscle/time line, and a single primary "Start workout" action (info-tinted). Same rail vocabulary as `NutritionPhaseCard` / coach Overview.
4. **Nutrition target card** → add the **MacroDistributionRibbon** (the red/amber/blue stacked bar with P/F/C gram labels) used on the coach Nutrition tab. Hero kcal number + macro grams in monospace. Reuse the existing ribbon component — don't rebuild.
5. **Status pills** everywhere (account status, plan, phase goal) → the rounded `999px` success/secondary/amber/danger pills, replacing shadcn `Badge` where it reads inconsistently. Use `statusUtils` for the status→variant mapping.
6. **Account group** stays demoted (billing under a quiet "Account" header) — just restyle `PlanBillingCard` to the muted secondary-surface row from the mock.

## Build notes
- **No IA change, no new queries/tables/RPCs.** Every value the glance row needs is already fetched in `NewClientOverview.loadDashboardData`.
- Reuse: `MacroDistributionRibbon`, the CC1 metric-card styling, `ClickableCard` (never `<Card onClick>`), the emerald-rail pattern.
- Keep the state-machine branches in `ClientDashboardLayout` (pending / medical-review / payment / suspended / cancelled / grace / hard-lock) — only swap their wrapper background + restyle the alert cards to match; don't touch the gating logic.
- Mobile is the primary client surface: single column already maps to mobile; keep `pb-24 md:pb-8`, `safe-area-bottom`, and `min-h-[44px]` touch targets. Verify on a narrow viewport.
- Keep the `hasFetched` ref guard + all the auth-race fixes in `NewClientOverview` / `Dashboard.tsx` untouched.

## Verify
- `npx tsc --noEmit` + `npm run build` clean.
- Active dashboard: flat bg, glance row, emerald workout hero, macro ribbon on the nutrition card, consistent pills, demoted Account group. Smoke via a test client (the +online/+complete accounts have an active phase) on both desktop and a narrow mobile viewport.
- The pending/payment/grace/cancelled branches still render and gate correctly with the new flat wrapper.
