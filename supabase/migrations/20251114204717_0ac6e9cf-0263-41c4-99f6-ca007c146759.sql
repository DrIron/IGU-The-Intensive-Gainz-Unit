-- Add payment_agreement_id and card_id columns to subscriptions table for Tap recurring payments
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS tap_payment_agreement_id TEXT,
ADD COLUMN IF NOT EXISTS tap_card_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_agreement 
ON public.subscriptions(tap_payment_agreement_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_card_id 
ON public.subscriptions(tap_card_id);

-- Add comment explaining the columns
COMMENT ON COLUMN public.subscriptions.tap_payment_agreement_id IS 'Tap Payment Agreement ID required for recurring non-3DS transactions';
COMMENT ON COLUMN public.subscriptions.tap_card_id IS 'Tap Card ID for generating tokens for recurring payments';