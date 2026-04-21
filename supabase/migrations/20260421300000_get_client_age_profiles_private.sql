-- =========================================================================
-- get_client_age was originally pulling DOB from form_submissions, but the
-- rest of the app (self-service calculator, /account edit, onboarding
-- submission) reads and writes profiles_private.date_of_birth. If a client
-- edits their DOB in /account, or if their onboarding never wrote to
-- form_submissions, the RPC returned NULL -- which silently broke the
-- coach nutrition form's Age auto-fill.
--
-- Fix: read profiles_private.date_of_birth first (the source of truth for
-- every other DOB read in the app), fall back to the newest form_submission
-- for legacy clients whose private profile row was seeded without DOB.
-- Auth check is unchanged.
-- =========================================================================

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
  IF NOT (
    auth.uid() = p_client_id
    OR public.is_admin(auth.uid())
    OR public.is_primary_coach_for_user(auth.uid(), p_client_id)
    OR public.is_care_team_member_for_client(auth.uid(), p_client_id)
  ) THEN
    RETURN NULL;
  END IF;

  SELECT date_of_birth
    INTO v_dob
    FROM public.profiles_private
   WHERE profile_id = p_client_id;

  IF v_dob IS NULL THEN
    -- Legacy fallback: some clients onboarded before profiles_private.date_of_birth
    -- was backfilled, but their intake form still carries the DOB.
    SELECT date_of_birth
      INTO v_dob
      FROM public.form_submissions
     WHERE user_id = p_client_id
       AND date_of_birth IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  IF v_dob IS NULL THEN
    RETURN NULL;
  END IF;

  v_age := date_part('year', age(v_dob))::INTEGER;
  RETURN v_age;
END;
$$;
