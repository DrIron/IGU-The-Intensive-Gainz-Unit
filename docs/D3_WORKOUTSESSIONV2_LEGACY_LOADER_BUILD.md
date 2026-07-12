# D3 — Retire the WorkoutSessionV2 legacy loader (last Stage B gate)

**Status:** Build handoff (2026-07-04, Cowork). **Owner:** terminal (builds). Cowork verifies on prod.
**This is a Stage A-class change** (code + one small progression FK migration + a 5-row re-key backfill). It **ships and soaks BEFORE Stage B** (`docs/P5_LEGACY_DROP_BUILD.md`). Do not drop any column/table in this slice.

## Why this is the gate

`WorkoutSessionV2.tsx` is the **last live code that reads AND writes `exercise_set_logs.client_module_exercise_id`** (a Stage B drop target). Stage B step 1 drops that column + the legacy tables (`client_module_exercises` → `client_day_modules` → `client_program_days` → `client_programs`). Two other live touchpoints (`useVolumeTracking`, the progression FK) also still reference the legacy keying. Until every one is on canonical keys and Hasan's real logs are re-keyed, the DROP would lose data / break surfaces. D3 clears all of them.

Not mechanical: deleting the legacy loader silently drops the per-exercise **history / personal-best / PR-refs** that only the legacy loader computed. Canonical parity for those must be built here, not assumed.

## Prod facts (verified 2026-07-04, project ghotrbotrywonaejlppg)

- `exercise_set_logs`: 124 rows — **119 canonical-keyed** (`assignment_id`+`plan_slot_id`), 53 dual-keyed, **5 legacy-only** (no canonical key). Both unique indexes exist: `exercise_set_logs_canonical_key (assignment_id, plan_slot_id, set_index)` and legacy `(client_module_exercise_id, set_index)`.
- The **5 legacy-only logs are ALL `hasandashti.hd` (ce14d4f5) — Hasan's real training account** (2026-06-30; movements: "Mid Traps DB Chest-Supported Wide Row" ×4, "Iliac Lat M … Pulldown" ×1). Untouchable per HANDOVER → **re-key, do not lose.** The account has an **active** canonical assignment `c63f4835` (start 2026-06-29) whose plan contains both movements as plan_slots → the logs are re-keyable.
- Canonical cross-instance history **is computable**: all 119 canonical logs resolve `plan_slot_id → plan_slots.exercise_id` (17 distinct movements). Parity read is a straight join, no schema gap.
- `progression_suggestions`: **0 rows**, FK `client_module_exercise_id` NOT NULL → `client_module_exercises`. No `assignment_id`/`plan_slot_id` columns. Progression is dormant: of 2983 plan_slots, 1904 carry `linear_progression_enabled` but **0 are true**. So the FK is the only real blocker and there is nothing to migrate.

## Scope — all must be true before Stage B

### A. `WorkoutSessionV2.tsx` — make canonical the only path
1. Delete `loadSession` (the `moduleId`/`client_day_modules` loader, ~1715–2053) and its reads of `client_day_modules`, `client_module_exercises`, and `exercise_set_logs.client_module_exercise_id`.
2. Remove the `useCanonical` branch (~1674–1677) and both call sites that pick a loader (retry ~2208–2214, effect ~2217–2223). `loadCanonicalSession` becomes the sole loader.
3. `buildLogKey` (~1686–1695): delete the legacy branch **and** the `client_module_exercise_id: null` field from the canonical branch. Result: `{ assignment_id, plan_slot_id }` only. `logConflictTarget` (~1696–1699): always `"assignment_id,plan_slot_id,set_index"`. This covers every write site (they all route through these two helpers — upserts at ~2330, 2440, 2653, 2678, 2750, 2762).
4. If `canonicalAssignmentId` is ever null at load, this is now a **hard error → redirect to `/client/workout/calendar`**, never a silent legacy fallback.

### B. Restore history / PB / PR-refs parity in the canonical loader (the non-mechanical part)
The legacy loader populated `Exercise.history`, `.personal_best`, `.pr_refs` (WSV2 ~1918–2018) from cross-instance logs. `loadCanonicalSession` currently leaves them undefined (resolver TODO). Build parity:
1. Extend `resolveCanonicalSession` (or add a sibling batched read in `loadCanonicalSession`) to fetch this client's `exercise_set_logs` for the rendered movements, joined `plan_slot_id → plan_slots.exercise_id`, newest-first, scoped to the client (`created_by_user_id`) across their assignments. **One batched `in()` read keyed by all `exercise_id`s at once** — replicate the WK7 §1.5 anti-fan-out pattern (do NOT reintroduce a per-exercise round-trip; that was the pooler-starvation bug).
2. From that batch compute, per rendered exercise: `history` (most-recent `setCount` sets), `personal_best` (heaviest `performed_load`, ties → most recent), and `pr_refs` (`{ bestAbsolute, bestByReps, bestRirByLoadReps }`) — mirroring WSV2 ~1934–1972. Skip for activity rows (weight×reps-centric), same as legacy.
3. Populate these on the canonical `formattedExercises` (WSV2 ~2144–2166) so the render/logging UI is unchanged.

