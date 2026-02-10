-- Diagnostic: check current state of auth function wrapping in RLS policies
-- This migration only reports via RAISE NOTICE, it does not modify anything.

DO $$
DECLARE
  total_policies INT;
  bare_public INT;
  wrapped_public INT;
  bare_all INT;
  wrapped_all INT;
  sample_qual TEXT;
  sample_name TEXT;
  sample_table TEXT;
  sample_schema TEXT;
  pol RECORD;
BEGIN
  -- Count total policies across all schemas
  SELECT count(*) INTO total_policies FROM pg_policies;

  -- Count policies with bare auth calls in public/storage
  SELECT count(*) INTO bare_public
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
    AND (
      regexp_replace(COALESCE(qual,''), '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)'
      OR
      regexp_replace(COALESCE(with_check,''), '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)'
    );

  -- Count policies with wrapped auth calls in public/storage
  SELECT count(*) INTO wrapped_public
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
    AND (COALESCE(qual,'') ~* '\(select\s+auth\.(uid|jwt|role)\(\)\)' OR COALESCE(with_check,'') ~* '\(select\s+auth\.(uid|jwt|role)\(\)\)');

  -- Count bare auth calls across ALL schemas
  SELECT count(*) INTO bare_all
  FROM pg_policies
  WHERE regexp_replace(COALESCE(qual,''), '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)'
    OR regexp_replace(COALESCE(with_check,''), '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)';

  -- Count wrapped across ALL schemas
  SELECT count(*) INTO wrapped_all
  FROM pg_policies
  WHERE COALESCE(qual,'') ~* '\(select\s+auth\.(uid|jwt|role)\(\)\)' OR COALESCE(with_check,'') ~* '\(select\s+auth\.(uid|jwt|role)\(\)\)';

  RAISE NOTICE '=== AUTH RLS DIAGNOSTIC ===';
  RAISE NOTICE 'Total policies: %', total_policies;
  RAISE NOTICE 'Public/Storage - bare auth calls remaining: %', bare_public;
  RAISE NOTICE 'Public/Storage - wrapped auth calls: %', wrapped_public;
  RAISE NOTICE 'ALL schemas - bare auth calls remaining: %', bare_all;
  RAISE NOTICE 'ALL schemas - wrapped auth calls: %', wrapped_all;

  -- Show 3 sample policies from public that still have bare auth calls
  FOR pol IN
    SELECT schemaname, tablename, policyname, LEFT(qual, 200) as qual_sample
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND qual IS NOT NULL
      AND qual ~ 'auth\.(uid|jwt|role)\(\)'
    LIMIT 3
  LOOP
    RAISE NOTICE 'SAMPLE bare (%.%): policy=% qual=%', pol.schemaname, pol.tablename, pol.policyname, pol.qual_sample;
  END LOOP;

  -- Show 3 sample policies from public that HAVE wrapped auth calls
  FOR pol IN
    SELECT schemaname, tablename, policyname, LEFT(qual, 200) as qual_sample
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND qual IS NOT NULL
      AND qual ~* '\(select\s+auth\.(uid|jwt|role)\(\)\)'
    LIMIT 3
  LOOP
    RAISE NOTICE 'SAMPLE wrapped (%.%): policy=% qual=%', pol.schemaname, pol.tablename, pol.policyname, pol.qual_sample;
  END LOOP;

  -- Show schemas that have bare auth calls
  FOR pol IN
    SELECT schemaname, count(*) as cnt
    FROM pg_policies
    WHERE regexp_replace(COALESCE(qual,''), '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)'
      OR regexp_replace(COALESCE(with_check,''), '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)'
    GROUP BY schemaname
    ORDER BY cnt DESC
  LOOP
    RAISE NOTICE 'Schema % has % policies with bare auth calls', pol.schemaname, pol.cnt;
  END LOOP;
END $$;
