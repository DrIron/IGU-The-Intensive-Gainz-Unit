
-- ============================================================
-- PHI ACCESS AUDIT LOG: Track all PHI decrypt/view/export events
-- ============================================================

CREATE TABLE IF NOT EXISTS public.phi_access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  target_user_id uuid,
  action text NOT NULL CHECK (action IN ('decrypt', 'view', 'export', 'query', 'bulk_export')),
  resource_type text, -- 'form_submissions', 'profiles_private', etc.
  resource_id uuid,
  fields_accessed text[], -- which PHI fields were accessed
  request_id text, -- edge function request ID for correlation
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_phi_access_audit_actor ON public.phi_access_audit_log(actor_user_id);
CREATE INDEX idx_phi_access_audit_target ON public.phi_access_audit_log(target_user_id);
CREATE INDEX idx_phi_access_audit_occurred ON public.phi_access_audit_log(occurred_at DESC);
CREATE INDEX idx_phi_access_audit_action ON public.phi_access_audit_log(action);

-- RLS: Only admin can read, service_role can insert
ALTER TABLE public.phi_access_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read PHI access audit logs"
  ON public.phi_access_audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert PHI access audit logs"
  ON public.phi_access_audit_log FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Allow admins to insert their own access logs (for client-side logging)
CREATE POLICY "Admins can log their own access"
  ON public.phi_access_audit_log FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') 
    AND actor_user_id = auth.uid()
  );

COMMENT ON TABLE public.phi_access_audit_log IS 
  'HIPAA compliance: Tracks all access to PHI data including decryption, viewing, and export events';

-- ============================================================
-- Function to log PHI access (callable from edge functions)
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_phi_access(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_resource_type text DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_fields_accessed text[] DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.phi_access_audit_log (
    actor_user_id, target_user_id, action, resource_type, resource_id,
    fields_accessed, request_id, ip_address, user_agent, metadata
  ) VALUES (
    p_actor_user_id, p_target_user_id, p_action, p_resource_type, p_resource_id,
    p_fields_accessed, p_request_id, p_ip_address, p_user_agent, p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$function$;

-- Restrict to service_role + admin
REVOKE EXECUTE ON FUNCTION public.log_phi_access FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_phi_access TO service_role;

COMMENT ON FUNCTION public.log_phi_access IS 
  'SECURITY: Logs PHI access events for HIPAA compliance. Service_role only.';

-- ============================================================
-- Enhanced decrypt functions that auto-log access
-- ============================================================

CREATE OR REPLACE FUNCTION public.decrypt_phi_text_logged(
  encrypted_text text,
  p_actor_user_id uuid,
  p_target_user_id uuid DEFAULT NULL,
  p_field_name text DEFAULT 'unknown'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  decrypted_value text;
BEGIN
  IF encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Decrypt
  decrypted_value := extensions.pgp_sym_decrypt(
    decode(encrypted_text, 'base64'),
    get_phi_encryption_key()
  )::text;
  
  -- Log access
  PERFORM log_phi_access(
    p_actor_user_id,
    p_target_user_id,
    'decrypt',
    'form_submissions',
    NULL,
    ARRAY[p_field_name],
    NULL, NULL, NULL,
    jsonb_build_object('function', 'decrypt_phi_text_logged')
  );
  
  RETURN decrypted_value;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$function$;

-- Restrict to service_role only
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_text_logged FROM anon, authenticated;
