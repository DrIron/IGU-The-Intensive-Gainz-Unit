-- Capacity v2 (Hasan, 2026-07-04). Per (coach, service): an admin ceiling, a coach self-set cap
-- at or below it, and a coach open/close toggle. coach_service_limits already has UNIQUE(coach_id,
-- service_id). coach_id here = coaches.id (matches list_active_coaches_for_service's csl.coach_id = c.id).

ALTER TABLE public.coach_service_limits
  ADD COLUMN IF NOT EXISTS coach_max_clients integer,                        -- coach's own cap; NULL = no coach limit
  ADD COLUMN IF NOT EXISTS is_accepting boolean NOT NULL DEFAULT true;       -- coach open/close for this service

COMMENT ON COLUMN public.coach_service_limits.max_clients IS
  'Admin ceiling for this (coach, service). 0 = unlimited ceiling. Admin-only (CoachServiceLimits).';
COMMENT ON COLUMN public.coach_service_limits.coach_max_clients IS
  'Coach self-set cap, <= the admin ceiling. NULL = no coach-side limit. Written only via set_coach_service_availability.';
COMMENT ON COLUMN public.coach_service_limits.is_accepting IS
  'Coach open/close toggle for this service. Written only via set_coach_service_availability.';

-- Coach write path: RLS can't do column-level, so a SECURITY DEFINER RPC lets the coach set ONLY
-- their own coach_max_clients + is_accepting (never the admin ceiling), and only <= the ceiling.
CREATE OR REPLACE FUNCTION public.set_coach_service_availability(
  p_service_id uuid,
  p_coach_max_clients integer,
  p_is_accepting boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_coach_id uuid;
  v_ceiling  integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_coach_id FROM public.coaches WHERE user_id = v_uid;
  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Not a coach' USING ERRCODE = '42501';
  END IF;

  IF p_coach_max_clients IS NOT NULL AND p_coach_max_clients < 0 THEN
    RAISE EXCEPTION 'coach_max_clients must be >= 0' USING ERRCODE = '22003';
  END IF;

  -- Admin ceiling for this (coach, service); 0/absent = no ceiling.
  SELECT max_clients INTO v_ceiling
  FROM public.coach_service_limits
  WHERE coach_id = v_coach_id AND service_id = p_service_id;

  IF v_ceiling IS NOT NULL AND v_ceiling > 0
     AND p_coach_max_clients IS NOT NULL AND p_coach_max_clients > v_ceiling THEN
    RAISE EXCEPTION 'coach_max_clients (%) exceeds the admin ceiling (%)', p_coach_max_clients, v_ceiling
      USING ERRCODE = 'P0001';
  END IF;

  -- Upsert ONLY the coach fields; max_clients (admin ceiling) is never touched.
  INSERT INTO public.coach_service_limits (coach_id, service_id, coach_max_clients, is_accepting)
  VALUES (v_coach_id, p_service_id, p_coach_max_clients, p_is_accepting)
  ON CONFLICT (coach_id, service_id)
  DO UPDATE SET
    coach_max_clients = EXCLUDED.coach_max_clients,
    is_accepting      = EXCLUDED.is_accepting,
    updated_at        = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_coach_service_availability(uuid, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_coach_service_availability(uuid, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_coach_service_availability(uuid, integer, boolean) TO authenticated;

-- Onboarding matching RPC — capacity v2: effective cap = LEAST(NULLIF(admin,0), coach_max_clients)
-- (Postgres LEAST ignores NULLs → NULL only when BOTH are unlimited). Offer a coach iff they are
-- accepting AND (unlimited OR current < effective). NOTE: max_clients=0 now means "unlimited"
-- (offered), matching the admin dialog — previously a 0 excluded the coach.
CREATE OR REPLACE FUNCTION public.list_active_coaches_for_service(p_service_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH coach_loads AS (
    SELECT
      c.id                  AS coach_id,
      c.user_id,
      c.first_name,
      c.last_name,
      c.profile_picture_url,
      c.short_bio,
      c.specializations,
      c.status,
      LEAST(NULLIF(csl.max_clients, 0), csl.coach_max_clients) AS effective_cap,
      csl.is_accepting,
      (
        SELECT COUNT(*)::int
        FROM public.subscriptions s
        WHERE s.coach_id = c.user_id
          AND s.service_id = p_service_id
          AND s.status IN ('pending', 'active')
      ) AS current_count
    FROM public.coaches c
    JOIN public.coach_service_limits csl
      ON csl.coach_id = c.id
     AND csl.service_id = p_service_id
    WHERE c.status = 'active'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',                  coach_id,
    'user_id',             user_id,
    'first_name',          first_name,
    'last_name',           last_name,
    'profile_picture_url', profile_picture_url,
    'short_bio',           short_bio,
    'specializations',     specializations,
    'status',              status,
    'max_clients',         COALESCE(effective_cap, 0),
    'current_clients',     current_count,
    'available_spots',     CASE WHEN effective_cap IS NULL THEN 999 ELSE GREATEST(effective_cap - current_count, 0) END
  ) ORDER BY coach_id), '[]'::jsonb)
  FROM coach_loads
  WHERE is_accepting = true
    AND (effective_cap IS NULL OR current_count < effective_cap);
$$;

GRANT EXECUTE ON FUNCTION public.list_active_coaches_for_service(uuid) TO authenticated;
