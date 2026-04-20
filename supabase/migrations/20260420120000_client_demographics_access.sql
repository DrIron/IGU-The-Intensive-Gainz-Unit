-- =========================================================================
-- Demographics access for coaches (nutrition goal auto-population).
--
-- Context: coach nutrition goal form re-asks for age, gender, and height on
-- every phase creation. Age already had a SECURITY DEFINER RPC (20260502),
-- but gender and height did not -- height wasn't even stored centrally.
--
-- This migration:
--   1. Adds profiles_private.height_cm (client's self-reported height, PII).
--   2. Exposes get_client_gender() and get_client_height_cm() with the
--      same auth pattern as get_client_age(): client-self, admin, primary
--      coach, or active care-team member.
--
-- Coaches still cannot read profiles_private directly -- these RPCs are the
-- only authorized path. DOB stays off-limits (only derived age exposed).
-- =========================================================================

-- ---- 1. height_cm column -------------------------------------------------
ALTER TABLE public.profiles_private
  ADD COLUMN IF NOT EXISTS height_cm INTEGER
  CHECK (height_cm IS NULL OR (height_cm BETWEEN 100 AND 250));

COMMENT ON COLUMN public.profiles_private.height_cm IS
  'Client self-reported height in centimeters. Reused across the calorie '
  'calculator and coach nutrition goal form. Coaches access via '
  'get_client_height_cm() RPC, never directly.';

-- ---- 2. get_client_gender() ----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_client_gender(p_client_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gender TEXT;
BEGIN
  IF NOT (
    auth.uid() = p_client_id
    OR public.is_admin(auth.uid())
    OR public.is_primary_coach_for_user(auth.uid(), p_client_id)
    OR public.is_care_team_member_for_client(auth.uid(), p_client_id)
  ) THEN
    RETURN NULL;
  END IF;

  SELECT gender
    INTO v_gender
    FROM public.profiles_private
   WHERE profile_id = p_client_id;

  RETURN v_gender;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_gender(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_gender(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_client_gender(UUID) IS
  'Returns a client''s self-reported gender (or NULL). Coaches/care team get '
  'authorized access without a direct SELECT on profiles_private. Used by '
  'the nutrition goal calculator to auto-populate the gender field.';

-- ---- 3. get_client_height_cm() -------------------------------------------
CREATE OR REPLACE FUNCTION public.get_client_height_cm(p_client_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_height INTEGER;
BEGIN
  IF NOT (
    auth.uid() = p_client_id
    OR public.is_admin(auth.uid())
    OR public.is_primary_coach_for_user(auth.uid(), p_client_id)
    OR public.is_care_team_member_for_client(auth.uid(), p_client_id)
  ) THEN
    RETURN NULL;
  END IF;

  SELECT height_cm
    INTO v_height
    FROM public.profiles_private
   WHERE profile_id = p_client_id;

  RETURN v_height;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_height_cm(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_height_cm(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_client_height_cm(UUID) IS
  'Returns a client''s self-reported height in centimeters (or NULL). Same '
  'authorization rules as get_client_age / get_client_gender.';
