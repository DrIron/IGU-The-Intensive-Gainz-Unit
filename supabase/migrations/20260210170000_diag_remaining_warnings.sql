-- Diagnostic: what auth calls remain across ALL schemas?

DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Per-schema breakdown of bare auth calls
  RAISE NOTICE '=== BARE AUTH CALLS BY SCHEMA ===';
  FOR pol IN
    SELECT schemaname, count(*) as cnt
    FROM pg_policies
    WHERE regexp_replace(
        regexp_replace(COALESCE(qual,'') || ' ' || COALESCE(with_check,''),
          '\(\s*SELECT\s+auth\.(uid|jwt|role|email)\(\)\s+AS\s+\w+\)', '', 'gi'),
        '\(select\s+auth\.(uid|jwt|role|email)\(\)\)', '', 'gi'
      ) ~ 'auth\.(uid|jwt|role|email)\(\)'
    GROUP BY schemaname ORDER BY cnt DESC
  LOOP
    RAISE NOTICE 'Schema %: % policies with bare auth calls', pol.schemaname, pol.cnt;
  END LOOP;

  -- Check for current_setting calls
  RAISE NOTICE '=== CURRENT_SETTING CALLS BY SCHEMA ===';
  FOR pol IN
    SELECT schemaname, count(*) as cnt
    FROM pg_policies
    WHERE COALESCE(qual,'') || ' ' || COALESCE(with_check,'') ~ 'current_setting'
    GROUP BY schemaname ORDER BY cnt DESC
  LOOP
    RAISE NOTICE 'Schema %: % policies with current_setting', pol.schemaname, pol.cnt;
  END LOOP;

  -- Check for any remaining auth function patterns
  RAISE NOTICE '=== ALL AUTH FUNCTION PATTERNS ===';
  FOR pol IN
    SELECT schemaname, count(*) as cnt
    FROM pg_policies
    WHERE COALESCE(qual,'') || ' ' || COALESCE(with_check,'') ~ 'auth\.\w+\(\)'
    GROUP BY schemaname ORDER BY cnt DESC
  LOOP
    RAISE NOTICE 'Schema %: % policies with any auth.* calls', pol.schemaname, pol.cnt;
  END LOOP;

  -- Sample from realtime/auth schemas
  FOR pol IN
    SELECT schemaname, tablename, policyname, LEFT(COALESCE(qual, with_check), 200) as expr_sample
    FROM pg_policies
    WHERE schemaname NOT IN ('public', 'storage')
      AND (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) ~ 'auth\.\w+\(\)'
    LIMIT 5
  LOOP
    RAISE NOTICE 'SAMPLE (%.%): policy=% expr=%', pol.schemaname, pol.tablename, pol.policyname, pol.expr_sample;
  END LOOP;
END $$;
