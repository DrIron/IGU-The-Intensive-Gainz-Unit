-- T5 — one-shot backfill: promote each team's legacy program to ONE shared
-- canonical clone (coach_teams.current_program_plan_id), repoint members onto it
-- via DEACTIVATE-then-INSERT (NOT assign_team_plan's repoint).
--
-- Why deactivate+insert, not repoint: a repoint mutates an existing assignment's
-- plan_id, which breaks the invariant log.plan_slot_id ∈ slots(assignment.plan_id).
-- Verified 2026-07-02: the coach session-log viewer (loadCanonicalSessionEntries)
-- resolves logs plan-first — plan_slots WHERE plan_session_id, then logs WHERE
-- plan_slot_id IN those slot ids — so a repointed assignment would orphan its
-- historical logs from the session view (they still point at the old clone's
-- slots). Deactivate+insert keeps old logs coherently attached to the old
-- assignment+clone pair and also cleanly resolves the ce14d4f5 duplicate.
--
-- Execution note: this calls clone_plan, which requires auth.uid() (admin/coach)
-- and sets owner_coach_id to the caller — so it must be run by an authenticated
-- ADMIN (service_role has no auth.uid() → clone_plan raises). Granted to
-- authenticated + admin-gated inside. After cloning, owner_coach_id is reassigned
-- to the team's head coach so the shared clone is editable from the team board.
CREATE OR REPLACE FUNCTION public.backfill_team_programs_canonical()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_team         record;
  v_mirror_plan  uuid;
  v_clone        uuid;
  v_start        date;
  v_member       record;
  v_reassigned   int;
  v_teams_done   int := 0;
  v_teams_skip   int := 0;
  v_results      jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Not authorised: backfill_team_programs_canonical requires an admin'
      USING ERRCODE = '42501';
  END IF;

  FOR v_team IN
    SELECT id, coach_id, current_program_template_id
    FROM public.coach_teams
    WHERE is_active = true
      AND current_program_template_id IS NOT NULL   -- has a program
      AND current_program_plan_id IS NULL           -- not yet canonical (idempotent skip)
    ORDER BY id
  LOOP
    -- Resolve the team's mirror template plan (newest), same join as assign_team_plan.
    SELECT p.id INTO v_mirror_plan
    FROM public.plan p
    JOIN public.muscle_program_templates m ON m.id = p.source_muscle_template_id
    WHERE m.converted_program_id = v_team.current_program_template_id
    ORDER BY p.created_at DESC
    LIMIT 1;

    IF v_mirror_plan IS NULL THEN
      v_teams_skip := v_teams_skip + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'team_id', v_team.id, 'skipped', true, 'reason', 'no_mirror_plan'));
      CONTINUE;
    END IF;

    -- One shared clone per team; own it as the head coach so the team board can edit it.
    v_clone := public.clone_plan(v_mirror_plan);
    UPDATE public.plan SET owner_coach_id = v_team.coach_id WHERE id = v_clone;
    UPDATE public.coach_teams SET current_program_plan_id = v_clone WHERE id = v_team.id;

    -- One shared start date per team (single-calendar model): newest existing active
    -- team-keyed start, else today.
    SELECT max(start_date) INTO v_start
    FROM public.client_plan_assignment
    WHERE team_id = v_team.id AND status = 'active';
    v_start := COALESCE(v_start, CURRENT_DATE);

    v_reassigned := 0;
    FOR v_member IN
      SELECT s.user_id, s.id AS subscription_id
      FROM public.subscriptions s
      WHERE s.team_id = v_team.id AND s.status = 'active'
      ORDER BY s.user_id
    LOOP
      -- Deactivate ALL existing active team-keyed assignments for this member+team
      -- (handles the duplicate case). Old logs stay attached to the old
      -- assignment+clone pair — both persist; new logging accrues on the new one.
      UPDATE public.client_plan_assignment
        SET status = 'ended', updated_at = now()
        WHERE client_id = v_member.user_id
          AND team_id = v_team.id
          AND status = 'active';

      INSERT INTO public.client_plan_assignment (
        client_id, subscription_id, plan_id, team_id, primary_coach_id, start_date, status
      ) VALUES (
        v_member.user_id, v_member.subscription_id, v_clone, v_team.id,
        v_team.coach_id, v_start, 'active'
      );
      v_reassigned := v_reassigned + 1;
    END LOOP;

    v_teams_done := v_teams_done + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'team_id', v_team.id,
      'skipped', false,
      'shared_plan_id', v_clone,
      'source_template_plan_id', v_mirror_plan,
      'start_date', v_start,
      'members_reassigned', v_reassigned));
  END LOOP;

  RETURN jsonb_build_object(
    'teams_backfilled', v_teams_done,
    'teams_skipped', v_teams_skip,
    'results', v_results);
END;
$function$;

REVOKE ALL ON FUNCTION public.backfill_team_programs_canonical() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_team_programs_canonical() FROM anon;
-- authenticated (not service_role): clone_plan needs auth.uid() = admin; the in-fn
-- is_admin gate is the real authorization.
GRANT EXECUTE ON FUNCTION public.backfill_team_programs_canonical() TO authenticated;
