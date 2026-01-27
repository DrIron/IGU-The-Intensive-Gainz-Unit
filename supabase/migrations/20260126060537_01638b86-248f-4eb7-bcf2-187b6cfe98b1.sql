-- Create payment_events table for replay protection and idempotency
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'tap',
  provider_event_id text, -- Webhook event ID from provider if available
  charge_id text NOT NULL,
  status text NOT NULL, -- CAPTURED, FAILED, DECLINED, CANCELLED, INITIATED, etc.
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload_json jsonb, -- Raw webhook/request payload
  verified_json jsonb, -- Verified data from provider API
  processed_at timestamptz, -- When we actually processed this event
  processing_result text, -- 'activated', 'already_active', 'failed', 'ignored', 'skipped_duplicate'
  source text NOT NULL DEFAULT 'webhook', -- 'webhook' or 'verify_payment'
  user_id uuid,
  subscription_id uuid REFERENCES public.subscriptions(id),
  amount numeric,
  currency text,
  error_details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint to prevent duplicate processing
-- A charge_id + status combination should only be processed once
CREATE UNIQUE INDEX idx_payment_events_idempotency 
  ON public.payment_events(provider, charge_id, status);

-- Index for provider_event_id lookups (if provider sends event IDs)
CREATE INDEX idx_payment_events_provider_event 
  ON public.payment_events(provider, provider_event_id) 
  WHERE provider_event_id IS NOT NULL;

-- Index for charge lookups
CREATE INDEX idx_payment_events_charge_id ON public.payment_events(charge_id);

-- Index for time-based queries
CREATE INDEX idx_payment_events_occurred_at ON public.payment_events(occurred_at DESC);

-- Enable RLS
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Admin-only read access
CREATE POLICY "Admin can view payment events"
  ON public.payment_events
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No authenticated insert - only service_role can insert from edge functions

-- Documentation
COMMENT ON TABLE public.payment_events IS 'Idempotent payment event log for replay protection. Each (provider, charge_id, status) tuple is processed exactly once.';
COMMENT ON COLUMN public.payment_events.provider_event_id IS 'Unique event ID from payment provider webhook if available';
COMMENT ON COLUMN public.payment_events.processing_result IS 'Result: activated, already_active, failed, ignored, skipped_duplicate';