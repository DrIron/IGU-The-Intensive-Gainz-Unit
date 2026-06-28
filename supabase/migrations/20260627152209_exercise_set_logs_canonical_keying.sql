-- Program system unification — P3: key exercise_set_logs on the canonical model
-- alongside the legacy client_module_exercise_id. See
-- docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md §P3. ADDITIVE — legacy logging is
-- untouched and authoritative; the canonical read+log path is behind a feature flag
-- (OFF by default).
--
-- A log row is now keyed EITHER legacy (client_module_exercise_id) OR canonical
-- (assignment_id + plan_slot_id). client_module_exercise_id becomes nullable so canonical
-- rows can omit it; the `prescribed` snapshot jsonb is still captured by both paths.
--
-- NOTE (volatility): plan_slots are delete-recreated on every save_plan_from_builder, so
-- plan_slot_id is FK'd ON DELETE SET NULL (a template re-save must never delete a client's
-- logs). Stable slot identity / promote-to-frozen-plan is a P4/P5 concern; for P3 (flag off,
-- no real canonical logs) this is fine. assignment_id cascades like the legacy cme FK.

ALTER TABLE public.exercise_set_logs
  ALTER COLUMN client_module_exercise_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.client_plan_assignment(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS plan_slot_id  uuid REFERENCES public.plan_slots(id) ON DELETE SET NULL;

-- Integrity: at least one keying must be present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exercise_set_logs_keying_check'
      AND conrelid = 'public.exercise_set_logs'::regclass
  ) THEN
    ALTER TABLE public.exercise_set_logs
      ADD CONSTRAINT exercise_set_logs_keying_check
      CHECK (client_module_exercise_id IS NOT NULL OR assignment_id IS NOT NULL);
  END IF;
END $$;

-- Canonical upsert target (mirrors the legacy (client_module_exercise_id, set_index) unique).
CREATE UNIQUE INDEX IF NOT EXISTS exercise_set_logs_canonical_key
  ON public.exercise_set_logs (assignment_id, plan_slot_id, set_index)
  WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_set_logs_assignment
  ON public.exercise_set_logs (assignment_id) WHERE assignment_id IS NOT NULL;

-- RLS: the legacy INSERT policies require the client_module_exercises join chain, so they
-- reject canonical rows (NULL cme_id). Add a client INSERT policy keyed via the assignment.
-- SELECT/UPDATE already permit the owner via created_by_user_id = auth.uid(), so no new
-- policies are needed there (coach-side canonical reads are a P4 concern).
DROP POLICY IF EXISTS esl_canonical_insert ON public.exercise_set_logs;
CREATE POLICY esl_canonical_insert ON public.exercise_set_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND assignment_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.client_plan_assignment a
      WHERE a.id = exercise_set_logs.assignment_id AND a.client_id = auth.uid()
    )
  );
