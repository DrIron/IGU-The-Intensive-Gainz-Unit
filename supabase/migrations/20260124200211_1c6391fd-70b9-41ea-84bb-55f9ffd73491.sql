
-- ============================================================
-- Lock down profiles_legacy to admin-only access
-- ============================================================

-- STEP 1: Drop ALL existing policies on profiles_legacy
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles_legacy;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles_legacy;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles_legacy;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles_legacy;

-- STEP 2: Create single admin-only policy
CREATE POLICY "profiles_legacy_admin_only"
ON public.profiles_legacy
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- STEP 3: Document the security model
COMMENT ON TABLE public.profiles_legacy IS 
'Legacy profiles table containing full PII. Access restricted to ADMINS ONLY.
Users and coaches should use:
- profiles_public: public profile data (name, status, display_name)
- profiles_private: private PII (email, phone, DOB, gender)
- profiles view: combined view for admin use only

This table is maintained for backward compatibility with FK constraints.
No application code should query this table directly.';

-- STEP 4: Create a function to check for non-admin access attempts on legacy tables
-- This will be called by the System Health check
CREATE OR REPLACE FUNCTION public.check_legacy_table_security()
RETURNS TABLE (
  table_name text,
  policy_name text,
  allows_non_admin boolean,
  issue_description text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.tablename::text,
    p.policyname::text,
    -- Check if policy allows non-admin access
    (
      p.qual::text NOT LIKE '%admin%' 
      OR p.qual::text LIKE '%auth.uid()%'
    ) AS allows_non_admin,
    CASE 
      WHEN p.qual::text LIKE '%auth.uid() = id%' THEN 'Policy allows user own-row access'
      WHEN p.qual::text LIKE '%auth.uid() = user_id%' THEN 'Policy allows user own-row access via user_id'
      WHEN p.qual::text NOT LIKE '%admin%' THEN 'Policy does not require admin role'
      ELSE 'Policy may allow non-admin access'
    END AS issue_description
  FROM pg_policies p
  WHERE p.schemaname = 'public'
  AND p.tablename IN ('profiles_legacy', 'coaches')
  AND (
    -- Flag policies that allow non-admin access
    p.qual::text NOT LIKE '%has_role(auth.uid(), ''admin''%'
    AND p.qual::text != 'false'
  );
END;
$$;

-- Grant execute to authenticated users (admins will call this from System Health)
GRANT EXECUTE ON FUNCTION public.check_legacy_table_security() TO authenticated;
