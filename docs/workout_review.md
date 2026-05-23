# Workout Pipeline Review — May 2026

End-to-end audit of the workout feature stack from planning board → program creation → assignment → client viewing → logging → coach feedback loop. Covers correctness, UX, and feature completeness. Includes RLS and edge-function depth.

Scope verified against `CLAUDE.md` rules. Findings cite `path:line` where possible.

---

## 0. Pipeline at a Glance

```
Coach Planning Board (muscle_program_templates.slot_config JSONB)
        │  ConvertToProgram.tsx → convert_muscle_plan_to_program_v2 RPC
        ▼
program_templates / program_template_days / day_modules / module_exercises / exercise_prescriptions
        │  AssignProgramDialog | AssignTeamProgramDialog → assign_program_to_client RPC
        ▼
client_programs / client_program_days / client_day_modules / client_module_exercises  (per-user snapshot)
        │  +  direct_calendar_sessions / direct_session_exercises  (ad-hoc, off-template)
        ▼
Client: TodaysWorkoutHero, WorkoutCalendar  →  /client/workout/session/:moduleId  →  WorkoutSessionV2
        ▼
exercise_set_logs  (per-set V2 logs)  +  client_day_modules.status='completed'
        ▼
Coach: WorkoutAdherencePulse, SessionLogViewer, VolumeChart  +  send-weekly-coach-digest  +  process-inactive-client-alerts
```

Two parallel coach authoring paths exist: the **Muscle Builder** (planning board → v2 RPC, the primary path) and the **Direct Calendar** (`DirectClientCalendar.tsx` + `direct_calendar_sessions`, ad-hoc per-client off-template). They land in different tables and don't share code.

---

## 1. Planning Board / Muscle Builder

### What works
- **Multi-week state model** in `src/types/muscle-builder.ts` is clean: `MusclePlanState.weeks[]` with `currentWeekIndex`; each `WeekData` has its own `slots[]` and `sessions[]`. `useMuscleBuilderState.deepCloneWeek()` (≈L176-197) regenerates session and slot IDs on duplicate via `sessionIdRemap` — no identity sharing.
- **Sessions model** (Apr 19 refactor) is consistent: `SessionData = { id, dayIndex, name?, type, sortOrder }`; every slot carries a `sessionId`; `migrateSlotsToSessions()` wraps legacy plans in one auto-session per `(dayIndex, type)` on load. `ensureSessionForDay()` is the find-or-create helper for legacy drops.
- **Droppable id format** is `session-${uuid}`. Drag actions: `REORDER_IN_SESSION` (same session), `MOVE_SLOT_TO_SESSION` (cross-session). Legacy `REORDER` / `MOVE_MUSCLE` actions still exist but no UI path triggers them.
- **Add-picker** (`SessionAddPicker.tsx`) is correctly the single source: `compact` for the desktop popover, `roomy` for the mobile drawer; carries `recentMuscleIds` and `placementCounts` from the parent. The right-rail palette and tablet "Muscles" Sheet were removed when this shipped (per `CLAUDE.md`); confirmed no parallel inline picker.

### Risks / gaps
- **Studio mode** (`muscle-builder/studio/StudioDayColumn.tsx`, `StudioRestDay.tsx`, etc.) is a second rendering path I could not trace to a route in `App.tsx` or `routeConfig.ts`. `src/pages/coach/StudioPreview.tsx` exists. **Action:** confirm this is shipped or behind an admin flag — if it diverges from the main builder, the two will drift.
- **Autosave debounce timing** is referenced in `SaveStatusBadge.tsx` (≈L21 "2-second debounce") but the actual debounce orchestration lives in the parent. Worth a single comment at the call site stating the interval, since this is a "lost work on tab close" failure mode if the user closes within the debounce window.
- **Mobile drag/drop** was not deeply audited; `MobileDayDetail.tsx` uses sessions-as-sections, but the @hello-pangea/dnd integration here has had past glitches around drag handles vs. tap targets — re-test on iOS Safari.
- **Bug to fix later:** the user has a memory file (`memory/project_igu_drift_cleanup.md`) noting two scratch folders at IGU project root with superseded muscle-builder migrations and a known triceps execution-cue bug — surface this once that area gets reopened.

