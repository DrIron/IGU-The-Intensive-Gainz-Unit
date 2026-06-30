# P5 Slice 2 — "Last workout" + "Has program" reads → canonical

**Status:** Build handoff (2026-06-30, Cowork). **Owner:** terminal. Cowork verifies on preview.
**Flag:** `board_v2` (same gate as Slice 1 / `WorkoutCalendar`). Off in prod ⇒ legacy path unchanged, **byte-identical**.
**Depends on:** Slice 1 — **merged to `main` as `82a846f` (2026-06-30)**. This slice reuses `resolveActiveAssignment(clientId)` and `loadCanonicalSchedule` from `src/lib/canonicalScheduleAdapter.ts`. Branch off current `main`.
**Reads:** `docs/PROGRAM_SYSTEM_UNIFICATION.md` §P5 + `docs/P5_SLICE1_TODAYSWORKOUT_BUILD.md` (the pattern this repeats).

## Why these next
Slice 1 migrated the client "today" card. The next A surfaces that read the legacy deep-copy snapshot — and therefore go **stale after an on-demand deload / show wrong completion** — are the *thin* reads: "when did this client last work out" and "does this client have a program / how many." They share one tiny set of canonical primitives, so they're a clean, low-risk second slice that extends the Slice-1 hook-branch pattern to the **coach Client-Overview** + **client dashboard** surfaces.

## Scope (this slice) — the thin reads only

| # | Surface (A) | File / edit point | Legacy read today | Canonical replacement |
|---|---|---|---|---|
| 1 | Coach Overview "Last Workout" | `src/components/client-overview/tabs/OverviewTab.tsx` **70–98** | `client_programs`→`client_program_days`→`client_day_modules.completed_at` (max) | `canonicalLastWorkoutAt(assignmentId)` (new helper) |
| 2 | Coach Vitals "last workout" + "has program" | `src/components/client-overview/useClientVitals.ts` **118–122, 154–175** | same completed_at chain; `client_programs` active for `hasProgram` fallback | `canonicalLastWorkoutAt` + `resolveActiveAssignment != null` |
| 3 | Client dashboard hero/count | `src/components/client/NewClientOverview.tsx` **130–142, 185–210** | `client_programs` count → `programCount` → hero gate | active assignment presence → `hasProgram` |

**Out of scope — deliberately deferred to Slice 3** (they need per-slot exercise / prescription / set-log detail that `loadCanonicalSchedule` does NOT expose; materially heavier + riskier):
- `useWorkoutPulse` (tonnage / PR / TUST / needs-eyes) — reads `exercise_set_logs` joined to `client_module_exercises`/`exercise_library`.
- coach `useClientWorkouts.ts` → `useSessionLog` (per-exercise set log viewer) and the `useClientPrograms` *per-module completion counts* (`completedModules`/`totalModules`). `useAdherencePulse` weekly counts MAY come along here if cheap (see §"Optional"), else defer.
- **Already done — do NOT touch:** coach drilldown (`WorkoutsTab.tsx` already overlays `canonicalDrilldownDays`), client today card (Slice 1).

> If terminal wants to split even smaller: the migration (§0) + changes #1+#2 (coach side, one helper) is a valid standalone commit; #3 (client side) a second. Land in that order.

## 0. DB migration — coach RLS on canonical `exercise_set_logs` (REQUIRED, do this first)

**Why this is mandatory, not optional:** Slice 2 is the first time these canonical reads run in a **coach** context (OverviewTab + useClientVitals = a coach viewing a client). Both existing `exercise_set_logs` SELECT policies resolve the coach's access through the **legacy `client_module_exercise_id`** column — `"View set logs"` joins on it; `exercise_set_logs_select` calls `get_client_from_module_exercise(client_module_exercise_id)`. A **canonical** log has that column NULL (it keys on `assignment_id` + `plan_slot_id`), so neither coach branch can resolve the client → **silent RLS denial → `canonicalLastWorkoutAt` returns null** for the coach under `board_v2`. That's a coach-side regression vs legacy (where the coach *can* read `completed_at`), and the exact silent-RLS trap from CLAUDE.md. Verified against live policies 2026-06-30. (The **client** self-read works — `created_by_user_id = auth.uid()` — which is why Slice 1 was fine.) `client_plan_assignment` already has a coach SELECT policy (`cpa_coach`), so `resolveActiveAssignment` works in a coach context; only `exercise_set_logs` needs this.

Additive policy — existing policies untouched; mirrors the sibling `exercise_set_logs_select` (reuses `has_active_coach_access_to_client` = primary-coach + care-team) and adds admin + the assignment's direct `primary_coach_id` + team-coach. All referenced columns/helpers verified present. The `assignment_id IS NOT NULL` guard scopes it to canonical logs only (does not widen legacy-log access). **This also unblocks Slice 3** (its pulse/session-log reads hit `exercise_set_logs` as the coach too).

