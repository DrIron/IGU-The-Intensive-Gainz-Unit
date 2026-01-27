-- Create PHI access audit log table for HIPAA compliance
-- Stores only metadata, NO PHI content
CREATE TABLE IF NOT EXISTS public.phi_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('view_medical_summary', 'view_medical_detail', 'update_medical_data', 'view_client_submission', 'view_parq_responses')),
  target_user_id UUID, -- The client whose data was accessed (no PHI stored)
  target_table TEXT, -- Which table/view was accessed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT, -- Optional for audit trail
  user_agent TEXT -- Optional for audit trail
);

-- Create index for efficient querying
CREATE INDEX idx_phi_access_log_user_id ON public.phi_access_log(user_id);
CREATE INDEX idx_phi_access_log_target_user_id ON public.phi_access_log(target_user_id);
CREATE INDEX idx_phi_access_log_created_at ON public.phi_access_log(created_at DESC);
CREATE INDEX idx_phi_access_log_action_type ON public.phi_access_log(action_type);

-- Enable RLS
ALTER TABLE public.phi_access_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "Admins can view PHI access logs"
  ON public.phi_access_log
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can insert their own access logs
CREATE POLICY "Users can log their own PHI access"
  ON public.phi_access_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add comment for documentation
COMMENT ON TABLE public.phi_access_log IS 'Audit log for PHI/medical data access. Contains NO PHI - only access metadata for HIPAA compliance.';