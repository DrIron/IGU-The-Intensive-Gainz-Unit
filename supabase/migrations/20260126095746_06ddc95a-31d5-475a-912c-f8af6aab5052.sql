-- ============================================================
-- Care Team Assignment Lifecycle Management
-- Adds time-bounded access, discharge/termination workflows
-- ============================================================

-- Create enum for care team assignment status
CREATE TYPE public.care_team_status AS ENUM (
  'active',
  'scheduled_end',
  'terminated_for_cause',
  'ended'
);

-- Create enum for end reason codes
CREATE TYPE public.care_team_end_reason AS ENUM (
  'subscription_cancelled',
  'addon_cancelled',
  'coach_request',
  'client_request',
  'admin_override',
  'for_cause_performance',
  'for_cause_conduct',
  'for_cause_other',
  'replaced'
);

-- Add lifecycle columns to care_team_assignments
ALTER TABLE public.care_team_assignments
  ADD COLUMN IF NOT EXISTS active_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS active_until TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_status public.care_team_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS ended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS end_reason_code public.care_team_end_reason DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS end_notes TEXT DEFAULT NULL;

-- Add index for time-bounded queries
CREATE INDEX IF NOT EXISTS idx_care_team_active_period 
  ON public.care_team_assignments (active_from, active_until);

CREATE INDEX IF NOT EXISTS idx_care_team_lifecycle_status 
  ON public.care_team_assignments (lifecycle_status);

-- Migrate existing records: set active_from to added_at
UPDATE public.care_team_assignments
SET active_from = COALESCE(added_at, created_at, now())
WHERE active_from = now();

-- ============================================================
-- Helper function: Check if coach has active time-bounded access
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_active_care_team_access(
  p_staff_uid uuid,
  p_subscription_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.care_team_assignments
    WHERE staff_user_id = p_staff_uid
      AND subscription_id = p_subscription_id
      AND lifecycle_status IN ('active', 'scheduled_end')
      AND now() >= active_from
      AND (active_until IS NULL OR now() <= active_until)
  )
$$;

-- ============================================================
-- Helper function: Check if user is on active care team for client
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_on_active_care_team_for_client(
  p_staff_uid uuid,
  p_client_uid uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.care_team_assignments cta
    WHERE cta.staff_user_id = p_staff_uid
      AND cta.client_id = p_client_uid
      AND cta.lifecycle_status IN ('active', 'scheduled_end')
      AND now() >= cta.active_from
      AND (cta.active_until IS NULL OR now() <= cta.active_until)
  )
$$;

