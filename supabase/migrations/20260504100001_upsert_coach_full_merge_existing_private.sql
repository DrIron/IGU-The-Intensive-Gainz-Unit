-- Coach refactor follow-up: TWO bugs in upsert_coach_full surfaced in
-- prod smoke tests on May 4, 2026:
--
-- (1) NOT NULL violation on coaches_private.email when admin updated an
-- existing coach whose payload didn't include email. CoachManagement
-- treats email as read-only, so p_private had DOB + URLs but no email.
-- The original INSERT-with-ON-CONFLICT pattern failed the column-level
-- NOT NULL check BEFORE PostgreSQL evaluated conflict resolution.
-- Fix: SELECT existing private row first, then merge payload values
-- with existing values via COALESCE before INSERTing. The ON CONFLICT
-- path retains its own COALESCE-with-existing as a safety net. Look up
-- existing row by either coach_public_id OR user_id (defensive against
-- the misnamed FK situation that D4 of the refactor will resolve).
--
-- (2) Status regression: the original `v_status := COALESCE(p_admin->>
-- 'status', 'pending')` defaulted to 'pending' when caller omitted
-- status, which the ON CONFLICT path then propagated as the new value
-- via `EXCLUDED.status` — silently demoting active coaches to pending
-- whenever admin saved a non-status edit. Fix: keep v_status null when
-- caller doesn't pass status; let the column default handle new INSERTs
-- and have ON CONFLICT preserve existing via `COALESCE(v_status, ...)`.
--
-- BOTH fixes are in the body below.

