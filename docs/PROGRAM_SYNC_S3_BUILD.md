# S3 — Resolver reads the clone directly (drop the retired override merge)

**Status:** Build handoff (2026-06-29, Cowork). **Owner:** terminal. Cowork verifies on preview.
**Flag:** rides the existing canonical-read flags (`canonical_session_read` / `board_v2`). Off in prod ⇒ no change.
**Reads:** `docs/PROGRAM_ASSIGNMENT_SYNC.md` §S3 + the S1/S2/S4 docs. Builds on S1 (clone-on-assign), S2 (board edits the clone), S4 (push). This is the read-side completion.

**Goal:** the canonical readers currently read the assignee clone **and then merge `client_plan_overrides`** over it. Under the own-your-copy model the clone **is** the divergence and overrides are never written (S2 routes edits to the clone; the only override writer — `deloadAutoApply` — is skipped under `board_v2`). So the override merge is dead weight that must be removed, or a future `board_v2` flip risks half-merged reads. Drop it; read the clone directly.

---

## THE GUARDRAIL (read first)
**`client_plan_inserted_deloads` is NOT `client_plan_overrides`.** It's the canonical on-demand-deload running sequence (`buildRunningSequence(plan_weeks, inserted_deloads)`), and it is the *correct* board_v2 deload mechanism. **Keep every `client_plan_inserted_deloads` / `buildRunningSequence` read intact.** S3 removes ONLY the `client_plan_overrides` read + merge. Confusing the two will break deload rendering — don't.

## Why it's safe to drop the override merge (verified 2026-06-29)
Under the canonical-read flags, NOTHING writes `client_plan_overrides`:
- **Per-client slot/session edits** → S2 (`save_plan_direct`) writes the clone directly; the override-writing path only runs with `board_v2` OFF.
- **Week-level deload `is_deload`** → `deloadAutoApply.ts` writes a `save_client_plan_override`, BUT its header states it's skipped under `board_v2` (`useCoachDeloadRequestForClient` skips it); under `board_v2` deload comes from `client_plan_inserted_deloads` + `plan_weeks.is_deload` (pinned), not overrides.
- The canonical readers only run for `board_v2`/`canonical_session_read` assignments (legacy assignments use the legacy `client_program_days` path), so for every assignment these readers see, the override set is **empty**. The merge is therefore a no-op today → removing it is behavior-preserving now and correct after the flip.

## Files + what to change
1. **`src/lib/canonicalSessionResolver.ts`** — remove the overrides fetch + merge block (the `client_plan_overrides` query ~L268-275 and the slot/session/week override application ~L261-300+). Resolve the session purely from `plan_*` on `assignment.plan_id`. Keep the deload handling that derives from `plan_weeks.is_deload` (pinned). Update the file header (it documents the override layer).
2. **`src/lib/canonicalScheduleAdapter.ts`** — remove the `client_plan_overrides` fetch (~L132-133) and the "override-aware" session/slot/week logic (~L157-189). **Keep** the `client_plan_inserted_deloads` fetch + `buildRunningSequence` (~L119-129, L17) untouched — that's the deload sequence, not overrides.
3. **`src/lib/clientPlanBoardAdapter.ts`** — if it reads `client_plan_overrides` to build the board (the S2-retired override-diff path under board_v2), drop that read so the board loads the clone directly. (S2 already writes the clone; confirm nothing here still reads the override layer for board_v2 loads.)
4. **Tests** — update `clientPlanBoardAdapter.test.ts` / `canonicalPrescription.test.ts` / any resolver/adapter test that asserts override-merge behavior. Replace "merges override X" cases with "reads the clone value directly." Don't delete deload-sequence tests.

## Do NOT (scope guards)
- Don't drop the `client_plan_overrides` **table** or the `save_client_plan_override` RPC yet — that's S5 (cutover). S3 only stops READING overrides in the canonical readers. The table stays through the soak (board_v2-off paths may still use it).
- Don't touch the legacy `client_program_days` read path.
- Don't touch `deloadAutoApply.ts`'s board_v2-off behavior — just confirm it's already skipped under board_v2 (it is).
- Don't touch progression (it already applies on the clone via `plan_slots`/`progression_rules`).

## Verify (Cowork on preview, board_v2 ON)
- `tsc -p tsconfig.app.json` (308 baseline) + `npm run build` clean; CI green (tests updated, not deleted).
- With `board_v2` on and a cloned assignment: the client's resolved session (`canonicalSessionResolver`) and the schedule grid (`canonicalScheduleAdapter`) render **exactly the clone's** sessions/slots/prescriptions — edit the clone via the board (S2), reload, confirm the change shows with no override involvement.
- **Deload still works:** an on-demand inserted deload still renders the Recovery week + shift via `client_plan_inserted_deloads` (this is the regression risk — prove it explicitly). A pinned deload (`plan_weeks.is_deload`) still shows.
- Sanity: with no override rows for a board_v2 assignment (the norm), the rendered output is byte-identical before/after S3 (it was already a no-op merge) — a good before/after diff to confirm zero behavior change today.

## Note
This is mostly deletion + test updates — contained and low-risk, but the deload-sequence guardrail is the one place to be careful. After S3, the only remaining own-your-copy work is S5 (drop the override table/RPC at cutover) and the `board_v2` flip-on (P5 legacy burn-down), at which point S4's push dialog also gets its live UI smoke.