-- ============================================================
-- Function to discharge care team member at subscription renewal
-- ============================================================
CREATE OR REPLACE FUNCTION public.discharge_care_team_member(
  p_assignment_id uuid,
  p_reason_code care_team_end_reason,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_subscription_id uuid;
  v_period_end timestamptz;
  v_assignment_record record;
BEGIN
  v_actor_id := auth.uid();
  
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Get assignment details
  SELECT cta.*, s.next_billing_date
  INTO v_assignment_record
  FROM care_team_assignments cta
  JOIN subscriptions s ON cta.subscription_id = s.id
  WHERE cta.id = p_assignment_id;
  
  IF v_assignment_record IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  
  -- Authorization: must be admin, primary coach, or the specialist themselves
  IF NOT (
    public.has_role(v_actor_id, 'admin')
    OR public.is_primary_coach_for_subscription(v_actor_id, v_assignment_record.subscription_id)
    OR v_actor_id = v_assignment_record.staff_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to discharge this care team member';
  END IF;
  
  -- Set scheduled end at next billing date
  v_period_end := COALESCE(v_assignment_record.next_billing_date, now() + interval '30 days');
  
  UPDATE care_team_assignments
  SET 
    lifecycle_status = 'scheduled_end',
    active_until = v_period_end,
    ended_by = v_actor_id,
    end_reason_code = p_reason_code,
    end_notes = p_notes,
    updated_at = now()
  WHERE id = p_assignment_id;
  
  -- Log to audit
  INSERT INTO admin_audit_log (
    admin_user_id, action_type, target_type, target_id, details
  ) VALUES (
    v_actor_id,
    'care_team_discharge',
    'care_team_assignment',
    p_assignment_id,
    jsonb_build_object(
      'reason_code', p_reason_code,
      'scheduled_end', v_period_end,
      'staff_user_id', v_assignment_record.staff_user_id,
      'client_id', v_assignment_record.client_id,
      'has_notes', p_notes IS NOT NULL
    )
  );
  
  RETURN true;
END;
$$;

-- ============================================================
-- Function to immediately terminate care team member (for cause)
-- ============================================================
CREATE OR REPLACE FUNCTION public.terminate_care_team_member(
  p_assignment_id uuid,
  p_reason_code care_team_end_reason,
  p_notes text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_is_admin boolean;
  v_assignment_record record;
BEGIN
  v_actor_id := auth.uid();
  
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Only admins can do for-cause termination
  v_is_admin := public.has_role(v_actor_id, 'admin');
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only administrators can perform for-cause terminations';
  END IF;
  
  -- Notes are required for terminations
  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RAISE EXCEPTION 'Termination notes are required for audit purposes';
  END IF;
  
  -- Get assignment details
  SELECT * INTO v_assignment_record
  FROM care_team_assignments
  WHERE id = p_assignment_id;
  
  IF v_assignment_record IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  
  -- Immediate termination
  UPDATE care_team_assignments
  SET 
    lifecycle_status = 'terminated_for_cause',
    active_until = now(),
    ended_by = v_actor_id,
    end_reason_code = p_reason_code,
    end_notes = p_notes,
    updated_at = now()
  WHERE id = p_assignment_id;
  
  -- Log to audit with full details
  INSERT INTO admin_audit_log (
    admin_user_id, action_type, target_type, target_id, details
  ) VALUES (
    v_actor_id,
    'care_team_terminate_for_cause',
    'care_team_assignment',
    p_assignment_id,
    jsonb_build_object(
      'reason_code', p_reason_code,
      'terminated_at', now(),
      'staff_user_id', v_assignment_record.staff_user_id,
      'client_id', v_assignment_record.client_id,
      'notes_provided', true
    )
  );
  
  RETURN true;
END;
$$;

-- ============================================================
-- Function to process scheduled discharges (called by cron)
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_care_team_discharges()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Update to ended status
    UPDATE care_team_assignments
    SET 
      lifecycle_status = 'ended',
      status = 'removed',
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
$$;

-- ============================================================
-- Drop existing RLS policies and recreate with time-bounded access
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins full access to care team" ON care_team_assignments;
DROP POLICY IF EXISTS "Primary coaches can manage their client care teams" ON care_team_assignments;
DROP POLICY IF EXISTS "Care team members can view their own assignments" ON care_team_assignments;
DROP POLICY IF EXISTS "Clients can view their own care team" ON care_team_assignments;

-- Admin: Full access (no time restrictions)
CREATE POLICY "admin_full_access_care_team"
ON public.care_team_assignments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Primary Coach: Can view/manage care team for their clients (active assignments only)
CREATE POLICY "primary_coach_manage_care_team"
ON public.care_team_assignments
FOR ALL
TO authenticated
USING (
  public.is_primary_coach_for_subscription(auth.uid(), subscription_id)
  AND lifecycle_status IN ('active', 'scheduled_end')
)
WITH CHECK (
  public.is_primary_coach_for_subscription(auth.uid(), subscription_id)
);

-- Care Team Staff: Can view their own ACTIVE assignments (time-bounded)
CREATE POLICY "staff_view_own_active_assignments"
ON public.care_team_assignments
FOR SELECT
TO authenticated
USING (
  staff_user_id = auth.uid()
  AND lifecycle_status IN ('active', 'scheduled_end')
  AND now() >= active_from
  AND (active_until IS NULL OR now() <= active_until)
);

-- Clients: Can view their own care team (active only)
CREATE POLICY "client_view_own_care_team"
ON public.care_team_assignments
FOR SELECT
TO authenticated
USING (
  client_id = auth.uid()
  AND lifecycle_status IN ('active', 'scheduled_end')
);

-- ============================================================
-- Grant execute permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION public.has_active_care_team_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_on_active_care_team_for_client TO authenticated;
GRANT EXECUTE ON FUNCTION public.discharge_care_team_member TO authenticated;
GRANT EXECUTE ON FUNCTION public.terminate_care_team_member TO authenticated;
-- process_care_team_discharges is for service_role only (cron)
REVOKE EXECUTE ON FUNCTION public.process_care_team_discharges FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_care_team_discharges FROM anon;