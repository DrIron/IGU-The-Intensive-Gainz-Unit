-- CP5: also end the OLD sub's active care-team assignments (dietitian etc.) when
-- migrating links. Cancelling/replacing a sub never ended these -> orphaned on the
-- specialist's roster + counted as an active care relationship. On a plan change the
-- care team is re-established on the new tier (admin/coach step). end_reason_code
-- 'subscription_cancelled' is the intended code for this. Applies to BOTH the change
-- path (new provided) and the cancel path (new NULL) -- the old sub is ending either way.
CREATE OR REPLACE FUNCTION public.migrate_subscription_links(
  p_old_subscription_id uuid,
  p_new_subscription_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coach_rows_ended       integer := 0;
  v_plan_assignments_moved integer := 0;
  v_care_team_ended        integer := 0;
  v_nutrition_active       integer := 0;
  v_user_id                uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.subscriptions WHERE id = p_old_subscription_id;

  -- 1) End the OLD sub's active coach relationships.
  UPDATE public.coach_client_relationships
     SET ended_at = now(), updated_at = now()
   WHERE subscription_id = p_old_subscription_id
     AND ended_at IS NULL;
  GET DIAGNOSTICS v_coach_rows_ended = ROW_COUNT;

  -- 1b) End the OLD sub's active care-team assignments (specialists). Never ended
  --     on sub cancel -> orphaned. Re-established on the new tier as a care-team step.
  UPDATE public.care_team_assignments
     SET lifecycle_status = 'ended',
         removed_at       = now(),
         active_until     = now(),
         end_reason_code  = 'subscription_cancelled',
         end_notes        = COALESCE(end_notes, 'subscription ended (plan change / cancel)'),
         updated_at       = now()
   WHERE subscription_id = p_old_subscription_id
     AND lifecycle_status = 'active';
  GET DIAGNOSTICS v_care_team_ended = ROW_COUNT;

  -- 2) Canonical program assignment (P5 table -- preserve the row + logs).
  IF p_new_subscription_id IS NOT NULL THEN
    UPDATE public.client_plan_assignment cpa
       SET subscription_id = p_new_subscription_id,
           team_id          = ns.team_id,
           primary_coach_id = COALESCE(nc.coach_id, cpa.primary_coach_id),
           updated_at       = now()
      FROM public.subscriptions ns
      LEFT JOIN LATERAL (
        SELECT coach_id
          FROM public.coach_client_relationships
         WHERE subscription_id = p_new_subscription_id
           AND ended_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1
      ) nc ON true
     WHERE cpa.subscription_id = p_old_subscription_id
       AND ns.id = p_new_subscription_id;
  ELSE
    UPDATE public.client_plan_assignment
       SET subscription_id = NULL,
           updated_at       = now()
     WHERE subscription_id = p_old_subscription_id;
  END IF;
  GET DIAGNOSTICS v_plan_assignments_moved = ROW_COUNT;

  -- 3) nutrition_phases carry by user_id -- report the active count.
  SELECT count(*) INTO v_nutrition_active
    FROM public.nutrition_phases
   WHERE user_id = v_user_id AND is_active = true;

  RETURN jsonb_build_object(
    'coach_rows_ended',        v_coach_rows_ended,
    'care_team_ended',         v_care_team_ended,
    'plan_assignments_moved',  v_plan_assignments_moved,
    'nutrition_active',        v_nutrition_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.migrate_subscription_links(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migrate_subscription_links(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.migrate_subscription_links(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_subscription_links(uuid, uuid) TO service_role;
