# Nutrition tab redesign — coach client view (notes 2026-06-26)

Follow-on to B2 (decision-first nutrition). Hasan's feedback: the tab works but
doesn't surface its features to coaches well, and several components hog a full
card when they should be compact / combined. Build as a focused pass after the
RD3 card restyle. Apply the Direction-3 language (MetricCard, compact graphs,
inline density) here too.

## Items

- **N1 — Steps + Weight as a compact two-up row.** `StepProgressDisplay` does
  not need a full card; make it a small trend graph (trend line + an average
  figure). The weight graph (`PhaseWeightTrendCard`) also takes more room than it
  needs. Put the two side-by-side in one row (compact graphs), stacked on mobile.

- **N2 — History: longer-duration graphs with phase markers.** In the History
  inner tab, widen the time window and annotate the graphs with markers where
  nutrition phases start/end (and ideally goal changes), so a coach can read the
  whole journey across phases, not just the current one.

- **N3 — Diet break + refeed: compact, pulled up to the phase card.**
  `DietBreakManager` + `RefeedDayScheduler` should NOT each be a full card. Make
  them compact controls/pills near the phase hero / decision card (the "This
  week" management cluster), not two big stacked cards lower down.

- **N4 — Scheduled events -> a real nutrition calendar.** `ScheduledEventsCalendar`
  becomes a proper nutrition calendar: show the phases (as ranges/bands), plus
  planned AND past diet breaks and refeed days, on a week/month view. (Implementer's
  choice on the exact visual — band the phase, mark break/refeed days.)

- **N5 — Adjustment area must surface when nutrition isn't tracking.** CONFIRMED
  present: the B2 "This week's decision" card (CoachNutritionProgress
  variant="decision" + recommendWeeklyAdjustment) recommends a +/-kcal change when
  actual vs expected diverges, with Approve/Adjust/Diet break. Fires only with an
  active phase + 3+ weigh-ins that week + a real deviation; else shows the calm
  "waiting" state. No build needed -- just verify it reads well once data exists.

- **N6 — Feature visibility.** Overall, make the tab communicate what a coach can
  DO (adjust, schedule breaks/refeeds, set steps, link content) more clearly,
  rather than burying actions in stacked cards.

## Current components (what each is today)

- `NutritionTab.tsx` — shell: decision hero (active phase) -> phase hero ->
  tabs This week / History / Edit phase.
- This week: `NutritionCheckInCard`, `PhaseWeightTrendCard`, `StepProgressDisplay`,
  `ScheduledEventsCalendar`, `DietBreakManager`, `RefeedDayScheduler`.
- History: `CoachNutritionGraphs` (weight/body-fat/circumference, phase-scoped),
  `CoachNutritionProgress` (full week grid), `CoachNutritionNotes`.
- Edit phase: `CoachNutritionGoal` (form), `StepRecommendationCard`,
  `LinkedContentList`.
