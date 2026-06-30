# P5 Slice 3 — Deep coach workout analytics → canonical

**Status:** Build handoff (2026-06-30, Cowork). **Owner:** terminal. Cowork verifies on preview.
**Flag:** `board_v2` (same gate as Slices 1–2). Off in prod ⇒ legacy path unchanged, **byte-identical**.
**Depends on:** Slices 1–2 on `main` (Slice 1 merged `82a846f`; Slice 2 pending merge — its RLS policy `20260630061546` is **already applied to prod** and is a hard dependency of this slice). Reuses `resolveActiveAssignment`, `loadCanonicalSchedule`, `canonicalLastWorkoutAt`, and the canonical session/prescription primitives.
**Reads:** `docs/P5_SLICE2_OVERVIEW_VITALS_BUILD.md` + `docs/PROGRAM_SYSTEM_UNIFICATION.md` §P5.

## Why this is the hard one
Slices 1–2 were *thin* reads (today's card, last-workout-at, has-program). Slice 3 is the **analytics**: tonnage / PR / TUST / "needs eyes", the per-exercise set-log viewer, and per-module completion counts. These need **per-slot exercise + prescription + every set log**, which the canonical adapter does not yet expose (`loadCanonicalSchedule` gives only `exerciseCount` + `muscles`). So Slice 3 = **one new adapter aggregator** + migrating three coach surfaces onto it. The good news (see §"Why the helpers don't change"): the analytics engines themselves need **zero changes**.

## Scope

| # | Surface (legacy) | File | What it computes | Canonical source |
|---|---|---|---|---|
| 1 | `useWorkoutPulse` | `src/components/client-overview/workouts/useWorkoutPulse.ts` | tonnage, TUST, PRs, progression flags, "needs eyes", weekly adherence | new `loadCanonicalWorkoutLogs` + existing `prEngine`/`workoutFlags` |
| 2 | `useSessionLog` | `src/components/client-overview/workouts/useClientWorkouts.ts` (~451–549) | per-exercise set-log viewer for one session | `loadCanonicalWorkoutLogs` filtered to one `plan_session_id` |
| 3 | `useClientPrograms` counts + `useAdherencePulse` | same file (~136–188, ~211–301) | `completedModules`/`totalModules`/`lastActivityAt`; weekly scheduled/completed | `loadCanonicalSchedule` (already computes `module.status`) + `canonicalLastWorkoutAt` |

All gate inside their effects on `isBoardV2Enabled()` + `resolveActiveAssignment() != null` (these are ref-guarded `useState`/`useEffect`, NOT React Query — same mechanic as Slice 2). Flag off / no assignment → existing legacy path untouched.

**Out of scope:** `get_coach_roster_stats` RPC (server-side, its own follow-up — see §After). Coach drilldown grid (already canonical via `WorkoutsTab` + `canonicalDrilldownDays`). The client-side analytics (none — these are all coach surfaces).

> Suggested split: 3a = adapter + `useWorkoutPulse` (the bulk); 3b = `useSessionLog`; 3c = the counts. Land 3a first (the others reuse its primitive).

## 0. RLS audit (DONE — results below; decision required, maybe a small migration)

Slice 3 reads more canonical tables in **coach context** than Slice 2. Audited live 2026-06-30:

| Table | Read by | Coach-context coverage | Gap |
|---|---|---|---|
| `exercise_set_logs` (canonical) | pulse, session-log | admin / primary / team-coach / care-team ✓ (Slice 2 policy `20260630061546`) | none |
| `plan_slots`, `plan_sessions`, `plan_weeks` | aggregator joins, `loadCanonicalSchedule` | admin / primary / **team-coach** ✓ (active assignments only) | **care-team-only NOT covered** |
| `client_plan_inserted_deloads` | `loadCanonicalSchedule` (deload seq) | admin / primary / **care-team** ✓ | **team-coach-only NOT covered** |
| `exercise_library` | aggregator (name + **category**) | public read ✓ | none |

**So the primary-coach and admin paths are FULLY covered with no new migration** — that's the overwhelming majority of who uses these surfaces. Two narrow asymmetries remain for *edge viewers*:
- a **team-coach** (assigned via team, not primary, not on care team) can read `plan_*` but not `client_plan_inserted_deloads` → `loadCanonicalSchedule` would return the base sequence **without inserted deloads** (counts slightly off on deload weeks).
- a **care-team-only** viewer (e.g. a dietitian, not the coach) can read `exercise_set_logs` (Slice 2 granted it) but not `plan_*` → the aggregator's slot/exercise join returns empty → **partial null analytics**.

**Decision: (A) CHOSEN** (2026-06-30) — parity migration, built as part of 3a. Rationale: the team-coach gap is reachable (T3's roster drill-down opens a team member's full `/coach/clients/:id` Workouts → `loadCanonicalSchedule`, silently dropping inserted deloads from counts), and the uniform-read end-state is needed before the legacy drop regardless — (B) would just defer it behind a fragile fallback that breaks at cutover. It's small, additive, and the exact shape validated three times (T3, Slice 2).

Two additive policies (don't edit the existing `*_read_via_assignment` / `cpid_via_assignment`):

```sql
-- Care-team parity on plan_* (existing *_read_via_assignment covers primary/team-coach/admin
-- but not care-team-only viewers). has_active_coach_access_to_client = primary OR care-team,
-- so this adds care-team (primary overlap harmless). One per table.
CREATE POLICY plan_slots_read_care_team ON public.plan_slots
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.client_plan_assignment a
          WHERE a.plan_id = plan_slots.plan_id AND a.status = 'active'
            AND public.has_active_coach_access_to_client((select auth.uid()), a.client_id)));

CREATE POLICY plan_sessions_read_care_team ON public.plan_sessions
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.client_plan_assignment a
          WHERE a.plan_id = plan_sessions.plan_id AND a.status = 'active'
            AND public.has_active_coach_access_to_client((select auth.uid()), a.client_id)));

CREATE POLICY plan_weeks_read_care_team ON public.plan_weeks
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.client_plan_assignment a
          WHERE a.plan_id = plan_weeks.plan_id AND a.status = 'active'
            AND public.has_active_coach_access_to_client((select auth.uid()), a.client_id)));

-- Team-coach parity on inserted deloads (existing cpid_via_assignment covers client +
-- is_care_team_member_for_client[=admin/primary/care-team] but not team-coach-only).
CREATE POLICY cpid_read_team_coach ON public.client_plan_inserted_deloads
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.client_plan_assignment a
          JOIN public.coach_teams ct ON ct.id = a.team_id
          WHERE a.id = client_plan_inserted_deloads.assignment_id
            AND ct.coach_id = (select auth.uid())));
```

Verify each rolled-back (impersonation, before/after) exactly like Slice 2 §0. **Belt-and-suspenders (keep even with (A) in):** the hooks must detect "canonical assignment exists but the plan read returned empty" and fall back to legacy rather than render a misleading empty analytics panel — a silent partial-read should never surface as "0 tonnage / no history."

## The adapter extension — `loadCanonicalWorkoutLogs` (new, in `canonicalScheduleAdapter.ts`)

A **client-wide canonical log aggregator** — the one new primitive Slices-3 surfaces share. Reads canonical `exercise_set_logs`, joins `plan_slots` for exercise/section/grouping, and `exercise_library` for name + **category**.

```ts
export interface CanonicalLoggedSet {
  planSlotId: string;
  planSessionId: string;        // plan_slots.plan_session_id — the session-instance key
  exerciseId: string | null;
  exerciseName: string | null;
  category: string | null;      // exercise_library.category — prEngine/workoutFlags route on THIS
  section: string;              // plan_slots.section
  sortOrder: number;
  setIndex: number;
  // raw exercise_set_logs columns (same names the legacy RawLog uses):
  prescribed: Record<string, unknown> | null;   // per-set Rx snapshot (written at log time)
  performed_reps: number | null;
  performed_load: number | null;
  performed_rir: number | null;
  performed_rpe: number | null;
  performed_json: Record<string, unknown> | null; // activity extras (time/distance/pace/...)
  skipped: boolean;
  created_at: string;
}

/**
 * All canonical set logs for a client (across their active assignment's plan),
 * enriched with the plan_slot's exercise + the library category, ordered by
 * created_at asc. Empty array when there are no canonical logs. Coach-context
 * reads rely on the Slice-2 exercise_set_logs policy + plan_* read policies (§0).
 */
export async function loadCanonicalWorkoutLogs(
  clientId: string,
  assignmentId: string,
): Promise<CanonicalLoggedSet[]>
```

Implementation outline:
1. `exercise_set_logs` — select the full column set WHERE `assignment_id = assignmentId` (canonical rows have `client_module_exercise_id` NULL; the assignment filter is the canonical key and is what the Slice-2 RLS policy scopes on). Order `created_at asc`.
   - *Scope note (document it):* this is **active-assignment-only**. RLS on `plan_*` requires `status='active'`, so logs from a prior (inactive) assignment can't be slot-joined anyway. Legacy `useWorkoutPulse` read all-time by `created_by_user_id`; pre-launch no client has assignment history, so this is acceptable — **`log()`/comment the limitation** so the 6-week trend's edge (mid-window plan switch) isn't a silent gap later.
2. Collect `plan_slot_id`s → batch-read `plan_slots` (`id, plan_session_id, exercise_id, section, sort_order`).
3. Collect `exercise_id`s → batch-read `exercise_library` (`id, name, category`). **`category` is mandatory** — the analytics engines route on it (see below).
4. Join into `CanonicalLoggedSet[]`.

For the **session-log viewer** (#2) and **per-module counts** (#3), no extra adapter function is strictly needed — #2 filters `loadCanonicalWorkoutLogs` to one `planSessionId` and buckets by `planSlotId`→exercise (pull prescription detail from `plan_slots.prescription_json` via the existing `canonicalPrescription` helpers, or from each row's `prescribed`); #3 reuses `loadCanonicalSchedule` (which already computes `module.status==="completed"`) + `canonicalLastWorkoutAt`.

## Why the analytics helpers don't change (the load-bearing insight)
`prEngine.detectExercisePrs(category, …)` and `workoutFlags.progressionFlag({category, …})` consume `LoggedSet` + `Prescription`, and `useWorkoutPulse` builds those via `toLoggedSet(rawLog)` / `prescriptionFromLog(rawLog)` — **reading the Rx straight off `exercise_set_logs.prescribed`, not from any prescription table**. The canonical logger (`WorkoutSessionV2`) writes `prescription_snapshot_json` into `prescribed` in the **same `PrescriptionSnapshot` shape** (`rep_range_min/intensity_type/intensity_value/tempo`) that `prescriptionFromLog` already reads. So once `loadCanonicalWorkoutLogs` yields rows with the same field names + a real `category`, the existing engines work **unchanged**. Don't fork them.

Two things the canonical rows must carry for this to hold (verify in build):
- **`category`** — comes from `exercise_library.category` (the canonical reads currently fetch only `primary_muscle`; the aggregator MUST add `category`). For non-strength, `ruleGroupForCategory` also accepts the `activity_type` vocab (`yoga_mobility`/`recovery`/`sport_specific`) — fall back to `plan_sessions.activity_type` only if `category` is null.
- **session grouping** — legacy groups logs into session instances via `client_module_exercise_id → client_day_module_id`. Canonical: `plan_slot_id → plan_slots.plan_session_id`. The `(assignment_id, plan_slot_id, set_index)` UNIQUE constraint means each slot is logged at most once per assignment, so `plan_session_id` is a stable session-instance key (no week ambiguity); chronology comes from `created_at` (already present). Rebuild `byExercise`/`byModule` on `(exerciseId, planSessionId)`.

## Per-surface changes

### 1. `useWorkoutPulse` (the bulk)
- `const boardV2 = isBoardV2Enabled();` at the top of `load()`.
- `boardV2` branch: `const a = await resolveActiveAssignment(userId);` if `a`, `const logs = await loadCanonicalWorkoutLogs(userId, a.id);` and feed the **existing** tonnage/TUST/PR/flag pipeline — map `CanonicalLoggedSet` → the engine shapes the same way `toLoggedSet`/`prescriptionFromLog`/`tempoFromLog` do today (they already read the same field names; the only change is the source array + the `(exerciseId, planSessionId)` grouping key instead of `(exercise_id, client_day_module_id)`).
- **Weekly scheduled/adherence** (legacy stages 1–2b counting `client_day_modules` in the ISO week): replace with a count from `loadCanonicalSchedule(a.id).byDate` — scheduled = modules whose date is in the current week; completed = `module.status==="completed"`. (This is the `useAdherencePulse` weekly-count piece deferred from Slice 2 — do it here.)
- No assignment / `!boardV2` → existing 5-stage legacy `load()` unchanged.

### 2. `useSessionLog`
- Legacy signature is `useSessionLog(clientDayModuleId)`. The canonical session key is `(assignmentId, planSessionId)`. The consumer (the drilldown under `WorkoutsTab`) already has canonical context — its `canonicalDrilldownDays` modules carry `{ id: plan_session_id, canonical?:{assignmentId,date} }`. Thread the canonical identifiers to the viewer.
- board_v2 branch: `const logs = (await loadCanonicalWorkoutLogs(clientId, assignmentId)).filter(l => l.planSessionId === planSessionId);` bucket by `planSlotId` → `SessionLogEntry { exerciseName, section, sortOrder, sets: SetLogRow[], prescriptionSnapshotJson, instructions }`. `exerciseName`/`section`/`sortOrder`/`instructions` come from the slot join (extend the aggregator or do a small `plan_slots` read for `instructions`, which the pulse path doesn't need); `prescriptionSnapshotJson` from `plan_slots.prescription_json`. The `SetLogRow` fields (`performedLoad/Reps/Rir/Rpe/notes/setIndex/createdAt`) map 1:1 from `CanonicalLoggedSet`.
- Keep the return type `SessionLogEntry[]` identical so the viewer UI is untouched.

### 3. `useClientPrograms` counts + `useAdherencePulse`
- `useClientPrograms` builds `ClientProgramSummary[]` from legacy programs. board_v2 branch: synthesize ONE summary from the active assignment — `totalModules` = all modules in `loadCanonicalSchedule().byDate`, `completedModules` = those with `status==="completed"`, `lastActivityAt` = `canonicalLastWorkoutAt(a.id)`, `title` = plan name, `startDate` = assignment start. Keep the shape identical (drilldown + other consumers unchanged).
- `useAdherencePulse.lastWorkoutAt` → `canonicalLastWorkoutAt`; weekly counts as in #1 (or share a small helper).

## Build decisions (resolved — don't re-litigate)
- **One aggregator, reused** — `loadCanonicalWorkoutLogs`; don't write three bespoke canonical readers.
- **Engines unchanged** — `prEngine`/`workoutFlags` stay as-is; only the data source + grouping key change. If you find yourself editing them, stop — the row shape is wrong, fix the aggregator.
- **`category` is mandatory** in the aggregator's `exercise_library` read (engines route on it); `activity_type` is the non-strength fallback only.
- **Active-assignment scope** is accepted (RLS-bound); document the all-time-history limitation, don't silently swallow it.
- **Counts reuse `loadCanonicalSchedule`** — its `module.status` completion is the canonical analog; don't recompute completion.
- **Gate in-effect**, byte-identical when off (same as Slice 2).

## Guardrails
- Flag OFF ⇒ byte-identical legacy analytics.
- Don't fork `prEngine`/`workoutFlags`/the viewer UI — shape-match instead.
- §0: a viewer who can't read the canonical plan must **fall back to legacy**, never render empty canonical analytics.
- Destructure `{ error }` on every new read and surface it (RLS denials return empty silently — the whole point of this slice's RLS care).
- Don't drop legacy tables. Add ZERO new app-tsc errors (baseline 308).

## Verify (Cowork on preview, `board_v2` ON, `+online` seed)
- `tsc -p tsconfig.app.json` = 308 + `npm run build` clean; CI green.
- **Seed needs real logs** — the `+online` canonical assignment (`74349417…`) currently has **0 set logs**; log a few sets across ≥2 sessions under the canonical player so tonnage/PR/grouping have data.
- Coach `/coach/clients/<+online>` → Workouts: pulse numbers (tonnage, weekly adherence, PR/flag chips) populate from canonical logs and **read through as the coach** (RLS); per-session log viewer shows the logged sets with prescription; program card shows correct `completed/total`.
- Compare a known session's tonnage/PR against the canonical player's logged values (correctness, not just non-null).
- Flag OFF → byte-identical legacy analytics.
- If §0 option A shipped: rolled-back impersonation proof for each new policy (team-coach reads cpid; care-team reads plan_*), before/after, like Slice 2.

## After Slice 3
- **`get_coach_roster_stats` RPC** (server-side): the gated roster headline numbers (`adherence_pct`, `has_program`, `last_weigh_in`) still read legacy tables inside the SECURITY DEFINER function. Migrate the function body to the canonical model (its own slice — touches SQL, needs the same before/after impersonation proof).
- Once every A surface reads canonical under `board_v2`: default the flag ON + soak, then the P5 backfill (legacy snapshots → `plan_*`/`client_plan_assignment`) and finally drop the legacy `client_programs`/`client_program_days`/`client_day_modules`/`client_module_exercises` tables.