---

## 2. Program Creation & Muscle-Plan → Program Conversion

### What works
- **v2 RPC contract** (`supabase/migrations/20260419100000_convert_rpc_v2_sessions.sql:13-22`): `convert_muscle_plan_to_program_v2(p_coach_id, p_plan_name, p_plan_description, p_muscle_template_id, p_sessions JSONB)` → `{ program_id, total_days, total_modules, session_to_module: {sessionId → day_module_id} }`. SECURITY DEFINER, `SET search_path = public`, returns JSONB — matches the project RPC convention from `CLAUDE.md`.
- **One day_module per session** (not per slot): grouping by `dayIndex` at L48-55, day title is `string_agg(... ' + ')` of session names or capitalized types — sensible default UI text.
- **`yoga_mobility → 'mobility'`** session_type collapse is correct (matches the existing enum elsewhere).
- **Client-side fan-out** in `ConvertToProgram.tsx` reads `session_to_module`, batch-inserts `module_exercises` (one per strength slot under the right module), with auto-fill from `exercise_library` via `MUSCLE_TO_EXERCISE_FILTER` when `slot.exercise` is missing. Non-strength sessions stay module-only (matches `CLAUDE.md`).

### Risks / gaps
- **Partial-success window** (`ConvertToProgram.tsx` ≈L166-240): if the RPC succeeds (program created, `session_to_module` returned) but the subsequent `module_exercises` / `exercise_prescriptions` batch inserts fail, the user sees an error toast but the program exists in an orphaned half-built state. No transaction wrapper, no cleanup. **Recommendation:** either wrap the post-RPC inserts in a single follow-up RPC that runs inside the same transaction, or detect partial-success and delete the orphan program on error.
- **Column presets not applied during conversion.** `coach_column_presets` and `get_default_column_config()` exist (migration `20260205_workout_builder_phase1.sql`) but `convert_muscle_plan_to_program_v2` doesn't read them. New prescriptions get hardcoded defaults instead of the coach's saved preset. Cheap fix: have `ConvertToProgram.tsx` look up the coach's default preset and pass it into the per-prescription insert.
- **Legacy v1 RPC** (`20260215100000_convert_muscle_plan_rpc.sql`) still in DB. No live caller. Drop in a follow-up migration once v2 has soaked.
- **`WorkoutBuilderQA` admin page** (`src/pages/admin/WorkoutBuilderQA.tsx`) — confirm it still exercises v2; if it still hits v1 it's silently testing dead code.

---

## 3. Program Assignment & Publishing

### What works
- **Single-client path** (`AssignProgramDialog.tsx` → `assignProgram.ts` → `assign_program_to_client` RPC) is atomic: the RPC deep-copies template → `client_program` + `client_program_days` + `client_day_modules` + `client_module_exercises` + prescription snapshots in one transaction (`supabase/migrations/20260215110000_assign_program_rpc.sql:48-137`). Only **published** modules are copied (L78-84). Care-team specialist modules auto-inject for active assignments (L145-175).
- **Wrapper** (`src/lib/assignProgram.ts:34-43`) destructures `{ error }` correctly and throws — the dialog catches and toasts.
- **Macrocycle assignment** (`assignMacrocycle.ts`) follows the same pattern: one RPC call per mesocycle, returns `clientProgramIds[]` and `weeksTotal`.
- **Team RLS** is in place per `CLAUDE.md`: migrations `20260212170000` (subscriptions team_id policy) and `20260212180000` (profiles_public via subscriptions → coach_teams). Verified.

