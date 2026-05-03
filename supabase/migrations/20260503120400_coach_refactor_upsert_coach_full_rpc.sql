-- Phase 1A migration 5/6 — Coach column-ownership refactor
-- Creates upsert_coach_full(p_user_id, p_public, p_private, p_admin) —
-- the single SECURITY DEFINER RPC that admin coach-record write paths
-- (`create-coach-account`, `CoachManagement.tsx`) route through.
--
-- D3: routing the multi-table writes through a single funnel makes
-- drift impossible by construction once 1B/1C ship.
--
-- Auth model:
-- - Service role (edge functions): bypass via JWT claim role='service_role'
-- - Authenticated user: must be admin (`is_admin(auth.uid())`)
-- - Anon: blocked
--
-- Atomicity: the function body is wrapped in a single implicit
-- transaction. If any of the three INSERT/UPSERTs fails, the whole
-- call rolls back and the error propagates to the caller as a normal
-- PostgREST error response. No partial-write state.
--
-- IMPORTANT: this is the SOAK-WINDOW version. While `coaches.first_name`,
-- `coaches.last_name`, etc. still exist (pre-Phase-3), the function
-- mirrors profile fields into BOTH `coaches` and `coaches_public`. Phase
-- 3 migration 8 rewrites the body to drop the `coaches` mirror writes
-- in the same transaction that drops the corresponding columns. Phase 3
-- migration 9 further rewrites to stop populating
-- `coaches_private.coach_public_id` (D4 drops the column).
--
-- Idempotent: CREATE OR REPLACE; safe to re-run.

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
BEGIN
  -- ─────────────────────────────────────────────────────────────────
  -- Auth: admin OR service_role only
  -- ─────────────────────────────────────────────────────────────────
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_caller := auth.uid();

  IF v_role <> 'service_role' THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Authentication required'
        USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_admin(v_caller) THEN
      RAISE EXCEPTION 'permission denied: admin role required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ─────────────────────────────────────────────────────────────────
  -- Validate
  -- ─────────────────────────────────────────────────────────────────
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- coaches.first_name and coaches_public.first_name are NOT NULL.
  -- For new rows we MUST supply a value. For existing rows the COALESCE
  -- in the UPDATE branch keeps the existing value. Default to '' on
  -- insert if caller doesn't pass it.
  v_first_name := p_public->>'first_name';
  v_last_name  := COALESCE(p_public->>'last_name', '');
  v_status     := COALESCE(p_admin->>'status', 'pending');

  -- ─────────────────────────────────────────────────────────────────
  -- 1. coaches  (admin/lifecycle home + soak-window mirror of profile)
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.coaches (
    user_id,
    first_name, last_name, nickname, bio, short_bio,
    location, profile_picture_url, qualifications, specializations,
    specialties, status, max_onetoone_clients, max_team_clients,
    last_assigned_at
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
    CASE WHEN p_public ? 'qualifications'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'qualifications'))
      ELSE NULL END,
    CASE WHEN p_public ? 'specializations'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'specializations'))
      ELSE NULL END,
    CASE WHEN p_public ? 'specialties'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'specialties'))::staff_specialty[]
      ELSE NULL END,
    v_status,
    NULLIF(p_admin->>'max_onetoone_clients', '')::int,
    NULLIF(p_admin->>'max_team_clients', '')::int,
    NULLIF(p_admin->>'last_assigned_at', '')::timestamptz
  )
  ON CONFLICT (user_id) DO UPDATE SET
    first_name           = COALESCE(EXCLUDED.first_name,           coaches.first_name),
    last_name            = COALESCE(EXCLUDED.last_name,            coaches.last_name),
    nickname             = COALESCE(EXCLUDED.nickname,             coaches.nickname),
    bio                  = COALESCE(EXCLUDED.bio,                  coaches.bio),
    short_bio            = COALESCE(EXCLUDED.short_bio,            coaches.short_bio),
    location             = COALESCE(EXCLUDED.location,             coaches.location),
    profile_picture_url  = COALESCE(EXCLUDED.profile_picture_url,  coaches.profile_picture_url),
    qualifications       = COALESCE(EXCLUDED.qualifications,       coaches.qualifications),
    specializations      = COALESCE(EXCLUDED.specializations,      coaches.specializations),
    specialties          = COALESCE(EXCLUDED.specialties,          coaches.specialties),
    status               = COALESCE(EXCLUDED.status,               coaches.status),
    max_onetoone_clients = COALESCE(EXCLUDED.max_onetoone_clients, coaches.max_onetoone_clients),
    max_team_clients     = COALESCE(EXCLUDED.max_team_clients,     coaches.max_team_clients),
    last_assigned_at     = COALESCE(EXCLUDED.last_assigned_at,     coaches.last_assigned_at),
    updated_at = now()
  RETURNING id INTO v_coach_id;

  -- ─────────────────────────────────────────────────────────────────
  -- 2. coaches_public  (canonical profile home)
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.coaches_public (
    user_id,
    first_name, last_name, nickname, bio, short_bio,
    location, profile_picture_url, qualifications, specializations,
    specialties, status, max_onetoone_clients, max_team_clients,
    last_assigned_at
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
    CASE WHEN p_public ? 'qualifications'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'qualifications'))
      ELSE NULL END,
    CASE WHEN p_public ? 'specializations'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'specializations'))
      ELSE NULL END,
    CASE WHEN p_public ? 'specialties'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_public->'specialties'))::staff_specialty[]
      ELSE NULL END,
    v_status,
    NULLIF(p_admin->>'max_onetoone_clients', '')::int,
    NULLIF(p_admin->>'max_team_clients', '')::int,
    NULLIF(p_admin->>'last_assigned_at', '')::timestamptz
  )
  ON CONFLICT (user_id) DO UPDATE SET
    first_name           = COALESCE(EXCLUDED.first_name,           coaches_public.first_name),
    last_name            = COALESCE(EXCLUDED.last_name,            coaches_public.last_name),
    nickname             = COALESCE(EXCLUDED.nickname,             coaches_public.nickname),
    bio                  = COALESCE(EXCLUDED.bio,                  coaches_public.bio),
    short_bio            = COALESCE(EXCLUDED.short_bio,            coaches_public.short_bio),
    location             = COALESCE(EXCLUDED.location,             coaches_public.location),
    profile_picture_url  = COALESCE(EXCLUDED.profile_picture_url,  coaches_public.profile_picture_url),
    qualifications       = COALESCE(EXCLUDED.qualifications,       coaches_public.qualifications),
    specializations      = COALESCE(EXCLUDED.specializations,      coaches_public.specializations),
    specialties          = COALESCE(EXCLUDED.specialties,          coaches_public.specialties),
    status               = COALESCE(EXCLUDED.status,               coaches_public.status),
    max_onetoone_clients = COALESCE(EXCLUDED.max_onetoone_clients, coaches_public.max_onetoone_clients),
    max_team_clients     = COALESCE(EXCLUDED.max_team_clients,     coaches_public.max_team_clients),
    last_assigned_at     = COALESCE(EXCLUDED.last_assigned_at,     coaches_public.last_assigned_at),
    updated_at = now()
  RETURNING id INTO v_public_id;

  -- ─────────────────────────────────────────────────────────────────
  -- 3. coaches_private  (PII)
  --
  -- Skipped if p_private is null/empty AND no row exists yet — caller
  -- can call again later with PII once available. If a row already
  -- exists and p_private is empty, we leave it alone.
  --
  -- coach_public_id is required pre-Phase-3 (NOT NULL + FK to coaches.id).
  -- Phase 3 migration 9 drops the column AND rewrites this RPC body.
  -- ─────────────────────────────────────────────────────────────────
  IF p_private IS NOT NULL AND p_private <> '{}'::jsonb THEN
    INSERT INTO public.coaches_private (
      coach_public_id, user_id, email, phone, whatsapp_number,
      date_of_birth, gender, instagram_url, tiktok_url, snapchat_url,
      youtube_url
    )
    VALUES (
      v_coach_id,
      p_user_id,
      p_private->>'email',
      p_private->>'phone',
      p_private->>'whatsapp_number',
      NULLIF(p_private->>'date_of_birth', '')::date,
      p_private->>'gender',
      p_private->>'instagram_url',
      p_private->>'tiktok_url',
      p_private->>'snapchat_url',
      p_private->>'youtube_url'
    )
    ON CONFLICT (coach_public_id) DO UPDATE SET
      user_id          = COALESCE(EXCLUDED.user_id,          coaches_private.user_id),
      email            = COALESCE(EXCLUDED.email,            coaches_private.email),
      phone            = COALESCE(EXCLUDED.phone,            coaches_private.phone),
      whatsapp_number  = COALESCE(EXCLUDED.whatsapp_number,  coaches_private.whatsapp_number),
      date_of_birth    = COALESCE(EXCLUDED.date_of_birth,    coaches_private.date_of_birth),
      gender           = COALESCE(EXCLUDED.gender,           coaches_private.gender),
      instagram_url    = COALESCE(EXCLUDED.instagram_url,    coaches_private.instagram_url),
      tiktok_url       = COALESCE(EXCLUDED.tiktok_url,       coaches_private.tiktok_url),
      snapchat_url     = COALESCE(EXCLUDED.snapchat_url,     coaches_private.snapchat_url),
      youtube_url      = COALESCE(EXCLUDED.youtube_url,      coaches_private.youtube_url),
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'ok',                true,
    'user_id',           p_user_id,
    'coaches_id',        v_coach_id,
    'coaches_public_id', v_public_id
  );
END;
$function$;

-- Permissions: authenticated users (admin gate inside) and service_role.
-- Anon explicitly revoked.
REVOKE ALL ON FUNCTION public.upsert_coach_full(UUID, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_coach_full(UUID, JSONB, JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_coach_full(UUID, JSONB, JSONB, JSONB)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.upsert_coach_full(UUID, JSONB, JSONB, JSONB) IS
  'Atomic upsert across coaches, coaches_public, coaches_private. Admin '
  'or service_role only. The single funnel for admin coach writes per '
  'D3 of the column-ownership refactor. Phase 3 will rewrite the body '
  'to drop soak-window mirror writes when columns are dropped from '
  'coaches and coaches_private.coach_public_id.';
