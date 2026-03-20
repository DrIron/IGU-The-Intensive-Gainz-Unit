-- ============================================================
-- Fix exercise_prescriptions + module_exercises RLS performance
--
-- Root cause: overlapping/duplicate policies with 4-table-deep
-- EXISTS subqueries causing 500/504 timeouts (8s statement_timeout
-- for authenticated role).
--
-- Fix:
-- 1. Consolidate module_exercises policies (had duplicates)
-- 2. Simplify exercise_prescriptions to 2-hop check
-- 3. Add missing indexes on FK columns used in RLS
-- ============================================================

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_module_exercises_day_module
  ON public.module_exercises (day_module_id);

CREATE INDEX IF NOT EXISTS idx_exercise_prescriptions_module_exercise
  ON public.exercise_prescriptions (module_exercise_id);

CREATE INDEX IF NOT EXISTS idx_day_modules_owner
  ON public.day_modules (module_owner_coach_id);

CREATE INDEX IF NOT EXISTS idx_day_modules_template_day
  ON public.day_modules (program_template_day_id);

-- ── module_exercises: drop all, recreate clean ──────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy WHERE polrelid = 'module_exercises'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON module_exercises', pol.polname);
  END LOOP;
END $$;

-- SELECT: module owner OR program owner OR admin
CREATE POLICY "module_exercises_select" ON module_exercises
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM day_modules dm
      WHERE dm.id = module_exercises.day_module_id
        AND (dm.module_owner_coach_id = auth.uid()
             OR EXISTS (
               SELECT 1 FROM program_template_days ptd
               JOIN program_templates pt ON pt.id = ptd.program_template_id
               WHERE ptd.id = dm.program_template_day_id
                 AND pt.owner_coach_id = auth.uid()
             ))
    )
    OR is_admin(auth.uid())
  );

-- INSERT: module owner OR admin
CREATE POLICY "module_exercises_insert" ON module_exercises
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM day_modules dm
      WHERE dm.id = module_exercises.day_module_id
        AND dm.module_owner_coach_id = auth.uid()
    )
    OR is_admin(auth.uid())
  );

-- UPDATE: module owner OR admin
CREATE POLICY "module_exercises_update" ON module_exercises
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM day_modules dm
      WHERE dm.id = module_exercises.day_module_id
        AND dm.module_owner_coach_id = auth.uid()
    )
    OR is_admin(auth.uid())
  );

-- DELETE: module owner OR admin
CREATE POLICY "module_exercises_delete" ON module_exercises
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM day_modules dm
      WHERE dm.id = module_exercises.day_module_id
        AND dm.module_owner_coach_id = auth.uid()
    )
    OR is_admin(auth.uid())
  );

-- ── exercise_prescriptions: drop all, recreate clean ────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy WHERE polrelid = 'exercise_prescriptions'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON exercise_prescriptions', pol.polname);
  END LOOP;
END $$;

-- SELECT: module owner OR program owner OR admin (single EXISTS, short-circuit OR)
CREATE POLICY "exercise_prescriptions_select" ON exercise_prescriptions
  FOR SELECT USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM module_exercises me
      JOIN day_modules dm ON dm.id = me.day_module_id
      WHERE me.id = exercise_prescriptions.module_exercise_id
        AND (dm.module_owner_coach_id = auth.uid()
             OR EXISTS (
               SELECT 1 FROM program_template_days ptd
               JOIN program_templates pt ON pt.id = ptd.program_template_id
               WHERE ptd.id = dm.program_template_day_id
                 AND pt.owner_coach_id = auth.uid()
             ))
    )
  );

-- INSERT: module owner OR admin
CREATE POLICY "exercise_prescriptions_insert" ON exercise_prescriptions
  FOR INSERT WITH CHECK (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM module_exercises me
      JOIN day_modules dm ON dm.id = me.day_module_id
      WHERE me.id = exercise_prescriptions.module_exercise_id
        AND dm.module_owner_coach_id = auth.uid()
    )
  );

-- UPDATE: module owner OR admin
CREATE POLICY "exercise_prescriptions_update" ON exercise_prescriptions
  FOR UPDATE USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM module_exercises me
      JOIN day_modules dm ON dm.id = me.day_module_id
      WHERE me.id = exercise_prescriptions.module_exercise_id
        AND dm.module_owner_coach_id = auth.uid()
    )
  );

-- DELETE: module owner OR admin
CREATE POLICY "exercise_prescriptions_delete" ON exercise_prescriptions
  FOR DELETE USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM module_exercises me
      JOIN day_modules dm ON dm.id = me.day_module_id
      WHERE me.id = exercise_prescriptions.module_exercise_id
        AND dm.module_owner_coach_id = auth.uid()
    )
  );
