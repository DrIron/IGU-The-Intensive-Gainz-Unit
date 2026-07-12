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

> **⛔ BLOCKED until Stage A.2 ships + soaks (found 2026-07-07).** A pre-drop audit found 13 LIVE legacy read/write branches Stage A missed (coach dashboard, activity feed, WeeklyProgressCard, AdherenceSummaryCard/useClientWorkoutsWeek=D1, hooks/useClientWorkouts, + `delete-account` & `send-content-link-email` edge fns, + WorkoutBuilderQA). Dropping now would break account-deletion, content-link emails, and dashboards. See **docs/P5_STAGE_A2_LEGACY_CODE_CLEANUP_BUILD.md** — migrate/remove those, then the grep exit-criterion is clean and this Stage B is safe.

> **Gate re-verified on prod 2026-07-05 (Cowork).** cp flat 8 active / coverage 0 / **124/124 logs canonical-keyed, 0 legacy-only** / overrides 0 / Sentry clean on canonical paths. The re-key (D3) is DONE. **Split Stage B into B1 (column, ready NOW, zero-dependency) and B2 (tables, after soak + the newly-found deps below).**

Migration(s), in FK-safe order:

### B1 — drop the dead column on `exercise_set_logs` (isolated, ready now)
`client_module_exercise_id` is dead as a *key*: 58/124 rows carry it but **every one is also canonical-keyed** (`assignment_id + plan_slot_id`), 0 rows rely on it alone, no live app reader/writer (buildLogKey/logConflictTarget canonical-only; only inserts anywhere are the client logger in WorkoutSessionV2).

**⚠️ RLS CAVEAT (found by CC 2026-07-05 — the original "zero-dependency" claim was WRONG).** `exercise_set_logs` has 9 RLS policies; **4 reference the column**, and 2 of those are the client's ONLY self-read/self-insert path:
- `Clients can create own set logs` (INSERT, via client_module_exercises join)
- `exercise_set_logs_insert` (INSERT, `get_client_from_module_exercise(...)`, had a dead `is_admin` branch)
- `View set logs` (SELECT, client-self via `created_by_user_id`)
- `exercise_set_logs_select` (SELECT, client-self)
The surviving canonical policies are `esl_canonical_insert` (client-self INSERT via `assignment_id`) + `exercise_set_logs_canonical_coach_select` (**coach/admin/team only — NO client-self SELECT branch**). So a naive `DROP COLUMN ... CASCADE` silently kills client self-reads = live regression. **The column drop MUST be paired with an RLS rewrite that first adds a canonical client-self SELECT** (`created_by_user_id = auth.uid()`), then drops the 4 legacy policies.

Objects (verified `contype`): FK constraint `exercise_set_logs_client_module_exercise_id_fkey` (`DROP CONSTRAINT`) · **UNIQUE constraint** `exercise_set_logs_client_module_exercise_id_set_index_key` (`DROP CONSTRAINT`, NOT DROP INDEX — it's constraint-backed) · plain index `idx_set_logs_exercise` (`DROP INDEX`). **KEEP** `exercise_set_logs_canonical_key` + `idx_set_logs_assignment`.

Migration order (authored: `supabase/migrations/20260705230000_drop_exercise_set_logs_cme_column.sql`): guard (`RAISE` if any `assignment_id IS NULL`) → ADD canonical client-self SELECT policy → DROP the 4 legacy policies → DROP FK + UNIQUE constraint + plain index → DROP COLUMN. Net post-state: INSERT=`esl_canonical_insert`; SELECT=coach-select + new self-select; UPDATE/DELETE untouched. **DECIDED (Hasan 2026-07-05): admins never client-side INSERT set logs (only inserts anywhere are the client logger; admin/service writes use service_role = RLS-bypass) → dropping the dead `is_admin` INSERT branch is safe. Apply as authored.**
2. Drop legacy RPCs with no remaining caller. **CORRECTED 2026-07-07 (Cowork verified callers + what each writes):**
   - **SAFE to drop now (zero live callers — only comments/types):** `assign_program_to_client`, `assign_macrocycle_to_client`, `assign_team_program_atomic`, `convert_muscle_plan_to_program` (v1).
   - **⚠️ KEEP — `convert_muscle_plan_to_program_v2`** was mis-listed. It has a LIVE caller (`ConvertToProgram.tsx:172`) and writes TEMPLATE tables (`day_modules`/`program_templates`), NOT the 5 client tables. It is the current coach "convert muscle plan → program" flow. DO NOT drop.
   - **⚠️ HOLD until A.3 — `skip_client_day_module`** (LIVE caller `WorkoutSessionV2:2206`, currently BROKEN under canonical — a real bug) and **`complete_client_day_module`** (live caller `WorkoutSessionV2:2576` but the branch is dead post-flip). Both write the legacy client tables. Don't drop them (or the tables out from under them) until A.3 fixes/removes these callers. See docs/P5_STAGE_A3_SKIP_COMPLETE_BUILD.md.
3. **B2 — `DROP TABLE`** in child→parent order: `client_module_exercises` → `client_day_modules` → `client_program_days` → `client_programs`. **Three external FK deps found on prod 2026-07-05 (NOT auto-covered by the child→parent order — handle each or the DROP errors):**
   - `plan.source_client_program_id → client_programs`: **`plan` is CANONICAL — keep the table.** Drop the FK `plan_source_client_program_id_fkey` (and the now-vestigial `source_client_program_id` column, or leave it nullable/unconstrained) before dropping `client_programs`.
   - `module_threads.client_day_module_id → client_day_modules`: **280 rows, but child `module_thread_messages` = 0 rows** — the per-module (B6) thread feature was never surfaced; messaging lives in `coach_client_messages`. These 280 are empty auto-created containers (~1:1 with 286 `client_day_modules`). **DECIDED (Hasan 2026-07-05): per-module threads are abandoned → DROP `module_thread_messages` then `module_threads` (child→parent) in this same B2 migration.** No re-key, no content loss. Grep `src/` for any live reader first (expected none — feature never surfaced); if a live reader turns up, STOP and report.
   - `exercise_media.client_module_exercise_id → client_module_exercises`: 0 legacy rows → drop FK `exercise_media_client_module_exercise_id_fkey` + the column before dropping `client_module_exercises`.
   - `client_plan_assignment.subscription_id` is independent (canonical); nothing else references the legacy set (verified via `pg_constraint` sweep).
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
