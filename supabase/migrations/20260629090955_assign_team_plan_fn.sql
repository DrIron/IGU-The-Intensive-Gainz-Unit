-- Teams canonical model — T1 assign-to-team RPC (ADDITIVE).
-- See docs/TEAMS_CANONICAL_BUILD.md §T1.
--
-- Binds a team to ONE shared canonical plan and assigns every active member to
-- it. Unlike the legacy assign_team_program_atomic (which deep-copies a frozen
-- client_programs per member, so edits never propagate), this creates a thin
-- client_plan_assignment per member pointing at the SAME plan_id. Editing the
-- team plan later (save_plan_from_builder on that plan) updates all members at
-- once — the canonical resolver reads the shared plan for everyone.
--
-- GUARDRAIL (the whole point of the model): NEVER writes client_plan_overrides.
-- Team-member assignments are override-free by construction.
--
-- Idempotent: one team assignment per (client, team). A re-run with identical
-- args changes nothing (members_skipped). Re-pointing the team at a new plan
-- updates each member's existing assignment in place (members_assigned).
--
-- Member set MATCHES assign_team_program_atomic exactly: active subscriptions on
-- the team (status = 'active'). The team row + member subs are locked FOR UPDATE
-- so concurrent assigns to the same team serialize (race-safe check-then-write).
--
-- Auth: team head coach (auth.uid() = coach_teams.coach_id) OR admin. RLS for
-- member plan reads is already covered by the P0.5 plan-read-via-assignment
-- policies (20260627101105); head-coach edits go through save_plan_from_builder
-- (gated on the muscle-template owner = the head coach). No new RLS needed here.
CREATE OR REPLACE FUNCTION public.assign_team_plan(
  p_team_id uuid,
  p_plan_id uuid,
  p_start_date date DEFAULT CURRENT_DATE
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller    uuid := auth.uid();
  v_team      record;
  v_member    record;
  v_existing  uuid;
  v_assign_id uuid;
  v_status    text;
  v_members   jsonb := '[]'::jsonb;
  v_total     int := 0;
  v_assigned  int := 0;
  v_skipped   int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Lock the team + resolve the head coach.
  SELECT t.id, t.coach_id, t.is_active
    INTO v_team
  FROM public.coach_teams t
  WHERE t.id = p_team_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_team.is_active THEN
    RAISE EXCEPTION 'Team not found or inactive' USING ERRCODE = 'P0001';
  END IF;

  -- Auth gate: team head coach OR admin.
  IF NOT public.is_admin(v_caller) AND v_caller <> v_team.coach_id THEN
    RAISE EXCEPTION 'Not authorised: caller is not the team head coach'
      USING ERRCODE = '42501';
  END IF;

  -- Pre-flight: the plan must exist (fail once, not per member).
  IF NOT EXISTS (SELECT 1 FROM public.plan WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0001';
  END IF;

  -- Lock + iterate active member subscriptions (same set as the legacy RPC).
  FOR v_member IN
    SELECT s.id AS subscription_id, s.user_id
    FROM public.subscriptions s
    WHERE s.team_id = p_team_id
      AND s.status = 'active'
    ORDER BY s.user_id
    FOR UPDATE
  LOOP
    v_total := v_total + 1;

    -- One team assignment per (client, team). Update in place if it exists,
    -- else insert. NEVER create client_plan_overrides.
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
        v_member.user_id, v_member.subscription_id, p_plan_id, v_team.coach_id,
        p_team_id, p_start_date, 'active'
      )
      RETURNING id INTO v_assign_id;
      v_assigned := v_assigned + 1;
      v_status := 'assigned';
    ELSE
      v_assign_id := v_existing;
      -- Only write when something actually changes → idempotent re-runs skip.
      UPDATE public.client_plan_assignment
         SET plan_id         = p_plan_id,
             subscription_id = v_member.subscription_id,
             start_date      = p_start_date,
             status          = 'active',
             updated_at      = now()
       WHERE id = v_existing
         AND (plan_id         IS DISTINCT FROM p_plan_id
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

  -- Bind the team to the canonical plan (dual-write: leaves the legacy
  -- current_program_template_id untouched during the soak).
  UPDATE public.coach_teams
     SET current_program_plan_id = p_plan_id
   WHERE id = p_team_id;

  RETURN jsonb_build_object(
    'team_id',          p_team_id,
    'plan_id',          p_plan_id,
    'members_total',    v_total,
    'members_assigned', v_assigned,
    'members_skipped',  v_skipped,
    'members',          v_members
  );
END;
$function$;
