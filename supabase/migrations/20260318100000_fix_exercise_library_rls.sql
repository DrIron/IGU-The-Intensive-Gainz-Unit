-- Fix: Allow authenticated users (coaches, admins) to read exercise_library
-- Currently coaches see 0 exercises because no SELECT policy exists for them

-- Allow all authenticated users to read active global exercises
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read exercise_library' AND tablename = 'exercise_library') THEN
    CREATE POLICY "Authenticated users can read exercise_library"
      ON public.exercise_library FOR SELECT TO authenticated USING (is_active = true);
  END IF;
END $$;

-- Allow coaches to read their own custom exercises (even if not global)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches can read own exercises' AND tablename = 'exercise_library') THEN
    CREATE POLICY "Coaches can read own exercises"
      ON public.exercise_library FOR SELECT TO authenticated USING (created_by_coach_id = auth.uid());
  END IF;
END $$;
