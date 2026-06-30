# P5 — `board_v2` flip-on readiness plan

**Status:** Planning only (2026-06-30, Cowork). **No code, no migration, no flip in this doc.** Hands back to Hasan for go/no-go and to Cowork to pressure-test the parity monitor + fallback audit.
**Context:** The P5 *read side* is complete — every workout read (client + coach, UI + RPC) is canonical-capable under `board_v2` (Slices 1–3 + roster RPC, all merged to `main`). Flipping `board_v2` ON in prod is a separate, high-blast-radius decision. This plan is the pre-flight.

---

## ⚠️ Headline finding (drives everything below)
**Four read sites do NOT fall back to legacy when a client has no canonical assignment** — under `board_v2` ON they return null/0/empty instead of the client's real legacy data. For the `+online` seed (which *has* an assignment) this never showed; it would hit **every not-yet-backfilled client** the instant the flag flips. So a naive "flip ON all-at-once before backfill" is **unsafe**. The fix is small (make those four fall through to legacy like the others) and is a **prerequisite slice** before any flip. Details in §2.

---

## 1. Flip mechanism

`isBoardV2Enabled()` → `isFeatureEnabled("board_v2")` (`src/lib/featureFlags.ts`). Resolution order (line 38–50):
1. **Build-time env `VITE_FF_BOARD_V2`** truthy (`on`/`true`/`1`/`yes`) → ON for everyone. Wins over everything.
2. else per-browser **`localStorage["igu_ff_board_v2"]`** truthy → ON for that browser only.
3. else **OFF** (default).

**To flip prod ON:** set `VITE_FF_BOARD_V2=true` in **Vercel → prod env**, then redeploy (Vite inlines `import.meta.env` at build, so it requires a rebuild — not a runtime toggle). Changing the `featureFlags.ts` default in code is the alternative but is strictly worse (a deploy either way, and it bakes the new default into history); **prefer the Vercel env var** so the flip is one env change + redeploy and trivially revertible (unset + redeploy).

**Staged / cohort rollout — NOT natively feasible.** The flag is client-side and binary at build:
- `VITE_FF_BOARD_V2` is all-or-nothing per deploy.
- `localStorage` is per-browser manual (good for *internal* dogfooding — set it in staff browsers — but not a server-controlled cohort).
- There is **no per-user/server-driven gating** today.

**The pragmatic "staging" is assignment-gated behavior, not flag-gated cohorts.** Once §2's gaps are fixed so *every* read falls back to legacy when there's no canonical assignment, flipping `VITE_FF_BOARD_V2=true` becomes **self-staging**: a client sees canonical *iff they have a canonical assignment*, legacy otherwise. Backfill then moves clients onto canonical one at a time. That converts the flip from "big-bang" into "safe, naturally phased by backfill coverage" — which is the recommended posture (§5). A true server cohort flag would be a separate build (per-user DB flag or remote config); **not required** if we adopt assignment-gated staging.

---

## 2. Fallback audit — every canonical read site, on no-assignment

"Fallback" = what the site returns under `board_v2` ON for a client with **no active `client_plan_assignment`** (i.e. not yet backfilled).

### ✅ Clean fall-through (safe to flip today)
| Site | File | Behavior on no-assignment |
|---|---|---|
| `useClientWorkoutsToday` (S1) | `src/hooks/useClientWorkouts.ts:139–184` | `if (assignment) { if (schedule) {…return} }` → **falls through to the legacy query**. Comment: "No assignment / null schedule → fall through to the legacy query below." |
| `useWorkoutPulse` (3a) | `…/workouts/useWorkoutPulse.ts:392–447` | `if (assignment) { if (schedule) {…return} }` → **legacy 5-stage path**. "no assignment → fall through to legacy." |
| `useClientPrograms` (3c) | `…/workouts/useClientWorkouts.ts:67–103` | `if (assignment) { if (schedule) {…return} }` → **legacy client_programs list**. |
| `useSessionLog` (3b) | `…/workouts/useClientWorkouts.ts` | Canonical path only when `module.canonical` is set, which only exists when a canonical schedule (→ assignment) produced the drilldown. Legacy modules → legacy read. **No no-assignment path exists.** |
| `loadCanonicalSchedule` / `loadCanonicalWorkoutLogs` / `resolveActiveAssignment` / `canonicalSessionResolver` | `src/lib/canonicalScheduleAdapter.ts`, `canonicalSessionResolver.ts` | **Primitives** — return `null`/`[]` when there's no assignment/plan. Safe by contract; the *caller* owns fallback. |
| `get_coach_roster_stats.has_program` (RPC) | migration `20260630104618` | **UNION** of legacy OR canonical — reads *both*, so no fallback needed. Correct for legacy-only, canonical-only, and dual clients. |

