-- Verify the auth subselect fix with correct pattern matching
-- pg_get_expr() decompiles (select auth.uid()) as ( SELECT auth.uid() AS uid)

DO $$
DECLARE
  bare_count INT;
  wrapped_count INT;
  total_count INT;
  pol RECORD;
BEGIN
  SELECT count(*) INTO total_count FROM pg_policies WHERE schemaname IN ('public', 'storage');

  -- Count bare (unwrapped) auth calls: remove wrapped pattern first, then check for bare
  -- Wrapped format: ( SELECT auth.uid() AS uid) or (SELECT auth.uid() AS uid)
  SELECT count(*) INTO bare_count
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
    AND (
      regexp_replace(
        regexp_replace(COALESCE(qual,''), '\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)\s+AS\s+\w+\)', '', 'gi'),
        '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi'
      ) ~ 'auth\.(uid|jwt|role)\(\)'
      OR
      regexp_replace(
        regexp_replace(COALESCE(with_check,''), '\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)\s+AS\s+\w+\)', '', 'gi'),
        '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi'
      ) ~ 'auth\.(uid|jwt|role)\(\)'
    );

  -- Count wrapped (subselect) auth calls
  SELECT count(*) INTO wrapped_count
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
    AND (
      COALESCE(qual,'') ~* '\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)\s+AS\s+\w+\)'
      OR COALESCE(with_check,'') ~* '\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)\s+AS\s+\w+\)'
    );

  RAISE NOTICE '=== AUTH RLS FIX VERIFICATION ===';
  RAISE NOTICE 'Total policies in public/storage: %', total_count;
  RAISE NOTICE 'Policies with WRAPPED auth calls (SELECT ... AS): %', wrapped_count;
  RAISE NOTICE 'Policies with BARE auth calls remaining: %', bare_count;

  -- Show a sample wrapped policy
  FOR pol IN
    SELECT policyname, tablename, LEFT(qual, 300) as qual_sample
    FROM pg_policies
    WHERE schemaname = 'public'
      AND COALESCE(qual,'') ~* '\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)\s+AS\s+\w+\)'
    LIMIT 2
  LOOP
    RAISE NOTICE 'WRAPPED: %.% qual=%', pol.tablename, pol.policyname, pol.qual_sample;
  END LOOP;

  -- Show a sample bare policy (if any remain)
  FOR pol IN
    SELECT policyname, tablename, LEFT(qual, 300) as qual_sample
    FROM pg_policies
    WHERE schemaname = 'public'
      AND regexp_replace(
        regexp_replace(COALESCE(qual,''), '\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)\s+AS\s+\w+\)', '', 'gi'),
        '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi'
      ) ~ 'auth\.(uid|jwt|role)\(\)'
    LIMIT 2
  LOOP
    RAISE NOTICE 'BARE: %.% qual=%', pol.tablename, pol.policyname, pol.qual_sample;
  END LOOP;
END $$;
