-- Own-your-copy assignment model — S1 rewire of the team assign RPC (ADDITIVE/safe).
-- See docs/PROGRAM_ASSIGNMENT_SYNC.md §S1 (supersedes TEAMS_CANONICAL_BUILD §T1).
--
-- Adds p_clone (board_v2 gate, default false):
--   * p_clone = false (prod default): UNCHANGED T1 behavior — every member's
--     assignment + coach_teams.current_program_plan_id point at p_plan_id (the
--     template, shared reference).
--   * p_clone = true (board_v2 on): clone-on-assign, but ONE clone per team
--     (not per member). The team gets a single owned copy of the template; every
--     member's assignment + current_program_plan_id point at that same clone, so
--     editing the team board (S2) is team-local and shared by all members.
--
-- Idempotent under clone mode too: if the team is already bound to a clone of
-- THIS template (current_program_plan_id -> plan with source_template_plan_id =
-- p_plan_id), that clone is reused (no re-clone, members already point at it ->
-- skipped). Re-pointing the team at a different template clones the new one.
--
-- NEVER writes client_plan_overrides. Member set = active subscriptions (matches
-- assign_team_program_atomic). Team + member subs locked FOR UPDATE.
--
-- Replaces the 3-arg overload with a 4-arg one (new param defaults, so 3-arg
-- callers keep resolving). DROP first since CREATE OR REPLACE can't change a sig.
DROP FUNCTION IF EXISTS public.assign_team_plan(uuid, uuid, date);

CREATE OR REPLACE FUNCTION public.assign_team_plan(
  p_team_id uuid,
  p_plan_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_clone boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_team       record;
  v_member     record;
  v_existing   uuid;
  v_assign_id  uuid;
  v_status     text;
  v_effective  uuid;
  v_members    jsonb := '[]'::jsonb;
  v_total      int := 0;
  v_assigned   int := 0;
  v_skipped    int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT t.id, t.coach_id, t.is_active, t.current_program_plan_id
    INTO v_team
  FROM public.coach_teams t
  WHERE t.id = p_team_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_team.is_active THEN
    RAISE EXCEPTION 'Team not found or inactive' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_admin(v_caller) AND v_caller <> v_team.coach_id THEN
    RAISE EXCEPTION 'Not authorised: caller is not the team head coach'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plan WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve the plan the team will actually follow.
  IF p_clone THEN
    -- Reuse an existing clone of THIS template if the team already follows one
    -- (idempotent re-assign); otherwise mint one shared clone for the whole team.
    SELECT cp.id INTO v_effective
    FROM public.plan cp
    WHERE cp.id = v_team.current_program_plan_id
      AND cp.source_template_plan_id = p_plan_id;
    IF v_effective IS NULL THEN
      v_effective := public.clone_plan(p_plan_id);
    END IF;
  ELSE
    v_effective := p_plan_id;  -- legacy shared-reference path
  END IF;

  FOR v_member IN
    SELECT s.id AS subscription_id, s.user_id
    FROM public.subscriptions s
    WHERE s.team_id = p_team_id
      AND s.status = 'active'
    ORDER BY s.user_id
    FOR UPDATE
  LOOP
    v_total := v_total + 1;

    SELECT id INTO v_existing
    FROM public.client_plan_assignment
    WHERE client_id = v_member.user_id
      AND team_id   = p_team_id
    ORDER BY created_at
    LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.client_plan_assignment (
        client_id, subscription_id, plan_id, primary_coach_id,
        team_id, start_date, status
      ) VALUES (
        v_member.user_id, v_member.subscription_id, v_effective, v_team.coach_id,
        p_team_id, p_start_date, 'active'
      )
      RETURNING id INTO v_assign_id;
      v_assigned := v_assigned + 1;
      v_status := 'assigned';
    ELSE
      v_assign_id := v_existing;
      UPDATE public.client_plan_assignment
         SET plan_id         = v_effective,
             subscription_id = v_member.subscription_id,
             start_date      = p_start_date,
             status          = 'active',
             updated_at      = now()
       WHERE id = v_existing
         AND (plan_id         IS DISTINCT FROM v_effective
              OR start_date      IS DISTINCT FROM p_start_date
              OR status          IS DISTINCT FROM 'active'::public.client_program_status
              OR subscription_id IS DISTINCT FROM v_member.subscription_id);
      IF FOUND THEN
        v_assigned := v_assigned + 1;
        v_status := 'updated';
      ELSE
        v_skipped := v_skipped + 1;
        v_status := 'skipped_existing';
      END IF;
    END IF;

    v_members := v_members || jsonb_build_object(
      'user_id',         v_member.user_id,
      'subscription_id', v_member.subscription_id,
      'assignment_id',   v_assign_id,
      'status',          v_status
    );
  END LOOP;

  -- Bind the team to the followed plan (clone under board_v2, template otherwise).
  -- Legacy current_program_template_id is left untouched during the soak.
  UPDATE public.coach_teams
     SET current_program_plan_id = v_effective
   WHERE id = p_team_id;

  RETURN jsonb_build_object(
    'team_id',          p_team_id,
    'plan_id',          v_effective,
    'cloned',           p_clone,
    'source_template_plan_id', CASE WHEN p_clone THEN p_plan_id ELSE NULL END,
    'members_total',    v_total,
    'members_assigned', v_assigned,
    'members_skipped',  v_skipped,
    'members',          v_members
  );
END;
$function$;
