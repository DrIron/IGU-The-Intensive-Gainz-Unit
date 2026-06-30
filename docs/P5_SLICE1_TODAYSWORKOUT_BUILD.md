# P5 Slice 1 — TodaysWorkoutHero + `useClientWorkoutsToday` → canonical

**Status:** Build handoff (2026-06-29, Cowork). **Owner:** terminal. Cowork verifies on preview.
**Flag:** `board_v2` (same gate as `WorkoutCalendar`). Off in prod ⇒ legacy path unchanged.
**Reads:** `docs/PROGRAM_SYSTEM_UNIFICATION.md` §P5 (the burn-down inventory + order). This is the FIRST P5 slice — the highest-priority A surface + its D hook.

**Why this first:** `TodaysWorkoutHero` (client "today's workout" card) reads the legacy deep-copy snapshot (`client_programs/_days/_day_modules`), which **never reflects an on-demand deload** (the snapshot is frozen; the deload inserts+shifts only in the canonical sequence). Migrating its hook to the canonical schedule fixes the stale-post-deload bug AND is the model for the rest of the A/D burn-down. Net order (doc §113): migrate D hooks → canonical (board_v2-gated) → A surfaces flip on → later default board_v2 on + soak → P5 backfill + drop legacy.

## The pattern to mirror — `WorkoutCalendar.tsx` (already migrated)
1. `const boardV2 = isBoardV2Enabled()` (`src/lib/featureFlags.ts`).
2. Resolve the client's active assignment once: `client_plan_assignment` where `client_id = user.id AND status='active'`, `order created_at desc, limit 1, maybeSingle` → `{ id, plan_id, start_date }`.
3. `loadCanonicalSchedule(assignment.id)` (`src/lib/canonicalScheduleAdapter.ts`) → `CanonicalSchedule { startDate, totalWeeks, weeks[], byDate: Map<iso, CanonicalScheduleDay> }`. Deload-aware (`buildRunningSequence` + `client_plan_inserted_deloads`).
4. `const useCanonical = boardV2 && !!schedule;` canonical wins, else fall back to legacy (`canonicalByDate ?? legacyByDate`).
5. Canonical nav target: `/client/workout/session/canonical?assignment=<id>&session=<plan_session_id>&date=<iso>`; legacy stays `/client/workout/session/<module_id>`.

## What to change

### 1. `src/hooks/useClientWorkoutsToday` (the D hook — do the branch HERE, keep the A surface thin)
Add a `board_v2` branch that returns the **same `TodayProgramResult` shape** the component already consumes, synthesized from the canonical schedule — so `TodaysWorkoutHero`'s rendering is largely untouched.

