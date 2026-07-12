# P5 Stage A.2 — remove the remaining LIVE legacy-table reads/writes (drop-unblocker)

**Status:** Build handoff (2026-07-07, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Why:** A pre-drop audit for Stage B2 found **13 live read/write branches** still hitting the legacy program tables (`client_programs`, `client_program_days`, `client_day_modules`, `client_module_exercises`, `module_threads`). Stage A cleaned the workout *player* but missed the coach dashboard, activity feed, a client card, the `hooks/useClientWorkouts` calendars, and two edge functions. **Stage B2 (DROP TABLE) is BLOCKED until these are gone.** This slice migrates them to canonical (`plan_*` / `client_plan_assignment` / `exercise_set_logs`) or removes them. **Ship A.2 → soak → THEN B2.** No DB drops in this slice.

**Bonus:** several of these read legacy completion data (`client_day_modules.completed_at`) that clients no longer write (they log canonically), so these surfaces likely show STALE/zero data today — A.2 fixes that too.

## Canonical sources to reuse (don't reinvent)
- `src/lib/canonicalScheduleAdapter.ts` — `resolveActiveAssignment(clientId)`, `loadCanonicalSchedule(assignmentId)` (date→sessions w/ status), `canonicalLastWorkoutAt`, `loadCanonicalWorkoutLogs`.
- `src/components/client-overview/workouts/useWorkoutPulse.ts` / `useAdherencePulse` — canonical weekly adherence for a client (already board-v2 canonical). Reuse its "a session is done when it has `exercise_set_logs` for that assignment+date" logic.
- **Completion in canonical** = a `(assignment_id, plan_session/date)` that has `exercise_set_logs` rows. There is no per-session `completed_at` like legacy `client_day_modules.completed_at`; derive completion from `exercise_set_logs` (keyed `assignment_id + plan_slot_id`, dated by `created_at`).

## Client surfaces
1. **`src/components/client/AdherenceSummaryCard.tsx`** (via `useClientWorkoutsWeek`, `src/hooks/useClientWorkouts.ts:197`) — **this is the deferred D1.** Migrate the weekly-adherence read to canonical: resolve the client's active `client_plan_assignment`, use `loadCanonicalSchedule` for this week's sessions + count those with `exercise_set_logs` as completed. Reuse the coach `useAdherencePulse`/`useWorkoutPulse` canonical logic (client-scoped). Match the current card's output shape (X/Y sessions this week).
2. **`src/components/client/WeeklyProgressCard.tsx:43`** — same canonical weekly-completion source as (1); drop the `client_programs → client_program_days → client_day_modules` embed. Consider sharing one canonical weekly-adherence hook between (1) and (2).
3. **`src/hooks/useClientWorkouts.ts`** — `useClientWorkoutsMonth` (L65) + `useClientWorkoutsWeek` (L197) are the legacy-embed hooks. After (1)/(2) move off them: grep for any remaining live caller. `useClientWorkoutsToday` (same file) is ALREADY canonical (P5 Slice 1) — keep it. `ClientScheduleCalendar.tsx` references Month/Week only as the board_v2-OFF **dead fallback** (flag is permanently ON post-flip) — remove that dead fallback branch. Then **delete `useClientWorkoutsMonth`/`useClientWorkoutsWeek`** if no live caller remains.

## Coach surfaces
4. **`src/components/coach/CoachDashboardOverview.tsx:206`** — "workouts completed this week" count (3-hop `client_programs→days→client_day_modules.completed_at`). Replace with a canonical count: distinct `(assignment_id, date)` in `exercise_set_logs` this week across the coach's clients' active `client_plan_assignment`s. (The coach can read canonical logs via `exercise_set_logs_canonical_coach_select` — already live.)
5. **`src/components/coach/ClientActivityFeed.tsx:68`** — "recent completed workouts" (last 20 `client_day_modules.completed_at`). Rebuild from canonical: most-recent distinct sessions derived from `exercise_set_logs` (assignment→client→session/date) across the coach's clients. Keep the same feed row shape (client, workout title, when).

## Edge functions (server-side — no flag gates, definite blockers)
6. **`supabase/functions/send-content-link-email/index.ts:117`** — program-template recipient resolution reads `client_programs` by `source_template_id`+active. Replace with canonical: recipients = `client_plan_assignment.client_id` (status active) whose assigned `plan` links back to the template. **Confirm the linkage column** — the write-cutover resolved `muscle_program_templates.converted_program_id → plan.source_muscle_template_id`, so `JOIN plan ON plan.id = cpa.plan_id WHERE plan.source_muscle_template_id = target.id`. Verify that column against the schema; keep the nutrition-phase branch (L129) unchanged. Redeploy `--no-verify-jwt` (unchanged).
7. **`supabase/functions/delete-account/index.ts:174`** — `client_programs.delete().eq('user_id')`. Replace with canonical cleanup: `client_plan_assignment.delete().eq('client_id', userId)` (and check whether the user's `client_frozen` cloned `plan` rows should also be removed or left orphaned — orphaned is acceptable, note the choice). Keep the `direct_calendar_sessions` delete (L175). Redeploy.

## Admin QA
8. **`src/pages/admin/WorkoutBuilderQA.tsx`** — seeds/reads/deletes legacy `client_programs/days/modules/module_threads` (seedTestData / runTests / cleanupTestData). **Recommendation: DELETE the page + its route** (it's dev/QA tooling that only exercises the legacy model, which is being removed; canonical assignment can be seeded via `assign_template_to_client_canonical`). If Hasan wants to keep a canonical QA harness, that's a separate net-new — not part of A.2. Remove its route from `App.tsx` + any nav reference.

## Out of scope for A.2 (these are Stage B2, after A.2 soaks)
- DROP of the tables + `module_threads`/`module_thread_messages` + the `plan`/`exercise_media` FKs.
- DROP of the dormant RPCs (`assign_program_to_client`, `assign_macrocycle_to_client`, `assign_team_program_atomic`, `convert_muscle_plan_to_program(_v2)`, `complete_client_day_module`, `skip_client_day_module`).
Do NOT drop anything here.

## Exit criterion (the gate for B2)
`grep -rE 'client_programs|client_program_days|client_day_modules|client_module_exercises|module_threads|module_thread_messages' src/ supabase/functions/` returns **only** comments + `src/integrations/supabase/types.ts` (regenerate types after). Zero live `.from(...)`/embeds/inserts/deletes and zero calls to the dormant legacy RPCs.

## Verify (Cowork, prod, after ship + a soak)
- Client dashboard: AdherenceSummaryCard + WeeklyProgressCard show correct weekly completion from canonical logs (not zero/stale). Log a canonical set → the weekly count reflects it.
- Coach dashboard: "workouts this week" count + ClientActivityFeed populate from canonical (cross-check against a client with recent `exercise_set_logs`).
- delete-account: deleting a test client removes its `client_plan_assignment` (impersonation/DB check), no error referencing client_programs.
- send-content-link-email: fires to the correct canonical recipients for a template content link (DB-verify the recipient set matches active `client_plan_assignment`s on that template).
- WorkoutBuilderQA route gone (404) if deleted.
- Grep exit criterion met. tsc (~306 baseline zero-new), ESLint 0, build clean.
- **Then** a clean soak → hand over Stage B2 (docs/P5_LEGACY_DROP_BUILD.md).
