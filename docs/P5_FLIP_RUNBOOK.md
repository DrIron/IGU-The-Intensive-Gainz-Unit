# P5 — `board_v2` flip runbook (the executable checklist)

**Status:** Runbook (2026-06-30, Cowork). Supersedes the analysis in `docs/P5_FLIP_ON_READINESS_PLAN.md` for *execution* (that doc remains the "why"). **The flip is Hasan's deliberate call.**
**Goal of the flip:** make every shipped-but-flagged canonical surface (Teams T1–T3, S1–S4 sync, deload v2, board v2, P5 reads) user-visible at once. Highest-blast-radius single action in the epic — hence this gated checklist.

This runbook is **blocked while Supabase is down** (the live gate queries + smokes need the DB). Everything here is "run when the project is reachable again." Re-check reachability at the start of every working session: a trivial `SELECT 1` via execute_sql, or `status.supabase.com` (note the status page reports the *fleet*, not our specific project — trust the `SELECT 1`).

---

## 0. Current state (git-confirmed 2026-06-30, main tip `7775429`)
**On `main` (all behind `board_v2`, OFF in prod — no user-visible change):**
- Read side complete: Slice 1 `82a846f`, Slice 2 `452a8b5`, Slice 3 `5779304`, roster RPC `0b4ba5f`.
- **Fallback hardening MERGED** `0a07413` (the §2 flip-blocker fix — every read now canonical-iff-assignment-else-legacy). This was the hard prerequisite; it's done.

**NOT on main (branches):**
- `feat/p5-backfill` (`511fea7`) — UNMERGED. **But the backfill RPC already ran on prod**: 8/8 active legacy programs promoted, coverage=0, parity 8/8 (Cowork-verified). So the *data* gate is met; the *migration files* still need to land on main for reproducibility (and for any real client post-launch).
- `feat/p5-write-cutover` (`f661568`) — UNMERGED, Cowork code-reviewed OK. Makes new assigns canonical-primary (stops writing legacy). Not yet applied to prod.
- Macrocycle write-cutover — **spec only** (`docs/P5_MACROCYCLE_CANONICAL_BUILD.md`), not built. The last legacy `client_programs` writer.

**Implication for ordering:** the read side is flip-ready now. The write side (cutover + macrocycle) does NOT block the flip — it blocks the *legacy drop*. So the flip can happen before the write-cutover merges; new assigns just keep writing legacy (+ canonical mirror) until the cutover lands. Recommended sequence in §4.

---

## 1. Pre-flip gate — ALL must pass (run when DB is back)
Run against prod (`ghotrbotrywonaejlppg`). Every query is designed to **return 0 rows / expected constant**. Any deviation → stop, investigate, do not flip.

### 1a. Coverage — every active legacy program has a canonical promotion (= 0 rows)
```sql
SELECT cp.id, cp.user_id
FROM client_programs cp
WHERE cp.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM plan p WHERE p.source_client_program_id = cp.id);
```
This was 0 at backfill time. **Re-run it at flip time** — if any assignment was created since the backfill (e.g. a test assign), it may be an un-promoted legacy program. If >0: re-run the backfill driver (`backfill_all_active_client_programs()`), then re-check. (The write-cutover, once merged, makes this self-maintaining; until then, re-backfill before flipping.)

