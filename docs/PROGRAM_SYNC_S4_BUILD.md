# S4 — Selective sync-push (the keystone)

**Status:** Build handoff (2026-06-29, Cowork). **Owner:** terminal (DB/RPC heavy + UI). Cowork verifies on preview.
**Flag:** `board_v2`-gated (consistent with S1/S2/S3). Off in prod ⇒ no behavior change.
**Reads:** `docs/PROGRAM_ASSIGNMENT_SYNC.md` (§S4 + "keep completed sessions" crux), this doc. Builds on S1 (`clone_plan`, `plan.source_template_plan_id`), S2 (`save_plan_direct`), S3 (resolver reads the clone).

**Feature:** after a coach edits a TEMPLATE program and saves, prompt **"Push changes to assignees?"** with a multiselect of the clients/teams following that template. Pushing **overwrites each selected assignee's cloned plan with the new template version, EXCEPT completed sessions are preserved** (the assignee keeps their training history + logs, exactly as performed).

---

## Grounding facts (verified 2026-06-29 — don't re-research)

- **Canonical clone link:** `plan.source_template_plan_id` (migration `20260629101716`) → the template's canonical `plan.id`. "Who follows template X" = clones with `source_template_plan_id = X`.
- **`clone_plan(p_source_plan_id)`** (`20260629101743`) deep-copies weeks/sessions/slots with fresh canonical ids but **copies `builder_session_id` and `builder_slot_id` verbatim** from the source. So template ↔ clone sessions/slots align on `builder_session_id` / `builder_slot_id` (NOT on canonical `id`, which differs).
- **`save_plan_direct(p_plan_id, p_payload)`** (`20260629111443`) upserts a clone keyed on **canonical `plan_sessions.id` / `plan_slots.id`** (ON CONFLICT(id)) and deletes unseen children — guards `kind='client_frozen'` + owner/admin. This is the S2 clone-save path; S4's overwrite is a *constrained* sibling of it.
- **Logged sets:** `exercise_set_logs`, canonical-keyed on **`(assignment_id, plan_slot_id, set_index)`** (`20260627152209`). Columns are **denormalized + self-contained**: `performed_reps/load/rir/rpe`, `notes`, `prescribed` JSONB. `plan_slot_id` is `ON DELETE SET NULL`. ⇒ **a log row stands alone as history even if its slot is later deleted.**
- **Completion detection (THE CRUX):** a clone session is *completed* iff **any of its slots has ≥1 `exercise_set_logs` row** (for any assignment using that clone). No separate canonical session `completed_at` marker exists; logs are the signal. (Legacy `client_day_modules.completed_at` is not relevant to canonical clones.)
- **Template save entry point:** `useMuscleBuilderState.ts` `save()` — `templateId` branch writes `muscle_program_templates.slot_config` then fire-and-forgets `mirrorPlanToCanonical()` → `save_plan_from_builder(p_template_id, p_payload)`. **`state.templateId` is the `muscle_program_templates.id`, NOT the canonical `plan.id`** — must resolve `plan WHERE source_muscle_template_id = templateId` (newest) to get `p_template_plan_id`, same resolution `b450bf1` does for team assign.
- **No existing push/sync RPC** — build from scratch. The retired `client_plan_overrides` auto-sync is OFF and irrelevant.

---

## Part A — `push_template_to_assignees` RPC (the heavy lift)

```sql
push_template_to_assignees(p_template_plan_id uuid, p_target_plan_ids uuid[]) RETURNS jsonb
```
SECURITY DEFINER, `SET search_path=public`, `p_`/`v_` naming. REVOKE PUBLIC/anon; GRANT authenticated. Verify anon-deny with `SET LOCAL ROLE anon`.

**Targets are CLONE PLAN IDs, not assignment ids** — this unifies 1:1 and team:
- 1:1 client → the clone = `client_plan_assignment.plan_id`.
- Team → the clone = `coach_teams.current_program_plan_id`.
Both are clones with `source_template_plan_id = p_template_plan_id`. The UI maps each selected assignee to its clone plan id (Part C).

