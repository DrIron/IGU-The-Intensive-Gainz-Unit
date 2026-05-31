-- B7-N2 + B7-N5 + B7-N6: atomic, authorized team join/change.
--
-- Background. ChooseTeamPrompt + ChangeTeamDialog wrote subscriptions.team_id
-- directly and never synced subscriptions.coach_id to the destination team's
-- head coach (B7-N2). Result: the head coach loses every
-- is_primary_coach_for_user-gated capability for that member (workout writes,
-- nutrition reads, care-team ops, direct sessions). The "once per billing
-- cycle" rule was dialog copy only -- nothing enforced it server-side (B7-N5).
-- And the max_members check was a racy client-side read, so two concurrent
-- joins to a 29/30 team could both land (B7-N6).
--
-- This SECURITY DEFINER RPC closes all three: it locks the subscription and
-- destination team rows FOR UPDATE (serializing concurrent joins), re-checks
-- capacity under the lock, enforces the cycle gap, and writes team_id +
-- coach_id + last_team_change_at atomically. It sets a transaction-local GUC
-- (app.in_join_team) that the enforce_subscription_column_whitelist trigger
-- (migration 20260531140100) reads to allow this one authorized write through
-- the otherwise locked-down column set.
--
-- NOTE: assign_coach_atomic Branch A (migration 20260523084526) already syncs
-- coach_id from coach_teams.coach_id on the SIGNUP path, so this RPC only
-- covers the post-signup join/change flows + the legacy backfill (migration
-- 20260531140200). assign_coach_atomic is intentionally left unchanged.

CREATE OR REPLACE FUNCTION public.join_team(
  p_subscription_id uuid,
  p_team_id         uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          uuid := auth.uid();
  v_sub             record;
  v_team            record;
  v_current_count   integer;
  v_last_change     timestamptz;
  v_min_change_gap  interval := interval '28 days';  -- conservative ~1 billing cycle
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Lock subscription row + verify ownership.
  SELECT s.id, s.user_id, s.team_id, s.coach_id, s.last_team_change_at, s.status
    INTO v_sub
  FROM public.subscriptions s
  WHERE s.id = p_subscription_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found' USING ERRCODE = '42501';
  END IF;
  IF v_sub.user_id <> v_caller AND NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF v_sub.status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'Subscription not active' USING ERRCODE = 'P0001';
  END IF;

  -- Lock team row + verify capacity (FOR UPDATE serializes concurrent joins:
  -- two callers contend on this same row, so the capacity recheck below sees
  -- the other's committed team_id write -- B7-N6).
  SELECT t.id, t.coach_id, t.max_members, t.is_active
    INTO v_team
  FROM public.coach_teams t
  WHERE t.id = p_team_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_team.is_active THEN
    RAISE EXCEPTION 'Team not available' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: already on this team -> succeed without touching anything.
  IF v_sub.team_id = p_team_id THEN
    RETURN jsonb_build_object('subscription_id', v_sub.id, 'team_id', p_team_id, 'noop', true);
  END IF;

  -- Cycle-gap enforcement (skipped for admin) -- B7-N5.
  IF NOT public.is_admin(v_caller) THEN
    v_last_change := v_sub.last_team_change_at;
    IF v_last_change IS NOT NULL AND v_last_change > now() - v_min_change_gap THEN
      RAISE EXCEPTION 'Team change too soon -- once per billing cycle'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Capacity recheck under lock (NULL max_members = unlimited) -- B7-N6.
  SELECT COUNT(*)::int INTO v_current_count
  FROM public.subscriptions s
  WHERE s.team_id = p_team_id AND s.status IN ('pending', 'active');
  IF v_team.max_members IS NOT NULL AND v_current_count >= v_team.max_members THEN
    RAISE EXCEPTION 'Team is full' USING ERRCODE = 'P0001';
  END IF;

  -- Signal the column-whitelist trigger that this UPDATE is authorised.
  PERFORM set_config('app.in_join_team', 'true', true);

  UPDATE public.subscriptions
     SET team_id                = p_team_id,
         coach_id               = v_team.coach_id,
         last_team_change_at    = now(),
         needs_coach_assignment = false
   WHERE id = p_subscription_id;

  RETURN jsonb_build_object(
    'subscription_id', v_sub.id,
    'team_id',         p_team_id,
    'coach_id',        v_team.coach_id,
    'noop',            false
  );
END;
$$;