### 1b. `has_program` parity — legacy vs canonical for active clients (= 0 mismatch rows)
```sql
WITH actives AS (SELECT DISTINCT user_id FROM subscriptions WHERE status='active'),
     leg AS (SELECT DISTINCT user_id FROM client_programs WHERE status='active'),
     can AS (SELECT DISTINCT client_id AS user_id FROM client_plan_assignment WHERE status='active')
SELECT a.user_id,
       (a.user_id IN (SELECT user_id FROM leg)) AS legacy_program,
       (a.user_id IN (SELECT user_id FROM can)) AS canonical_assignment
FROM actives a
WHERE (a.user_id IN (SELECT user_id FROM leg)) <> (a.user_id IN (SELECT user_id FROM can));
```
Mismatch = a client who has legacy but not canonical (backfill hole → they'd correctly fall back to legacy post-flip, but investigate why) or canonical but not legacy (a pure-canonical seed — expected for the `+online`/test fixtures; eyeball that the rows are only known test accounts).

### 1c. Schedule-structure parity — dual-written clients, EXCLUDING inserted deloads (= 0 mismatch rows)
Inserted on-demand deloads make canonical *intentionally* diverge from the frozen legacy snapshot — exclude them or they false-alarm.
```sql
WITH dual AS (
  SELECT a.client_id, a.id AS assignment_id, a.plan_id
  FROM client_plan_assignment a
  WHERE a.status='active'
    AND EXISTS (SELECT 1 FROM client_programs cp WHERE cp.user_id=a.client_id AND cp.status='active')
    AND NOT EXISTS (SELECT 1 FROM client_plan_inserted_deloads d WHERE d.assignment_id = a.id)
),
leg_cnt AS (
  SELECT cp.user_id,
         (SELECT count(*) FROM client_day_modules m
            JOIN client_program_days d ON d.id=m.client_program_day_id
          WHERE d.client_program_id=cp.id) AS legacy_modules
  FROM client_programs cp WHERE cp.status='active'
),
can_cnt AS (
  SELECT dual.client_id,
         (SELECT count(*) FROM plan_sessions s
            JOIN plan_weeks w ON w.id=s.plan_week_id
          WHERE w.plan_id=dual.plan_id) AS canonical_sessions
  FROM dual
)
SELECT d.client_id, l.legacy_modules, c.canonical_sessions
FROM dual d
JOIN leg_cnt l ON l.user_id=d.client_id
JOIN can_cnt c ON c.client_id=d.client_id
WHERE l.legacy_modules <> c.canonical_sessions;
```
> Join columns verified against the migration DDL (Cowork 2026-06-30): `client_day_modules.client_program_day_id → client_program_days.id → .client_program_id`; `plan_sessions.plan_week_id → plan_weeks.id → .plan_id`. For the 8 promoted test programs this should be 0 (the backfill's built-in parity already asserted sessions==modules and slots==exercises per program). One nuance: this counts canonical sessions across ALL `plan_weeks` of the clone vs legacy `client_day_modules` across all days — equal only if the promotion preserved week/session granularity (it does: one plan_session per legacy module). If a clone has multiple weeks where legacy had one cycle, compare per-week instead.

### 1d. Log-keying sanity (informational, not a blocker)
Tells you which keying each client's history is in. Not a pass/fail — it confirms the backfill re-keyed logs to canonical (`assignment_id`).
```sql
SELECT
  count(*) FILTER (WHERE client_module_exercise_id IS NOT NULL AND assignment_id IS NULL) AS legacy_only_logs,
  count(*) FILTER (WHERE assignment_id IS NOT NULL) AS canonical_keyed_logs
FROM exercise_set_logs;
```
For the test accounts this touches ~0 rows (little history). The key point: no active backfilled client should have history *only* in `legacy_only_logs` if you expect canonical analytics to show it.

### 1e. Sentry quiet
Confirm no open errors on canonical read paths (`save_plan_from_builder_mirror`, `assign_plan_to_client_mirror`, canonical session resolve) over the prior soak window.

### 1f. last-workout / tonnage — NOT SQL-comparable (do NOT gate on a SQL parity query)
These derive from `exercise_set_logs` with **different keying and different events** per UI (legacy = `client_day_modules.completed_at`; canonical = `max(exercise_set_logs.created_at WHERE assignment_id)`). A SQL "parity" query here produces false mismatches. Validate these by the **post-flip live smoke** (§3) on the `+online` seed instead, where you can eyeball both paths.

---

## 2. The flip action
Set `VITE_FF_BOARD_V2=true` (the **single master flag** — it drives the canonical reads AND the canonical session player) + redeploy.

1. Vercel → project → Settings → Environment Variables → **Production**: add `VITE_FF_BOARD_V2 = true`.
2. Redeploy prod (Vite inlines `import.meta.env` at build — env change alone does nothing without a rebuild).
3. Confirm the deploy is live (new build hash) and the app loads.

> **Pre-fix caveat (resolved `feat/p5-flip-safety`):** before that fix, `board_v2` alone 400'd the workout player — the Today card / calendar routed Start to the canonical URL, but `WorkoutSessionV2` gated its canonical loader on the separate `canonical_session_read` flag, so with `board_v2` on and `canonical_session_read` off it fell to the legacy loader with `moduleId="canonical"` → `client_day_modules?id=eq.canonical` → 400. The fix makes `board_v2` the sole gate for the player too, so this single env var is now sufficient. Ensure `feat/p5-flip-safety` is merged before flipping.

**Why the env var, not a code default:** one env change + redeploy, trivially revertible (unset + redeploy), no default baked into git history. `localStorage["igu_ff_board_v2"]` stays the per-browser dogfood override (independent of the env var).

**Self-staging:** because fallback hardening is merged, flipping the env is safe — a client reads canonical **iff they have an active `client_plan_assignment`**, legacy otherwise. With coverage=0 (all active programs promoted), the test/seed clients read canonical and there are no real un-backfilled clients to strand.

---

## 3. Post-flip smoke (per surface — run as the seeded accounts)
Sign in per role (admin redirects; anon hits waitlist — see [[project_igu_test_accounts]]). Fixture: `+online` (4331fa4f) → assignment `74349417` → clone `093cee67`.

- **Client `+online`:** Today card reads canonical (Start → `/session/canonical?assignment=74349417…`); Programs list shows the promoted program (not the "coach is preparing" empty state); Workout Calendar grid renders canonical dates; log a set → canonical `exercise_set_logs` row (assignment-keyed).
- **Client with an inserted deload** (seed one on `+online` if needed): calendar shows the Recovery week + the +1wk shift.
- **Coach (of `+online`):** Client Overview → Overview "Last Workout" populates; Workouts Pulse tonnage/adherence populate; Programs drilldown shows session titles (not "Untitled"); roster shows `has_program=true`.
- **+hybrid (freshly backfilled, no prior canonical reads):** the post-backfill read smoke that was owed — Today/pulse/program card show the promoted program, confirming a *backfilled* (not hand-seeded) client reads through.
- **A legacy-only / no-assignment path** (if any exists): confirm it still shows legacy data (fallback holds) — not null/empty.
- **Teams:** a team member reads the shared team plan; My Teams shell loads.

Watch Sentry live during the smoke.

---

## 4. Recommended sequence from here to zero-legacy
1. **Flip** (§2) once §1 passes — read side only. New assigns still write legacy (+ canonical mirror) for now; that's fine.
2. **Soak** a few days on canonical reads with real usage (you + test accounts). Parity queries (§1b/1c) stay at 0.
3. **Merge `feat/p5-backfill`** to main (gets the migration files onto main; data already on prod — `db push` will reconcile, watch for the prod-ahead-of-main case, see [[feedback_supabase_prod_ahead_of_main_db_push]]).
4. **Merge `feat/p5-write-cutover`** + verify live (new assign → canonical assignment, zero new `client_programs`; flag-off legacy parity; anon-deny). **Re-run the backfill once more right before/after** to sweep any assign made during the soak (the cutover removes the dual-write mirror, so pre-cutover flag-on assigns are legacy-only until swept).
5. **Build + merge the macrocycle cutover** (`docs/P5_MACROCYCLE_CANONICAL_BUILD.md`) — after this, NO path writes legacy `client_programs`.
6. **Soak again** — confirm `client_programs WHERE status='active'` count is flat (no new legacy rows).
7. **Legacy drop** (`docs/P5_LEGACY_DROP_BUILD.md`) — Stage A (remove legacy code branches) ships + soaks, then Stage B (DROP TABLE). Confirm the canonical workout-finish path needs no `complete_client_day_module` first.
8. **Done = the goal:** zero legacy, all canonical. Then the deferred `docs/help/` FAQ pass.

---

## 5. Rollback
- **Reads wrong after flip:** unset `VITE_FF_BOARD_V2` in Vercel prod + redeploy → instant revert to legacy reads (the data is untouched; canonical rows just stop being read). No data migration to undo.
- **A specific client looks wrong:** check they have an active `client_plan_assignment` + that `1b`/`1c` pass for them; if it's a backfill gap, they should be on the legacy fallback anyway — investigate before assuming canonical is at fault.
- The flip touches **no data** — it only changes which model the reads prefer. That's what makes it safely reversible.
