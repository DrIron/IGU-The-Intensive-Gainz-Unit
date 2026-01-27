-- Create billing_mode enum for subscriptions
CREATE TYPE billing_mode AS ENUM ('manual', 'recurring');

-- Create payment_status enum for payment tracking
CREATE TYPE payment_status AS ENUM ('initiated', 'paid', 'failed', 'cancelled');

-- Add billing lifecycle columns to subscriptions
ALTER TABLE subscriptions 
  ADD COLUMN IF NOT EXISTS billing_mode billing_mode NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 7;

-- Create subscription_payments table to log all TAP charges
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tap_charge_id TEXT NOT NULL,
  amount_kwd NUMERIC NOT NULL,
  status payment_status NOT NULL DEFAULT 'initiated',
  is_renewal BOOLEAN NOT NULL DEFAULT false,
  billing_period_start DATE,
  billing_period_end DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  paid_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index for efficient lookups
CREATE INDEX idx_subscription_payments_subscription_id ON subscription_payments(subscription_id);
CREATE INDEX idx_subscription_payments_user_id ON subscription_payments(user_id);
CREATE INDEX idx_subscription_payments_tap_charge_id ON subscription_payments(tap_charge_id);
CREATE INDEX idx_subscription_payments_status ON subscription_payments(status);
CREATE INDEX idx_subscription_payments_created_at ON subscription_payments(created_at DESC);

-- Add unique constraint on tap_charge_id to prevent duplicate processing
CREATE UNIQUE INDEX idx_subscription_payments_tap_charge_unique ON subscription_payments(tap_charge_id);

-- Enable RLS on subscription_payments
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_payments

-- Admins can view all payments
CREATE POLICY "Admins can view all subscription payments"
ON subscription_payments FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert payments (from edge functions via service role)
CREATE POLICY "Admins can insert subscription payments"
ON subscription_payments FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update payments
CREATE POLICY "Admins can update subscription payments"
ON subscription_payments FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own payments
CREATE POLICY "Users can view their own subscription payments"
ON subscription_payments FOR SELECT
USING (auth.uid() = user_id);

-- Coaches can view their clients' payments
CREATE POLICY "Coaches can view client subscription payments"
ON subscription_payments FOR SELECT
USING (
  has_role(auth.uid(), 'coach'::app_role) AND
  EXISTS (
    SELECT 1 FROM subscriptions s 
    WHERE s.id = subscription_payments.subscription_id 
    AND s.coach_id = auth.uid()
  )
);

-- Update existing active subscriptions to use manual billing mode
-- (Already defaulted to 'manual', this just ensures consistency)
COMMENT ON COLUMN subscriptions.billing_mode IS 'Payment model: manual requires user action each cycle, recurring uses saved card';
COMMENT ON COLUMN subscriptions.past_due_since IS 'Timestamp when subscription became past due (null if current)';
COMMENT ON COLUMN subscriptions.grace_period_days IS 'Days allowed after next_billing_date before marking inactive';
COMMENT ON TABLE subscription_payments IS 'Audit log of all TAP payment attempts and their outcomes';