### ❌ Hard cutover — NO legacy fallback on no-assignment (FLIP BLOCKERS)
| Site | File:line | Bug when flag ON + no assignment |
|---|---|---|
| `OverviewTab` "Last Workout" | `…/tabs/OverviewTab.tsx:74–76` | `lastWorkoutAt = assignment ? canonicalLastWorkoutAt(...) : null` → **null** (legacy `completed_at` ignored). Coach sees "no last workout" for an active legacy client. |
| `useClientVitals` last-workout | `…/useClientVitals.ts:166–168` | same `assignment ? … : null` → **null**. |
| `NewClientOverview` program count | `…/client/NewClientOverview.tsx:134–137` | `setProgramCount(assignment ? 1 : 0)` → **0** → client sees the **"coach is preparing your program"** empty state despite having a legacy program. |
| `useAdherencePulse` weekly counts | `…/workouts/useClientWorkouts.ts:297–311` | `if (boardV2){ assignment; schedule; if(schedule){count} } else {legacy}` → no-assignment ⇒ **weeklyScheduled/Completed = 0** (legacy week ignored). |

**These four were written as "canonical-or-nothing under the flag" (correct intent for *validation on `+online`*, which always has an assignment), not "canonical-with-legacy-fallback."** They must be hardened to fall through to legacy on no-assignment **before** any flip. This is a small, isolated slice — call it **"P5 fallback hardening"** — mechanically identical to the clean sites above (wrap the canonical read in `if (assignment) { … } else { legacy }`, or compute legacy first and overlay canonical when present). **Not built here, per the stop instruction** — flagged as a prerequisite.

---

## 3. Divergence monitor (canonical vs legacy for dual-written clients)