### Bugs / gaps
- **Silent fail on `coach_teams.current_program_template_id` update** — `src/components/coach/teams/AssignTeamProgramDialog.tsx:171-175`:

  ```ts
  if (successCount > 0) {
    await supabase
      .from("coach_teams")
      .update({ current_program_template_id: selectedProgramId })
      .eq("id", team.id);
  }
  ```

  No `{ error }` destructure. If RLS denies or network drops, the user sees a green success toast but the team's "current program" pointer is stale. Direct violation of the `CLAUDE.md` rule. **Quick fix:**

  ```ts
  const { error: teamErr } = await supabase
    .from("coach_teams").update({...}).eq("id", team.id);
  if (teamErr) throw teamErr;
  ```
- **Team fan-out is sequential, not parallelized** (`AssignTeamProgramDialog.tsx:147-167` — `for` loop of `await assignProgramToClient(...)`). Each call is one RPC; for a 20-person team that's 20× the round-trip latency. `CLAUDE.md` rule "Parallelize Supabase calls in loops with Promise.all" applies here. The order of operations doesn't matter (each call is independent), so wrap in `Promise.allSettled` and tally success/failure from the results array.
- **Partial-success UX**: when some assignments succeed and some fail, the dialog reports counts but doesn't surface *which* members failed — `assignmentErrors` contains the names but isn't visible to the user post-close. Worth a "Failed assignments" section in the toast or a follow-up modal.
- **`current_program_template_id` semantics** are unclear. If a coach reassigns a team after one or more members were paused/cancelled, what does the team pointer represent? Worth a one-line comment in the schema migration.

---

## 4. RLS Coverage — Workout Tables

Tables are all RLS-enabled. The dominant pattern is **module ownership via `day_modules.module_owner_coach_id`** (migration `20260319110000_fix_exercise_prescriptions_rls.sql` is the latest authoritative rewrite).

### Verified good
- `module_exercises` SELECT/INSERT/UPDATE/DELETE: gated to `module_owner_coach_id = auth.uid() OR is_admin(auth.uid())`. Admin override IS present on these tables (the earlier audit overstated the gap here — `20260319110000:53,64,75,86` confirm admin bypass on every action).
- `exercise_prescriptions` same pattern (L101-153). SELECT additionally allows the program owner (`program_templates.owner_coach_id`), which matters when a coach is editing a template not yet "owned" at the module level.
- `client_programs` SELECT: `user_id` OR `primary_coach_id` OR `is_on_active_care_team_for_client` OR `is_admin` — good. INSERT/UPDATE/DELETE locked to primary coach, which is the correct write boundary.
- `exercise_set_logs` (client-owned): client has full CRUD on own logs; client_day_modules SELECT allows client + coach + care-team + admin.
- Storage bucket `exercise-videos` restricts uploads to coaches; clients read.

### Real gaps
- **`module_exercises` / `exercise_prescriptions` INSERT and UPDATE require `module_owner_coach_id = auth.uid()`** with no care-team or team-coach branch. This means: a dietitian or physio assigned to a client cannot edit any prescription on that client's program; a co-coach on a team cannot edit a module created by another co-coach. This is the **biggest practical RLS gap** in the workout stack — every write the coach makes after assignment must be done as the exact module owner.
- **`coach_teams.current_program_template_id` update** (the silent-fail above) — this update also flows through whatever `coach_teams` UPDATE policy exists; verify the head coach can write to their own team. (Not audited deeply.)
- **`direct_calendar_sessions`** RLS allows coach create + client view + care-team read (`20260205_workout_builder_phase1.sql:88-112`) — correct. But there's no "co-coach can edit" branch; the coach who created the session is the only editor.

### Not a problem despite earlier claim
- The previous notes ("admin can't override day_modules / module_exercises") were based on an outdated migration; `20260319110000` explicitly added `OR is_admin(auth.uid())` to all four CRUD policies on `module_exercises` and `exercise_prescriptions`. Confirm same was done for `client_day_modules` and `client_module_exercises` — these inherit from earlier migrations and weren't touched in `20260319110000`.

---

## 5. Client Workout Viewing

