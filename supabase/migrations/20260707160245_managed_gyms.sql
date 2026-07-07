-- Managed gyms vocabulary (mirrors specialization_tags) + coach_gyms join +
-- location-aware coach matching. Frontend reads active gyms like specialization_tags;
-- coaches tag the gyms they train at; the matching RPC ranks gym-matched coaches first
-- for In-Person/Hybrid clients.

-- 1. Tables ------------------------------------------------------------------
CREATE TABLE public.gyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  area text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Which gyms a coach trains at (many-to-many). coach_user_id = coaches.user_id.
CREATE TABLE public.coach_gyms (
  coach_user_id uuid NOT NULL,
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_user_id, gym_id)
);
CREATE INDEX idx_coach_gyms_gym ON public.coach_gyms (gym_id);

ALTER TABLE public.gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_gyms ENABLE ROW LEVEL SECURITY;

-- 2. RLS ---------------------------------------------------------------------
-- gyms: anon + authenticated read active (onboarding, like specialization_tags);
-- admins also read inactive (so the manager can re-activate); admins write.
CREATE POLICY gyms_anon_read_active ON public.gyms
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY gyms_auth_read ON public.gyms
  FOR SELECT TO authenticated USING (is_active = true OR public.is_admin(auth.uid()));
CREATE POLICY gyms_admin_write ON public.gyms
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- coach_gyms: coach manages own rows; admin all. NO direct client read — client-safe
-- matching goes through the SECURITY DEFINER RPC (which bypasses RLS as owner).
CREATE POLICY coach_gyms_own ON public.coach_gyms
  FOR ALL TO authenticated USING (coach_user_id = auth.uid()) WITH CHECK (coach_user_id = auth.uid());
CREATE POLICY coach_gyms_admin ON public.coach_gyms
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 3. Seed the 3 existing gyms (do NOT seed "Other" — it stays a UI free-text escape).
INSERT INTO public.gyms (name, area, sort_order) VALUES
  ('Oxygen Jabriya', 'Jabriya', 1),
  ('Oxygen Subah AlSalem', 'Subah AlSalem', 2),
  ('Spark Shuwaikh', 'Shuwaikh', 3);

-- 4. Matching RPC: add optional p_gym_id + a gym_match flag, rank gym matches first.
-- Adding a defaulted param changes the signature, so drop the 1-arg overload first
-- (else one-arg calls become ambiguous). One-arg callers now resolve here (gym=null).
DROP FUNCTION IF EXISTS public.list_active_coaches_for_service(uuid);
CREATE OR REPLACE FUNCTION public.list_active_coaches_for_service(p_service_id uuid, p_gym_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      ) AS current_count,
      CASE
        WHEN p_gym_id IS NULL THEN false
        ELSE EXISTS (
          SELECT 1 FROM public.coach_gyms cg
          WHERE cg.coach_user_id = c.user_id AND cg.gym_id = p_gym_id
        )
      END AS gym_match
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
    'available_spots',     CASE WHEN effective_cap IS NULL THEN 999 ELSE GREATEST(effective_cap - current_count, 0) END,
    'gym_match',           gym_match
  ) ORDER BY gym_match DESC, coach_id), '[]'::jsonb)
  FROM coach_loads
  WHERE is_accepting = true
    AND (effective_cap IS NULL OR current_count < effective_cap);
$function$;

REVOKE ALL ON FUNCTION public.list_active_coaches_for_service(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_active_coaches_for_service(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_active_coaches_for_service(uuid, uuid) TO authenticated;
