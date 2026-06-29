# Teams — canonical shared-plan model + My Teams shell

Decided 2026-06-28 (Hasan). Teams become a first-class top-level object (Programs · Clients · **Teams**), with a **single shared canonical plan** per team — edit once, every member inherits, **zero per-member overrides** (TrainHeroic single-calendar model). Builds on the canonical `plan_*` model from PR #185. Canonical pieces ride the `igu_ff_board_v2` flag, consistent with the rest of the unification.

## What already exists (live in prod — don't rebuild)

- **Data:** `coach_teams` (head-coach owned: name, tags[], max_members, `current_program_template_id`, public/cover/goal/cycle fields), `subscriptions.team_id` + `client_programs.team_id`, `coaches_public.is_head_coach`. Team Plan service tier (slug `team_plan`, 12 KWD).
- **Coach UI:** `/coach/teams` (`CoachTeamsPage`) — team list + `TeamDetailView` (roster + current program + edit/delete) + `AssignTeamProgramDialog` + `CreateTeamDialog`.
- **Assignment (LEGACY):** `assign_team_program_atomic(p_team_id, p_template_id, p_start_date)` fans out via `assign_program_to_client` (deep-copy) — each member gets a frozen `client_programs` copy; **edits don't propagate** (the drift we're fixing). `soft_delete_team_atomic` unassigns members.
- **Public:** `/teams` browser (`list_public_teams_for_browser`), team waitlist.
- **RLS:** team-coach reads member `subscriptions` + `profiles_public` via `coach_teams.coach_id` (migrations 20260212170000/180000).

## Canonical model (the change)

A team's program = ONE canonical `plan` (kind `template`), owned by the head coach, bound to the team. Members follow it directly:

- `coach_teams.current_program_plan_id` → `plan.id` (new; alongside the legacy `current_program_template_id` during soak).
- Each active member: `client_plan_assignment { client_id, team_id, plan_id = team plan, start_date, status }`. **NEVER a `client_plan_overrides` row** — team assignments are override-free by construction.
- **Edit propagation is automatic:** members share `plan_id`, so the canonical resolver reads the same plan for all of them. Editing the team plan (board team skin → `save_plan_from_builder` on that plan) updates every member at once. Only initial member assignment fans out; edits never do.
- New member joining → gets an assignment to the team's current plan (at onboarding/join).

## Slices

**T1 — canonical schema + assign-to-team RPC.** `coach_teams.current_program_plan_id` (FK plan). New `assign_team_plan(p_team_id, p_plan_id, p_start_date)` SECURITY DEFINER RPC: head-coach/admin gated; for each active member subscription, upsert `client_plan_assignment` (team_id, plan_id, no overrides), idempotent; set `coach_teams.current_program_plan_id`; returns per-member status. REVOKE-from-anon/GRANT authenticated. RLS: members read the team plan via their assignment (P0.5 plan-read-via-assignment should already cover it — verify); head coach can edit the team plan (owns it). Regen types.

**T2 — board team skin (edit-once-inherit).** Open the team plan in the planning board in **team context** (the board already has template/client/team skins). Edits write to the `plan` directly via `save_plan_from_builder` — **no `client_plan_overrides`**, so all members inherit. Wire the "Program" section + "Change program" to this. Flag-gated `board_v2`.

**T3 — team-detail shell (Pulse / Nutrition / Program / Roster).** Mock approved 2026-06-28 (Pulse: on-track N/total, this-week workout %, avg weight trend, deficit/maintenance/surplus nutrition split, needs-attention list). Section nav mirrors the client overview shell, aggregated. Nutrition = view-only aggregate (who's drifting). Roster = member rows → open a **view-only** member detail (coach can view program/nutrition, never edit a team member's plan). Aggregates read existing member data (adherence via logs, weight_logs, nutrition phase goal_type) — independent of the program model.

**T4 — IA separation.** `My Clients = 1:1 only` — filter team members out of `CoachMyClientsPage` / `CoachClientsWorkspace` (currently they merge `coachSubs` + `teamSubs`; exclude `team_id IS NOT NULL`). Team members live ONLY under My Teams → team → roster. (Live behavior change, not flag-gated — it's an IA fix.)

**T5 — assignment cutover + backfill.** Migrate existing legacy team assignments → canonical (each member's deep-copy promoted/replaced by an assignment to a shared team plan). Retire `assign_team_program_atomic`'s legacy path under `board_v2`. Part of / after the broader P5 legacy retire.

## Sequencing

T4 (IA) and T3 (shell aggregates) are independent of the program model and can land first for immediate value. T1→T2 (canonical shared plan + board team skin) is the heavy foundation for the "edit once → inherit" magic and is `board_v2`-gated. T5 is cutover, later. Terminal builds T1/T2/T5 (DB/RPC); T3/T4 are UI (terminal or Cowork-spec'd). Verify each on preview.

## Guardrails

- **Never write `client_plan_overrides` for a team-member assignment.** That's the whole model — enforce in the assign RPC + board team skin (the team skin must not expose per-member edits).
- Editing the team plan edits the shared `plan` → affects ALL members. The board team skin must make that explicit (banner: "Editing the team plan — changes apply to all N members").
- Dual-write legacy `current_program_template_id` during the soak; cut over in T5.
- Team assignments excluded from the 1:1 canonical mirror already (assignProgram.ts skips `teamId`).
