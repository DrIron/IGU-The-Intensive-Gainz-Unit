-- Performance optimization: wrap auth function calls in subselects in all RLS policies
--
-- PostgreSQL evaluates auth.uid(), auth.jwt(), and auth.role() per-row in RLS policies.
-- Wrapping them in (select auth.uid()) tells PostgreSQL to evaluate once and cache the
-- result for the entire query, dramatically improving performance on large tables.
--
-- This addresses all "Auth RLS Initialization Plan" warnings from the Supabase Performance Advisor.
-- Uses pg_policies to dynamically find and fix all affected policies.

DO $$
DECLARE
  pol RECORD;
  new_qual TEXT;
  new_check TEXT;
  needs_qual BOOLEAN;
  needs_check BOOLEAN;
  stripped TEXT;
  sql_cmd TEXT;
  fix_count INT := 0;
  skip_count INT := 0;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
  LOOP
    -- Check if USING expression has unwrapped auth function calls
    needs_qual := FALSE;
    IF pol.qual IS NOT NULL THEN
      -- Remove already-wrapped calls, then check if any bare calls remain
      stripped := regexp_replace(pol.qual, '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi');
      needs_qual := stripped ~ 'auth\.(uid|jwt|role)\(\)';
    END IF;

    -- Check if WITH CHECK expression has unwrapped auth function calls
    needs_check := FALSE;
    IF pol.with_check IS NOT NULL THEN
      stripped := regexp_replace(pol.with_check, '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi');
      needs_check := stripped ~ 'auth\.(uid|jwt|role)\(\)';
    END IF;

    IF NOT needs_qual AND NOT needs_check THEN
      CONTINUE;
    END IF;

    sql_cmd := format('ALTER POLICY %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);

    IF needs_qual THEN
      new_qual := pol.qual;
      -- Protect already-wrapped calls with placeholders (case-insensitive)
      new_qual := regexp_replace(new_qual, '\(select\s+auth\.uid\(\)\)',  '___WRAPPED_UID___',  'gi');
      new_qual := regexp_replace(new_qual, '\(select\s+auth\.jwt\(\)\)',  '___WRAPPED_JWT___',  'gi');
      new_qual := regexp_replace(new_qual, '\(select\s+auth\.role\(\)\)', '___WRAPPED_ROLE___', 'gi');
      -- Wrap bare auth calls in subselects
      new_qual := replace(new_qual, 'auth.uid()',  '(select auth.uid())');
      new_qual := replace(new_qual, 'auth.jwt()',  '(select auth.jwt())');
      new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
      -- Restore placeholders
      new_qual := replace(new_qual, '___WRAPPED_UID___',  '(select auth.uid())');
      new_qual := replace(new_qual, '___WRAPPED_JWT___',  '(select auth.jwt())');
      new_qual := replace(new_qual, '___WRAPPED_ROLE___', '(select auth.role())');
      sql_cmd := sql_cmd || ' USING (' || new_qual || ')';
    END IF;

    IF needs_check THEN
      new_check := pol.with_check;
      -- Protect already-wrapped calls with placeholders
      new_check := regexp_replace(new_check, '\(select\s+auth\.uid\(\)\)',  '___WRAPPED_UID___',  'gi');
      new_check := regexp_replace(new_check, '\(select\s+auth\.jwt\(\)\)',  '___WRAPPED_JWT___',  'gi');
      new_check := regexp_replace(new_check, '\(select\s+auth\.role\(\)\)', '___WRAPPED_ROLE___', 'gi');
      -- Wrap bare auth calls
      new_check := replace(new_check, 'auth.uid()',  '(select auth.uid())');
      new_check := replace(new_check, 'auth.jwt()',  '(select auth.jwt())');
      new_check := replace(new_check, 'auth.role()', '(select auth.role())');
      -- Restore placeholders
      new_check := replace(new_check, '___WRAPPED_UID___',  '(select auth.uid())');
      new_check := replace(new_check, '___WRAPPED_JWT___',  '(select auth.jwt())');
      new_check := replace(new_check, '___WRAPPED_ROLE___', '(select auth.role())');
      sql_cmd := sql_cmd || ' WITH CHECK (' || new_check || ')';
    END IF;

    -- Execute with error handling so one failure doesn't stop all fixes
    BEGIN
      EXECUTE sql_cmd;
      fix_count := fix_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to alter policy "%" on "%.%": %',
        pol.policyname, pol.schemaname, pol.tablename, SQLERRM;
      skip_count := skip_count + 1;
    END;
  END LOOP;

  RAISE NOTICE 'RLS auth subselect optimization: % policies fixed, % skipped', fix_count, skip_count;
END $$;
