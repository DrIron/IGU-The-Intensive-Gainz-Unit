-- P5 Legacy Drop — Stage B1: drop dead legacy column client_module_exercise_id on exercise_set_logs.
-- Gate re-verified on prod 2026-07-05: 124/124 logs canonical-keyed (assignment_id + plan_slot_id), 0 legacy-only.
--
-- NOTE (found on apply 2026-07-05): the column is NOT app-code-referenced (buildLogKey/logConflictTarget
-- are canonical-only) but FOUR RLS policies still bind it, and two of them are the ONLY policies granting
-- a client SELECT on their own set logs. So the drop is preceded here by an RLS re-point:
--   * add a canonical client-self SELECT policy (created_by_user_id = auth.uid()) to preserve client reads,
--   * drop the four legacy cme-bound policies,
--   * then drop the FK / unique constraint / plain index / column.
-- The identically-named column on progression_suggestions is a DIFFERENT table and is untouched.

-- 1. Guard: abort if the canonical-keying invariant regressed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM exercise_set_logs WHERE assignment_id IS NULL) THEN
    RAISE EXCEPTION 'legacy-keyed logs still present — abort column drop';
  END IF;
END $$;

-- 2. Preserve client-self SELECT (the two legacy SELECT policies being dropped below are the only ones
--    granting a client read on their own logs; the canonical coach-select policy is coach/admin/team only).
CREATE POLICY exercise_set_logs_canonical_self_select ON exercise_set_logs
  FOR SELECT
  USING (created_by_user_id = (SELECT auth.uid()));

-- 3. Drop the four legacy policies that reference client_module_exercise_id.
--    Canonical coverage after drop: INSERT -> esl_canonical_insert (client-self + assignment_id);
--    SELECT -> exercise_set_logs_canonical_coach_select (coach/admin/team) + the new self-select above;
--    UPDATE/DELETE policies never referenced the column.
DROP POLICY "Clients can create own set logs" ON exercise_set_logs;
DROP POLICY "View set logs"                   ON exercise_set_logs;
DROP POLICY exercise_set_logs_insert          ON exercise_set_logs;
DROP POLICY exercise_set_logs_select          ON exercise_set_logs;

-- 4. Drop the legacy FK constraint.
ALTER TABLE exercise_set_logs
  DROP CONSTRAINT exercise_set_logs_client_module_exercise_id_fkey;

-- 5. Drop the legacy UNIQUE key (constraint-backed): (client_module_exercise_id, set_index).
ALTER TABLE exercise_set_logs
  DROP CONSTRAINT exercise_set_logs_client_module_exercise_id_set_index_key;

-- 6. Drop the legacy plain btree index on the column.
DROP INDEX IF EXISTS idx_set_logs_exercise;

-- 7. Drop the dead column.
ALTER TABLE exercise_set_logs
  DROP COLUMN client_module_exercise_id;
