-- Create pending_discount_applications table for short-lived discount claims
CREATE TABLE public.pending_discount_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_id uuid NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz,
  tap_charge_id text,
  CONSTRAINT unique_pending_per_user_service UNIQUE (user_id, service_id)
);

-- Enable RLS
ALTER TABLE public.pending_discount_applications ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "pending_discount_admin_all"
  ON public.pending_discount_applications FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can view their own pending applications
CREATE POLICY "pending_discount_user_select_own"
  ON public.pending_discount_applications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Revoke from anon
REVOKE ALL ON public.pending_discount_applications FROM anon;

-- Index for fast lookups
CREATE INDEX idx_pending_discount_user_service 
  ON public.pending_discount_applications(user_id, service_id) 
  WHERE consumed_at IS NULL;

CREATE INDEX idx_pending_discount_expires 
  ON public.pending_discount_applications(expires_at) 
  WHERE consumed_at IS NULL;

-- Function to clean up expired pending applications (can be called by cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_discount_applications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM pending_discount_applications
  WHERE expires_at < now() AND consumed_at IS NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Comment for documentation
COMMENT ON TABLE public.pending_discount_applications IS 
'Short-lived records tracking discount code applications before payment. Expires after 15 minutes if not consumed by a successful payment.';