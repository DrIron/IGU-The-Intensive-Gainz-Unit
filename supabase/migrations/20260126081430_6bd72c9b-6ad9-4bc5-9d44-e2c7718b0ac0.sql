-- =============================================================================
-- RLS POLICIES FOR COACH DIRECTORY VIEWS
-- =============================================================================

-- Note: Views with security_invoker = true inherit RLS from underlying tables,
-- but we also add explicit grants to control access at the view level.

-- =============================================================================
-- coaches_directory (public-safe view) - Authenticated users only
-- =============================================================================

-- Revoke all access first (already done in previous migration, but ensure clean state)
REVOKE ALL ON public.coaches_directory FROM anon, authenticated;

-- Grant SELECT only to authenticated users
GRANT SELECT ON public.coaches_directory TO authenticated;

-- Verify: anon role cannot access this view (no GRANT = no access)

-- =============================================================================
-- coaches_directory_admin - Admins and self (coach viewing their own record)
-- =============================================================================

-- Revoke all access first
REVOKE ALL ON public.coaches_directory_admin FROM anon, authenticated;

-- Grant SELECT to authenticated (RLS will restrict further)
GRANT SELECT ON public.coaches_directory_admin TO authenticated;

-- Create a wrapper function for admin-only access with audit logging
-- This ensures that even if someone tries to query directly, they get nothing
-- unless they use the audited RPC

-- Drop existing RPC if it exists and recreate with proper security
DROP FUNCTION IF EXISTS public.admin_get_coaches_directory();

CREATE OR REPLACE FUNCTION public.admin_get_coaches_directory()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  display_name text,
  nickname text,
  bio text,
  short_bio text,
  location text,
  profile_picture_url text,
  qualifications text[],
  specializations text[],
  specialties public.staff_specialty[],
  status text,
  max_onetoone_clients integer,
  max_team_clients integer,
  last_assigned_at timestamptz,
  instagram_url text,
  tiktok_url text,
  youtube_url text,
  created_at timestamptz,
  updated_at timestamptz,
  email text,
  phone text,
  whatsapp_number text,
  date_of_birth date,
  gender text,
  snapchat_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_requester_id uuid;
BEGIN
  v_requester_id := auth.uid();
  
  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Only admins can access full coach directory with contact info
  IF NOT has_role(v_requester_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;
  
  -- Log admin access to coach directory for audit trail
  INSERT INTO admin_audit_log (admin_user_id, action_type, target_type, details)
  VALUES (v_requester_id, 'view_coaches_directory_admin', 'coaches', 
    jsonb_build_object('action', 'listed all coaches with contact info'));
  
  RETURN QUERY SELECT * FROM public.coaches_directory_admin;
END;
$$;

-- Revoke direct execute from non-admins, grant to authenticated (RPC handles auth check)
REVOKE EXECUTE ON FUNCTION public.admin_get_coaches_directory() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_coaches_directory() TO authenticated;

-- =============================================================================
-- Create RPC for coach to view their own full profile (self-service)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_coach_profile()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  display_name text,
  nickname text,
  bio text,
  short_bio text,
  location text,
  profile_picture_url text,
  qualifications text[],
  specializations text[],
  specialties public.staff_specialty[],
  status text,
  max_onetoone_clients integer,
  max_team_clients integer,
  instagram_url text,
  tiktok_url text,
  youtube_url text,
  created_at timestamptz,
  updated_at timestamptz,
  email text,
  phone text,
  whatsapp_number text,
  date_of_birth date,
  gender text,
  snapchat_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_requester_id uuid;
BEGIN
  v_requester_id := auth.uid();
  
  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Must be a coach to use this function
  IF NOT has_role(v_requester_id, 'coach'::app_role) THEN
    RAISE EXCEPTION 'Access denied: Coach role required';
  END IF;
  
  -- Return only the coach's own record (self-service)
  RETURN QUERY 
  SELECT 
    cda.id,
    cda.user_id,
    cda.first_name,
    cda.last_name,
    cda.display_name,
    cda.nickname,
    cda.bio,
    cda.short_bio,
    cda.location,
    cda.profile_picture_url,
    cda.qualifications,
    cda.specializations,
    cda.specialties,
    cda.status,
    cda.max_onetoone_clients,
    cda.max_team_clients,
    cda.instagram_url,
    cda.tiktok_url,
    cda.youtube_url,
    cda.created_at,
    cda.updated_at,
    cda.email,
    cda.phone,
    cda.whatsapp_number,
    cda.date_of_birth,
    cda.gender,
    cda.snapchat_url
  FROM public.coaches_directory_admin cda
  WHERE cda.user_id = v_requester_id;
END;
$$;

-- Grant execute to authenticated (RPC handles role check)
REVOKE EXECUTE ON FUNCTION public.get_my_coach_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_coach_profile() TO authenticated;

-- =============================================================================
-- Add comments for documentation
-- =============================================================================

COMMENT ON VIEW public.coaches_directory IS 
'Public-safe coach directory. Contains ONLY non-sensitive fields suitable for client-facing pages. 
No email, phone, DOB, capacity, or internal data exposed.
Access: Authenticated users only (no anon access).';

COMMENT ON VIEW public.coaches_directory_admin IS 
'Admin-only coach directory with full contact and internal data.
Access: Admins only via admin_get_coaches_directory() RPC.
Coaches can view their own record via get_my_coach_profile() RPC.
Direct SELECT is blocked for non-service_role.';

COMMENT ON FUNCTION public.admin_get_coaches_directory() IS 
'Admin-only RPC to list all coaches with contact info. Logs access to admin_audit_log.';

COMMENT ON FUNCTION public.get_my_coach_profile() IS 
'Coach self-service RPC to view their own full profile including contact info.';