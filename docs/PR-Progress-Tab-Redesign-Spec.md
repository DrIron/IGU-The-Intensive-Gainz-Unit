# PR — Coach client Progress tab redesign (metric-card summary + hero trend)

**Status:** Drop-in spec (2026-06-24, Cowork). **Priority / effort:** P2 / M. Mostly recomposition of existing charts + the shipped CC1 metric-card pattern. File: `src/components/client-overview/tabs/ProgressTab.tsx` (+ existing `CoachNutritionGraphs`, `VolumeChart`).

## The problem (verified live)
`ProgressTab` today just stacks `CoachNutritionGraphs` (phase-scoped weight/body-fat/circumference) over `VolumeChart` (client-scoped) — a raw chart dump with no at-a-glance summary and no shared visual language with the rest of the site. The numbers a coach scans first (current weight, body-fat, weekly volume + deltas) aren't surfaced; you have to read them off the chart.

## Target (approved mock)
1. **Summary header** — client avatar + name + phase/week subtitle + an `On track / Ahead / Behind / No data` status pill (same vocabulary + emerald rail as `NutritionPhaseCard`; derive from expected-vs-actual rate, reuse the phase status logic).
2. **Metric-card row** (the shipped **CC1** pattern — `label · timeframe · hero value · delta · sparkline`), 3 cards auto-fit: **Weight** (kg, Δ vs phase start, green when moving toward goal), **Body fat %** (Δ), **Weekly volume** (sets, Δ vs last week). Reuse the CC1 metric-card component (`feat/cc1-cc2-metric-card`, already adopted across charts) — do NOT hand-roll a new card.
3. **Hero "Weight trend" chart** — the existing weight graph from `CoachNutritionGraphs`: daily dots + weekly-avg line + adjustment flag markers, with the monospace `expected vs actual kg/wk` strip above it.
4. **Two-up below** — **Measurements** (circumference deltas, compact rows) + **Training volume** (per-muscle bars). Both already exist inside `CoachNutritionGraphs` / `VolumeChart`; just lay them side-by-side on desktop, stacked on mobile (`useIsMobile()` / auto-fit grid).
5. **No-phase empty state** stays (volume still renders), restyled to match.

## Build notes
- **Reuse, don't rebuild:** `CoachNutritionGraphs` (weight/body-fat/circumference, phase-scoped) and `VolumeChart` (client-scoped) already own the data + queries. The work is (a) the metric-card summary row, (b) the status header, (c) the layout regroup — display only, **no new queries/tables/RPCs**.
- **Metric values** come from the same sources the charts already read (`weight_logs`, `body_fat_logs`, `nutrition_adjustments`, volume hook). If a summary number needs the latest weigh-in and coach RLS hides it client-side, that's the **same coach-RLS weigh-in gap** flagged for the Overview/Nutrition tabs — depend on that follow-up ticket's SECURITY DEFINER read rather than re-querying `weight_logs` directly. Flag in the PR if a value comes back null for that reason.
- Keep `ProgressTab`'s `hasFetched` ref guard + `.maybeSingle()` phase fetch as-is.
- Color: weight/body-fat use the chart's existing ramps; volume bars purple (`c-purple` / `#534AB7`); deltas use `--color-text-success` toward-goal, `--color-text-secondary` neutral.

## Non-goals / guardrails
- Don't change the `ClientContext` contract or refetch identity.
- Don't reimplement BMR/macro math (not on this tab anyway).
- Don't add a new chart library — reuse what `CoachNutritionGraphs`/`VolumeChart` use.

## Verify
- `npx tsc --noEmit` + `npm run build` clean.
- Progress tab leads with the status header + 3 CC1 metric cards, then the weight-trend hero, then Measurements + Volume two-up; mobile stacks. Smoke via the +online test client (has an active phase + weight logs) and a no-phase client (volume only + empty state).
- Metric deltas point the right way for a cut (weight/BF down = green).
