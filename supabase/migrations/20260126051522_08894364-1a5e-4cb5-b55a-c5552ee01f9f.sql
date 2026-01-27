-- ============================================================
-- SECURITY HARDENING: Lock down profiles view
-- Combined profiles view contains PII - restrict to admin/service only
-- ============================================================

-- Revoke all access from anon and authenticated on the profiles view
REVOKE ALL ON public.profiles FROM public;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;

-- Grant SELECT only to service_role (for edge functions)
GRANT SELECT ON public.profiles TO service_role;

-- Add security documentation
COMMENT ON VIEW public.profiles IS 
'SECURITY: ADMIN/SERVER-ONLY - Combined view of profiles_public + profiles_private.
Contains PII (email, phone, DOB, full name). Never expose via client-side queries.
Frontend must use profiles_public for display, profiles_private for admin/owner access only.';

-- ============================================================
-- RPC: admin_get_profile_private (Admin only)
-- Secure admin access to private profile data
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_profile_private(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  last_name text,
  phone text,
  date_of_birth date,
  gender text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id uuid;
  v_is_admin boolean;
BEGIN
  -- Get requester identity
  v_requester_id := auth.uid();
  
  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Only admins can use this function
  v_is_admin := has_role(v_requester_id, 'admin'::app_role);
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;
  
  -- Log PHI access
  PERFORM log_phi_access(
    v_requester_id,
    p_user_id,
    'admin_get_profile_private',
    'profiles_private',
    NULL,
    ARRAY['email', 'phone', 'date_of_birth', 'full_name', 'gender'],
    NULL, NULL, NULL,
    jsonb_build_object('admin_access', true)
  );
  
  -- Return private profile data
  RETURN QUERY
  SELECT 
    pp.profile_id as id,
    pp.email,
    pp.full_name,
    pp.last_name,
    pp.phone,
    pp.date_of_birth,
    pp.gender,
    pp.created_at,
    pp.updated_at
  FROM profiles_private pp
  WHERE pp.profile_id = p_user_id;
END;
$$;

-- ============================================================
-- RPC: get_my_profile_private (Self-access only)
-- Users can view their own private profile data
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_profile_private()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  last_name text,
  phone text,
  date_of_birth date,
  gender text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id uuid;
BEGIN
  -- Get requester identity
  v_requester_id := auth.uid();
  
  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Return only the requester's own private data
  RETURN QUERY
  SELECT 
    pp.profile_id as id,
    pp.email,
    pp.full_name,
    pp.last_name,
    pp.phone,
    pp.date_of_birth,
    pp.gender,
    pp.created_at,
    pp.updated_at
  FROM profiles_private pp
  WHERE pp.profile_id = v_requester_id;
END;
$$;

-- ============================================================
-- RPC: update_my_profile_private (Self-update only)
-- Users can update their own private profile data
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_my_profile_private(
  p_email text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_gender text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id uuid;
BEGIN
  -- Get requester identity
  v_requester_id := auth.uid();
  
  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Update only the requester's own data
  UPDATE profiles_private
  SET 
    email = COALESCE(p_email, email),
    full_name = COALESCE(p_full_name, full_name),
    last_name = COALESCE(p_last_name, last_name),
    phone = COALESCE(p_phone, phone),
    date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
    gender = COALESCE(p_gender, gender),
    updated_at = now()
  WHERE profile_id = v_requester_id;
  
  RETURN true;
END;
$$;

-- ============================================================
-- PERMISSIONS
-- ============================================================

-- Revoke from anon
REVOKE EXECUTE ON FUNCTION public.admin_get_profile_private(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_profile_private() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_my_profile_private(text, text, text, text, date, text) FROM anon;

-- Grant to authenticated (authorization checked inside functions)
GRANT EXECUTE ON FUNCTION public.admin_get_profile_private(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_profile_private(text, text, text, text, date, text) TO authenticated;

-- Grant to service_role
GRANT EXECUTE ON FUNCTION public.admin_get_profile_private(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_my_profile_private(text, text, text, text, date, text) TO service_role;

-- ============================================================
-- DOCUMENTATION
-- ============================================================
COMMENT ON FUNCTION public.admin_get_profile_private(uuid) IS 
'ADMIN-ONLY: Returns private profile data for any user. All access is logged to phi_access_audit_log.';

COMMENT ON FUNCTION public.get_my_profile_private() IS 
'SELF-ACCESS: Returns the authenticated user''s own private profile data. No user_id parameter to prevent IDOR.';

COMMENT ON FUNCTION public.update_my_profile_private(text, text, text, text, date, text) IS 
'SELF-ACCESS: Allows authenticated users to update their own private profile data only.';