```sql
CREATE POLICY exercise_set_logs_canonical_coach_select ON public.exercise_set_logs
FOR SELECT USING (
  assignment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.client_plan_assignment cpa
    WHERE cpa.id = exercise_set_logs.assignment_id
      AND (
        public.is_admin((select auth.uid()))
        OR public.has_active_coach_access_to_client((select auth.uid()), cpa.client_id)
        OR cpa.primary_coach_id = (select auth.uid())
        OR EXISTS (
             SELECT 1 FROM public.coach_teams ct
             WHERE ct.id = cpa.team_id AND ct.coach_id = (select auth.uid())
           )
      )
  )
);
```

- No REVOKE/GRANT needed (that pattern is for SECURITY DEFINER functions, not RLS policies).
- Apply via MCP `apply_migration` (prod `ghotrbotrywonaejlppg`) then **rename the local migration file to the MCP-registered version** (per the usual workflow). Verify with a rolled-back coach impersonation: `BEGIN; SELECT set_config('request.jwt.claims', json_build_object('sub','<coach uid>','role','authenticated')::text, true); SET LOCAL ROLE authenticated; SELECT count(*) FROM exercise_set_logs WHERE assignment_id='<+online assignment>'; ROLLBACK;` — should return >0 once the policy exists, 0 before.
- **Optional, not a blocker:** no `(assignment_id, created_at)` index exists, so `canonicalLastWorkoutAt`'s order-by sorts. Fine at current volumes; add `CREATE INDEX ... ON exercise_set_logs (assignment_id, created_at DESC)` only if it shows up later.

## New shared helper — add to `src/lib/canonicalScheduleAdapter.ts`

`loadCanonicalSchedule` computes module completion from `exercise_set_logs` but discards timestamps. "Last workout at" needs the newest log time. Add a tiny dedicated query (cheaper than loading the whole schedule when all you need is the timestamp):

```ts
/**
 * Newest set-log timestamp for an assignment = the canonical "last workout at"
 * (the analog of legacy client_day_modules.completed_at max). Returns null when
 * the client has never logged a set under this assignment. board_v2-gated by callers.
 */
export async function canonicalLastWorkoutAt(assignmentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("exercise_set_logs")
    .select("created_at")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ?? null;
}
```

(Uses `assignment_id` on `exercise_set_logs` — the same column `loadCanonicalSchedule` filters on at line ~179. No new table.)

## What to change

### 1. `OverviewTab.tsx` — "Last Workout"
Inside the existing `load()` (the ref-guarded effect, ~55–139), wrap the last-workout derivation (70–98) in a `board_v2` branch:
- `const boardV2 = isBoardV2Enabled();` (already imported, line 21).
- When `boardV2`: `const a = await resolveActiveAssignment(context.clientUserId);` then `lastWorkoutAt = a ? await canonicalLastWorkoutAt(a.id) : null;` — and **skip** the three legacy queries (70–94).
- When `!boardV2` (or no assignment branch you choose to fall through): keep the existing legacy chain exactly.
- Everything downstream (`OverviewStats.lastWorkoutAt`, the `MetricCard` at 200–205, `relative()`/`recencyInterp`) is unchanged — same string|null shape.
- Note `OverviewTab` already uses `isBoardV2Enabled` only to gate `DeloadRequestPanel` (155); reuse the same import, compute `boardV2` once near the top of `load()`.

### 2. `useClientVitals.ts` — last workout + has-program fallback
Two reads to gate (inside the ref-guarded effect):
- **last workout** (154–175): same swap as #1 — `boardV2 ? (assignment ? canonicalLastWorkoutAt(assignment.id) : null) : <legacy chain>`. Resolve the assignment once and reuse for both reads.
- **has program** (118–122): the direct `client_programs` active read that feeds the local `hasProgram` fallback → under `boardV2`, `hasProgram = !!assignment`. **Leave the `useCoachRosterStats()` RPC path alone** — that's server-side (`get_coach_roster_stats`), out of scope; only migrate the *direct* `client_programs` read in this file. (The RPC still wins where it has data, per the existing 214–231 precedence; we only change the local fallback.)
- Return shape (`ClientVitals`, 33–53) unchanged.

