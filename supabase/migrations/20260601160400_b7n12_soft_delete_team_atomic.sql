-- B7-N12: atomic team soft-delete + member orphan recovery.
-- The old TeamDetailView delete just set is_active=false and left every member
-- subscription pointing at the now-dead team (team_id set, stale coach_id) --
-- the same orphan class as B7-N2. This RPC unassigns members in the same locked
-- transaction: team_id=NULL, coach_id=NULL, needs_coach_assignment=true,
-- last_team_change_at=now() (mirrors join_team / B7-N2 recovery), then flips the
-- team is_active=false (the soft-delete signal; no deleted_at column).
CREATE OR REPLACE FUNCTION public.soft_delete_team_atomic(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller      uuid := auth.uid();
  v_team        record;
  v_unassigned  int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Lock the team row.
  SELECT t.id, t.coach_id, t.is_active
    INTO v_team
  FROM public.coach_teams t
  WHERE t.id = p_team_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found' USING ERRCODE = 'P0001';
  END IF;

  -- Auth gate: team head coach OR admin.
  IF NOT public.is_admin(v_caller) AND v_caller <> v_team.coach_id THEN
    RAISE EXCEPTION 'Not authorised: caller is not the team head coach'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the member subscriptions before mutating.
  PERFORM 1 FROM public.subscriptions WHERE team_id = p_team_id FOR UPDATE;

  -- Authorise the subscription writes past the B7-N4 whitelist trigger
  -- (txn-local; auto-clears at commit/rollback).
  PERFORM set_config('app.in_soft_delete_team', 'true', true);

  WITH upd AS (
    UPDATE public.subscriptions
       SET team_id                = NULL,
           coach_id               = NULL,
           needs_coach_assignment = true,
           last_team_change_at    = now()
     WHERE team_id = p_team_id
    RETURNING 1
  )
  SELECT count(*) INTO v_unassigned FROM upd;

  -- Soft-delete the team.
  UPDATE public.coach_teams
     SET is_active = false
   WHERE id = p_team_id;

  RETURN jsonb_build_object(
    'team_id',            p_team_id,
    'members_unassigned', v_unassigned,
    'is_active',          false
  );
END;
$function$;

-- NOTE: REVOKE/GRANT for this function lives in
-- 20260601160500_b7_team_rpcs_grants.sql (splitter isolation -- see the sibling
-- assign_team_program_atomic migration).