**Guards (raise `42501` / `P0001`):**
1. `auth.uid()` not null.
2. Caller owns the template: `plan.owner_coach_id = auth.uid()` on `p_template_plan_id` (or `is_admin`).
3. **Every** `p_target_plan_ids` entry must be a clone with `source_template_plan_id = p_template_plan_id` (reject foreign plan ids — prevents overwriting an unrelated plan). `kind='client_frozen'`.

**Per-target algorithm (overwrite-except-completed, per-session granularity):**

For each target clone `v_clone`:
1. **Find completed sessions in the clone.** A clone session is completed iff any of its slots has a log:
   ```sql
   v_completed_builder_session_ids := (
     SELECT array_agg(DISTINCT ps.builder_session_id)
     FROM plan_sessions ps
     JOIN plan_slots psl ON psl.plan_session_id = ps.id
     JOIN exercise_set_logs esl ON esl.plan_slot_id = psl.id
     WHERE ps.plan_id = v_clone
       AND esl.assignment_id IN (
         SELECT id FROM client_plan_assignment WHERE plan_id = v_clone
       )
   );
   ```
   (For a team clone this unions logs across all member assignments — a session any member started is preserved. Acceptable per spec.)
2. **Align by `builder_session_id`.** Template sessions and clone sessions share `builder_session_id` (from `clone_plan`). Build the new clone state = the TEMPLATE's weeks/sessions/slots, **except** for each template session whose `builder_session_id ∈ v_completed_builder_session_ids`, keep the CLONE's existing session+slots untouched (same prescription + the slot rows the logs point at).
3. **Apply.** Mechanically:
   - Delete clone weeks/sessions/slots **whose `builder_session_id` is NOT in the completed set** (their slots have no logs → safe; FK CASCADE handles slots). Leave completed sessions and their slots in place (logs stay linked).
   - Insert the template's sessions/slots for every `builder_session_id` NOT in the completed set, into the correct week (align weeks by `week_index`; create missing weeks). Copy `prescription_json`, grouping (`group_id/group_type/rounds`), `section`, `sort_order`, deload flags, `progression_rule_id` (clone the rule per `clone_plan`'s approach), and **carry `builder_session_id`/`builder_slot_id` verbatim** so future pushes keep aligning.
   - Result: completed sessions = exactly as performed; everything else = the new template.
4. Bump `plan.updated_at` on the clone. Return per-target `{ plan_id, sessions_replaced, sessions_preserved, weeks_total, status:'pushed' }`. On a target with zero completed sessions this is a full overwrite; on one fully completed it's a no-op.

**Reuse, don't duplicate:** the insert/copy logic is the same materializer `clone_plan` + `save_plan_direct` already use — factor a shared internal helper if practical, or mirror `clone_plan`'s remap-by-fresh-id approach but scoped to the non-completed `builder_session_id` set. Keep it ONE transaction per call (all targets), so a failure rolls back cleanly.

**Edge cases to handle explicitly:**
- Target clone has a session the template no longer has, and it's completed → keep it (history). Not completed → delete.
- Template has a brand-new session (new `builder_session_id`) → insert into all non-conflicting targets.
- New team member mid-cycle: assignment points at the current team clone; no preservation needed (no logs yet) — out of scope for the push, just don't break.
- Deload weeks/placement: carry `is_deload/deload_preset_id/deload_placement` from the template like `clone_plan` does.

---

## Part B — "Who follows this template" (for the multiselect)

A read RPC or direct queries (RLS already lets the owning coach read their plans/assignments). Return both buckets for `p_template_plan_id`:

```sql
-- 1:1 clients
SELECT cpa.id AS assignment_id, cpa.client_id, cpa.plan_id AS clone_plan_id,
       cpa.start_date, cpa.status, p.updated_at AS clone_updated_at
FROM client_plan_assignment cpa
JOIN plan p ON p.id = cpa.plan_id
WHERE p.source_template_plan_id = $1 AND cpa.team_id IS NULL AND cpa.status = 'active';

-- teams
SELECT ct.id AS team_id, ct.name, ct.current_program_plan_id AS clone_plan_id,
       p.updated_at AS clone_updated_at,
       (SELECT count(*) FROM client_plan_assignment x WHERE x.team_id = ct.id AND x.status='active') AS member_count
FROM coach_teams ct
JOIN plan p ON p.id = ct.current_program_plan_id
WHERE p.source_template_plan_id = $1 AND ct.is_active;
```
- Resolve client display names via `profiles_public` (separate query — no FK join, per CLAUDE.md).
- **"Edited since assigned" hint** (optional, soft): `clone_updated_at > assignment.created_at` ⇒ flag "customized" so the coach knows a push overwrites their changes (completed sessions still kept). Don't try to deep-diff; the hint + the always-true "push overwrites un-completed sessions" copy is enough.

