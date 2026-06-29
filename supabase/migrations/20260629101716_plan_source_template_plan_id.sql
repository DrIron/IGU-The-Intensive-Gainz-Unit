-- Own-your-copy assignment model — S1 schema (ADDITIVE).
-- See docs/PROGRAM_ASSIGNMENT_SYNC.md.
--
-- A clone-on-assign plan links back to the template it was copied from. This is
-- the spine of the model: "who follows template X" = assignments whose plan has
-- source_template_plan_id = X, and the selective-push RPC (S4) uses it to find
-- the source. NULL on templates and on legacy reference-mode plans.
ALTER TABLE public.plan
  ADD COLUMN IF NOT EXISTS source_template_plan_id uuid REFERENCES public.plan (id);

COMMENT ON COLUMN public.plan.source_template_plan_id IS
  'For a clone (own-your-copy model): the template plan.id this plan was deep-copied from. NULL on templates / legacy reference-mode plans. Set by clone_plan. See docs/PROGRAM_ASSIGNMENT_SYNC.md.';

CREATE INDEX IF NOT EXISTS idx_plan_source_template
  ON public.plan (source_template_plan_id)
  WHERE source_template_plan_id IS NOT NULL;
