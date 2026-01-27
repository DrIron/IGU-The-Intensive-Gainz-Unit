-- Create discount_applies_to enum
CREATE TYPE public.discount_applies_to AS ENUM ('first_payment', 'all_payments', 'limited_payments');

-- Create discount_codes table
CREATE TABLE public.discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC NOT NULL CHECK (discount_value >= 0),
  applies_to public.discount_applies_to NOT NULL,
  max_cycles INTEGER CHECK (max_cycles > 0),
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  max_redemptions INTEGER CHECK (max_redemptions > 0),
  per_user_limit INTEGER CHECK (per_user_limit > 0),
  min_price_kwd NUMERIC CHECK (min_price_kwd >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_max_cycles CHECK (
    (applies_to = 'limited_payments' AND max_cycles IS NOT NULL) OR 
    (applies_to != 'limited_payments')
  )
);

-- Enable RLS on discount_codes
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage discount codes"
ON public.discount_codes
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create discount_redemptions table
CREATE TABLE public.discount_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id UUID NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL CHECK (cycle_number >= 0),
  amount_before_kwd NUMERIC NOT NULL,
  amount_after_kwd NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on discount_redemptions
ALTER TABLE public.discount_redemptions ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage all redemptions
CREATE POLICY "Admins can view all discount redemptions"
ON public.discount_redemptions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert discount redemptions"
ON public.discount_redemptions
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own redemptions
CREATE POLICY "Users can view their own discount redemptions"
ON public.discount_redemptions
FOR SELECT
USING (auth.uid() = user_id);

-- Extend subscriptions table
ALTER TABLE public.subscriptions
ADD COLUMN base_price_kwd NUMERIC,
ADD COLUMN billing_amount_kwd NUMERIC,
ADD COLUMN discount_code_id UUID REFERENCES public.discount_codes(id) ON DELETE SET NULL,
ADD COLUMN discount_cycles_used INTEGER NOT NULL DEFAULT 0;

-- Add index for performance
CREATE INDEX idx_discount_codes_code ON public.discount_codes(UPPER(code));
CREATE INDEX idx_discount_redemptions_code ON public.discount_redemptions(discount_code_id);
CREATE INDEX idx_discount_redemptions_user ON public.discount_redemptions(user_id);
CREATE INDEX idx_subscriptions_discount_code ON public.subscriptions(discount_code_id);