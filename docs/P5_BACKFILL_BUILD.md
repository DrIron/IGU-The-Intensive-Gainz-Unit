# P5 Backfill — promote legacy client programs → canonical (the cutover's first step)

**Status:** Build handoff (2026-06-30, Cowork). **Owner:** terminal (DB/RPC). Cowork verifies on prod.
**Not flag-gated** — it's an additive data migration (creates canonical rows alongside legacy; reads only matter under `board_v2`). Idempotent + re-runnable.
**Goal / why now:** the end goal is **zero legacy, all canonical.** With the fallback hardening merged, a flipped client with no canonical assignment just reads legacy — so legacy only goes away once *every* client has a canonical assignment. This backfill is that step. **Context: no real production clients exist** (pre-launch; the 5 active legacy programs are the `dr.ironofficial+*` test accounts, with ~no workout history), so this is low-risk — but build it correctly because the same RPC runs for real clients post-launch if any legacy ever exists.

**Sequence this belongs to:** (1) **this backfill** → (2) flip `board_v2` ON (everyone reads canonical) → (3) cut the assignment write-path to canonical-primary (stop writing legacy `client_programs`) → (4) drop legacy tables + the legacy code branches. Build only (1) here.

## Grounding — the mapping (schema verified 2026-06-30)

| Legacy | → | Canonical |
|---|---|---|
| `client_programs` (user_id, subscription_id, primary_coach_id, source_template_id, start_date, timezone, status, team_id, macrocycle_id) | → | one **`plan`** (`kind='client_frozen'`, `owner_coach_id=primary_coach_id`, `visibility='private'`, name from the source template title or a fallback) **+** one **`client_plan_assignment`** (client_id=user_id, plan_id=new plan, subscription_id, primary_coach_id, start_date, status, timezone, team_id, macrocycle_id) |
| `client_program_days` (date, day_index, title) | → | groups into **`plan_weeks`** (week_index) — derive week + day-of-week from `day_index` (absolute): `week_index = floor((day_index-1)/7)+1`, `day_in_week = ((day_index-1) % 7)+1`. Prefer `day_index`; fall back to `(date - start_date)` if day_index is null. |
| `client_day_modules` (module_type, title, sort_order, status, completed_at) | → | one **`plan_session`** per module (plan_week_id from the day's week, `day_index=day_in_week`, `activity_type`=map(module_type), `name`=title, `sort_order`). Map `module_type`→`activity_type` (CHECK: strength\|cardio\|hiit\|yoga_mobility\|recovery\|sport_specific) — read the distinct `module_type` values first and map; fall back to `'strength'`. |
| `client_module_exercises` (exercise_id, section, sort_order, instructions, **prescription_snapshot_json**, skipped) | → | one **`plan_slot`** per row (exercise_id, section, sort_order, instructions, **`prescription_json = prescription_snapshot_json`** — same snapshot shape, direct copy). |
| `exercise_set_logs` (client_module_exercise_id-keyed) | → | **RE-KEY** to canonical: `assignment_id` = the new assignment, `plan_slot_id` = the slot the cme became. Preserves workout history under canonical reads. |

Reuse the existing materializer shape from `save_plan_from_builder` / `clone_plan` for the `plan_*` inserts (same column set, fresh ids); this is "materialize a plan from the legacy snapshot" instead of from a JSONB payload.

## The RPC — `backfill_client_program(p_program_id uuid) RETURNS jsonb`
SECURITY DEFINER, `SET search_path=public`, `p_`/`v_` naming. Admin/service-role gated (this is an ops migration, not a user action) — REVOKE PUBLIC/anon, GRANT service_role (+ admin via an `is_admin(auth.uid())` check). One transaction per program (all-or-nothing per client).

Per call:
1. Load the `client_programs` row (`p_program_id`); if not found or already backfilled (see idempotency), return `{skipped: true, reason}`.
2. `INSERT plan` (client_frozen, owner=primary_coach_id, name, **`source_client_program_id = p_program_id`** — the idempotency + traceability marker; see below).
3. Build weeks/sessions/slots from days→modules→exercises per the mapping, recording a **`cme_id → plan_slot_id` map** as you go (needed for re-keying).
4. `INSERT client_plan_assignment` (carry subscription_id, primary_coach_id, start_date, status, timezone, team_id, macrocycle_id).
5. **Re-key logs:** `UPDATE exercise_set_logs SET assignment_id = <new>, plan_slot_id = <cme_map[client_module_exercise_id]> WHERE client_module_exercise_id IN (<this program's cme ids>)`. (For the test accounts this touches ~0 rows — fine; the mechanism must still be correct for any real history.)
6. Return `{ plan_id, assignment_id, weeks, sessions, slots, logs_rekeyed, source_client_program_id }`.

### Idempotency + traceability — `plan.source_client_program_id`
Add `plan.source_client_program_id uuid NULL REFERENCES client_programs(id)` (+ partial index WHERE NOT NULL). It marks a plan as a promoted snapshot (distinct from `source_template_plan_id`, which marks a *clone of a template*). The backfill skips a program if a plan with that `source_client_program_id` already exists. Re-runnable safely; also lets the coverage query join legacy↔canonical.

### Driver
A thin `backfill_all_active_client_programs()` (or a one-shot script) that loops every `client_programs WHERE status='active'` not yet backfilled and calls the per-program RPC, returning a summary. Incremental + restartable.

## Built-in parity check (the verification, baked in)
After backfilling a program, assert canonical == legacy structurally (return it in the RPC result or a companion `verify_backfill(p_program_id)`):
- `count(plan_sessions for new plan)` == `count(client_day_modules for the program)`
- `count(plan_slots for new plan)` == `count(client_module_exercises for the program)`
- `count(exercise_set_logs WHERE assignment_id = new)` == `count(legacy logs for the program's cmes)` (history preserved)
Any mismatch → flag the program, don't silently proceed.

## Coverage query (gate before the flip)
```sql
-- Every active legacy program must have a canonical promotion. Should return 0.
SELECT cp.id, cp.user_id
FROM client_programs cp
WHERE cp.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM plan p WHERE p.source_client_program_id = cp.id);
```

## Edge cases
- **Team programs** (`client_programs.team_id` set): promote the same way; the assignment carries `team_id`. (Don't conflate with the *shared* team plan model from T1/S1 — this is a per-client frozen promotion of their existing snapshot. Flag in the PR if a team member's promotion should instead point at the team's shared plan; for now, faithful per-client promotion is correct and matches "promote, don't diff".)
- **Macrocycles** (`macrocycle_id` set): carry it onto the assignment; no other special handling.
- **Deloads:** legacy snapshots have no canonical inserted-deloads — backfilled plans simply have none (`plan_weeks.is_deload=false`); that's correct (the snapshot is the frozen truth).
- **`source_template_id`**: keep it only for the plan name lookup; do NOT set `source_template_plan_id` (these are promotions, not clones).

## Verify (Cowork on prod)
- Run the driver on prod (5 test programs). Per-program parity (sessions/slots/logs counts match legacy). Coverage query returns 0.
- Idempotency: run the driver twice → second run skips all (no duplicate plans/assignments).
- `tsc`/types regenerated if any client code references the new column (likely none — this is DB-only).
- **Post-backfill canonical read smoke** (the payoff): on a backfilled test client (e.g. `+hybrid`) with `board_v2` ON, its now-canonical assignment reads through — Today card / pulse / program card show the promoted program (not the legacy fallback, not empty). I'll run this on the existing `+online` + a freshly-backfilled `+hybrid`.
- Anon-deny on the new RPC(s).

## Guardrails
- Idempotent + additive — creates canonical rows, **touches no legacy table** (except the `exercise_set_logs` re-key, which is the intended history migration; legacy `client_*` rows stay intact for the soak).
- ONE transaction per program.
- Don't flip `board_v2`, don't drop any legacy table — those are later cutover steps.
- `source_client_program_id` is the idempotency key — never create a second plan for a program that already has one.
- Re-keying `exercise_set_logs`: only rows whose `client_module_exercise_id` belongs to the program being backfilled; set BOTH `assignment_id` and `plan_slot_id`; leave `client_module_exercise_id` in place (don't null it during the soak — it's the rollback path).

## After this lands
Coverage = 0 (every active legacy program promoted) is the gate to **flip `board_v2` ON** — at which point every client reads canonical with real promoted data. Then the write-path cutover (assignment creates canonical-primary, stops writing legacy) and finally dropping the legacy tables + the `client_programs` arm of the roster UNION + the legacy hook branches.