Goal: before trusting canonical, confirm canonical ≈ legacy for clients who have **both** (dual-written since **PR #185**). Caveats matter — naive equality will false-alarm.

### Cleanly comparable (SQL parity)
- **`has_program` parity** — for every active client: `(active client_programs exists) == (active client_plan_assignment exists)`. Dual-write should make these equal; mismatches flag dual-write/backfill holes.
  ```sql
  -- mismatches only
  WITH actives AS (
    SELECT user_id FROM subscriptions WHERE status='active'
  ),
  leg AS (SELECT DISTINCT user_id FROM client_programs WHERE status='active'),
  can AS (SELECT DISTINCT client_id AS user_id FROM client_plan_assignment WHERE status='active')
  SELECT a.user_id,
         (a.user_id IN (SELECT user_id FROM leg)) AS legacy_program,
         (a.user_id IN (SELECT user_id FROM can)) AS canonical_assignment
  FROM actives a
  WHERE (a.user_id IN (SELECT user_id FROM leg)) <> (a.user_id IN (SELECT user_id FROM can));
  ```
- **Schedule-structure parity** — for dual clients, compare legacy day/module counts vs canonical schedule module count. **Must exclude clients with an inserted on-demand deload** (`client_plan_inserted_deloads`) — there, canonical *intentionally* diverges (deload-aware) from the frozen legacy snapshot; that's the feature, not a bug.

### NOT cleanly SQL-comparable — needs care (call out, don't fake parity)
- **last-workout & tonnage** derive from `exercise_set_logs`, but **the keying differs by which UI wrote the log**: legacy logs carry `client_module_exercise_id` (cme-keyed); canonical logs carry `assignment_id + plan_slot_id` with `client_module_exercise_id` NULL. A client logging via the canonical player produces logs the *legacy* readers can't see (and vice-versa). So:
  - Legacy "last workout" = `max(client_day_modules.completed_at)` (module-completion event), canonical = `max(exercise_set_logs.created_at WHERE assignment_id)` (last set-log event) — **different events**, not equal even when both are "fresh."
  - Tonnage runs through app-layer aggregation (`toLoggedSet`/`setTonnage`/tempo) that's impractical to reproduce in SQL.
  - **Recommendation:** for these two, use an **app-layer shadow-compare harness** instead of SQL — for a sample of dual clients, invoke both the legacy and canonical code paths and diff the outputs, accounting for log keying. A SQL "parity" query here would produce false mismatches and false confidence. (A coarse SQL sanity check is still useful: per client, count `exercise_set_logs` where `client_module_exercise_id IS NOT NULL` vs `assignment_id IS NOT NULL` — tells you which keying their history is in, i.e. whether log re-keying is needed at backfill; see §4.)

### Operationalizing
- Run the SQL parity queries as a periodic check (manual or a lightweight cron) over the soak window; expect **zero** `has_program` mismatches and zero non-deload schedule mismatches before widening the flip.
- Cowork to pressure-test: confirm the deload-exclusion is correct, and design the shadow-compare sampling for last-workout/tonnage.

---

## 4. Backfill plan (SPEC ONLY — do not build)

Promote each active legacy program to the canonical model so canonical reads have data, then (eventually) drop legacy.

**Two parts — part B is the hard one:**

**A. Structure promotion ("promote to frozen plan", §P5).** For each active `client_programs` lacking an active `client_plan_assignment`:
- Build a frozen `plan` (visibility not global; owned by the assigning coach) from the snapshot: `client_program_days → plan_weeks/plan_sessions`, `client_day_modules → plan_sessions`, `client_module_exercises → plan_slots` (carry `exercise_id`, `section`, `sort_order`, prescription → `prescription_json`).
- Create `client_plan_assignment` (client → plan, `start_date = client_programs.start_date`, status active).
- **Idempotent + additive:** skip clients who already have an active assignment; never mutate legacy tables; safe to re-run.

**B. Log re-keying (history preservation).** Structure promotion alone makes canonical analytics show **empty history** (canonical reads key on `assignment_id + plan_slot_id`; legacy logs are cme-keyed). To preserve tonnage/PR/last-workout/completion, legacy `exercise_set_logs` must be **re-keyed**: map each legacy `client_module_exercise_id` → its newly-created `plan_slot_id`, and set `assignment_id + plan_slot_id` on those log rows (dual-key or migrate). This requires a reliable cme→slot mapping captured during part A. **This is the riskiest piece** — flag for its own design + verification pass; without it, backfilled clients lose visible workout history under canonical.

**Coverage query (acceptance):**
```sql
-- every active legacy program's owner has an active canonical assignment → 0 rows
SELECT cp.user_id
FROM (SELECT DISTINCT user_id FROM client_programs WHERE status='active') cp
WHERE NOT EXISTS (
  SELECT 1 FROM client_plan_assignment a
  WHERE a.client_id = cp.user_id AND a.status='active'::client_program_status
);
```
Plus a part-B coverage check: every cme-keyed `exercise_set_logs` row for a backfilled client has a corresponding canonical key.

---

## 5. Recommended order + reasoning

**Recommended: fix-fallbacks → flip (self-staging) → incremental backfill+parity → drop legacy.**

1. **Prerequisite slice — "P5 fallback hardening"** (the §2 four sites → fall back to legacy on no-assignment). Small, isolated, board_v2-gated. **Must precede any flip.** After this, every read is canonical-iff-assignment-else-legacy.
2. **Pilot dual-write parity** — pick a few real clients already dual-written (PR #185), run §3's `has_program` + schedule parity + a shadow-compare on last-workout/tonnage. Gain confidence canonical ≈ legacy on real data while the flag is still OFF in prod.
3. **Flip `VITE_FF_BOARD_V2=true` + soak.** Because §1's fallback now holds, this is **safe and self-staging**: real clients (no assignment yet) keep seeing legacy; only assignment-holders (test seeds, then pilot-backfilled clients) get canonical. Soak with the parity monitor running. Easy revert (unset env + redeploy).
4. **Backfill incrementally** (§4 A+B), small cohorts, **parity-verify each cohort** before the next. Each backfilled client flips to canonical naturally (they now have an assignment). Monitor for divergence per cohort.
5. **Drop legacy** only after 100% coverage (§4 coverage query = 0) + a clean soak. Then delete the `client_programs` arm of `prog`, the legacy hook branches, and finally the legacy tables.

**Why not the two simpler orders:**
- **Flip-then-backfill (naive):** unsafe today — the §2 gaps break every not-backfilled client at the moment of flip. Even *with* the gaps fixed, flipping before *any* backfill is fine (self-staging no-op for real clients) — which is exactly step 3 above; the difference is we fix the gaps first.
- **Backfill-everything-then-flip (big-bang):** runs a large, partly-unverified backfill (esp. risky part B) against 100% of prod before any production canonical validation, then exposes it all at once. Higher blast radius and harder to attribute failures. The incremental order validates the read path (step 3) and the backfill (step 4) in separate, smaller steps.

**One-liner:** *Harden the four fallbacks, flip (safe + self-staging), then backfill cohort-by-cohort with parity gates, then drop legacy.*

---

## Hand-off
- **Hasan:** go/no-go on the order; the flip itself (`VITE_FF_BOARD_V2`) is your deliberate call.
- **Cowork:** pressure-test §2 (confirm the four gaps + that the clean sites really fall through) and §3 (deload-exclusion correctness; shadow-compare design for last-workout/tonnage).
- **Prerequisite before any flip:** build "P5 fallback hardening" (§2). Not built here by instruction.
