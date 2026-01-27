-- ============================================================
-- COACH-SAFE MEDICAL FLAGS: Least privilege PHI access
-- Coaches see flags only, not decrypted medical details
-- ============================================================

-- Add admin_summary column to form_submissions_safe for curated notes
ALTER TABLE public.form_submissions_safe 
ADD COLUMN IF NOT EXISTS medical_cleared boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS medical_cleared_at timestamptz,
ADD COLUMN IF NOT EXISTS medical_cleared_by uuid,
ADD COLUMN IF NOT EXISTS admin_medical_summary text;

-- Add comment explaining the columns
COMMENT ON COLUMN public.form_submissions_safe.medical_cleared IS 
'Admin-set flag indicating medical review has been completed and client is cleared';

COMMENT ON COLUMN public.form_submissions_safe.admin_medical_summary IS 
'COACH-SAFE: Admin-curated summary of medical considerations. Never contains raw PHI.';

-- ============================================================
-- RPC: get_client_medical_flags
-- Coach-safe function returning only flags, not PHI
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_client_medical_flags(p_client_user_id uuid)
RETURNS TABLE (
  needs_medical_review boolean,
  medical_cleared boolean,
  medical_cleared_at timestamptz,
  admin_summary text,
  has_injuries_noted boolean,
  submission_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id uuid;
  v_is_admin boolean;
  v_is_assigned_coach boolean;
BEGIN
  -- Get requester identity
  v_requester_id := auth.uid();
  
  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Check if requester is admin (admins can view any client)
  v_is_admin := has_role(v_requester_id, 'admin'::app_role);
  
  -- Check if requester is the assigned primary coach for this client
  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = p_client_user_id
        AND s.coach_id = v_requester_id
        AND s.status IN ('active', 'pending')
    ) INTO v_is_assigned_coach;
    
    IF NOT v_is_assigned_coach THEN
      RAISE EXCEPTION 'Access denied: You are not assigned to this client';
    END IF;
  END IF;
  
  -- Return ONLY safe flags, never raw PHI
  RETURN QUERY
  SELECT 
    fss.needs_medical_review,
    COALESCE(fss.medical_cleared, false) as medical_cleared,
    fss.medical_cleared_at,
    fss.admin_medical_summary as admin_summary,
    -- Indicate if there are injury notes WITHOUT revealing content
    (fss.red_flags_count > 0) as has_injuries_noted,
    fss.created_at as submission_date
  FROM form_submissions_safe fss
  WHERE fss.user_id = p_client_user_id
  ORDER BY fss.created_at DESC
  LIMIT 1;
END;
$$;

-- ============================================================
-- RPC: set_client_medical_clearance (Admin only)
-- Admin function to set medical clearance and summary
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_client_medical_clearance(
  p_client_user_id uuid,
  p_cleared boolean,
  p_summary text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id uuid;
  v_is_admin boolean;
BEGIN
  -- Get requester identity
  v_requester_id := auth.uid();
  
  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Only admins can set medical clearance
  v_is_admin := has_role(v_requester_id, 'admin'::app_role);
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: Only administrators can set medical clearance';
  END IF;
  
  -- Update the form_submissions_safe record
  UPDATE form_submissions_safe
  SET 
    medical_cleared = p_cleared,
    medical_cleared_at = CASE WHEN p_cleared THEN now() ELSE NULL END,
    medical_cleared_by = CASE WHEN p_cleared THEN v_requester_id ELSE NULL END,
    admin_medical_summary = p_summary
  WHERE user_id = p_client_user_id;
  
  -- Log this admin action
  INSERT INTO admin_audit_log (
    admin_user_id, action_type, target_type, target_id, details
  ) VALUES (
    v_requester_id,
    'set_medical_clearance',
    'client',
    p_client_user_id,
    jsonb_build_object(
      'cleared', p_cleared,
      'has_summary', p_summary IS NOT NULL
    )
  );
  
  RETURN true;
END;
$$;

-- ============================================================
-- PERMISSIONS
-- ============================================================

-- Revoke from anon
REVOKE EXECUTE ON FUNCTION public.get_client_medical_flags(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_client_medical_clearance(uuid, boolean, text) FROM anon;

-- Grant to authenticated (authorization checked inside)
GRANT EXECUTE ON FUNCTION public.get_client_medical_flags(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_medical_clearance(uuid, boolean, text) TO authenticated;

-- Grant to service_role
GRANT EXECUTE ON FUNCTION public.get_client_medical_flags(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_client_medical_clearance(uuid, boolean, text) TO service_role;

-- ============================================================
-- DOCUMENTATION
-- ============================================================
COMMENT ON FUNCTION public.get_client_medical_flags(uuid) IS 
'COACH-SAFE: Returns medical status flags for a client without exposing raw PHI.
Access restricted to:
- Admins (can view any client)
- Assigned primary coach (only their clients with active/pending subscriptions)
Returns: needs_medical_review, medical_cleared, admin_summary, has_injuries_noted.';

COMMENT ON FUNCTION public.set_client_medical_clearance(uuid, boolean, text) IS 
'ADMIN-ONLY: Sets medical clearance status and optional summary for a client.
The summary should be a curated, coach-safe note - never raw PHI.
All actions are logged to admin_audit_log.';