-- Teams management — atomic member removal (Hasan, 2026-07-04).
-- join_team sets subscriptions.team_id + coach_id atomically; removal must be equally atomic and
-- gated to the team's head coach (or admin). Coach-binding decision (Hasan): also clear coach_id
-- (in the team-plan tier the team WAS the coaching relationship; the member becomes unassigned).
-- status is left untouched (they keep their subscription); the row is NOT deleted.
CREATE OR REPLACE FUNCTION public.remove_team_member(p_subscription_id uuid, p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_owner    uuid;
  v_sub_team uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT coach_id INTO v_owner FROM public.coach_teams WHERE id = p_team_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Team not found' USING ERRCODE = '42704';
  END IF;

  -- Gate: the team's head coach OR an admin.
  IF NOT (v_uid = v_owner OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Lock the subscription row and verify it's actually on this team.
  SELECT team_id INTO v_sub_team FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF v_sub_team IS NULL OR v_sub_team <> p_team_id THEN
    RAISE EXCEPTION 'Subscription is not a member of this team' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.subscriptions
    SET team_id = NULL,
        coach_id = NULL,
        updated_at = now()
    WHERE id = p_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_team_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_team_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid) TO authenticated;