### C. `progression_suggestions` FK — unblock the table DROP  ✅ DECIDED (Hasan, 2026-07-04): drop FK, defer rebuild
The FK references `client_module_exercises` (drops in Stage B). Table is empty (0 rows), progression dormant (0 slots enabled).
**Do:** migration drops **only** the `progression_suggestions_client_module_exercise_id_fkey` constraint so Stage B can drop `client_module_exercises`. Leave the (empty) table in place. The write path in `useProgressionSuggestions` stays gated off under canonical (WSV2 ~2384 guard is already `!canonicalAssignmentIdRef.current`, so it never fires) — no runtime references the column. Progression gets rebuilt on canonical keys (`assignment_id`+`plan_slot_id`) as a separate future feature. Zero data risk.
**Do NOT** re-home the schema now (rejected — a no-op today, deferred until progression actually ships).

### D. `useVolumeTracking.ts` — migrate the live VolumeChart to canonical
Reads `exercise_set_logs.client_module_exercise_id → client_module_exercises → exercise_id → exercise_library.primary_muscle` (~44–99). It is **live** (coach `VolumeChart` in `WorkoutsTab` ~330 + `CoachClientDetail` ~308) and today **under-counts** — it misses canonical-only logs (119 of 124). Rewrite to read logs by `plan_slot_id → plan_slots.exercise_id → primary_muscle`, still scoped `created_by_user_id`. Canonical-only is correct after the 5-log re-key (G); a transitional `COALESCE`/union of both keys is optional but unnecessary once G lands.

### E. Entry points — remove the dead legacy-fallback arms
`TodaysWorkoutHero.tsx` (~130/133) and `WorkoutCalendar.tsx` (~216/219) each do `navigate('/client/workout/session/${m.id}')` when `m.canonical` is absent. With board_v2 live + full canonical coverage that arm is dead. Delete it; if `m.canonical` is ever missing, surface an error/toast rather than mint a legacy `:moduleId` URL. Only the canonical `…/session/canonical?assignment=&session=&date=` link remains.

### F. Route + old bookmarks
`/client/workout/session/:moduleId` now only ever receives the literal `"canonical"`. An old bookmark with a real `client_day_module` UUID hits `loadCanonicalSession` with no `assignment` param → `resolveCanonicalSession` returns null → existing "not found" → redirect to calendar. Acceptable; note it in the PR. Leave the `:moduleId` route shape as-is (vestigial) — do not churn App.tsx routing.

### G. Re-key the 5 legacy-only logs (prerequisite to Stage B step 1)  ✅ DECIDED (Hasan, 2026-07-04): re-key, don't lose
Backfill migration: for the 5 `exercise_set_logs` rows owned by `ce14d4f5` with null canonical keys, set `assignment_id = 'c63f4835-fd09-4d41-b455-6a2a4099ebe1'` and `plan_slot_id =` a plan_slot under that assignment's plan whose `exercise_id` matches the row's movement (`4d46e394…` mid-traps, `8e8194a0…` iliac-lat). Exact slot doesn't affect history (aggregated by movement) — pick the lowest `sort_order` matching slot deterministically. Guard the UPDATE to those 5 ids; verify `client_module_exercise_id` is left intact (rollback path) until Stage B. After: `SELECT count(*) FROM exercise_set_logs WHERE client_module_exercise_id IS NOT NULL AND (assignment_id IS NULL OR plan_slot_id IS NULL)` must return **0**.

## Migrations in this slice
- `…_progression_suggestions_drop_legacy_fk.sql` — drop the FK constraint (per C-recommended). Follow the REVOKE/GRANT rules only if you touch functions (none here).
- `…_rekey_hasan_legacy_only_set_logs.sql` — the G backfill (guarded to the 5 ids). Idempotent (`WHERE assignment_id IS NULL`).
No column/table DROP in D3 — those are Stage B.

## Verify (Cowork, on prod after merge)
1. Client loads + logs + resumes a workout via canonical only; new `exercise_set_logs` rows have `assignment_id`+`plan_slot_id` and `client_module_exercise_id IS NULL`.
2. `history` / `personal_best` / `pr_refs` render on a movement with prior logs (fixture `+online` 4331fa4f, assignment 74349417).
3. Coach `VolumeChart` (WorkoutsTab) shows non-zero weekly volume including canonical logs (previously under-counted).
4. Progression: no runtime error on log-complete under canonical (eval no-ops); FK gone (`\d client_module_exercises` has no inbound progression FK).
5. Re-key: the 0-row guard query above returns 0; Hasan's 5 logs now surface in his canonical history.
6. `grep -rn client_module_exercise_id src/` → only `types/`, generated `integrations/supabase/types.ts`, and comments remain — no live read/write.
7. tsc/build clean, CI green, Sentry quiet through the soak.

## After D3 soaks clean
All three Stage B pre-drop conditions on the legacy column are met (0 rows rely on it, no live reader/writer, FK cleared) → `docs/P5_LEGACY_DROP_BUILD.md` Stage B can drop `exercise_set_logs.client_module_exercise_id` + the legacy tables + dormant RPCs.
