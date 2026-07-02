# T5 — Team program backfill → canonical shared plan (+ retire legacy team assign)

**Status:** Spec (2026-07-02, Cowork). Prod state below verified read-only same day.
**Parent docs:** `docs/TEAMS_CANONICAL_BUILD.md` (T5 slice), `docs/P5_LEGACY_DROP_BUILD.md` (this unblocks Stage A for the team path).
**Goal:** every team with a program follows ONE shared canonical clone (`coach_teams.current_program_plan_id`), members' assignments point at it, and `assign_team_program_atomic` becomes unreachable → droppable in Stage B.

---

## 1. Verified prod state (2026-07-02)

Two teams:

| Team | `current_program_template_id` | `current_program_plan_id` | Active members |
|---|---|---|---|
| Fe Squad `77034189` | `d1e35f86` | **NULL** ← the T5 gap | 2 |
| Bunz of Steel `c5518b7b` | NULL | NULL | 1 (no program — nothing to do) |

Fe Squad detail:
- Template `d1e35f86` HAS a canonical mirror: muscle template `21f2ecc9` → plan `dd516335` (kind `template`, "Classic Series (C with a T) Strength Meso (Copy)"). So `assign_team_plan(p_clone=true)` can run as-is.
- **H D `6bcb1bba`:** 1 active team-keyed assignment `2b3a8638` (plan `9fc175bf` = per-member promoted clone, start 06-29, **0 logs**). Also has a separate 1:1 assignment `451a6a52` (team NULL) — out of T5 scope, but note he carries 2 active assignments total.
- **Hasan Dashti `ce14d4f5`:** **TWO active team-keyed assignments** — `1212cca1` (plan `46c88dd4`, start 06-18, **18 logs**) and `59ade699` (plan `d3f47dcc`, start 06-29, **11 logs**). Legacy dupe carried through the backfill. Both have identical `created_at`, so `assign_team_plan`'s `ORDER BY created_at LIMIT 1` upsert-target pick is **nondeterministic** for him — the backfill must dedupe explicitly, don't let the RPC pick.

Log keying: `exercise_set_logs(assignment_id, plan_slot_id)`. The canonical invariant since the P5 backfill is `log.plan_slot_id ∈ slots(assignment.plan_id)`.

## 2. Design decision — do NOT repoint assignments that have logs

`assign_team_plan`'s upsert branch REPOINTS an existing team-keyed assignment's `plan_id`. For an assignment with existing logs that **breaks the invariant** (logs' `plan_slot_id` would reference slots of the old per-member clone, not the assignment's new plan). Any history reader that resolves slots via `assignment.plan_id` would mismatch.

So the backfill (a one-shot admin/service-role-gated SECURITY DEFINER RPC, same shape as `backfill_all_active_client_programs`):

1. Resolve team → mirror template plan (`current_program_template_id` → `muscle_program_templates.converted_program_id` → `plan.source_muscle_template_id`, newest). Skip + report teams with no mirror.
2. `clone_plan(mirror)` once per team → shared clone. Set `coach_teams.current_program_plan_id`.
3. Per active member: **deactivate** (status `completed` or `cancelled` — match whatever the enum uses for retired assignments; do NOT delete) ALL existing active team-keyed assignments for that team, then **INSERT a fresh assignment** `{client_id, subscription_id, plan_id=shared clone, team_id, primary_coach_id, start_date, status='active'}`. Old logs stay coherently attached to the old assignment+clone pair (both persist); new logging accrues on the new assignment.
4. Start date: one shared date per team (TrainHeroic single-calendar model). For Fe Squad use `2026-06-29` (the newer of the two legacy starts).
5. Idempotent: skip teams where `current_program_plan_id` already set; deactivate-then-insert guarded so re-runs no-op. Returns JSONB report (teams processed / members reassigned / skipped).
6. Standard RPC hygiene: `p_`/`v_` naming, `SET search_path = public`, `RETURNS JSONB`, **REVOKE PUBLIC/anon, GRANT service_role** (admin-gated inside). One CREATE FUNCTION per migration file (CLI dollar-quote splitter).

**Check before building step 3:** grep canonical history readers (tonnage/PR/adherence/log viewers) — if ALL resolve exercise identity via `log.plan_slot_id` join directly (not via `assignment.plan_id`), the deactivate+insert can be simplified to repoint. Expected answer: keep deactivate+insert; it also fixes the ce14d4f5 dupe cleanly.

**Open Q for Hasan (pre-drop, not blocking T5):** does any reader show history only for the ACTIVE assignment? If yes, Hasan's 18+11 logs on deactivated assignments disappear from those views (test data — probably acceptable, but say so out loud).

## 3. Retire `assign_team_program_atomic`

After the backfill:
- `src/lib/assignProgram.ts` team path: replace the legacy fan-out fallback (`no_mirror_plan` → `assign_team_program_atomic`) with a hard, user-facing error ("Open the program in the Planning Board once to enable team assignment") — under `board_v2`, same pattern the 1:1 cutover used. The flag-off branch stays until Drop Stage A removes it wholesale.
- The RPC itself gets DROPPED in Stage B alongside `save_client_plan_override` (add it to the Stage B list in `docs/P5_LEGACY_DROP_BUILD.md`).

## 4. Verify (Cowork, post-apply)

1. `coach_teams`: Fe Squad `current_program_plan_id` NOT NULL; clone's `source_template_plan_id = dd516335`.
2. Both members: exactly ONE active team-keyed assignment each, `plan_id` = shared clone; ce14d4f5's old two are inactive with logs intact.
3. Soak check unchanged: `client_programs` total still 8 (this RPC writes zero legacy).
4. UI: `/coach/teams` → Fe Squad → Program tab shows the edit button (T2 positive-guard case, previously unverifiable); board opens the shared clone with the all-members banner; edit propagates to both members' calendars.
5. Sentry: no `assign_team_plan_fallback` / `no_mirror_plan` warnings.
