-- Fix: capacity-v2 #5 selected is_head_coach / head_coach_specialisation from coaches_directory,
-- but the public view didn't expose them → PostgREST 400 at runtime → Meet Our Team rendered an
-- empty coach list (the FE `.returns<>()` cast hid it from tsc). Both columns live on the
-- client-safe coaches_public; append them to the view. All existing columns + order + the
-- approved_subroles subquery + WHERE status='active' + the definer security property
-- (security_invoker=false, so it reads coaches_public regardless of caller RLS) are preserved.
CREATE OR REPLACE VIEW public.coaches_directory
WITH (security_invoker = false) AS
 SELECT user_id,
    first_name,
    last_name,
    nickname,
    display_name,
    short_bio,
    bio,
    profile_picture_url,
    qualifications,
    specializations,
    specialties,
    location,
    status,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('slug', sd.slug, 'display_name', sd.display_name, 'sort_order', sd.sort_order) ORDER BY sd.sort_order)
        FROM user_subroles us
        JOIN subrole_definitions sd ON sd.id = us.subrole_id
       WHERE us.user_id = cp.user_id
         AND us.status = 'approved'::subrole_status
         AND sd.is_active = true
    ), '[]'::jsonb) AS approved_subroles,
    cp.is_head_coach,
    cp.head_coach_specialisation
   FROM coaches_public cp
  WHERE status = 'active'::text;
