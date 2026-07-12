# P5 Stage A.3 — retire the two legacy RPC callers in WorkoutSessionV2 (final B2 gate)

**Status:** Build handoff (2026-07-07, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Why:** A.2 removed all direct legacy-table reads/writes, but two RPC callers remain in `src/pages/client/WorkoutSessionV2.tsx` — the last thing blocking B2 from dropping `skip_client_day_module` + `complete_client_day_module` (and the tables under them). **Decision (Hasan 2026-07-07): DROP the skip feature** (canonical has no per-session status; the skip button is already broken under canonical). This slice removes both callers. Frontend-only, no DB changes. After it ships + soaks, B2 can drop the tables + those two RPCs.

## Part 1 — Remove the "skip workout" feature (it's LIVE + broken under canonical)
`skip_client_day_module` errors for canonical clients (module.id is a `plan_session_id`, RPC 42704 → "Couldn't skip workout"). Per Hasan, drop the feature. Delete all of it in `WorkoutSessionV2.tsx`:
- **State** L1649: `const [skipWorkoutOpen, setSkipWorkoutOpen] = useState(false);`
- **Handler** L2203–2222: the entire `skipWorkout` async fn (the `.rpc("skip_client_day_module", ...)` caller).
- **Menu item** L2801–2803: the `<DropdownMenuItem onClick={() => setSkipWorkoutOpen(true)}> ... Skip workout</DropdownMenuItem>`.
- **Confirm dialog** L3131–3142: the `<AlertDialog open={skipWorkoutOpen} ...>` ... `<AlertDialogAction onClick={skipWorkout}>Skip workout</AlertDialogAction>` block.
- Then remove any now-unused imports (`AlertDialog*` may still be used elsewhere in the file — grep before deleting the import; only drop imports with zero remaining use). tsc will catch leftovers.

## Part 2 — Remove the dead `complete_client_day_module` branch
The legacy completion path is provably dead post-flip: L2554 `const skipLegacyCompletion = !!canonicalAssignmentIdRef.current;` is **always true** (board_v2 ON + coverage=0 → every active client has a canonical assignment, so `canonicalAssignmentIdRef` is always set). Therefore `completeErr` is always `{ error: null }` and the RPC call + its error UX (L2573–2604) never execute.
- Delete L2554 (`skipLegacyCompletion`), the `skipLegacyCompletion ? { error: null } : await selectWithRetry(() => supabase.rpc("complete_client_day_module", ...), ...)` expression, and the whole `if (completeErr) { ... }` block (the 42501 "expired" UX + `throw`). Under canonical, finish just persists set logs via `saveProgress()` (already happening above) and falls through to the summary — preserve that exact behavior.
- Keep the existing `TODO(P4): record per-assignment session completion in the canonical model` comment (or move it up) so the deferral is documented.
- **Safety:** this is the PR #117 completion path, so verify precisely: after removal, the canonical finish still (a) persists set logs, (b) shows the summary, (c) doesn't call any legacy RPC. Do NOT touch `saveProgress()` / the set-log upserts. The removal is safe *only because* coverage=0 (no active client can hit the legacy branch) — state that in the PR.

## Exit criterion
`grep -rE 'skip_client_day_module|complete_client_day_module' src/` returns nothing outside `src/integrations/supabase/types.ts` (regenerate types is optional now; the RPCs still exist until B2 drops them, so the generated types can stay until then). No caller of either RPC remains in app code.

## Verify (Cowork, prod)
- Client workout session: the "Skip workout" menu item + its dialog are gone; the header menu still works (other items intact).
- **Finish a canonical workout end-to-end**: log sets → Finish → set logs persist (DB check `exercise_set_logs`) → summary shows → no error toast, no console error, no legacy RPC call in the network tab. (This is the sensitive path — smoke it carefully on +online.)
- Sentry quiet on the completion path after the change.
- tsc (~306 baseline zero-new), ESLint 0, build clean.
- **Then** a short soak → B2 is fully unblocked: drop the 6 tables + `module_threads`/`module_thread_messages` + the 4 dormant RPCs (`assign_program_to_client`, `assign_macrocycle_to_client`, `assign_team_program_atomic`, `convert_muscle_plan_to_program` v1) + now-caller-less `skip_client_day_module` + `complete_client_day_module`. **KEEP `convert_muscle_plan_to_program_v2`** (live template feature). Handle the `plan.source_client_program_id` + `exercise_media.client_module_exercise_id` FKs per docs/P5_LEGACY_DROP_BUILD.md.
