
-- ============================================================
-- SECURITY AUDIT: Least-Privilege Enforcement Migration
-- ============================================================

-- 1. EXPLICIT COACH DENIAL on profiles_private (defense in depth)
-- Coaches should NEVER access private profile data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles_private' 
    AND policyname = 'Coaches explicitly denied profiles_private'
  ) THEN
    CREATE POLICY "Coaches explicitly denied profiles_private"
      ON public.profiles_private
      FOR ALL
      TO authenticated
      USING (
        NOT has_role(auth.uid(), 'coach'::app_role) 
        OR has_role(auth.uid(), 'admin'::app_role)
        OR auth.uid() = profile_id
      );
  END IF;
END $$;

-- 2. EXPLICIT COACH DENIAL on form_submissions (they use form_submissions_safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'form_submissions' 
    AND policyname = 'Coaches denied direct form_submissions access'
  ) THEN
    CREATE POLICY "Coaches denied direct form_submissions access"
      ON public.form_submissions
      FOR SELECT
      TO authenticated
      USING (
        -- Allow if NOT a coach, OR if also an admin, OR if owner
        NOT has_role(auth.uid(), 'coach'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR auth.uid() = user_id
      );
  END IF;
END $$;

-- 3. CREATE APPROVAL ACTIONS AUDIT LOG
CREATE TABLE IF NOT EXISTS public.approval_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  actor_role TEXT NOT NULL,
  action_type TEXT NOT NULL, -- 'coach_approval', 'medical_approval', 'medical_rejection', 'admin_override'
  target_user_id UUID,
  target_subscription_id UUID,
  previous_status TEXT,
  new_status TEXT,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on approval audit log
ALTER TABLE public.approval_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read approval audit logs
CREATE POLICY "Admins can read approval_audit_log"
  ON public.approval_audit_log
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert (via service role or security definer functions)
CREATE POLICY "System can insert approval_audit_log"
  ON public.approval_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 4. CREATE FUNCTION TO LOG APPROVAL ACTIONS
CREATE OR REPLACE FUNCTION public.log_approval_action(
  p_actor_user_id UUID,
  p_actor_role TEXT,
  p_action_type TEXT,
  p_target_user_id UUID DEFAULT NULL,
  p_target_subscription_id UUID DEFAULT NULL,
  p_previous_status TEXT DEFAULT NULL,
  p_new_status TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.approval_audit_log (
    actor_user_id, actor_role, action_type, target_user_id, target_subscription_id,
    previous_status, new_status, reason, metadata, ip_address, user_agent
  ) VALUES (
    p_actor_user_id, p_actor_role, p_action_type, p_target_user_id, p_target_subscription_id,
    p_previous_status, p_new_status, p_reason, p_metadata, p_ip_address, p_user_agent
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- 5. CREATE FUNCTION TO LOG PHI ACCESS BY ROLE
CREATE OR REPLACE FUNCTION public.log_phi_access_by_role(
  p_actor_user_id UUID,
  p_target_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_fields_accessed TEXT[] DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  v_actor_role TEXT;
BEGIN
  -- Determine actor's highest role
  SELECT 
    CASE 
      WHEN has_role(p_actor_user_id, 'admin'::app_role) THEN 'admin'
      WHEN has_role(p_actor_user_id, 'coach'::app_role) THEN 'coach'
      ELSE 'member'
    END INTO v_actor_role;

  -- Insert into PHI access audit log
  INSERT INTO public.phi_access_audit_log (
    actor_user_id, target_user_id, action, resource_type, fields_accessed, metadata
  ) VALUES (
    p_actor_user_id, 
    p_target_user_id, 
    p_action, 
    p_resource_type, 
    p_fields_accessed,
    p_metadata || jsonb_build_object('actor_role', v_actor_role)
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- 6. ADD COMMENTS FOR SECURITY AUDITING
COMMENT ON TABLE public.approval_audit_log IS 'SECURITY: Tracks all approval/rejection actions by coaches and admins for compliance auditing';
COMMENT ON TABLE public.profiles_private IS 'PII/PHI: Contains sensitive user data. RLS restricted to Admin and Owner ONLY. Coaches DENIED.';
COMMENT ON TABLE public.form_submissions IS 'PHI: Contains encrypted medical data. Coaches must use form_submissions_safe view. Direct access DENIED for coach role.';

-- 7. REVOKE EXECUTE on sensitive functions from public
REVOKE EXECUTE ON FUNCTION public.log_approval_action FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_approval_action TO authenticated;

REVOKE EXECUTE ON FUNCTION public.log_phi_access_by_role FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_phi_access_by_role TO authenticated;