---

## Part C — UI: post-save prompt + multiselect dialog

1. **Fire after a successful TEMPLATE save.** In `useMuscleBuilderState.save()` `templateId` branch: **await** the canonical mirror (don't leave it fire-and-forget for this path, or the push could read a stale template) — i.e. `await save_plan_from_builder(...)`, then resolve the canonical template plan id (`plan WHERE source_muscle_template_id = templateId` newest), then query Part B. If there are ≥1 assignees, open the push dialog. (board_v2 only.)
2. **`PushTemplateDialog`** (new, `src/components/coach/programs/`): a Dialog listing 1:1 clients + teams as **checkbox rows** (build a simple checkbox multiselect — none exists; use shadcn `Checkbox` in a scroll list, "Select all", per-row "customized" badge + member-count for teams). Mirror `AssignFromLibraryDialog`'s Dialog/Footer/toast/progress shape. Copy: "Pushing updates these plans to your latest template. Sessions they've already completed stay as-is." Confirm → call `push_template_to_assignees(templatePlanId, selectedClonePlanIds)`; show per-target result (replaced/preserved counts) in a toast.
3. **Skippable:** a "Not now" path — the coach can always push later (add an entry point on the template, e.g. a "Push to assignees" action in the program/macrocycle menu, using the same dialog) so closing the prompt isn't a dead end.

---

## Resolved build decisions (don't re-litigate)
- **Granularity:** per-SESSION (by `builder_session_id`), not per-week. A half-done week keeps only its completed sessions; the rest update.
- **Team completion:** preserve a team session if ANY member logged it (shared clone). Documented trade-off — keeps history over forcing the update.
- **Divergence:** no deep diff. Soft "customized" hint via `clone_updated_at`; the push always overwrites un-completed sessions regardless. Coach decides.
- **Targets = clone plan ids** (unifies 1:1 + team). The RPC validates each is a clone of the template.
- **History safety net:** even where a slot IS deleted, `exercise_set_logs` rows survive (`plan_slot_id` SET NULL, self-contained columns) — but we still preserve completed sessions' slots so the completed session renders exactly as performed.

## Verify (Cowork on preview)
- `tsc -p tsconfig.app.json` (308 baseline) + `npm run build` clean; CI green.
- **Anon-deny** on `push_template_to_assignees` (`SET LOCAL ROLE anon`). Owner-gate: a coach who doesn't own the template gets `42501`. Foreign target plan id rejected.
- **The completed-preservation proof (critical):** seed a clone with one completed session (insert an `exercise_set_logs` row on one of its slots) and one un-started session. Edit the template (change both sessions). Push. Assert: the completed session's slots/prescription UNCHANGED and its log still linked (`plan_slot_id` intact); the un-started session REPLACED by the template's new version. Do it inside a rolled-back tx for the read-only proof, then a real run on a test assignee.
- **Team push:** push to a team clone; all members inherit the update for un-completed sessions; a session one member completed is preserved for the team.
- UI: edit a template with assignees → prompt appears; multiselect + push → toast shows replaced/preserved; re-open an assignee's board/calendar and confirm the update landed and history survived.

## Guardrails
- ONE transaction per RPC call (all targets) — partial push must roll back.
- Never touch the template itself in the push (read-only source).
- board_v2-gated end to end; flags off ⇒ dialog never fires, RPC unused.
- Don't write `client_plan_overrides` (retired under the clone model).
- Keep `builder_session_id`/`builder_slot_id` flowing through inserts so the NEXT push still aligns.
