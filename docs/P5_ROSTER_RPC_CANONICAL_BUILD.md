# P5 (server-side) — `get_coach_roster_stats.has_program` → canonical

**Status:** Build handoff (2026-06-30, Cowork). **Owner:** terminal. Cowork verifies on preview.
**Type:** SECURITY DEFINER SQL function migration (the last server-side legacy *workout* reader in the P5 burn-down).
**Depends on:** Slices 1–3 (canonical schema + assignments live). Independent of Slice 3 UI validation.
**Reads:** `docs/P5_SLICE3_WORKOUT_ANALYTICS_BUILD.md` §After.

## ⚠️ Accuracy correction (read first — changes the scope)
The brief assumed this RPC computes workout "completion" and should reuse `loadCanonicalSchedule`'s every-slot-logged definition. **It does not.** I read both deployed functions:

- **`get_coach_roster_stats`** returns per-client `{ adherence_pct, weigh_ins_this_week, expected_weigh_ins, last_weigh_in_date, has_program }`. `adherence_pct` is **nutrition** adherence (`weekly_progress.followed_calories` for team / `adherence_logs` for 1:1); weigh-ins from `weekly_progress`/`weight_logs`. **The ONLY workout-domain read is the `prog` CTE → `has_program` = "client has an active `client_programs` row" — a boolean presence check, no completion count.**
- **`get_coach_roster_attention`** (sibling) — audited too: payment/inactive/pending/adjustments + `check_in_overdue` (from `weight_logs` weigh-in recency). **No workout reads at all.** Not part of this migration.

So there is **no workout-"completed" definition in either RPC to reuse** — the completion-logic concern doesn't apply here. (It *would* apply if we ever add a *workout*-adherence tile to the roster; that future addition should reuse the every-slot-logged rule from `canonicalScheduleAdapter`/`loadCanonicalSchedule`. Out of scope now — flagged so it's not forgotten.)

**Net: this migration is one line of intent — make `has_program` canonical-aware.** Workout *adherence/tonnage/PR* already went canonical in Slice 3a (`useWorkoutPulse`), independently of this RPC.

## The change
`has_program` currently = active `client_programs`. Make it = active `client_programs` **OR** active `client_plan_assignment`:

```sql
-- in get_coach_roster_stats, replace the prog CTE:
  prog AS (
    SELECT user_id FROM public.client_programs
      WHERE user_id IN (SELECT user_id FROM roster) AND status = 'active'
    UNION
    SELECT client_id AS user_id FROM public.client_plan_assignment
      WHERE client_id IN (SELECT user_id FROM roster) AND status = 'active'
  )
```
(The `SELECT DISTINCT cp.user_id` is replaced by the UNION, which already dedupes.)

### Why a UNION, not a `board_v2` parameter
`board_v2` is a **client-side** flag (localStorage/env) — a SECURITY DEFINER SQL function cannot read it. Two options:
- **(chosen) UNION** — the RPC always considers both sources. Purely additive: it can only flip `has_program` from false→true for a **canonical-only** client (one with an assignment but no legacy `client_programs` row). For every real prod client today (all have a legacy row), the value is **unchanged** — so it's effectively flag-off-safe while being forward-correct, and at the eventual legacy drop you just delete the `client_programs` arm.
- (rejected) `p_board_v2 boolean` param threaded from the client — more plumbing, and strictly worse: it would report `has_program=false` for a canonical-only client whenever the flag is off, which is just wrong.

This also **closes the Slice 2 loop**: `useClientVitals.hasProgram` reads `stat.has_program` from this RPC (Slice 2 deliberately left the RPC alone and only migrated the direct `client_programs` read). After this, the RPC-sourced `hasProgram` is canonical-correct too.

## Migration mechanics
- `CREATE OR REPLACE FUNCTION public.get_coach_roster_stats()` with the full body (only the `prog` CTE changes). **`CREATE OR REPLACE` preserves existing GRANTs** — no re-REVOKE/GRANT needed; verify after with `\df+` / `has_function_privilege`. Keep `SECURITY DEFINER`, `STABLE`, `SET search_path = public`, and the `auth.uid() IS NULL → '{}'` guard.
- Apply via MCP `apply_migration` (prod `ghotrbotrywonaejlppg`); rename the local file to the registered version.
- SECURITY DEFINER → the canonical read inside runs as owner (RLS-exempt), so no new RLS policy is needed for the function body (contrast the client-side hooks).

## Verify — before/after impersonation, per role
The RPC is self-scoped by `auth.uid()` (the caller's roster: own `coach_id` subs + their `coach_teams`), so "per role" = per coach identity. Proof:
1. **Canonical-only client false→true (the headline):** pick (or temporarily construct, rolled-back) a roster client of coach `92605b68` who has an **active `client_plan_assignment` but no active `client_programs` row** — e.g. the `+online` seed (`4331fa4f`, assignment `74349417`) if it's on `92605b68`'s active roster. Impersonate the coach, call `get_coach_roster_stats()`, read `result->'<clientId>'->>'has_program'`:
   - BEFORE migration: `false` (only `client_programs` checked).
   - AFTER: `true` (assignment arm).
   Run the BEFORE read first (current deployed fn), then apply, then the AFTER read — same impersonation pattern as Slice 2 (`set_config('request.jwt.claims', …)` + `SET LOCAL ROLE authenticated`).
2. **Non-breakage:** a roster client with a legacy `client_programs` row reads `has_program=true` both before and after (the `client_programs` arm is unchanged); a client with neither reads `false` both.
3. **Team-coach parity:** impersonate a team-coach whose team has a canonical-only member → that member's `has_program=true` after (the roster CTE already includes `team_id = ANY(coach_teams)`; the assignment arm keys on `client_id`, so it works for team members too).
4. Confirm grants intact: `SELECT has_function_privilege('authenticated','public.get_coach_roster_stats()','EXECUTE');` → true; anon stays as it was.

> `+online` caveat (same as Slice 3): seed real data as needed. For has_program you don't need logged sets — just the active assignment (already present). Just confirm `4331fa4f` is on a coach's active roster (active subscription + active profile) so it appears in the roster CTE.

## Guardrails
- Only the `prog` CTE changes — leave the nutrition adherence / weigh-in CTEs byte-identical.
- Additive `has_program` (OR canonical) — never removes the `client_programs` arm in this migration (that's the eventual legacy-drop step).
- No new "completed" computation — this RPC has none and isn't gaining one here.

## After this
This is the **last server-side workout-legacy reader**. Once it's in (and Slice 3 UI validation passes), every workout read — client + coach, UI + RPC — is canonical-capable under `board_v2`. Next macro-steps (separate work): **default `board_v2` ON + soak**, then the **P5 backfill** (legacy snapshots → `plan_*`/`client_plan_assignment`), then **drop the legacy tables** (`client_programs`/`_days`/`_day_modules`/`_module_exercises`) — at which point the `client_programs` arm of `prog` is deleted, leaving only the assignment read.
