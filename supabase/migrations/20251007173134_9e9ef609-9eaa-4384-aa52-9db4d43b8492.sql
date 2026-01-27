-- Add columns for TAP recurring subscriptions
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS tap_subscription_status text,
ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;

-- Add index for faster subscription lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_tap_subscription_id ON subscriptions(tap_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

COMMENT ON COLUMN subscriptions.tap_subscription_status IS 'TAP subscription status (active, canceled, etc)';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'Whether subscription will cancel at end of current billing period';
COMMENT ON COLUMN subscriptions.cancelled_at IS 'When the subscription was cancelled';