- When `isBoardV2Enabled()` AND an active `client_plan_assignment` exists:
  - `loadCanonicalSchedule(assignmentId)`; from `schedule.byDate`, synthesize the `client_program_days`-shaped array the component reads — at minimum **today** + the **next upcoming workout day** (the card renders today, a rest-day-with-upcoming preview, and an "up next" link, so it needs today + the next non-rest day). Each synthesized "day" = `{ id, title, day_index, date, client_day_modules: [...] }`; each module from `CanonicalScheduleModule` → `{ id: plan_session_id, title: canonicalSessionTitle(m), module_type, status, exercise_count: m.exerciseCount, isDeload: m.isDeload }`.
  - Carry a canonical nav marker so the component can build the canonical URL: add an optional `canonical?: { assignmentId, date }` to the module/day shape (mirror `WorkoutCalendar`'s `SessionModule.canonical`).
  - `programName` = `plan.name` (from the assignment's plan; the schedule load already has the plan — expose it, or do the existing `program_templates(title)` fallback only on the legacy branch).
- When flag off / no assignment / schedule null → existing legacy query unchanged (graceful fallback).
- Keep the React Query cache key distinct per path or include a `boardV2` discriminator so toggling the flag doesn't serve a stale legacy cache. Keep `refetchOnWindowFocus`.
- **The shape-mapping is the main work** — get the `client_day_modules` completion `status` right: canonical `m.status` is `"completed"` (all slots logged) or `""`; map to whatever the card's progress bar expects (it counts modules with `status==='completed'`).

### 2. `src/components/client/TodaysWorkoutHero.tsx` (the A surface — minimal)
- **Navigation:** if a module carries the `canonical` marker, `navigate(\`/client/workout/session/canonical?assignment=${canonical.assignmentId}&session=${moduleId}&date=${canonical.date}\`)`; else the existing legacy `/client/workout/session/<id>`.
- **Deload badge:** render a "Recovery" badge when today's day `isDeload` (the legacy card has none — this is the visible payoff that today's card now reflects a deload). Mirror `WorkoutCalendar`'s deload styling.
- No other render changes if the hook returns the existing shape.

### 3. Optional but recommended — shared assignment resolver
The active-assignment query is now duplicated across `WorkoutCalendar`, `WorkoutsTab`, and (with this slice) `useClientWorkoutsToday`, and the remaining P5 A surfaces (`OverviewTab`, `NewClientOverview`) will need it too. Add one tiny helper — `resolveActiveAssignment(clientId): Promise<{ id, plan_id, start_date } | null>` (in `canonicalScheduleAdapter.ts` or a small lib) — and use it here. Keeps the next slices from re-duplicating. (Don't refactor the existing callers in this slice — just introduce it and adopt it for the new code; migrate the others opportunistically.)

## Build decisions (resolved — don't re-litigate)
- **Use `loadCanonicalSchedule` (schedule adapter), not `resolveCanonicalSession`** — it gives today + upcoming in one load (the card needs the up-next preview) and matches `WorkoutCalendar`. `canonical_session_read` is NOT needed here (that's logging-only); gate on **`board_v2`** only.
- **Render the deload/Recovery badge** — it's the user-visible point of the migration.
- **Branch inside the hook**, keep the component shape — lowest-risk, and it's literally the "migrate the D hook so the A surface flips on" step.

## Guardrails
- Flag OFF ⇒ byte-identical legacy behavior (the canonical branch must be fully behind `isBoardV2Enabled()`).
- Don't touch the legacy query path (other surfaces still use the hook's siblings `useClientWorkoutsMonth`/`Week` — out of scope here, but don't break them).
- `client_plan_inserted_deloads` is the deload sequence — `loadCanonicalSchedule` already handles it; don't reimplement date math.
- Don't drop any legacy table (that's the P5 backfill phase, much later).

## Verify (Cowork on preview, `board_v2` ON)
- `tsc -p tsconfig.app.json` (308 baseline) + `npm run build` clean; CI green.
- With `board_v2` ON and a client with a canonical assignment: today's card matches the canonical schedule for today (title, module/exercise counts, completion), and tapping it opens the canonical session (`?assignment=...`).
- **The headline proof — deload no longer goes stale:** insert an on-demand deload (the Slice-4 client "take a deload" path) so the running sequence shifts; the card's "today" must reflect the shifted/Recovery week (legacy would show the pre-deload snapshot). Render the Recovery badge on a deload day.
- Flag OFF: card is byte-identical to today (legacy).
- Smoke the `+online` test client (4331fa4f) — it has a seeded program; assign a canonical plan / seed an assignment if needed to exercise the canonical branch.

## After this slice
Next A/D pairs (same pattern): `OverviewTab` "last workout" + `NewClientOverview` program count/hero, then their shared D hooks (coach `useClientWorkouts`, `useWorkoutPulse`, `useClientVitals`, `useExerciseHistory`, `useVolumeTracking`). Once all A surfaces read canonical under `board_v2`, default the flag on + soak, then the P5 backfill (legacy snapshots → `plan_*`/`client_plan_assignment`) + drop legacy tables. This slice establishes the hook-branch + shared-resolver pattern the rest reuse.
