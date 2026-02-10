-- Performance optimization V2: DROP + CREATE policies to preserve (select auth.uid()) subqueries
--
-- ALTER POLICY does not preserve scalar subqueries — PostgreSQL's expression normalizer
-- inlines (select auth.uid()) back to auth.uid(). The only way to keep the subselect
-- is to DROP and CREATE the policy fresh.
--
-- This runs in a transaction, so if any CREATE fails, the DROP is rolled back too.

DO $$
DECLARE
  pol RECORD;
  new_qual TEXT;
  new_check TEXT;
  roles_str TEXT;
  create_sql TEXT;
  fix_count INT := 0;
  skip_count INT := 0;
  bare_before INT;
  bare_after INT;
  wrapped_after INT;
BEGIN
  -- Count before
  SELECT count(*) INTO bare_before
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
    AND (
      regexp_replace(COALESCE(qual,''), '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)'
      OR
      regexp_replace(COALESCE(with_check,''), '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)'
    );
  RAISE NOTICE 'Before: % policies with bare auth calls', bare_before;

  FOR pol IN
    SELECT schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
    ORDER BY schemaname, tablename, policyname
  LOOP
    -- Check if this policy needs fixing
    IF NOT (
      (pol.qual IS NOT NULL AND
       regexp_replace(pol.qual, '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)')
      OR
      (pol.with_check IS NOT NULL AND
       regexp_replace(pol.with_check, '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)')
    ) THEN
      CONTINUE;
    END IF;

    -- Build roles string with proper quoting
    SELECT string_agg(quote_ident(r), ', ') INTO roles_str FROM unnest(pol.roles) AS r;

    -- Build CREATE POLICY statement
    create_sql := format('CREATE POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    create_sql := create_sql || ' AS ' || pol.permissive;
    create_sql := create_sql || ' FOR ' || pol.cmd;
    create_sql := create_sql || ' TO ' || roles_str;

    IF pol.qual IS NOT NULL THEN
      new_qual := pol.qual;
      -- Protect already-wrapped calls with placeholders
      new_qual := regexp_replace(new_qual, '\(select\s+auth\.uid\(\)\)', '___WRAPPED_UID___', 'gi');
      new_qual := regexp_replace(new_qual, '\(select\s+auth\.jwt\(\)\)', '___WRAPPED_JWT___', 'gi');
      new_qual := regexp_replace(new_qual, '\(select\s+auth\.role\(\)\)', '___WRAPPED_ROLE___', 'gi');
      -- Wrap bare calls in subselects
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, 'auth.jwt()', '(select auth.jwt())');
      new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
      -- Restore placeholders
      new_qual := replace(new_qual, '___WRAPPED_UID___', '(select auth.uid())');
      new_qual := replace(new_qual, '___WRAPPED_JWT___', '(select auth.jwt())');
      new_qual := replace(new_qual, '___WRAPPED_ROLE___', '(select auth.role())');
      create_sql := create_sql || ' USING (' || new_qual || ')';
    END IF;

    IF pol.with_check IS NOT NULL THEN
      new_check := pol.with_check;
      new_check := regexp_replace(new_check, '\(select\s+auth\.uid\(\)\)', '___WRAPPED_UID___', 'gi');
      new_check := regexp_replace(new_check, '\(select\s+auth\.jwt\(\)\)', '___WRAPPED_JWT___', 'gi');
      new_check := regexp_replace(new_check, '\(select\s+auth\.role\(\)\)', '___WRAPPED_ROLE___', 'gi');
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
      new_check := replace(new_check, 'auth.jwt()', '(select auth.jwt())');
      new_check := replace(new_check, 'auth.role()', '(select auth.role())');
      new_check := replace(new_check, '___WRAPPED_UID___', '(select auth.uid())');
      new_check := replace(new_check, '___WRAPPED_JWT___', '(select auth.jwt())');
      new_check := replace(new_check, '___WRAPPED_ROLE___', '(select auth.role())');
      create_sql := create_sql || ' WITH CHECK (' || new_check || ')';
    END IF;

    -- DROP + CREATE inside subtransaction so failure rolls back both
    BEGIN
      EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
      EXECUTE create_sql;
      fix_count := fix_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed policy "%" on "%.%": %', pol.policyname, pol.schemaname, pol.tablename, SQLERRM;
      skip_count := skip_count + 1;
    END;
  END LOOP;

  -- Count after
  SELECT count(*) INTO bare_after
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
    AND (
      regexp_replace(COALESCE(qual,''), '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)'
      OR
      regexp_replace(COALESCE(with_check,''), '\(select\s+auth\.(uid|jwt|role)\(\)\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)'
    );
  SELECT count(*) INTO wrapped_after
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
    AND (COALESCE(qual,'') ~* '\(select\s+auth\.(uid|jwt|role)\(\)\)' OR COALESCE(with_check,'') ~* '\(select\s+auth\.(uid|jwt|role)\(\)\)');

  RAISE NOTICE 'Result: % policies recreated, % skipped', fix_count, skip_count;
  RAISE NOTICE 'After: % bare, % wrapped', bare_after, wrapped_after;
END $$;
