-- Program system unification — P4 (backend slice): writer for client_plan_overrides.
-- See docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md §P4. The override layer is how a 1:1
-- client's program diverges from the followed plan WITHOUT touching the template or other
-- clients. The editor UI (deferred) calls this; here we build + verify the data layer only.
--
-- One override row per (assignment_id, target_type, target_id):
--   target_type 'week'|'session'|'slot', target_id = the plan_* element id (or a client-gen
--   uuid for an added element), override_json = changed fields only, removed = drop the element.
-- Contract for override_json (consumed by canonicalSessionResolver):
--   slot:    { exercise_id?, section?, sort_order?, instructions?, prescription?: <partial pj>,
--              added?: true, plan_session_id? }  -- field-level patch; added=new slot in a session
--   session: { name?, activity_type? }            -- element-level (removed=true drops it)
--   week:    { is_deload?, deload_preset_id? }     -- accepted now; per-client deload applied later
--
-- Empty override_json + removed=false = "revert to template" → deletes the row (no diff, no row).
-- Teams use the shared plan directly (Teams track: zero per-member overrides) → rejected here.
CREATE OR REPLACE FUNCTION public.save_client_plan_override(
  p_assignment_id uuid,
  p_target_type   text,
  p_target_id     uuid,
  p_override_json jsonb DEFAULT '{}'::jsonb,
  p_removed       boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_client      uuid;
  v_coach       uuid;
  v_team        uuid;
  v_override_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_target_type NOT IN ('week', 'session', 'slot') THEN
    RAISE EXCEPTION 'invalid target_type %', p_target_type USING ERRCODE = '22023';
  END IF;

  SELECT client_id, primary_coach_id, team_id
    INTO v_client, v_coach, v_team
  FROM public.client_plan_assignment
  WHERE id = p_assignment_id;

  IF v_client IS NULL THEN
    RAISE EXCEPTION 'assignment % not found', p_assignment_id USING ERRCODE = '42704';
  END IF;

  -- Teams edit the shared plan directly — no per-member override layer (Teams track).
  IF v_team IS NOT NULL THEN
    RAISE EXCEPTION 'team assignments do not take per-client overrides' USING ERRCODE = '42501';
  END IF;

  -- Same access set as cpa_coach / cpo_via_assignment: admin or the client's primary coach.
  IF NOT public.is_admin(v_uid)
     AND v_uid <> v_coach
     AND NOT public.is_primary_coach_for_user(v_uid, v_client) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- No diff (empty patch, not a removal) = revert to following the template: drop any override.
  IF (p_override_json IS NULL OR p_override_json = '{}'::jsonb) AND NOT p_removed THEN
    DELETE FROM public.client_plan_overrides
      WHERE assignment_id = p_assignment_id
        AND target_type = p_target_type
        AND target_id = p_target_id
    RETURNING id INTO v_override_id;
    RETURN jsonb_build_object(
      'action', CASE WHEN v_override_id IS NULL THEN 'noop' ELSE 'cleared' END,
      'override_id', v_override_id);
  END IF;

  INSERT INTO public.client_plan_overrides (assignment_id, target_type, target_id, override_json, removed)
  VALUES (p_assignment_id, p_target_type, p_target_id, COALESCE(p_override_json, '{}'::jsonb), p_removed)
  ON CONFLICT (assignment_id, target_type, target_id) DO UPDATE
    SET override_json = EXCLUDED.override_json, removed = EXCLUDED.removed, updated_at = now()
  RETURNING id INTO v_override_id;

  RETURN jsonb_build_object('action', 'upserted', 'override_id', v_override_id);
END;
$function$;
