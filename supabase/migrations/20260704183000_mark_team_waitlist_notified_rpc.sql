-- Teams management — mark a team_waitlist entry notified (Hasan, 2026-07-04).
-- The head-coach SELECT policy lets them READ their waitlist, but there is no head-coach UPDATE
-- policy on team_waitlist (anon-INSERT / coach-read only). This SECURITY DEFINER RPC is the write
-- path for the "Notify" action: gated to the team's head coach (or admin), it stamps notified_at +
-- status='notified'. The actual email is sent by the FE via the send-team-waitlist-notify edge fn.
CREATE OR REPLACE FUNCTION public.mark_team_waitlist_notified(p_waitlist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_team_id uuid;
  v_owner   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT team_id INTO v_team_id FROM public.team_waitlist WHERE id = p_waitlist_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Waitlist entry not found' USING ERRCODE = '42704';
  END IF;

  SELECT coach_id INTO v_owner FROM public.coach_teams WHERE id = v_team_id;
  IF NOT (v_uid = v_owner OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  UPDATE public.team_waitlist
    SET status = 'notified',
        notified_at = now()
    WHERE id = p_waitlist_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_team_waitlist_notified(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_team_waitlist_notified(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_team_waitlist_notified(uuid) TO authenticated;
