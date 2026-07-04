-- D3 (§G, Hasan-decided 2026-07-04): re-key the 5 legacy-ONLY exercise_set_logs (owned by
-- ce14d4f5 = hasandashti.hd, Hasan's real training account, logged 2026-06-30) from the legacy
-- client_module_exercise_id key onto the canonical (assignment_id, plan_slot_id) key, so they
-- survive the Stage B drop of client_module_exercise_id and surface in canonical history.
--
-- Target assignment c63f4835 (active, start 2026-06-29) → plan c692ff67, whose plan_slots contain
-- both movements (Mid Traps DB Chest-Supported Wide Row 4d46e394; Iliac Lat … Pulldown 8e8194a0).
--
-- REFINEMENT of the spec's "lowest sort_order matching slot": the naive lowest-sort_order slot
-- collides with EXISTING canonical logs on 4 of 5 rows (same assignment+slot+set_index →
-- exercise_set_logs_canonical_key unique violation), because Hasan also logged those slots
-- canonically. Verified 2026-07-04: none of the 5 are value-duplicates of a canonical log, and
-- every (movement, set_index) has ≥1 FREE candidate slot. So pick the lowest sort_order matching
-- slot that is FREE at this row's set_index — deterministic, collision-free, preserves all 5.
-- History is aggregated by movement (exercise_id), so the exact slot is immaterial to what renders.
--
-- Idempotent: WHERE assignment_id IS NULL re-selects nothing on re-run. client_module_exercise_id
-- is left intact as the rollback path until Stage B. Guarded to ce14d4f5's legacy-only rows, and
-- only rows for which a free matching slot exists (guards against a half-key).
UPDATE public.exercise_set_logs esl
SET assignment_id = 'c63f4835-fd09-4d41-b455-6a2a4099ebe1',
    plan_slot_id = (
      SELECT ps.id
      FROM public.plan_slots ps
      WHERE ps.plan_id = 'c692ff67-7a85-4ae8-a0d2-e93f1e918c92'
        AND ps.exercise_id = (
          SELECT cme.exercise_id FROM public.client_module_exercises cme
          WHERE cme.id = esl.client_module_exercise_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.exercise_set_logs e
          WHERE e.assignment_id = 'c63f4835-fd09-4d41-b455-6a2a4099ebe1'
            AND e.plan_slot_id = ps.id
            AND e.set_index = esl.set_index
        )
      ORDER BY ps.sort_order ASC, ps.id ASC
      LIMIT 1
    )
WHERE esl.created_by_user_id = 'ce14d4f5-e1a0-4250-873e-2e57b968e4ef'
  AND esl.assignment_id IS NULL
  AND esl.plan_slot_id IS NULL
  AND esl.client_module_exercise_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.plan_slots ps
    WHERE ps.plan_id = 'c692ff67-7a85-4ae8-a0d2-e93f1e918c92'
      AND ps.exercise_id = (
        SELECT cme.exercise_id FROM public.client_module_exercises cme
        WHERE cme.id = esl.client_module_exercise_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.exercise_set_logs e
        WHERE e.assignment_id = 'c63f4835-fd09-4d41-b455-6a2a4099ebe1'
          AND e.plan_slot_id = ps.id
          AND e.set_index = esl.set_index
      )
  );

-- Post-condition (must be 0): no legacy-keyed log lacks a canonical key.
DO $$
DECLARE v_orphans int;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM public.exercise_set_logs
  WHERE client_module_exercise_id IS NOT NULL
    AND (assignment_id IS NULL OR plan_slot_id IS NULL);
  IF v_orphans <> 0 THEN
    RAISE EXCEPTION 'D3 re-key incomplete: % legacy-only logs still lack a canonical key', v_orphans;
  END IF;
END $$;
