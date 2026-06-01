-- B5-N6 (Option A) -- retire care_team_assignments.status, part 1: functions.
--
-- The legacy `status` (text) column was the source of truth for "is this care
-- team member active?", but the admin lifecycle actions only maintain the newer
-- `lifecycle_status` enum: discharge_care_team_member sets lifecycle_status =
-- 'scheduled_end' and terminate_care_team_member sets 'terminated_for_cause',
-- BOTH leaving status = 'active'. So every reader of status='active' (the RLS
-- gatekeeper, the dietitian helpers, the addon-link trigger) treated a
-- terminated-for-cause staff member as still active -> retained care-team RLS
-- access. This migration repoints every status reader at
--   lifecycle_status IN ('active','scheduled_end')
-- which is the column the lifecycle writers actually maintain. Bodies are the
-- verbatim prod definitions (pulled via pg_get_functiondef) with only the
-- status predicate swapped -- same pattern as B7-N3.
--
-- Part 2 (..._cleanup.sql) recreates the inline-status policies, drops the
-- status index, and drops the column. Functions must land first.
--
-- Splitter note (feedback_supabase_cli_dollar_quote_splitter): function defs
-- live in their own file; no long REVOKE/GRANT runs here.

-- ---------------------------------------------------------------------------
-- RLS-predicate helper: is_care_team_member_for_client (THE gatekeeper)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_care_team_member_for_client(p_staff_uid uuid, p_client_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- Admin has access to all
    public.is_admin(p_staff_uid)
    -- Primary coach
    OR public.is_primary_coach_for_user(p_staff_uid, p_client_uid)
    -- Any active care team assignment (B5-N6: lifecycle_status, not stale status)
    OR EXISTS (
      SELECT 1
      FROM public.care_team_assignments cta
      WHERE cta.client_id = p_client_uid
        AND cta.staff_user_id = p_staff_uid
        AND cta.lifecycle_status IN ('active', 'scheduled_end')
    )
$function$;

-- ---------------------------------------------------------------------------
-- RLS-predicate helper: is_dietitian_for_client
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_dietitian_for_client(p_dietitian_uid uuid, p_client_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.care_team_assignments cta
    WHERE cta.client_id = p_client_uid
      AND cta.staff_user_id = p_dietitian_uid
      AND cta.specialty = 'dietitian'::staff_specialty
      AND cta.lifecycle_status IN ('active', 'scheduled_end')
  )
$function$;

-- ---------------------------------------------------------------------------
-- RLS-predicate helper: client_has_dietitian
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_has_dietitian(p_client_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.care_team_assignments cta
    WHERE cta.client_id = p_client_uid
      AND cta.specialty = 'dietitian'::staff_specialty
      AND cta.lifecycle_status IN ('active', 'scheduled_end')
  )
$function$;

-- can_edit_nutrition is intentionally NOT recreated: it has no direct
-- care_team_assignments.status read -- it composes the three helpers above, so
-- it is fixed transitively. (Verified via pg_get_functiondef 2026-06-01.)

-- ---------------------------------------------------------------------------
-- Trigger fn: link_addon_to_care_team (links a subscription addon to its
-- matching active assignment). Inline status='active' -> lifecycle_status.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_addon_to_care_team()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- When a subscription addon is created, try to link it to the matching care team assignment
  UPDATE care_team_assignments
  SET addon_id = NEW.id, is_billable = true
  WHERE subscription_id = NEW.subscription_id
    AND staff_user_id = NEW.staff_user_id
    AND specialty = NEW.specialty
    AND lifecycle_status IN ('active', 'scheduled_end')
    AND addon_id IS NULL;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Trigger fn: manage_care_team_relationships (maintains coach_client_relationships).
-- Keyed transitions moved from status to lifecycle_status, where "active" means
-- lifecycle_status IN ('active','scheduled_end') -- a scheduled_end member is
-- still serving until active_until, so the relationship persists through it and
-- ends only at 'ended'/'terminated_for_cause'. This ALSO closes a latent bug:
-- terminate_care_team_member (-> terminated_for_cause, status left 'active')
-- never fired the old status-keyed end branch, so the relationship row lingered.
--
-- auth.uid() NULL-branch (feedback_trigger_auth_uid_null_branch): NOT needed --
-- this trigger does not gate on caller identity. It only mirrors lifecycle
-- transitions into coach_client_relationships and must run for every writer
-- (service_role discharge/terminate RPCs, the cron expiry job, admin/coach
-- UPDATEs alike). Adding a NULL bypass would SKIP relationship maintenance for
-- the service-role/cron writers -- the opposite of what we want here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_care_team_relationships()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- New care team assignment
  IF TG_OP = 'INSERT' AND NEW.lifecycle_status IN ('active', 'scheduled_end') THEN
    INSERT INTO public.coach_client_relationships (
      client_id, coach_id, subscription_id, role, started_at
    ) VALUES (
      NEW.client_id, NEW.staff_user_id, NEW.subscription_id, 'care_team', v_now
    )
    ON CONFLICT DO NOTHING; -- Avoid duplicates
    RETURN NEW;
  END IF;

  -- Care team member removed/deactivated
  IF TG_OP = 'UPDATE' THEN
    -- Lifecycle changed out of the active window (-> terminated_for_cause / ended)
    IF OLD.lifecycle_status IN ('active', 'scheduled_end')
       AND NEW.lifecycle_status NOT IN ('active', 'scheduled_end') THEN
      UPDATE public.coach_client_relationships
      SET ended_at = COALESCE(NEW.removed_at, v_now), updated_at = v_now
      WHERE subscription_id = NEW.subscription_id
        AND coach_id = NEW.staff_user_id
        AND client_id = NEW.client_id
        AND role = 'care_team'
        AND ended_at IS NULL;
    END IF;

    -- Lifecycle changed back into the active window
    IF OLD.lifecycle_status NOT IN ('active', 'scheduled_end')
       AND NEW.lifecycle_status IN ('active', 'scheduled_end') THEN
      -- Only insert if no active relationship exists
      IF NOT EXISTS (
        SELECT 1 FROM public.coach_client_relationships
        WHERE subscription_id = NEW.subscription_id
          AND coach_id = NEW.staff_user_id
          AND client_id = NEW.client_id
          AND role = 'care_team'
          AND ended_at IS NULL
      ) THEN
        INSERT INTO public.coach_client_relationships (
          client_id, coach_id, subscription_id, role, started_at
        ) VALUES (
          NEW.client_id, NEW.staff_user_id, NEW.subscription_id, 'care_team', v_now
        );
      END IF;
    END IF;
  END IF;

  -- Care team deletion
  IF TG_OP = 'DELETE' THEN
    UPDATE public.coach_client_relationships
    SET ended_at = v_now, updated_at = v_now
    WHERE subscription_id = OLD.subscription_id
      AND coach_id = OLD.staff_user_id
      AND client_id = OLD.client_id
      AND role = 'care_team'
      AND ended_at IS NULL;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Cron fn: process_care_team_discharges. Drop the now-defunct status='removed'
-- write (column is removed in part 2); lifecycle_status='ended' is the signal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_care_team_discharges()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_processed_count integer := 0;
  v_assignment record;
BEGIN
  -- Find all assignments that have passed their active_until date
  FOR v_assignment IN
    SELECT id, staff_user_id, client_id, subscription_id, end_reason_code
    FROM care_team_assignments
    WHERE lifecycle_status = 'scheduled_end'
      AND active_until IS NOT NULL
      AND active_until < now()
  LOOP
    -- Update to ended status (B5-N6: lifecycle_status is the sole signal now)
    UPDATE care_team_assignments
    SET
      lifecycle_status = 'ended',
      removed_at = now(),
      updated_at = now()
    WHERE id = v_assignment.id;

    -- Log the automatic transition
    INSERT INTO admin_audit_log (
      admin_user_id, action_type, target_type, target_id, details
    ) VALUES (
      '00000000-0000-0000-0000-000000000000'::uuid, -- System user
      'care_team_auto_ended',
      'care_team_assignment',
      v_assignment.id,
      jsonb_build_object(
        'reason_code', v_assignment.end_reason_code,
        'processed_by', 'cron_job',
        'staff_user_id', v_assignment.staff_user_id,
        'client_id', v_assignment.client_id
      )
    );

    v_processed_count := v_processed_count + 1;
  END LOOP;

  RETURN v_processed_count;
END;
$function$;

-- Re-assert grants on the RLS-predicate helpers (feedback_supabase_default_grants_to_anon:
-- these are evaluated INSIDE RLS policies, so the querying role -- incl. anon --
-- must keep EXECUTE; CREATE OR REPLACE preserves grants but we re-assert explicitly).
GRANT EXECUTE ON FUNCTION public.is_care_team_member_for_client(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_dietitian_for_client(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_has_dietitian(uuid) TO anon, authenticated;