### 3. `NewClientOverview.tsx` — program count / hero gate
The hero gate (185–210) only needs the boolean "has a program," derived from `programCount` (130–142):
- `const boardV2 = isBoardV2Enabled();` (import from `@/lib/featureFlags`).
- When `boardV2`: `const a = await resolveActiveAssignment(user.id); setProgramCount(a ? 1 : 0);` — skip the `client_programs` count query.
- When `!boardV2`: keep the existing count exactly.
- The hero gate `programCount === 0 && status==='active' && sub==='active'` then works unchanged: a client with a canonical assignment but **no legacy `client_programs` row** now correctly shows `TodaysWorkoutHero` (already Slice-1-migrated) instead of the "coach is preparing your program" empty state. That mismatch is the visible payoff.
- `TodaysWorkoutHero` / `AdherenceSummaryCard` / `WeeklyProgressCard` children are untouched (they fetch by `userId`; `TodaysWorkoutHero` already reads canonical).

### Optional (only if trivially cheap, else defer to Slice 3)
Coach `useClientWorkouts.ts` → `useAdherencePulse` (211–301) `lastWorkoutAt` field: it derives from the same legacy `client_day_modules` rows. If you're already in the file you *may* set its `lastWorkoutAt` from `canonicalLastWorkoutAt` under `boardV2`, but the **weekly completion %** there needs per-module canonical completion (which `loadCanonicalSchedule` *does* give via `schedule.byDate[*].modules[].status`) — only do it if you can reuse the schedule cleanly. If it balloons, **stop and defer the whole hook to Slice 3.** Do not half-migrate weekly counts.

## Build decisions (resolved — don't re-litigate)
- **Gate inside each effect**, not on a query key — these are plain `useState`/`useEffect`, not React Query (unlike Slice 1's hook). There's no cache to discriminate; the effect re-runs per `clientUserId`/mount.
- **Reuse `resolveActiveAssignment` + add `canonicalLastWorkoutAt`** — don't inline the assignment query again (WorkoutsTab/WorkoutCalendar already each inline it; we're consolidating, not adding a 4th copy).
- **Don't touch the `get_coach_roster_stats` RPC** — server-side canonical migration is a separate, later piece. Only the direct table reads in these files change.
- **Defer pulse/session-log/per-module-counts** — they require an adapter extension exposing per-slot exercise+prescription+log rows. That's Slice 3, specced separately.

## Guardrails
- Flag OFF ⇒ byte-identical legacy behavior (the entire canonical branch behind `isBoardV2Enabled()`).
- Resolve the active assignment **once per effect** and reuse; don't fire `resolveActiveAssignment` twice in the same load.
- `client_plan_inserted_deloads` / deload math is `loadCanonicalSchedule`'s job — this slice doesn't reimplement any date math (it only reads a log timestamp + assignment presence).
- Don't drop any legacy table (P5 backfill phase, much later).
- Add ZERO new app-tsc errors (baseline 308).
- **The §0 migration is part of this slice** — without it the coach-side reads (#1, #2) silently return null under `board_v2`. Don't ship the code without the policy.

## Verify (Cowork on preview, `board_v2` ON, test client `+online` / `4331fa4f`)
- `tsc -p tsconfig.app.json` = 308 (baseline) + `npm run build` clean; CI green.
- Reuse the **dormant canonical seed left on `+online` by Slice-1 validation** (assignment `74349417` → clone `093cee67`, starts today) — no re-seed needed.
- **§0 migration first** — confirm the coach impersonation read returns >0 (see §0). This is the RLS proof; without it the next bullet silently shows "no last workout."
- **Coach Overview / Vitals (`/coach/clients/<+online userId>`):** with `board_v2` ON, "Last Workout" reflects canonical set-logs and **reads through as the coach** (not null) — log a set under the canonical session → it becomes "last workout"; an on-demand deload week doesn't break it. Flag OFF → legacy completed_at value.
- **Client dashboard (`+online`):** with `board_v2` ON, the hero renders (`TodaysWorkoutHero`) for a client with a canonical assignment even if there's no legacy `client_programs` row — NOT the "preparing your program" empty state. Flag OFF → byte-identical legacy gate.
- **Headline proof:** same on-demand-deload insert as Slice 1 — confirm "Last Workout" + hero stay correct across the shift (legacy would read the frozen snapshot). Clean up the test deload + clear the flag after.

## After this slice
**Slice 3** (specced separately): extend `canonicalScheduleAdapter` to expose per-slot exercise + prescription + set-log detail, then migrate the *deep* surfaces — `useWorkoutPulse` (tonnage/PR/TUST), coach `useSessionLog`, and `useClientPrograms` per-module completion counts. Then the server-side `get_coach_roster_stats` RPC. Once all A surfaces read canonical under `board_v2`: default the flag on + soak, then P5 backfill (legacy snapshots → `plan_*`/`client_plan_assignment`) + drop legacy tables.
