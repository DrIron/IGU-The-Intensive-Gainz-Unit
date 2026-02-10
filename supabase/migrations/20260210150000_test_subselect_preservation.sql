-- Test: does pg_policies preserve (select auth.uid()) in policy expressions?

DO $$
DECLARE
  test_qual TEXT;
BEGIN
  -- Create test table and policy with explicit subselect
  CREATE TABLE IF NOT EXISTS public._test_rls_subselect (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid);
  ALTER TABLE public._test_rls_subselect ENABLE ROW LEVEL SECURITY;

  -- Create policy WITH the subselect pattern
  CREATE POLICY "test_subselect_policy" ON public._test_rls_subselect
    FOR SELECT TO authenticated
    USING ((select auth.uid()) = user_id);

  -- Check what pg_policies shows
  SELECT qual INTO test_qual
  FROM pg_policies
  WHERE policyname = 'test_subselect_policy' AND tablename = '_test_rls_subselect';

  RAISE NOTICE 'TEST: Created with (select auth.uid()), pg_policies shows: %', test_qual;
  RAISE NOTICE 'Contains "select": %', (test_qual ~* 'select');

  -- Cleanup
  DROP POLICY "test_subselect_policy" ON public._test_rls_subselect;
  DROP TABLE public._test_rls_subselect;
END $$;
