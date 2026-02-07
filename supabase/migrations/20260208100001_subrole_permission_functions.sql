-- ============================================================
-- Phase 26: Subrole Permission Helper Functions
-- ============================================================

-- Check if a user has an approved subrole by slug
CREATE OR REPLACE FUNCTION public.has_approved_subrole(p_user_id uuid, p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_subroles us
    JOIN public.subrole_definitions sd ON us.subrole_id = sd.id
    WHERE us.user_id = p_user_id
      AND sd.slug = p_slug
      AND us.status = 'approved'
  )
$$;

-- Can build programs: coaches, physiotherapists, mobility_coaches
-- WITH backward-compat fallback for existing coaches without subrole records
CREATE OR REPLACE FUNCTION public.can_build_programs(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admin always can
    public.is_admin(p_user_id)
    -- Has an approved subrole that grants program building
    OR public.has_approved_subrole(p_user_id, 'coach')
    OR public.has_approved_subrole(p_user_id, 'physiotherapist')
    OR public.has_approved_subrole(p_user_id, 'mobility_coach')
    -- Backward compatibility: existing coaches without ANY subrole records
    -- still get access so nothing breaks during migration
    OR (
      public.has_role(p_user_id, 'coach'::app_role)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_subroles us
        JOIN public.subrole_definitions sd ON us.subrole_id = sd.id
        WHERE us.user_id = p_user_id
          AND sd.slug IN ('coach', 'physiotherapist', 'mobility_coach')
      )
    )
$$;

-- Alias: can_assign_workouts delegates to can_build_programs
CREATE OR REPLACE FUNCTION public.can_assign_workouts(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_build_programs(p_user_id)
$$;

-- Can write injury notes: admin + approved physiotherapist
CREATE OR REPLACE FUNCTION public.can_write_injury_notes(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(p_user_id)
    OR public.has_approved_subrole(p_user_id, 'physiotherapist')
$$;

-- Can write psych notes: admin + approved sports_psychologist
CREATE OR REPLACE FUNCTION public.can_write_psych_notes(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(p_user_id)
    OR public.has_approved_subrole(p_user_id, 'sports_psychologist')
$$;

-- Updated is_dietitian: checks subroles first, fallback to user_roles
CREATE OR REPLACE FUNCTION public.is_dietitian(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_approved_subrole(p_user_id, 'dietitian')
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = p_user_id
        AND role = 'dietitian'::app_role
    )
$$;

-- Updated can_edit_nutrition: adds mobility_coach support
-- Hierarchy: Admin > Dietitian > Coach/MobilityCoach (if no dietitian) > Self
CREATE OR REPLACE FUNCTION public.can_edit_nutrition(p_actor_uid uuid, p_client_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admin always has access
    public.is_admin(p_actor_uid)
    OR (
      CASE WHEN public.client_has_dietitian(p_client_uid) THEN
        -- Only the assigned dietitian can edit
        public.is_dietitian_for_client(p_actor_uid, p_client_uid)
      ELSE
        -- No dietitian: coach can edit, mobility_coach can edit, or user can self-edit
        public.is_primary_coach_for_user(p_actor_uid, p_client_uid)
        OR (
          public.has_approved_subrole(p_actor_uid, 'mobility_coach')
          AND public.is_care_team_member_for_client(p_actor_uid, p_client_uid)
        )
        OR p_actor_uid = p_client_uid
      END
    )
$$;

-- Get all approved subrole slugs for a user
CREATE OR REPLACE FUNCTION public.get_user_subroles(p_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(sd.slug ORDER BY sd.sort_order),
    '{}'::text[]
  )
  FROM public.user_subroles us
  JOIN public.subrole_definitions sd ON us.subrole_id = sd.id
  WHERE us.user_id = p_user_id
    AND us.status = 'approved'
$$;
