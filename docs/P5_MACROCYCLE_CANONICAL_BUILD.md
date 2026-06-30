# P5 Macrocycle write-cutover — assign a macrocycle canonical-primary, stop the legacy fan-out

**Status:** Build handoff (2026-06-30, Cowork). **Owner:** terminal. Cowork verifies on prod.
**Sibling of `docs/P5_WRITE_CUTOVER_BUILD.md`** — that slice cut the single-template 1:1 + team assign to canonical. This cuts the **macrocycle** assign (the last remaining legacy `client_programs` writer). It is a **prerequisite for the legacy drop** (CC flagged it): while `assign_macrocycle_to_client` still fans out legacy `client_programs` rows, `client_programs` can't be dropped.
**Build it `board_v2`-gated** (canonical when on, legacy fan-out when off) — safe to build + merge pre-flip; flag-off stays byte-identical; activates with the flip. **The migration apply is the only DB-touching step — write + build + push offline, apply when Supabase is back.**

## The key fact — the per-template canonical RPC already exists and already takes a macrocycle id
The write-cutover shipped `assign_template_to_client_canonical(p_coach_id, p_client_id, p_subscription_id, p_template_id, p_start_date, p_team_id, p_macrocycle_id, p_timezone)` (migration `20260630133057`). It:
- resolves the template's canonical plan (`plan p JOIN muscle_program_templates m ON m.id = p.source_muscle_template_id WHERE m.converted_program_id = p_template_id`, newest),
- `clone_plan`s it (own-your-copy),
- inserts ONE `client_plan_assignment` carrying `macrocycle_id`,
- returns `{skipped:false, assignment_id, plan_id, source_template_plan_id}` or `{skipped:true, reason:'no_mirror_plan'}`.

So the macrocycle cutover is **a loop**: for each mesocycle in `macrocycle_mesocycles` (ordered by `sequence`), call this RPC with a start_date staggered by the cumulative week count, passing `p_macrocycle_id`. No new clone/materialize logic.

## Grounding — the legacy fan-out it replaces (`supabase/migrations/20260421100000_add_macrocycles.sql`)
`assign_macrocycle_to_client(p_coach_id, p_client_id, p_subscription_id, p_macrocycle_id, p_start_date, p_team_id)`:
- loops `macrocycle_mesocycles` (`macrocycle_id, program_template_id, sequence`) in `sequence` order,
- inserts one legacy `client_programs` per mesocycle, `start_date` staggered by cumulative weeks of the prior mesocycles,
- returns `{ client_program_ids: uuid[], weeks_total: int }`.
- `macrocycle_mesocycles.program_template_id` → `program_templates(id)` (the legacy program-builder template), which is exactly the `p_template_id` the canonical RPC's resolver expects.

TS wrapper: `src/lib/assignMacrocycle.ts` → `assignMacrocycleToClient(...)` returns `{ success, clientProgramIds, weeksTotal }` (type `AssignMacrocycleResult` in `src/types/macrocycle.ts`).

## Step 1 — new RPC `assign_macrocycle_to_client_canonical(...)`
New migration (`YYYYMMDDHHMMSS_assign_macrocycle_to_client_canonical.sql`). SECURITY DEFINER, `SET search_path = public`, `p_`/`v_` naming, ONE transaction (all-or-nothing — a macrocycle is a unit).

Signature — match the legacy arg order + add timezone:
`(p_coach_id uuid, p_client_id uuid, p_subscription_id uuid, p_macrocycle_id uuid, p_start_date date, p_team_id uuid DEFAULT NULL, p_timezone text DEFAULT 'UTC') RETURNS jsonb`

