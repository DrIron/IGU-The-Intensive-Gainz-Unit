-- Create payment_webhook_events table for audit logging
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'tap_webhook',
  raw_payload jsonb NOT NULL,
  verified_with_tap boolean NOT NULL DEFAULT false,
  tap_charge_id text,
  tap_status text,
  expected_amount_kwd numeric,
  actual_amount numeric,
  actual_currency text,
  subscription_id uuid REFERENCES public.subscriptions(id),
  user_id uuid,
  verification_result text NOT NULL, -- 'verified', 'amount_mismatch', 'currency_mismatch', 'subscription_not_found', 'tap_verification_failed', 'unsigned_rejected', 'invalid_metadata'
  processing_result text, -- 'activated', 'already_active', 'ignored', 'failed'
  error_details text,
  ip_address text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- Admin-only access for audit logs
CREATE POLICY "Admin can view webhook events"
  ON public.payment_webhook_events
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert (from edge functions)
-- No authenticated insert policy - only service_role can insert

-- Create index for efficient lookups
CREATE INDEX idx_payment_webhook_events_charge_id ON public.payment_webhook_events(tap_charge_id);
CREATE INDEX idx_payment_webhook_events_received_at ON public.payment_webhook_events(received_at DESC);
CREATE INDEX idx_payment_webhook_events_verification ON public.payment_webhook_events(verification_result);

-- Add comment for documentation
COMMENT ON TABLE public.payment_webhook_events IS 'Audit log for all incoming payment webhooks with verification status. Used for security monitoring and debugging.';
COMMENT ON COLUMN public.payment_webhook_events.verification_result IS 'Result of TAP API verification: verified, amount_mismatch, currency_mismatch, subscription_not_found, tap_verification_failed, unsigned_rejected, invalid_metadata';
COMMENT ON COLUMN public.payment_webhook_events.processing_result IS 'Result of payment processing: activated, already_active, ignored, failed';