CREATE OR REPLACE FUNCTION public.upsert_coach_full(
  p_user_id  UUID,
  p_public   JSONB DEFAULT '{}'::jsonb,
  p_private  JSONB DEFAULT '{}'::jsonb,
  p_admin    JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller        UUID;
  v_role          TEXT;
  v_coach_id      UUID;
  v_public_id     UUID;
  v_first_name    TEXT;
  v_last_name     TEXT;
  v_status        TEXT;
  v_existing_priv RECORD;
  v_email         TEXT;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_caller := auth.uid();

  IF v_role <> 'service_role' THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_admin(v_caller) THEN
      RAISE EXCEPTION 'permission denied: admin role required' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;

  v_first_name := p_public->>'first_name';
  v_last_name  := COALESCE(p_public->>'last_name', '');
  -- Don't force a default — let it be NULL when caller doesn't supply it.
  -- For new INSERTs, the coaches.status column default ('pending') applies.
  -- For UPDATEs, the ON CONFLICT COALESCE preserves the existing status.
  v_status     := p_admin->>'status';

  -- 1. coaches
  INSERT INTO public.coaches (
    user_id, first_name, last_name, nickname, bio, short_bio,
    location, profile_picture_url, qualifications, specializations,
    specialties, status, max_onetoone_clients, max_team_clients, last_assigned_at
  )
  VALUES (
    p_user_id,
    COALESCE(v_first_name, ''),
    v_last_name,
    p_public->>'nickname',
    p_public->>'bio',
    p_public->>'short_bio',
    p_public->>'location',
    p_public->>'profile_picture_url',
    CASE WHEN p_public ? 'qualifications' THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'qualifications')) ELSE NULL END,
    CASE WHEN p_public ? 'specializations' THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'specializations')) ELSE NULL END,
    CASE WHEN p_public ? 'specialties' THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'specialties'))::staff_specialty[] ELSE NULL END,
    COALESCE(v_status, 'pending'),
    NULLIF(p_admin->>'max_onetoone_clients', '')::int,
    NULLIF(p_admin->>'max_team_clients', '')::int,
    NULLIF(p_admin->>'last_assigned_at', '')::timestamptz
  )
  ON CONFLICT (user_id) DO UPDATE SET
    first_name           = COALESCE(EXCLUDED.first_name, coaches.first_name),
    last_name            = COALESCE(EXCLUDED.last_name, coaches.last_name),
    nickname             = COALESCE(EXCLUDED.nickname, coaches.nickname),
    bio                  = COALESCE(EXCLUDED.bio, coaches.bio),
    short_bio            = COALESCE(EXCLUDED.short_bio, coaches.short_bio),
    location             = COALESCE(EXCLUDED.location, coaches.location),
    profile_picture_url  = COALESCE(EXCLUDED.profile_picture_url, coaches.profile_picture_url),
    qualifications       = COALESCE(EXCLUDED.qualifications, coaches.qualifications),
    specializations      = COALESCE(EXCLUDED.specializations, coaches.specializations),
    specialties          = COALESCE(EXCLUDED.specialties, coaches.specialties),
    status               = COALESCE(v_status, coaches.status),
    max_onetoone_clients = COALESCE(EXCLUDED.max_onetoone_clients, coaches.max_onetoone_clients),
    max_team_clients     = COALESCE(EXCLUDED.max_team_clients, coaches.max_team_clients),
    last_assigned_at     = COALESCE(EXCLUDED.last_assigned_at, coaches.last_assigned_at),
    updated_at = now()
  RETURNING id INTO v_coach_id;

  -- 2. coaches_public
  INSERT INTO public.coaches_public (
    user_id, first_name, last_name, nickname, bio, short_bio,
    location, profile_picture_url, qualifications, specializations,
    specialties, status, max_onetoone_clients, max_team_clients, last_assigned_at
  )
  VALUES (
    p_user_id,
    COALESCE(v_first_name, ''),
    v_last_name,
    p_public->>'nickname',
    p_public->>'bio',
    p_public->>'short_bio',
    p_public->>'location',
    p_public->>'profile_picture_url',
    CASE WHEN p_public ? 'qualifications' THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'qualifications')) ELSE NULL END,
    CASE WHEN p_public ? 'specializations' THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'specializations')) ELSE NULL END,
    CASE WHEN p_public ? 'specialties' THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'specialties'))::staff_specialty[] ELSE NULL END,
    COALESCE(v_status, 'pending'),
    NULLIF(p_admin->>'max_onetoone_clients', '')::int,
    NULLIF(p_admin->>'max_team_clients', '')::int,
    NULLIF(p_admin->>'last_assigned_at', '')::timestamptz
  )
  ON CONFLICT (user_id) DO UPDATE SET
    first_name           = COALESCE(EXCLUDED.first_name, coaches_public.first_name),
    last_name            = COALESCE(EXCLUDED.last_name, coaches_public.last_name),
    nickname             = COALESCE(EXCLUDED.nickname, coaches_public.nickname),
    bio                  = COALESCE(EXCLUDED.bio, coaches_public.bio),
    short_bio            = COALESCE(EXCLUDED.short_bio, coaches_public.short_bio),
    location             = COALESCE(EXCLUDED.location, coaches_public.location),
    profile_picture_url  = COALESCE(EXCLUDED.profile_picture_url, coaches_public.profile_picture_url),
    qualifications       = COALESCE(EXCLUDED.qualifications, coaches_public.qualifications),
    specializations      = COALESCE(EXCLUDED.specializations, coaches_public.specializations),
    specialties          = COALESCE(EXCLUDED.specialties, coaches_public.specialties),
    status               = COALESCE(v_status, coaches_public.status),
    max_onetoone_clients = COALESCE(EXCLUDED.max_onetoone_clients, coaches_public.max_onetoone_clients),
    max_team_clients     = COALESCE(EXCLUDED.max_team_clients, coaches_public.max_team_clients),
    last_assigned_at     = COALESCE(EXCLUDED.last_assigned_at, coaches_public.last_assigned_at),
    updated_at = now()
  RETURNING id INTO v_public_id;

  -- 3. coaches_private — look up existing row first, merge payload with
  -- existing values via COALESCE so admin updates that don't supply
  -- email don't fail the NOT NULL constraint. Look up by either
  -- coach_public_id OR user_id (the misnamed FK situation; D4 of the
  -- refactor drops coach_public_id in Phase 3).
  IF p_private IS NOT NULL AND p_private <> '{}'::jsonb THEN
    SELECT * INTO v_existing_priv
    FROM public.coaches_private
    WHERE coach_public_id = v_coach_id
       OR user_id = p_user_id
    LIMIT 1;

    v_email := COALESCE(p_private->>'email', v_existing_priv.email);
    IF v_email IS NULL THEN
      RAISE EXCEPTION 'email is required when no existing coaches_private row exists for user_id %', p_user_id
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.coaches_private (
      coach_public_id, user_id, email, phone, whatsapp_number,
      date_of_birth, gender, instagram_url, tiktok_url, snapchat_url, youtube_url
    )
    VALUES (
      v_coach_id,
      p_user_id,
      v_email,
      COALESCE(p_private->>'phone', v_existing_priv.phone),
      COALESCE(p_private->>'whatsapp_number', v_existing_priv.whatsapp_number),
      COALESCE(NULLIF(p_private->>'date_of_birth', '')::date, v_existing_priv.date_of_birth),
      COALESCE(p_private->>'gender', v_existing_priv.gender),
      COALESCE(p_private->>'instagram_url', v_existing_priv.instagram_url),
      COALESCE(p_private->>'tiktok_url', v_existing_priv.tiktok_url),
      COALESCE(p_private->>'snapchat_url', v_existing_priv.snapchat_url),
      COALESCE(p_private->>'youtube_url', v_existing_priv.youtube_url)
    )
    ON CONFLICT (coach_public_id) DO UPDATE SET
      user_id          = COALESCE(EXCLUDED.user_id, coaches_private.user_id),
      email            = COALESCE(EXCLUDED.email, coaches_private.email),
      phone            = COALESCE(EXCLUDED.phone, coaches_private.phone),
      whatsapp_number  = COALESCE(EXCLUDED.whatsapp_number, coaches_private.whatsapp_number),
      date_of_birth    = COALESCE(EXCLUDED.date_of_birth, coaches_private.date_of_birth),
      gender           = COALESCE(EXCLUDED.gender, coaches_private.gender),
      instagram_url    = COALESCE(EXCLUDED.instagram_url, coaches_private.instagram_url),
      tiktok_url       = COALESCE(EXCLUDED.tiktok_url, coaches_private.tiktok_url),
      snapchat_url     = COALESCE(EXCLUDED.snapchat_url, coaches_private.snapchat_url),
      youtube_url      = COALESCE(EXCLUDED.youtube_url, coaches_private.youtube_url),
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'coaches_id', v_coach_id,
    'coaches_public_id', v_public_id
  );
END;
$function$;