Body:
1. `v_uid := auth.uid()`; null → `RAISE EXCEPTION ... 42501`. Auth gate identical to the write-cutover RPC: `is_admin(v_uid) OR v_uid = p_coach_id OR is_primary_coach_for_user(v_uid, p_client_id)`.
2. **Pre-resolve all mesocycles' canonical plans first** (so the all-or-nothing skip is clean — don't create half the assignments then bail). For each `macrocycle_mesocycles` row (ordered by `sequence`): resolve its canonical plan id with the same join as the write-cutover RPC. If ANY mesocycle has no canonical plan → `RETURN jsonb_build_object('skipped', true, 'reason', 'no_mirror_plan', 'assignment_ids', '[]'::jsonb)` (caller falls back to the legacy fan-out — a partial canonical macrocycle is worse than a clean legacy one).
3. Loop mesocycles in `sequence` order, maintaining `v_cumulative_weeks` (start 0):
   - `v_start := p_start_date + (v_cumulative_weeks * 7)` (days).
   - clone the resolved plan (`clone_plan`), insert one `client_plan_assignment` (client_id, subscription_id, plan_id=clone, macrocycle_id=p_macrocycle_id, primary_coach_id=p_coach_id, team_id=p_team_id, start_date=v_start, status='active', timezone=COALESCE(NULLIF(p_timezone,''),'UTC')). Collect the new assignment id.
   - **week count for the stagger** = `count(plan_weeks WHERE plan_id = <the clone>)` (the canonical clone's week count is the source of truth — equals the template's). Add to `v_cumulative_weeks`. (If a clone somehow has 0 weeks, treat as 1 to avoid same-day stacking — match legacy behavior; legacy used the template's `weeks`/day span.)
   - Reuse the write-cutover RPC's clone+insert inline rather than calling it (a nested SECURITY DEFINER call re-checks `auth.uid()` fine, but inline keeps it one transaction and avoids the per-call resolve; either is acceptable — inline preferred).
4. Return `jsonb_build_object('skipped', false, 'assignment_ids', <jsonb array of new ids in sequence order>, 'weeks_total', v_cumulative_weeks)`.

**Grants (mandatory pattern):**
```sql
REVOKE ALL ON FUNCTION public.assign_macrocycle_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_macrocycle_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_macrocycle_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,text) TO authenticated;
```

## Step 2 — rewire `src/lib/assignMacrocycle.ts` (board_v2-gated)
Mirror `assignProgram.ts` exactly:
```ts
if (isBoardV2Enabled()) {
  const { data, error } = await supabase.rpc("assign_macrocycle_to_client_canonical", {
    p_coach_id: coachUserId, p_client_id: clientUserId, p_subscription_id: subscriptionId,
    p_macrocycle_id: macrocycleId, p_start_date: format(startDate, "yyyy-MM-dd"),
    p_team_id: teamId || null, p_timezone: <client tz or 'UTC'>,
  });
  if (!error && data && !(data as any).skipped) {
    const r = data as { assignment_ids: string[]; weeks_total: number };
    return { success: true, clientProgramIds: r.assignment_ids, weeksTotal: r.weeks_total };
    // clientProgramIds now carries canonical assignment ids — the dialog only uses it for count/toast.
  }
  // skipped:no_mirror_plan OR error → Sentry warn + fall through to legacy.
  captureException(new Error("assign_macrocycle_to_client_canonical fell back to legacy"),
    { level: "warning", context: "assignMacrocycle", extra: { macrocycleId, reason: (data as any)?.skipped ? "no_mirror_plan" : error?.message } });
}
// flag off OR fallthrough: existing legacy assign_macrocycle_to_client call, unchanged.
```
- Keep `AssignMacrocycleResult` shape unchanged. Under canonical, `clientProgramIds` carries assignment ids. **Verified safe (Cowork, 2026-06-30):** the only caller is `AssignMacrocycleDialog`, which reads `result.weeksTotal` only — it never fetches `client_programs` by those ids (its preview `weeksTotal` prop comes from `useMacrocycles`, not the assign result). So the field is just a created-count carrier; no consumer breaks. No further callers to check.
- `import { captureException } from "@/lib/errorLogging"` + the same `isBoardV2Enabled` import `assignProgram.ts` uses.

## Guardrails
- Flag-off byte-identical (legacy fan-out untouched). Canonical only under `board_v2`.
- **All-or-nothing:** if any mesocycle lacks a canonical plan, skip the whole thing → legacy fallback. Never create a partial canonical macrocycle.
- ONE transaction; stagger by the clone's `plan_weeks` count; carry `macrocycle_id` + `team_id` onto every assignment.
- Note (same as the 1:1/team cutover): this slice does not add a dual-write mirror — under `board_v2` the macrocycle is canonical-only. Pre-flip flag-off macrocycle assigns are legacy-only and are covered by the backfill re-run before the flip.
- `tsc -p tsconfig.app.json` + build clean; CI green. **Do NOT apply the migration while Supabase is down** — push the branch, apply (`supabase db push` / dashboard) when it's back, then ping Cowork to verify.

## Verify (Cowork, when Supabase is back)
- Anon-deny on the new RPC (`SET LOCAL ROLE anon; SELECT assign_macrocycle_to_client_canonical(...)` → 42501).
- With `board_v2` ON, assign a multi-meso macrocycle to a test client (e.g. `+hybrid`): N `client_plan_assignment` rows created (one per mesocycle), all with `macrocycle_id` set, `start_date`s staggered by cumulative weeks, **zero new `client_programs` rows**. Each assignment reads its program canonically (Today/pulse/program card).
- A macrocycle whose mesocycles have NO canonical plan → falls back to the legacy fan-out (N `client_programs`), Sentry warning logged.
- Flag-off: legacy fan-out, byte-identical.
- `assignMacrocycleToClient` callers (the assign dialog) show the right count + weeks total in both paths.

## After this
With single-template (write-cutover) AND macrocycle assigns both canonical-only under `board_v2`, **no path creates legacy `client_programs` anymore**. That clears the last write-side blocker for `docs/P5_LEGACY_DROP_BUILD.md` Stage B (DROP `client_programs*`). Remaining drop prereqs per that doc: flip live + write-cutover live + soak + canonical workout-finish confirmed.
