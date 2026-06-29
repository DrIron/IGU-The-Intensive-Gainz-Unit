# Program assignment + selective sync (own-your-copy model)

Decided 2026-06-28 (Hasan). **Supersedes** the reference + per-client-override auto-sync model shipped behind `board_v2` (off in prod, so no live disruption). New model for how clients AND teams relate to a coach's template programs. Foundation for Teams T2 and the 1:1 editor.

## The model

- **Template (in Programs)** = the source program a coach builds/owns (a canonical `plan`, `kind='template'`).
- **Assign a template to an assignee (1:1 client OR team)** = **clone** the template's plan into an **assignee-owned plan** (`kind='client_frozen'`/team-owned). The assignment points at the clone, not the template.
  - 1:1 → one clone per client. Team → **one clone per team**, every member's `client_plan_assignment` points at that single team plan (zero per-member divergence).
- **Editing on the assignee's board** (client board / team board) edits **their own clone directly** — local to them, never touches the template or other assignees. (No override layer; the clone *is* the divergence.)
- **Editing the template** in Programs does **NOT** auto-flow. After the edit, prompt **"Push changes to assignees?"** with a **multiselect** of every client/team currently following that template (mock approved 2026-06-28). The coach chooses who.
- **Push = overwrite** the selected assignee's clone with the new template version, **except completed sessions are preserved** (the assignee keeps their training history + logs).

## "Keep completed sessions" rule (the crux)

A session is **completed** = it has ≥1 logged set (`exercise_set_logs`) or a `completed_at` marker. On push to an assignee:
- **Completed sessions stay exactly as they were** — same prescription + logs, as history.
- **Un-started sessions are replaced** by the new template's structure (from the assignee's current point forward).
- **Boundary to lock in build:** since the schedule is date-mapped (canonical resolver maps dates→weeks), the clean cut is "past/completed = frozen, today-forward = the new template." Logged sets reference `plan_slot_id`, so the engine must **preserve logged slots/sessions** (don't delete them) OR rely on logs being a standalone record — confirm `exercise_set_logs.performed_json` carries enough (weight/reps/exercise) to stand alone, and define whether the kept history keeps its old `plan_slot_id` rows. Flag the exact merge in the push-RPC PR.

## Data model

- `plan` gains a source link: `source_template_plan_id UUID NULL REFERENCES plan(id)` (the clone → its template), so "who follows this template" = assignments whose plan has `source_template_plan_id = X`, and push knows the source.
- `client_plan_assignment.plan_id` = the assignee-owned clone (1:1: per-client; team: the shared team plan via `coach_teams.current_program_plan_id`).
- **`client_plan_overrides` is retired** under this model — divergence lives in the clone, not an override layer. (Keep the table through the soak; stop writing it; drop in cutover.)
- Clone-on-assign = a `clone_plan(p_source_plan_id) → new plan_id` SECURITY DEFINER RPC (deep-copies plan_weeks/sessions/slots, fresh ids, sets `source_template_plan_id`). Reuse the materializer shape from `save_plan_from_builder`.
- Push = `push_template_to_assignees(p_template_plan_id, p_assignment_ids uuid[])` SECURITY DEFINER, coach-gated (owns the template), REVOKE-from-anon/GRANT authenticated. Per assignee: overwrite the clone's un-completed structure from the template; preserve completed sessions per the rule; returns per-assignee result.

## What changes vs the shipped override model

| Area | Shipped (override/auto-sync) | New (clone/selective-push) |
|---|---|---|
| Assign (`assign_plan_to_client` / `assign_team_plan`) | assignment.plan_id = template plan (shared) | assignment.plan_id = a **clone** (own copy); bind via `clone_plan` then assign |
| Client board edit | writes `client_plan_overrides` | edits the client's clone directly |
| Team board edit (T2) | (was: shared plan) | edits the team's clone directly |
| Resolver (`canonicalSessionResolver`) | merges plan + overrides | reads the assignee clone directly (simpler — drop the override merge) |
| Template→assignee sync | automatic (shared plan) | **selective push**, overwrite-except-completed |
| `clientPlanBoardAdapter` (override diff) | in use | retired/replaced |

## Re-sliced build (replaces TEAMS_CANONICAL_BUILD.md slices)

- **S1 — clone-on-assign.** `plan.source_template_plan_id`; `clone_plan` RPC; rewire `assign_plan_to_client` (1:1) and `assign_team_plan` (team) to clone the template then assign the clone. board_v2-gated; dual-keep override path during soak.
- **S2 — board edits → clone.** Client + team board skins edit the assignee clone directly (retire override-writing). **Teams T2 = the team-board half of this** (team owns its plan, edits team-local) + the assign-dialog wiring + the team banner (already stubbed).
- **S3 — resolver reads clone.** `canonicalSessionResolver` / `canonicalScheduleAdapter` read the assignee clone directly; drop the override merge. (Deload v2 inserts + progression still apply on the clone.)
- **S4 — selective sync-push.** `push_template_to_assignees` RPC (overwrite-except-completed) + the post-template-edit "push to whom?" multiselect UI (clients + teams following the template; flag already-customized assignees). The keystone.
- **S5 — cutover.** Drop `client_plan_overrides` + the adapter after soak; fold into the broader P5 retire.

## Sequencing

S1 (clone-on-assign) is the foundation — do first. S2 unblocks Teams T2 (team-local editing) and the 1:1 editor on the clone model. S4 (push) is the headline feature, independent enough to design/build after S1–S2 land. The Teams shell (Pulse/Nutrition/Roster) + IA separation are independent of all this and can proceed in parallel. Terminal builds S1/S3/S4 (DB/RPC); S2 is board UI.

## Open questions to resolve in build

- Exact completed-session preservation merge (see crux above) — confirm `exercise_set_logs` standalone-history sufficiency.
- Does a team that's diverged still appear in the template's push list (yes — coach can overwrite it), with a clear "will replace this team's customizations" warning?
- New member joins a team mid-cycle → assigned to the team's current clone (gets the team's customizations), completed-preservation N/A (no history yet).
