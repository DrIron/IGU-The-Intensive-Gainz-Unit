-- Fix: Allow authenticated users (coaches, admins) to read exercise_library
-- Currently coaches see 0 exercises because no SELECT policy exists for them

-- Allow all authenticated users to read active global exercises
CREATE POLICY IF NOT EXISTS "Authenticated users can read exercise_library"
  ON public.exercise_library
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Allow coaches to read their own custom exercises (even if not global)
CREATE POLICY IF NOT EXISTS "Coaches can read own exercises"
  ON public.exercise_library
  FOR SELECT
  TO authenticated
  USING (created_by_coach_id = auth.uid());
