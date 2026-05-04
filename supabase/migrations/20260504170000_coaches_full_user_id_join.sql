-- Rebuild coaches_full view + admin_get_coaches_full RPC to JOIN on user_id
-- instead of the misnamed coach_public_id.
--
-- Pulled forward from Phase 3 migration 6 of the column-ownership refactor
-- because the misnamed-FK JOIN was breaking admin views of new coaches.
-- coaches.id and coaches_public.id are independent UUIDs except where
-- aligned by the one-time backfill in migration 20260121190914.
-- coaches_private.coach_public_id stores coaches.id (despite the name),
-- not coaches_public.id. So the old `cp.id = cpriv.coach_public_id` JOIN
-- only worked for the single backfill-aligned coach (Hasan in prod).
-- Any new coach showed "—" for email / DOB / socials_private etc in the
-- admin CoachManagement table.
--
-- This migration changes ONLY the JOIN key. Column shape, sources, grants,
-- and security model are unchanged. Phase 3 (proper) will additionally
-- move status / max_*_clients / last_assigned_at sourcing from
-- coaches_public to coaches and drop the deprecated columns.

DROP VIEW IF EXISTS public.coaches_full;

CREATE VIEW public.coaches_full AS
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
  cp.instagram_url,
  cp.tiktok_url,
  cp.youtube_url,
  cp.coach_level,
  cp.is_head_coach,
  cp.head_coach_specialisation,
  cpriv.email,
  cpriv.phone,
  cpriv.whatsapp_number,
  cpriv.date_of_birth,
  cpriv.gender,
  cpriv.snapchat_url
FROM public.coaches_public cp
LEFT JOIN public.coaches_private cpriv ON cp.user_id = cpriv.user_id;

-- Restore grants (matching the original — RLS on the underlying tables
-- enforces actual access; views inherit).
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.coaches_full
  TO anon, authenticated, service_role, postgres;

-- Rebuild the SECURITY DEFINER RPC with the same JOIN key change.
CREATE OR REPLACE FUNCTION public.admin_get_coaches_full()
RETURNS TABLE(
  id uuid, user_id uuid, first_name text, last_name text, nickname text,
  display_name text, bio text, short_bio text, location text,
  profile_picture_url text, qualifications text[], specializations text[],
  specialties staff_specialty[], status text, max_onetoone_clients integer,
  max_team_clients integer, last_assigned_at timestamp with time zone,
  created_at timestamp with time zone, updated_at timestamp with time zone,
  email text, phone text, whatsapp_number text, date_of_birth date,
  gender text, instagram_url text, tiktok_url text, snapchat_url text,
  youtube_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_requester_id uuid;
BEGIN
  v_requester_id := auth.uid();

  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT has_role(v_requester_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  PERFORM log_phi_access(
    v_requester_id,
    NULL,
    'admin_get_coaches_full',
    'coaches_full',
    NULL,
    ARRAY['email', 'phone', 'date_of_birth'],
    NULL, NULL, NULL,
    jsonb_build_object('function', 'admin_get_coaches_full')
  );

  RETURN QUERY
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
  LEFT JOIN public.coaches_private cpriv ON cp.user_id = cpriv.user_id;
END;
$function$;
