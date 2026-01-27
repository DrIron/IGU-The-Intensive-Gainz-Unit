
-- Fix the overly permissive INSERT policy on approval_audit_log
-- Only allow inserts through the security definer function, not direct inserts
DROP POLICY IF EXISTS "System can insert approval_audit_log" ON public.approval_audit_log;

-- No direct INSERT policy - inserts only via SECURITY DEFINER function log_approval_action
-- The function bypasses RLS due to SECURITY DEFINER

-- Add explicit deny for direct user inserts (defense in depth)
CREATE POLICY "No direct inserts to approval_audit_log"
  ON public.approval_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Revoke direct INSERT from authenticated (function uses service_role context)
REVOKE INSERT ON public.approval_audit_log FROM authenticated;
GRANT INSERT ON public.approval_audit_log TO service_role;
