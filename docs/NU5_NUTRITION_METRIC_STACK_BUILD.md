# NU5 — Client nutrition metric-card stack (weight / body-fat / adherence / steps, tap-to-expand)

**Status:** Build handoff (2026-07-07, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Board:** NU5 (Nutrition, P1). Frontend-only, no data-model change. Surface: the 1:1 client nutrition page `src/pages/ClientNutrition.tsx` (route `/nutrition-client`).

## What's there now / the gap
The trend area is a **2-metric toggle** (`Weight | Body fat`) above a single chart (`WeightProgressGraph` / `BodyFatProgressGraph`), with a `4W/12W/All` range control. Adherence + steps aren't surfaced as trends at all. NU5 = replace the toggle with a compact **4-metric card stack** — Weight, Body fat, Adherence, Steps — each showing the current value + a small trend signal, and **tapping a card expands its detail chart** below (accordion-style, one expanded at a time). Keep the `4W/12W/All` range control (applies to the expanded chart).

## Design
- **New component** `src/components/nutrition/NutritionMetricStack.tsx` (or inline in ClientNutrition if simpler): renders 4 `MetricCard`-style tiles in a responsive grid (2-up mobile, 4-up desktop). Reuse the existing `MetricCard` primitive (`src/components/ui/metric-card.tsx`, already used by the HX1/exercise-history cards — label + hero value + unit + delta chip + optional `spark` sparkline + interpretation line). Each tile:
  - **Weight** — latest avg-week weight (kg), delta vs previous week, sparkline of weekly avg. (Have: `weightLogs` grouped by `week_number`; `latestAverageWeight` + `latestActualChangePercent` already computed in ClientNutrition.)
  - **Body fat** — latest body-fat %, delta, sparkline. (Have: `weeklyProgress` = `{week_number, body_fat_percentage}` series.)
  - **Adherence** — this-phase adherence % (or this-week), from `adherence_logs` (already loaded in `loadActivePhase`, currently only used for the phase summary). Compute a simple % (on-point/mostly vs total) + a small trend.
  - **Steps** — recent avg daily steps + trend. **Needs a new fetch**: `step_logs` for the phase (`.eq('user_id').gte('log_date', phase.start_date)`), same pattern as the body-fat fetch. Reuse `StepProgressDisplay`/`AllPhasesStepsChart` for the expanded view if suitable.
- **Selection + expand:** clicking a tile sets `selectedMetric` (default `weight`); the selected tile is visually active (ring/emphasis), and its detail chart renders below the stack — reuse `WeightProgressGraph` (weight), `BodyFatProgressGraph` (body fat), and add lightweight trend charts for adherence + steps (reuse `AllPhasesStepsChart` / a simple line for adherence, or `StepProgressDisplay`). The `4W/12W/All` range control stays and filters the expanded chart's data (already wired for weight via `trendWeightLogs`; extend the same window filter to the other series).
- **Empty states:** a tile with no data shows "—" + a muted "Log X to see your trend" (match the existing chart empty-state copy). Tapping still works; the expanded area shows the empty state.
- Keep the surrounding layout: the left column (phase hero / weekly ribbon / log-today / message-coach link) is unchanged; NU5 only reshapes the right-column trend area (the toggle → the card stack + expandable chart).

## Data notes
- No schema change. Add one `step_logs` fetch to `loadActivePhase` (parallelize into the existing `Promise.all`). Everything else is already loaded.
- Keep the `hasFetched` ref guard + the "no nested PostgREST FK joins on subscriptions" rule (unaffected here).
- Weight/body-fat units: weight stays kg (canonical); match the page's existing display.

## Out of scope (note, don't build)
- The **team** nutrition surface (`TeamNutrition.tsx` / `/nutrition-team`) — a parallel follow-up if Hasan wants the same stack there (team weight is period-averaged, so the weight card differs slightly). This slice is the 1:1 page only.

## Verify (Cowork, prod, +online 1:1 client with an active phase)
- The nutrition page shows a 4-tile metric stack (Weight / Body fat / Adherence / Steps) with current values + trend where data exists; tiles with no data show the "—/log to see" empty state.
- Tapping a tile expands its chart below; only one expanded at a time; the active tile is visually marked; `4W/12W/All` filters the expanded chart.
- Weight + Body fat expanded charts match what the old toggle showed (no regression); Adherence + Steps show sensible trends.
- Mobile: 2-up tiles, chart reflows, no overflow behind the bottom nav (`pb-24`).
- tsc (~306 baseline zero-new), ESLint 0, build clean.
