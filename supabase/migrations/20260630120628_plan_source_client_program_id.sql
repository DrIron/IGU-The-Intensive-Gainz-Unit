-- P5 backfill: traceability + idempotency marker for promoted legacy snapshots.
-- Distinct from source_template_plan_id (which marks a clone of a template).
ALTER TABLE public.plan
  ADD COLUMN IF NOT EXISTS source_client_program_id uuid REFERENCES public.client_programs(id);

CREATE INDEX IF NOT EXISTS idx_plan_source_client_program
  ON public.plan (source_client_program_id)
  WHERE source_client_program_id IS NOT NULL;
