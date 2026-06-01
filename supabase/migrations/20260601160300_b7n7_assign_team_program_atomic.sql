-- B7-N7 + B7-N19: atomic team program fan-out.
-- Replaces the FE Promise.allSettled loop in AssignTeamProgramDialog. Locks the
-- team + member subs, then assigns the program to every active member by calling
-- the existing deep-copy RPC assign_program_to_client per member (the head coach
-- passes its B7-N3 gate as primary coach for each member; admin passes via
-- is_admin). Each member runs in its own savepoint (BEGIN/EXCEPTION) so one
-- member's failure never rolls back the others -- best-effort batch, per-member
-- status returned (matches the prior Promise.allSettled semantics).
--
-- Idempotency (B7-N19): the client_programs UNIQUE(subscription_id,
-- source_template_id, start_date) makes a re-run raise unique_violation, caught
-- as 'skipped_existing' (no pre-check -- the constraint is the race-safe source
-- of truth).
CREATE OR REPLACE FUNCTION public.assign_team_program_atomic(
  p_team_id uuid,
  p_template_id uuid,
  p_start_date date DEFAULT CURRENT_DATE
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller   uuid := auth.uid();
  v_team     record;
  v_member   record;
  v_assign   jsonb;
  v_cp_id    uuid;
  v_status   text;
  v_err      text;
  v_members  jsonb := '[]'::jsonb;
  v_total    int := 0;
  v_inserted int := 0;
  v_skipped  int := 0;
  v_failed   int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Lock the team (capacity/contract) + resolve the head coach.
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

  -- Cheap pre-flight so a bad template fails once, not once per member.
  IF NOT EXISTS (SELECT 1 FROM public.program_templates WHERE id = p_template_id) THEN
    RAISE EXCEPTION 'Program template not found' USING ERRCODE = 'P0001';
  END IF;

  -- Lock + iterate active member subscriptions on this team.
  FOR v_member IN
    SELECT s.id AS subscription_id, s.user_id
    FROM public.subscriptions s
    WHERE s.team_id = p_team_id
      AND s.status = 'active'
    ORDER BY s.user_id
    FOR UPDATE
  LOOP
    v_total := v_total + 1;
    v_cp_id := NULL;
    v_err := NULL;
    BEGIN
      v_assign := public.assign_program_to_client(
        p_coach_id        => v_team.coach_id,
        p_client_id       => v_member.user_id,
        p_subscription_id => v_member.subscription_id,
        p_template_id     => p_template_id,
        p_start_date      => p_start_date,
        p_team_id         => p_team_id,
        p_macrocycle_id   => NULL
      );
      v_cp_id := (v_assign->>'client_program_id')::uuid;
      v_inserted := v_inserted + 1;
      v_status := 'created';
    EXCEPTION
      WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
        v_status := 'skipped_existing';
      WHEN OTHERS THEN
        v_failed := v_failed + 1;
        v_status := 'failed';
        v_err := SQLERRM;
    END;

    v_members := v_members || jsonb_build_object(
      'user_id',           v_member.user_id,
      'subscription_id',   v_member.subscription_id,
      'client_program_id', v_cp_id,
      'status',            v_status,
      'error',             v_err
    );
  END LOOP;

  -- Point the team at the assigned template if anything landed (atomic with the
  -- fan-out; replaces the FE's separate post-loop coach_teams update).
  IF v_inserted > 0 THEN
    UPDATE public.coach_teams
       SET current_program_template_id = p_template_id
     WHERE id = p_team_id;
  END IF;

  RETURN jsonb_build_object(
    'team_id',                  p_team_id,
    'members_total',            v_total,
    'members_inserted',         v_inserted,
    'members_skipped_existing', v_skipped,
    'members_failed',           v_failed,
    'members',                  v_members
  );
END;
$function$;

-- NOTE: REVOKE/GRANT for this function lives in
-- 20260601160500_b7_team_rpcs_grants.sql -- the CLI statement splitter (v2.78.1)
-- raises 42601 when a CREATE FUNCTION body is followed by REVOKE/GRANT in the
-- same file (feedback_supabase_cli_dollar_quote_splitter). Function defs stay
-- alone; grants are isolated in a DO block.
