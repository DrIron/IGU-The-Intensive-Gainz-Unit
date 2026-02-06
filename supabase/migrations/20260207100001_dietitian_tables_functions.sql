-- ============================================================
-- Migration: Dietitian Tables and Functions
-- Phase 22: IGU Nutrition System Enhancement
--
-- This migration creates tables/functions that use 'dietitian' enum.
-- Must run AFTER 20260207100000_add_dietitian_role.sql commits.
-- ============================================================

-- ============================================================
-- Create dietitians profile table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dietitians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Professional credentials
  license_number text,
  license_state text,
  license_expiry date,
  certifications text[] DEFAULT '{}',

  -- Specialties (e.g., sports nutrition, clinical, eating disorders)
  nutrition_specialties text[] DEFAULT '{}',

  -- Profile
  bio text,
  years_experience integer,

  -- Settings
  max_clients integer DEFAULT 50,
  accepting_clients boolean NOT NULL DEFAULT true,

  -- Metadata
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.dietitians ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper Functions
-- ============================================================

-- Check if user has dietitian role
CREATE OR REPLACE FUNCTION public.is_dietitian(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = p_user_id
      AND role = 'dietitian'::app_role
  )
$$;

-- Check if dietitian is assigned to client via care_team_assignments
CREATE OR REPLACE FUNCTION public.is_dietitian_for_client(p_dietitian_uid uuid, p_client_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.care_team_assignments cta
    WHERE cta.client_id = p_client_uid
      AND cta.staff_user_id = p_dietitian_uid
      AND cta.specialty = 'dietitian'::staff_specialty
      AND cta.status = 'active'
  )
$$;

-- Check if user is any care team member for client (coach, dietitian, or other specialist)
CREATE OR REPLACE FUNCTION public.is_care_team_member_for_client(p_staff_uid uuid, p_client_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admin has access to all
    public.is_admin(p_staff_uid)
    -- Primary coach
    OR public.is_primary_coach_for_user(p_staff_uid, p_client_uid)
    -- Any active care team assignment
    OR EXISTS (
      SELECT 1
      FROM public.care_team_assignments cta
      WHERE cta.client_id = p_client_uid
        AND cta.staff_user_id = p_staff_uid
        AND cta.status = 'active'
    )
$$;

-- Check if client has an active dietitian assignment
CREATE OR REPLACE FUNCTION public.client_has_dietitian(p_client_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.care_team_assignments cta
    WHERE cta.client_id = p_client_uid
      AND cta.specialty = 'dietitian'::staff_specialty
      AND cta.status = 'active'
  )
$$;

-- ============================================================
-- Nutrition Edit Permission Check
-- Implements the dietitian hierarchy:
-- 1. Admin → yes
-- 2. Has active dietitian → only dietitian can edit
-- 3. No dietitian, has coach → coach can edit
-- 4. No dietitian, no coach → user can self-edit
-- ============================================================
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
      -- If client has a dietitian assigned...
      CASE WHEN public.client_has_dietitian(p_client_uid) THEN
        -- Only the assigned dietitian can edit
        public.is_dietitian_for_client(p_actor_uid, p_client_uid)
      ELSE
        -- No dietitian: coach can edit, or user can self-edit
        public.is_primary_coach_for_user(p_actor_uid, p_client_uid)
        OR p_actor_uid = p_client_uid
      END
    )
$$;

-- ============================================================
-- RLS Policies for dietitians table
-- ============================================================

-- Admins full access
CREATE POLICY "dietitians_admin_all"
ON public.dietitians
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Dietitians can view/update their own profile
CREATE POLICY "dietitians_own_select"
ON public.dietitians
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "dietitians_own_update"
ON public.dietitians
FOR UPDATE
USING (auth.uid() = user_id);

-- Coaches can view dietitians (for referrals/care team)
CREATE POLICY "dietitians_coach_select"
ON public.dietitians
FOR SELECT
USING (public.is_coach(auth.uid()));

-- Clients can view their assigned dietitian
CREATE POLICY "dietitians_client_select"
ON public.dietitians
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.care_team_assignments cta
    WHERE cta.client_id = auth.uid()
      AND cta.staff_user_id = dietitians.user_id
      AND cta.specialty = 'dietitian'::staff_specialty
      AND cta.status = 'active'
  )
);

-- Create indexes
CREATE INDEX idx_dietitians_user_id ON public.dietitians(user_id);
CREATE INDEX idx_dietitians_accepting ON public.dietitians(accepting_clients) WHERE accepting_clients = true;

-- Add updated_at trigger
CREATE TRIGGER update_dietitians_updated_at
BEFORE UPDATE ON public.dietitians
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON FUNCTION public.is_dietitian IS 'RLS Helper: Returns true if user has dietitian role';
COMMENT ON FUNCTION public.is_dietitian_for_client IS 'RLS Helper: Returns true if dietitian is assigned to client via care_team_assignments';
COMMENT ON FUNCTION public.is_care_team_member_for_client IS 'RLS Helper: Returns true if user is admin, primary coach, or any active care team member';
COMMENT ON FUNCTION public.can_edit_nutrition IS 'RLS Helper: Implements dietitian priority - when assigned, only dietitian can edit nutrition; otherwise coach or self';
COMMENT ON FUNCTION public.client_has_dietitian IS 'RLS Helper: Returns true if client has an active dietitian assignment';
