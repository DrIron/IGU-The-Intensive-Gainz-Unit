# Deload v2 — authored deload weeks + on-demand insert/shift

Decided 2026-06-28 (Hasan). Supersedes the substitute-in-place + coach-approval deload shipped
in `3284d0c` (`deloadAutoApply.ts`). A deload is now an **authored property of a week in the
planning board**, with two placement modes the coach toggles per deload week.

## Model

One deload week, authored in the board (real content, `is_deload = true`, a `deload_preset_id`).
The coach picks its **placement**:

- **Pinned at week X** — the deload runs automatically when the client reaches week X. It is part
  of the program length. Nothing replaces it; no shift. ("Week X is the deload — no replacements.")
  This is exactly today's `plan_weeks.is_deload` template flag, applied in place.
- **On-demand (floating)** — the deload week is **excluded from the running date sequence** and is
  instead **available to insert**. Either the **client or the coach** can toggle it on to replace
  the current week. The coach turning on-demand **off** collapses it back to *pinned at week X*.

## Confirmed behavior (Hasan, 2026-06-28)

- **Insert & shift.** Triggering an on-demand deload **inserts** a week at the client's current
  position and **pushes all later weeks out by one** (+7 days to every downstream session date).
  The program gets a week longer. Multiple on-demand deloads stack (cumulative shift).
- **Client applies directly.** The client can self-toggle an on-demand deload; it applies
  **immediately**, no coach approval. The coach is **notified**. The coach can also trigger it
  (from the board or the client overview). The old request → approve gate is removed for the
  on-demand path.

## Assumption flagged for veto

The inserted on-demand deload's **content = the authored deload week's content** (the same week the
coach designed). Inserting drops a copy of that week at the current position. (Alternative
considered and not chosen: synthesize a deload by applying the preset to the *displaced* week.)

## Data model

- `plan_weeks.deload_placement` — `NULL | 'pinned' | 'on_demand'` (only meaningful when
  `is_deload = true`). `pinned` = runs in place (current behavior). `on_demand` = the week is the
  insertable deload template and is skipped in the normal running sequence.
- New table `client_plan_inserted_deloads`:
  ```
  id, assignment_id (FK client_plan_assignment),
  position_week_index INT,        -- 1-based plan-week boundary where the deload was inserted
  source_plan_week_id UUID,       -- the on_demand deload week whose content runs
  preset_id TEXT NULL,
  inserted_by UUID,               -- client or coach user id
  created_at
  ```
  RLS: client-self + active care-team + admin read/write (same shape as `coach_client_messages`).
  RPC `insert_client_deload(p_assignment_id, p_position_week_index, p_source_plan_week_id, p_preset_id)`
  and `remove_client_deload(p_id)` — SECURITY DEFINER, REVOKE-all-from-anon, GRANT authenticated.

## Resolver / date changes (`canonicalSessionResolver.ts`, `boardDates.ts`, `deloadAutoApply.ts`)

The running sequence = `plan_weeks` where NOT (`is_deload` AND `deload_placement='on_demand'`),
ordered by `week_index`, with the assignment's `client_plan_inserted_deloads` spliced in at their
`position_week_index`. Then:

- `resolveWeekIndexForDate` and `boardDayDate`/`boardDayLabel` must compute the client's current
  week and every session date **against the spliced/shifted sequence** — each insert at or before a
  position adds 7 days. These are currently pure functions of `(start_date, weekIndex, dayIndex)`;
  they gain an `inserts: { position: number }[]` parameter (sorted), and callers thread it.
- An inserted position resolves to the **source deload week's content** (`source_plan_week_id`),
  not a `plan_weeks` row in the base sequence.
- A pinned deload week keeps the existing in-place `applyDeloadPreset` read-time reduction.

## UI

- **Board (coach):** per-week toggle to mark a week as deload + pick preset + choose placement
  (Pinned at this week / Available on-demand). The week tab already has a kebab (`⋮`) — surface it
  there and badge deload weeks in the column header.
- **Client:** a "Take a deload this week" control in the client's program / current-week view.
  Confirm dialog ("this adds a recovery week and pushes the rest of your plan out by a week"),
  then `insert_client_deload` at the current position → immediate, dates shift, coach notified.
- **Coach trigger:** same action from the board (on the client's current week) and from the Client
  Overview → Workouts. Plus the on-demand on/off placement toggle.
- **Notification:** coach notified when a client self-applies (reuse the message/notification
  plumbing; not the deload_requests approval panel).

## Reconcile with shipped work

- `deloadAutoApply.applyApprovedDeload` (substitute-in-place via week override) is **retired for the
  on-demand path** — replaced by `insert_client_deload` (insert + shift). The week-level
  `is_deload` override stays only as the mechanism for a pinned/template deload's read-time
  reduction.
- `useCoachDeloadRequests` / `DeloadRequestPanel` (request → approve) — drop the approval gate;
  repurpose any surface to a "client took a deload" notification feed, or remove.

## Build slices (terminal CC)

1. **Schema** — `plan_weeks.deload_placement`; `client_plan_inserted_deloads` + RLS;
   `insert_client_deload` / `remove_client_deload` RPCs (REVOKE/GRANT pattern). Regen types.
2. **Resolver + dates** — splice/shift in `resolveWeekIndexForDate`, `boardDayDate`/`boardDayLabel`,
   resolve inserted position → source deload week content. Unit tests for single/multiple inserts,
   date shift, pinned-vs-on-demand enumeration.
3. **Board authoring** — per-week deload toggle (mark + preset + placement) + column badge.
4. **Trigger UI** — client "Take a deload this week" (confirm + immediate) and coach trigger +
   placement on/off; coach notification on client self-apply.
5. **Reconcile** — retire `applyApprovedDeload` on-demand path; drop the approval gate.

Flag-gate behind the existing `igu_ff_board_v2` / `igu_ff_client_program_editor` family until
verified on the preview.
