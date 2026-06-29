-- Teams canonical model — T1 schema (ADDITIVE). See docs/TEAMS_CANONICAL_BUILD.md.
--
-- A team follows ONE shared canonical plan: bind coach_teams to a plan.id. This
-- rides ALONGSIDE the legacy current_program_template_id (program_templates.id)
-- during the soak — both are dual-written until the T5 cutover. Nothing is
-- dropped or rewritten here.
--
-- Nullable: a team may exist without a plan yet (created, not yet programmed).
ALTER TABLE public.coach_teams
  ADD COLUMN IF NOT EXISTS current_program_plan_id uuid REFERENCES public.plan (id);

COMMENT ON COLUMN public.coach_teams.current_program_plan_id IS
  'Canonical shared team plan (plan.id). Members follow this via client_plan_assignment, zero overrides. Dual-written with the legacy current_program_template_id during the canonical-model soak (T1-T5).';

CREATE INDEX IF NOT EXISTS idx_coach_teams_current_plan
  ON public.coach_teams (current_program_plan_id)
  WHERE current_program_plan_id IS NOT NULL;
