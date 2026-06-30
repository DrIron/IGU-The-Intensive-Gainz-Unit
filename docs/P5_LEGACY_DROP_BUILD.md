# P5 Legacy drop — remove the legacy program model entirely (the finish line)

**Status:** Build handoff (2026-06-30, Cowork). **Owner:** terminal. Cowork verifies on prod.
**Final step of the legacy cutover.** Order: backfill (DONE) → flip `board_v2` ON → write-cutover (canonical-only writes) → **soak** → THIS. Do NOT build until reads are canonical (flip live), writes are canonical-only (cutover live), and a soak shows no legacy traffic.
**This is destructive (DROP TABLE). Stage it: code first, tables last, after a clean soak.**

## Pre-drop gate (must all be true — verify before touching anything)
1. `board_v2` is ON in prod (reads canonical).
2. Write-cutover live: `client_programs WHERE status='active'` count has been **flat** for the soak window (no new legacy rows).
3. Coverage still 0 (every active legacy program promoted — already true).
4. Sentry quiet on canonical read/write paths during the soak.
5. The canonical workout-finish path is complete (no dependence on `complete_client_day_module` / `client_day_modules` — confirmed in the write-cutover slice).

## Stage A — remove legacy CODE branches (reversible, ship + soak before Stage B)
Now that every client has a canonical assignment, the legacy fallback can never fire — delete it:
- The `else`/legacy branches in the read hooks: `OverviewTab`, `useClientVitals`, `NewClientOverview`, `useAdherencePulse`, `useWorkoutPulse`, `useClientWorkoutsToday` (+ Month/Week siblings), `useClientPrograms`, `useSessionLog`, `WorkoutCalendar`, `WorkoutsTab` (`canonicalDays ?? legacy`), `canonicalScheduleAdapter`/`canonicalSessionResolver` legacy bits.
- The `client_programs` arm of `get_coach_roster_stats`'s `prog` UNION (leave only the canonical arm).
- The `board_v2` gating itself on these read paths (canonical is now the only path) — and retire the `igu_ff_board_v2` flag once nothing references it. (Keep `canonical_session_read` handling per its own status.)
- The dual-write mirror code (no longer needed — canonical is primary).
- Legacy-only components/hooks with no remaining caller (grep each before deleting).
- **Keep deload, progression, set-instruction, Teams, sync — all canonical, untouched.**
tsc/build clean; CI green. Ship Stage A, soak again (the app now runs with NO legacy code path).

## Stage B — drop legacy DB objects (after Stage A soaks clean)
Migration(s), in FK-safe order:
1. `exercise_set_logs`: drop the `client_module_exercise_id` column (logs were re-keyed to `assignment_id + plan_slot_id` in the backfill; the column was kept only as the rollback path). Drop its FK + the old partial unique index keyed on it. Confirm 0 rows still rely on it (every active program's logs re-keyed).
2. Drop legacy RPCs with no remaining caller: `assign_program_to_client`, `convert_muscle_plan_to_program(_v2)`, `complete_client_day_module`, and any `client_*`-only helper (grep each; some RLS helpers may still be referenced — keep those).
3. `DROP TABLE` in child→parent order: `client_module_exercises` → `client_day_modules` → `client_program_days` → `client_programs`. Handle FKs (e.g. `client_plan_assignment.subscription_id` is independent; check nothing else references these).
4. Drop `client_program_status`-only artifacts if now unused (the enum is reused by `client_plan_assignment.status` — KEEP it).
Each migration: additive-safe where possible, but DROP is irreversible — take a fresh prod backup/snapshot note first, and run the pre-drop gate queries inside the PR.

## Guardrails
- **Do NOT drop:** `client_plan_assignment`, `plan_*`, `exercise_set_logs` (the table — only its legacy column), `client_program_status` enum (reused), any RLS helper still referenced by a policy, the Teams/deload/sync objects.
- Two-stage: Stage A (code) ships and soaks BEFORE Stage B (DROP). Never drop tables in the same PR that removes the readers.
- One concern per migration; verify each with `pg_get_constraintdef` / dependency checks before dropping.
- If anything still references a legacy object, STOP and report — don't force-drop.

## Verify (Cowork)
- Stage A: full app works with legacy code removed — client dashboard, coach overview/pulse/programs/session-log, roster stats — all canonical, on prod after merge. Sentry quiet.
- Pre-Stage-B gate queries return clean (flat legacy count, coverage 0, no logs depending on the legacy column).
- Stage B: post-drop, `\d client_programs` etc. gone; the app is unaffected (everything already canonical); a fresh assignment + a logged workout + the coach analytics all work end-to-end with zero legacy objects in the DB.
- Final: grep confirms no `client_programs|client_program_days|client_day_modules|client_module_exercises` references remain in `src/` or `supabase/functions/` (except historical migration files).

## Done = the goal
After Stage B: the legacy deep-copy model is gone, every program is canonical (`plan_*` + `client_plan_assignment`), and the whole epic — Teams, deload v2, board v2, S1–S4 sync, progression, set-instructions, the P5 read migration — is the live, only model. The remaining follow-up is the long-deferred `docs/help/` FAQ + tutorial pass documenting the finished product.
