-- RPC to expose a client's age (integer years) to their care team.
-- Coaches deliberately cannot read DOB (PHI) directly. Age at year-granularity is
-- low-sensitivity and needed by the nutrition calculator / goal setting UI.
-- Caller must be: the client themselves, an admin, the primary coach, or a care-team member.

CREATE OR REPLACE FUNCTION public.get_client_age(p_client_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dob DATE;
  v_age INTEGER;
BEGIN
  -- Authorization
  IF NOT (
    auth.uid() = p_client_id
    OR public.is_admin(auth.uid())
    OR public.is_primary_coach_for_user(auth.uid(), p_client_id)
    OR public.is_care_team_member_for_client(auth.uid(), p_client_id)
  ) THEN
    RETURN NULL;
  END IF;

  -- Pull DOB from the most recent form submission (PHI source of truth).
  SELECT date_of_birth
    INTO v_dob
    FROM public.form_submissions
   WHERE user_id = p_client_id
     AND date_of_birth IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_dob IS NULL THEN
    RETURN NULL;
  END IF;

  v_age := date_part('year', age(v_dob))::INTEGER;
  RETURN v_age;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_age(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_age(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_client_age(UUID) IS
  'Returns a client''s integer age in years. Coaches/care team get authorized access without exposing DOB. Used by the nutrition goal calculator to auto-populate the age field.';