### What works
- **Entry points** are clearly tiered: `TodaysWorkoutHero` for "right now" (greeting + module count + Start/Continue CTA), `WorkoutCalendar` for full-month browse, `LogTodayCard` for weight/steps, `QuickActionsGrid` gated on `isActiveClient`. Roles + subscription status checked at quick-action level.
- **`hasFetched` ref guard** is used consistently (Dashboard.tsx:73, TodaysWorkoutHero.tsx:171, LogTodayCard.tsx:59, NewClientOverview.tsx:44) — matches the Phase 16 pattern from `CLAUDE.md`.
- **Timeout-wrapped queries** in `Dashboard.tsx` (≈L136, 246) for roles/profile — fallback to cached values prevents indefinite hangs (matches the AuthGuard pattern called out in `CLAUDE.md`).
- **Team vs 1:1 routing** in `QuickActionsGrid.tsx:16`: `subscription?.services?.type === "team"` flips the nutrition action target between `/nutrition-team` and `/nutrition`.
- **Mobile dock** auto-hides on `/client/workout/session/` (`App.tsx:115`) — distraction-free logging is correctly enforced.

### Risks / gaps
- **No realtime / cache invalidation between hero and calendar.** If a client completes a session inside `WorkoutSessionV2`, then navigates back to dashboard, `TodaysWorkoutHero` and `WorkoutCalendar` re-fetch independently. Two scenarios in which they can drift:
  1. Hero fetched first → shows pre-completion state → calendar fetches and shows post-completion state. Hero stays stale until next mount.
  2. Both use direct Supabase calls, not React Query — no shared cache key, no invalidation hook.
  **Recommendation:** route the workout queries through React Query with a shared `['client-workouts', userId]` key, and invalidate after `WorkoutSessionV2.completeWorkout()`.
