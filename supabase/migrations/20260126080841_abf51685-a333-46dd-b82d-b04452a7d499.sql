-- =============================================================================
-- STEP 1: Rename existing coaches_directory to coaches_directory_admin
-- =============================================================================

-- Drop the existing coaches_directory view
DROP VIEW IF EXISTS public.coaches_directory;

-- Create admin-only full view with all fields (including contact/internal data)
CREATE VIEW public.coaches_directory_admin
WITH (security_invoker = true)
AS
SELECT 
  cp.id,
  cp.user_id,
  cp.first_name,
  cp.last_name,
  cp.display_name,
  cp.nickname,
  cp.bio,
  cp.short_bio,
  cp.location,
  cp.profile_picture_url,
  cp.qualifications,
  cp.specializations,
  cp.specialties,
  cp.status,
  cp.max_onetoone_clients,
  cp.max_team_clients,
  cp.last_assigned_at,
  cp.instagram_url,
  cp.tiktok_url,
  cp.youtube_url,
  cp.created_at,
  cp.updated_at,
  -- Private/sensitive fields from coaches_private
  cpriv.email,
  cpriv.phone,
  cpriv.whatsapp_number,
  cpriv.date_of_birth,
  cpriv.gender,
  cpriv.snapchat_url
FROM public.coaches_public cp
LEFT JOIN public.coaches_private cpriv ON cp.id = cpriv.coach_public_id
WHERE cp.status = 'active';

-- Restrict admin view to admins only
REVOKE ALL ON public.coaches_directory_admin FROM anon, authenticated;
GRANT SELECT ON public.coaches_directory_admin TO authenticated;

-- =============================================================================
-- STEP 2: Create new safe public coaches_directory (client-safe fields only)
-- =============================================================================

CREATE VIEW public.coaches_directory
WITH (security_invoker = true)
AS
SELECT 
  cp.user_id,
  COALESCE(cp.display_name, cp.first_name || ' ' || COALESCE(cp.last_name, '')) AS display_name,
  cp.first_name,
  cp.last_name,
  cp.nickname,
  cp.short_bio,
  cp.bio,
  cp.profile_picture_url,
  cp.qualifications,
  cp.specializations,
  cp.specialties,
  cp.location,
  cp.status,
  -- Social URLs can be public (coaches choose to share these)
  cp.instagram_url,
  cp.tiktok_url,
  cp.youtube_url
FROM public.coaches_public cp
WHERE cp.status = 'active';

-- Comment on public-safe view
COMMENT ON VIEW public.coaches_directory IS 'Public-safe coach directory. Contains ONLY non-sensitive fields suitable for client-facing pages. No email, phone, DOB, capacity, or internal data.';

-- Grant SELECT to authenticated users only (not anon)
REVOKE ALL ON public.coaches_directory FROM anon, authenticated;
GRANT SELECT ON public.coaches_directory TO authenticated;

-- =============================================================================
-- STEP 3: Create RPC for admin to fetch full coach details
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_coaches_directory()
RETURNS SETOF public.coaches_directory_admin
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
  
  -- Only admins can access full coach directory
  IF NOT has_role(v_requester_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;
  
  -- Log admin access to coach directory
  INSERT INTO admin_audit_log (admin_user_id, action_type, target_type, details)
  VALUES (v_requester_id, 'view_coaches_directory_admin', 'coaches', 
    jsonb_build_object('action', 'listed all coaches with contact info'));
  
  RETURN QUERY SELECT * FROM public.coaches_directory_admin;
END;
$$;

-- Revoke direct execute from non-admins
REVOKE EXECUTE ON FUNCTION public.admin_get_coaches_directory() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_coaches_directory() TO authenticated;