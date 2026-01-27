-- =============================================================================
-- FIX SECURITY DEFINER VIEWS - Use SECURITY INVOKER instead
-- =============================================================================

-- Fix coaches_full VIEW to use SECURITY INVOKER (respects querying user's RLS)
DROP VIEW IF EXISTS public.coaches_full;
CREATE VIEW public.coaches_full 
WITH (security_invoker = on)
AS
SELECT 
  cp.id,
  cp.user_id,
  cp.first_name,
  cp.last_name,
  cp.nickname,
  cp.display_name,
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
  cp.created_at,
  cp.updated_at,
  cpriv.email,
  cpriv.phone,
  cpriv.whatsapp_number,
  cpriv.date_of_birth,
  cpriv.gender,
  cpriv.instagram_url,
  cpriv.tiktok_url,
  cpriv.snapchat_url,
  cpriv.youtube_url
FROM public.coaches_public cp
LEFT JOIN public.coaches_private cpriv ON cp.id = cpriv.coach_public_id;

-- Fix profiles VIEW to use SECURITY INVOKER
DROP VIEW IF EXISTS public.profiles;
CREATE VIEW public.profiles 
WITH (security_invoker = on)
AS
SELECT 
  pp.id,
  priv.email,
  priv.full_name,
  priv.phone,
  pp.status,
  pp.created_at,
  pp.updated_at,
  pp.payment_deadline,
  pp.signup_completed_at,
  pp.onboarding_completed_at,
  pp.activation_completed_at,
  pp.first_name,
  priv.last_name,
  priv.date_of_birth,
  priv.gender,
  pp.payment_exempt,
  pp.display_name,
  pp.avatar_url
FROM public.profiles_public pp
LEFT JOIN public.profiles_private priv ON pp.id = priv.profile_id;

-- Grant SELECT on views to authenticated users (RLS on underlying tables still applies)
GRANT SELECT ON public.coaches_full TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;