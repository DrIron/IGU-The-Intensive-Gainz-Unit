# P5 Write-path cutover — assignment creates canonical-primary, stops writing legacy

**Status:** Build handoff (2026-06-30, Cowork). **Owner:** terminal. Cowork verifies on prod/preview.
**Step 3 of the legacy cutover.** Order: backfill (DONE, coverage=0) → flip `board_v2` ON → write cutover *activates* → legacy drop. **Build it `board_v2`-gated** (canonical write when the flag is on, legacy write when off) — that makes it **safe to build + merge pre-flip**: flag-off keeps legacy writes byte-identical, and it activates together with the canonical reads the moment you flip. So this is buildable now; the flip is what turns reads AND writes canonical at once.
**Reads:** `docs/P5_FLIP_ON_READINESS_PLAN.md`, `docs/P5_BACKFILL_BUILD.md`, `docs/PROGRAM_ASSIGNMENT_SYNC.md` (S1 clone-on-assign — the canonical primary write already exists).

**Goal:** every NEW assignment/onboarding creates the canonical record (a per-client `plan` + `client_plan_assignment`) as the source of truth and **no longer writes legacy `client_programs*`**. After this, no new legacy program rows are ever created — the "only new, no legacy" guarantee going forward.

## The key fact — the canonical primary write already exists
S1 shipped `assign_plan_to_client(..., p_clone => true)` → `clone_plan` creates a per-client `client_frozen` plan + assignment with zero overrides. That IS the canonical primary write. This slice is mostly **rewiring the legacy entry points to it and removing the legacy deep-copy write** — not new materialization logic.

## Step 1 — inventory the legacy write paths (do first, report findings)
Grep/read every site that creates legacy `client_programs` / `client_program_days` / `client_day_modules` / `client_module_exercises`. Known suspects (confirm + find any others):
- `src/lib/assignProgram.ts` — `assign_program_to_client` (legacy deep-copy) + the `assign_plan_to_client` canonical mirror (dual-write since #185).
- `src/lib/assignMacrocycle.ts`
- `supabase/functions/submit-onboarding/` — creates the client's initial program on onboarding/coach-approval.
- `AssignFromLibraryDialog`, `AssignTeamProgramDialog` / `assign_team_program_atomic`, `create-manual-client`, and any RPC that inserts `client_program*`.
List each: file:line, what it writes, and which UI/flow triggers it.

## Step 2 — rewire each to canonical-primary
For each entry point:
- Replace the legacy `client_programs` deep-copy creation with the canonical clone-on-assign (`assign_plan_to_client` / `assign_team_plan` with `p_clone => true`, resolving the template's canonical plan id the same way `b450bf1` does: `muscle_program_templates.id → converted_program_id → plan.source_muscle_template_id`).
- **Stop writing legacy** — remove the `assign_program_to_client` (deep-copy) call. The dual-write mirror becomes the *only* (now primary) write.
- Onboarding (`submit-onboarding`): when a coach approves + assigns, create the canonical assignment, not a legacy program. (Also the `last_assigned_at` coach update stays.)
- Team assign: `assign_team_program_atomic` already dual-writes the canonical team clone under `board_v2` (b450bf1) — make the canonical bind unconditional and drop the legacy `client_programs` fan-out.
- **Gate behind `board_v2`** for safety during the transition (canonical when on, legacy when off) — since the flip is already live this is effectively always-canonical, but it keeps a one-flag rollback. (The drop slice removes the legacy branch entirely.)

## Step 3 — decision: `complete_client_day_module` and workout finish
Legacy workout-finish wrote `client_day_modules.completed_at` via `complete_client_day_module`. Under canonical, "completed" is inferred from `exercise_set_logs` (no module row to mark). Confirm the canonical workout logger (`WorkoutSessionV2` canonical path, `canonical_session_read`) already persists completion via set-logs and does NOT need `complete_client_day_module`. If the canonical finish path is incomplete, **flag it** — it's a prerequisite to dropping `client_day_modules`. (This may be its own small slice; don't silently leave finish broken under canonical.)

## Guardrails
- **Build it `board_v2`-gated** so flag-off is byte-identical (legacy writes unchanged) — safe to build + merge pre-flip; it activates with the flip. Don't make it unconditional (that would break new clients before the flip).
- Don't drop any legacy table here (that's the next slice) — just stop *writing* them (under the flag).
- Every rewired path must create the canonical assignment in ONE transaction (reuse the atomic RPCs).
- Keep the legacy read fallback in place (it's removed in the drop slice, after a soak proves no legacy reads).
- tsc -p tsconfig.app.json (308) + build clean; CI green.

## Verify (Cowork)
- Create a NEW assignment (assign a template to a fresh test client / re-assign one): confirm it creates a `client_plan_assignment` + a `client_frozen` plan and **zero new `client_programs` rows** (query before/after counts).
- The new client reads their program canonically (board_v2 live): Today card / pulse / program card all populate from the new assignment.
- Onboarding flow: a newly-approved+assigned client gets a canonical assignment, no legacy program.
- No regression for already-backfilled clients (they keep their promoted plans).
- Coverage stays clean: `client_programs WHERE status='active'` count does NOT grow after new assignments (legacy writes stopped).

## After this
With reads canonical (flip) + writes canonical-only (this), legacy `client_programs*` is fully dormant — no new rows, no reads. A short soak (watch Sentry, confirm `client_programs` row count flat) → then the **legacy drop** slice (`docs/P5_LEGACY_DROP_BUILD.md`).
