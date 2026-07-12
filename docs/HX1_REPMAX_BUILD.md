# HX1 — Replace Estimated-1RM with actual logged rep-maxes (+ canonical-read migration)

**Status:** Build handoff (2026-07-05, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Why:** (1) The "Estimated 1RM" card uses the Epley formula — violates Hasan's standing NO-e1RM rule (per-lift detail = actual logged numbers only). (2) The two surfaces that render it read `exercise_set_logs` via a `client_module_exercises!inner` PostgREST embed — a **dead path post-P5/B1**: canonical logs write `client_module_exercise_id = null` (since D3, ~Jul 1) so the inner-join returns nothing, and **B1 dropped that FK entirely** so the embed now errors ("Error loading history"). So this slice is a canonical-read migration **and** an e1RM→rep-max swap in one.

**Client-only.** Coaches never saw e1RM. Two near-identical twin files render it.

## Chosen design (Hasan 2026-07-05): "best-load-at-a-rep" trend
Headline metric = the heaviest **load actually logged at a chosen rep count**, trended across sessions. No estimation. Plus an all-time rep-max breakdown (best load per rep count) for context, and a rep-bracket selector to beat sparseness.

## Files
1. `src/pages/client/ExerciseHistory.tsx` — full page (note: route `/client/workout/history` now redirects to `/client/workout/calendar?tab=history`, so the PANEL below is the live surface; keep this file in sync or confirm it's still mounted).
2. `src/components/workouts/ExerciseHistoryPanel.tsx` — **the live surface** (mounted in `WorkoutCalendar.tsx:292`, `/client/workout/calendar?tab=history`). Identical query + analysis logic to (1).
3. `src/lib/interpret.ts` (+ `src/lib/interpret.test.ts`) — replace `interpretE1rmTrend`.
4. `src/pages/client/WorkoutSessionV2.tsx` — remove the **dead** `epley1RM` import (line ~93) + fix the stale comment (~2622); PRs already use `classifySetPr` (rep-max), no functional change.
5. `src/lib/oneRepMax.ts` — **DELETE** after confirming no remaining caller (grep `epley1RM` / `oneRepMax` — should be empty once 1/2/4 are done).
6. **Recommended:** extract the shared canonical-fetch + rep-max analysis into ONE hook so the twins stop drifting. There's already `src/hooks/useExerciseHistory.ts` — check if it can back both; otherwise add `useExerciseStrengthHistory(exerciseId)`.

## A. Canonical read migration (both twin files)
Both the **exercise picker** (`loadExercises`) and the **per-exercise logs** (`loadExerciseLogs`) currently use the dead `client_module_exercises!inner` embed. Replace with the plan_slot pattern (there is NO FK `exercise_set_logs.plan_slot_id → plan_slots`, so resolve in memory with two `in()` reads — see `useVolumeTracking.ts:46-92` and `canonicalSessionResolver.loadCrossInstanceHistory` for the exact idiom):

- **Picker** = distinct movements the client has canonical logs for: read `exercise_set_logs` (`created_by_user_id = user.id`, `plan_slot_id not null`) → distinct `plan_slot_id` → `plan_slots(id, exercise_id)` → `exercise_library(id, name)`; dedupe by exercise_id; sort by name.
- **Per-exercise logs** = reuse `loadCrossInstanceHistory(user.id, [selectedExercise])` from `src/lib/canonicalSessionResolver.ts` → returns `Map<exerciseId, {plan_slot_id, set_index, performed_load, performed_reps, performed_rir, performed_rpe, created_at}[]>`. Take the array for `selectedExercise`. **Session date = `created_at`'s date** (canonical has no `client_program_days.date`; group by `YYYY-MM-DD` of `created_at`).
- Keep the existing `selectWithRetry` + toast error handling. Delete the old embed queries entirely.

## B. Analysis — replace e1RM with rep-max (both files, the `useMemo`)
Drop `bestE1rm`/`e1rmSeries`/`latestE1rm`/`e1rmDelta`/`prE1rm`. Compute instead:
- `bestLoadAtReps: Map<reps, number>` — all-time heaviest load at each exact rep count (for the breakdown row). Reuse `prEngine.buildExerciseHistory(...).bestLoadAtReps` if it takes these rows cleanly; else inline `maxInto`.
- `sessionsByRep: Map<reps, {date, bestLoad}[]>` — per rep count, per session (date), the max `performed_load` logged **at that exact rep count**.
- `headlineReps` = the rep count with the most **distinct sessions** in `sessionsByRep` (densest bracket). Tiebreak: more sessions → then lower rep count (heavier/"stronger" bias).
- `series` = `sessionsByRep.get(headlineReps)` sorted by date → `bestLoad` per session (the sparkline). `latest` = last, `delta` = last − first (1-decimal).
- Keep `prTopLoad` (heaviest set) + `prVolume` (best volume) tiles — concrete, no estimation. **Remove the "Best est. 1RM" tile.**

## C. UI (both files)
- `MetricCard` label → `Best load @ {headlineReps} reps` (unit `kg`), `timeframe="last N sessions"`, `value=latest`, `delta`, `spark=series` (if ≥2 sessions), `interpretation=interpretRepMaxTrend(delta, sessionCount, headlineReps)`.
- **Rep-bracket selector** (mitigates Option-B sparseness): a small row of chips of the available rep counts in `sessionsByRep`; clicking switches `headlineReps` (local state, default = densest). Include it — it's the reason Option B is viable when rep counts vary.
- **Rep-max breakdown**: render `bestLoadAtReps` as a compact inline list, e.g. `Rep maxes — 1:100 · 3:92.5 · 5:85 · 8:75 kg`. This is the literal "actual logged rep-maxes (best load per rep count)."
- Empty/low-data: if `series.length < 2`, hide the sparkline (MetricCard already does) and show the interpret copy prompting another logged set.

## D. interpret.ts
Replace `interpretE1rmTrend(deltaKg, sessions)` → `interpretRepMaxTrend(deltaKg, sessions, reps)`. Same thresholds (±0.5 kg) and tones; copy:
- ≥ +0.5: `on_track` / "Getting stronger" / `Best load at ${reps} reps up ${mag} kg over ${sessions} sessions.`
- ≤ −0.5: `attention` / "Dipped" / `Best load at ${reps} reps down ${mag} kg over ${sessions} sessions -- could be fatigue or a deload.`
- else: `neutral` / "Holding" / `Best load at ${reps} reps steady over ${sessions} sessions.`
- `<2` sessions: `neutral` / "" / `Log another set at ${reps} reps to see your strength trend.`
Update `interpret.test.ts` (rename cases; assert the new copy). Use `--` not em-dash in copy.

## Verify (Cowork, on prod after merge)
- **Client** (+online, `/client/workout/calendar?tab=history`): picker lists logged exercises (canonical — currently broken/empty); pick one → card reads "Best load @ N reps" with sparkline + rep-max breakdown + rep-bracket chips; **NO "Estimated 1RM" / "est. 1RM" anywhere**; switching rep chip re-trends; log a set at a rep count → reflects on reload.
- **No regression**: no "Error loading history" toast; console clean.
- **Grep**: zero `epley1RM` / `oneRepMax` / `Estimated 1RM` / `e1rm` remaining in `src/` (except migrations/history); `src/lib/oneRepMax.ts` deleted.
- tsc (`~306` baseline, zero new), ESLint, build clean.