- **Timezone implicit on date strings** (`WorkoutCalendar.tsx:48-49`): `startOfMonth(selectedDate).toISOString()` then `gte('day_date', ...)`. `day_date` is a DATE column; `toISOString()` converts in UTC. Clients in GMT+3 (Kuwait — IGU's home base) at 11pm local on the last of the month query as the first of next month UTC. Off-by-one is possible. **Fix:** format as `yyyy-MM-dd` in local time, no `toISOString()`.
- **Missing React keys on module chip arrays** (`TodaysWorkoutHero.tsx` ≈L356-380, `WorkoutCalendar.tsx` ≈L256) — verify; React dev warning will catch if real, but reorder stability would break.
- **No "your coach is setting up your program" empty state** after onboarding completes but before the coach assigns. Today the dashboard shows blank module count / empty calendar, which reads as a bug. Cheap empty-state card.

---

## 6. Client Workout Logging

### What works
- **Per-set V2 model** in `WorkoutSessionV2.tsx`: `sets_json` is read as the canonical source, with `legacyToPerSet()` (≈L164-189) expanding shared-prescription legacy rows into a per-set array at runtime. UI is identical for both — graceful backward compat.
- **Write-through saves** (`completeSet()` ≈L1189-1292) upsert `exercise_set_logs` on the composite key `[client_module_exercise_id, set_index]`; rollback of local `completed` state on error (≈L1224-1235) keeps the UI honest.
- **Batch fallback** (`saveProgress()` ≈L1366-1419) on unmount or explicit Save Progress button — covers the case where the user navigates mid-set.
- **Session completion** (`completeWorkout()` ≈L1422-1452) marks `client_day_modules.status='completed'` + `completed_at=now()`, then navigates to the calendar.
- **All Supabase calls destructure `{ error }`** in this file — clean.
- **Mobile keyboards** correctly typed (`inputMode="decimal"` for weight, `numeric` for reps).

### Risks / gaps
- **No `beforeunload` guard.** React Router `useBlocker()` is used (per the audit), but native browser unload (tab close, OS-back gesture on iOS) bypasses it. Saved batch state lives in memory; the unmount-triggered batch save races with the actual navigation. **Cheap fix:** `window.addEventListener('beforeunload', flushPendingLogs)` when dirty.
- **No conflict resolution for concurrent edits.** If the coach edits the prescription mid-session, the client's next save still writes per `client_module_exercise_id` + `set_index` — last-write-wins. Rare but real for the in-person tier where coach + client are both interacting with the same session.
- **Rest timer state loss on unmount** (mentioned in the audit) — minor UX nit, but worth a single sentence on the screen if the user expects timer continuity.
- **`direct_calendar_sessions` has no client-side logging path.** The schema exists, but `WorkoutSessionV2` is only routed via `:moduleId` (= `client_day_modules.id`). A direct session does not produce a `client_day_module` row, so the client never lands on a logger for it. **This is the largest functional gap in the workout pipeline**: the coach can create an ad-hoc workout for a client, but the client has no way to log against it. Either (a) bring direct sessions through the calendar with a different log route, or (b) have `assign_program_to_client`-equivalent fan-out for one-off sessions into `client_day_modules`.

---

## 7. Exercise Library & Picker

### What works
- **Two-table reality** (`exercises` legacy + `exercise_library` canonical, ~107 seeded) handled cleanly: `WorkoutLibraryManager.tsx:87-132` reads both via `Promise.all` for the admin view; `ExercisePickerDialog.tsx:73-93` queries only `exercise_library` filtered to `is_global OR created_by_coach_id`.
- **Picker UX** has name/muscle/equipment search, category filter, mobile drawer (max-h-92vh) vs desktop dialog branching, keyboard activation (Enter/Space) on rows.

### Gaps
- **`setup_instructions` is empty for every row** (`CLAUDE.md` explicitly acknowledges this; ~362 exercises). The Instructions accordion in `WorkoutLibrary.tsx:161-175` renders empty content to coaches. **Action:** either hide the accordion when empty, or stub a "Setup notes coming soon" line — the current state reads as broken UI.
- **Sections 19-21 (Cardio / Mobility / Warmup) movement_patterns and execution_points are deferred** (per `CLAUDE.md`). Currently surface as empty blocks or fall through to a generic state. Consider a single "Notes pending" placeholder so coaches don't think it's a render bug.
- **No master-file ↔ DB sync utility.** `IGU_MASTER_EXERCISE_LIBRARY_v2.md` is authoritative on paper, but there's no script or migration that verifies row counts or names match. A one-shot `npm run lint:exercises` that parses the .md and diffs against the DB would catch drift.
- **No referential-integrity check** on delete. Removing an `exercise_library` row would silently orphan any `module_exercises` row that points at it — no FK cascade. Worth a `ON DELETE RESTRICT` or a guard in the WorkoutLibraryManager delete handler.
- **`exercise_library.default_video_url` is trusted** without validation in `VideoThumbnail.tsx` — a broken URL renders a broken-image icon to coaches and clients.

---

## 8. Adherence & Coach Feedback Loop

### What works
- **Coach `WorkoutAdherencePulse`** (`useClientWorkouts.ts` ≈L235-274) computes the current ISO week (Mon-Sun) completion %; the rail colors at 3 / 7 days.
- **Weekly digest cron** (`send-weekly-coach-digest`) emails coaches on Mondays with active/inactive counts.
- **Inactive-client cron** (`process-inactive-client-alerts`) fires when no `exercise_set_logs` and no completed direct sessions for 5 days, 14-day dedup window via `email_notifications`.

### Gaps
- **Weekday-windowing mismatch.** Coach: Mon-Sun. Client `AdherenceSummaryCard.tsx:64`: `startOfWeek(now, { weekStartsOn: 0 })` = Sun-Sat. A Sunday workout falls into "this week" for the coach but "last week" for the client (or vice versa, depending on which side flipped). **Single-line fix:** standardize on Mon-Sun everywhere; pass `weekStartsOn: 1` to date-fns on the client.
- **No per-session notification to the coach.** Completed workouts surface to the coach only via the next poll (no realtime subscription), or via the weekly digest, or — if the client goes silent — via the 5-day inactivity alert. The system is built to alert on silence, not celebrate completion. For the in-person and 1:1 Complete tiers ("Service Tiers & Compensation" in `CLAUDE.md`), a daily "your client did their session" line in a digest would close this loop without spamming.
- **Weekly digest is activity-only**, not adherence-%. The digest counts active/inactive clients but doesn't include per-client completion percentage or last-workout-date. A column per client in the digest would be cheap and high-signal.
- **Inactivity threshold (5 days) vs amber rail (3-7 days) mismatch.** A client at 4 days inactive shows amber but no alert; a client at 6 days shows amber AND triggers an alert. Reconciling to a single 5-day threshold (or matching the rail to 4-7d / 7d+) would be cleaner.
- **No server-side adherence RPC** — adherence is computed client-side everywhere. A SECURITY DEFINER `compute_client_adherence(p_client_id, p_window_days)` returning JSONB would give the digest, the rail, and any future analytics surface the same number.

---

## 9. Cross-Cutting Issues — Prioritized

| # | Severity | Issue | File / Migration |
|---|---|---|---|
| 1 | **HIGH** | Direct calendar sessions have no client-side logger | `direct_calendar_sessions` schema vs `WorkoutSessionV2` route |
| 2 | **HIGH** | `module_exercises` / `exercise_prescriptions` writes locked to single coach — care-team and team-coach can't edit prescriptions | `20260319110000_fix_exercise_prescriptions_rls.sql:57-87, 119-153` |
| 3 | **HIGH** | Silent fail on `coach_teams.current_program_template_id` update during team assignment | `AssignTeamProgramDialog.tsx:171-175` |
| 4 | **MEDIUM** | Partial-success orphan programs in `ConvertToProgram` (no transaction wrap on post-RPC inserts) | `ConvertToProgram.tsx:166-240` |
| 5 | **MEDIUM** | Team fan-out is sequential, not `Promise.allSettled` | `AssignTeamProgramDialog.tsx:147-167` |
| 6 | **MEDIUM** | Coach vs client week windowing drift (Mon-Sun vs Sun-Sat) | `useClientWorkouts.ts` ≈L235-274 vs `AdherenceSummaryCard.tsx:64` |
| 7 | **MEDIUM** | Hero / calendar fetch independently, no shared cache → stale module status after session completion | `TodaysWorkoutHero.tsx`, `WorkoutCalendar.tsx` |
| 8 | **MEDIUM** | No empty state for "post-onboarding, pre-program-assignment" client | `Dashboard.tsx` |
| 9 | **MEDIUM** | Coach gets no per-session completion notification | digest + inactivity crons only |
| 10 | **LOW** | Column presets exist but aren't applied during muscle-plan → program conversion | `ConvertToProgram.tsx` + `coach_column_presets` |
| 11 | **LOW** | `setup_instructions` empty on all ~362 exercises, surfaces as empty accordion | `WorkoutLibrary.tsx:161-175` |
| 12 | **LOW** | `WorkoutCalendar` date math uses `toISOString()` on a local-month boundary | `WorkoutCalendar.tsx:48-49` |
| 13 | **LOW** | Legacy `convert_muscle_plan_to_program` v1 RPC + `exercises` legacy table still present | migrations + DB |
| 14 | **LOW** | No `beforeunload` flush of pending exercise logs | `WorkoutSessionV2.tsx` |
| 15 | **LOW** | `IGU_MASTER_EXERCISE_LIBRARY_v2.md` ↔ DB has no sync verifier | repo-wide |

---

## 10. Suggested First PR Bundle

If you want a clean small first PR off this audit, the highest correctness-for-LOC ratio:

1. `AssignTeamProgramDialog.tsx:171-175` — destructure `{ error }`, throw on failure (rule violation, 3-line fix).
2. `AssignTeamProgramDialog.tsx:147-167` — wrap the per-member loop in `Promise.allSettled`, tally from results (latency win, no behavior change).
3. `useClientWorkouts.ts` and `AdherenceSummaryCard.tsx` — standardize on Mon-Sun (`weekStartsOn: 1`) so coach and client see the same week.
4. `Dashboard.tsx` — add a "Your coach is preparing your program" card when `client_programs.count === 0 && profile.status === 'active'`.

The bigger structural items (direct-session logger, care-team RLS expansion, transaction-wrap the converter, per-completion coach notification) should be planned individually before any edits — flag here so they're not lost.
