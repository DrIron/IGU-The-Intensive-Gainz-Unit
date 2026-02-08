-- Create referrals table for tracking client referrals
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL UNIQUE,
  referred_email TEXT,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'converted', 'rewarded', 'expired')),
  reward_type TEXT,
  reward_amount NUMERIC,
  reward_claimed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Users can view their own referrals
CREATE POLICY "Users can view own referrals"
ON public.referrals FOR SELECT
TO authenticated
USING (referrer_user_id = auth.uid());

-- Users can create referrals for themselves
CREATE POLICY "Users can create own referrals"
ON public.referrals FOR INSERT
TO authenticated
WITH CHECK (referrer_user_id = auth.uid());

-- Users can update their own referrals (for claiming rewards)
CREATE POLICY "Users can update own referrals"
ON public.referrals FOR UPDATE
TO authenticated
USING (referrer_user_id = auth.uid())
WITH CHECK (referrer_user_id = auth.uid());

-- Admins can manage all referrals
CREATE POLICY "Admins can manage all referrals"
ON public.referrals FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Function to generate referral codes
CREATE OR REPLACE FUNCTION public.generate_referral_code(first_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  sanitized TEXT;
  random_suffix TEXT;
  new_code TEXT;
  attempts INT := 0;
BEGIN
  -- Sanitize: uppercase, letters only, max 10 chars
  sanitized := UPPER(REGEXP_REPLACE(first_name, '[^a-zA-Z]', '', 'g'));
  sanitized := LEFT(sanitized, 10);

  -- If name is empty after sanitization, use 'IGU'
  IF sanitized = '' THEN
    sanitized := 'IGU';
  END IF;

  -- Generate unique code with random suffix
  LOOP
    random_suffix := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
    new_code := 'IGU-' || sanitized || '-' || random_suffix;

    -- Check if code already exists
    IF NOT EXISTS (SELECT 1 FROM public.referrals WHERE referral_code = new_code) THEN
      RETURN new_code;
    END IF;

    attempts := attempts + 1;
    IF attempts > 10 THEN
      -- Fallback: use UUID prefix
      RETURN 'IGU-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 8));
    END IF;
  END LOOP;
END;
$$;

-- Indexes
CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_user_id);
CREATE INDEX idx_referrals_code ON public.referrals(referral_code);
CREATE INDEX idx_referrals_status ON public.referrals(status);
CREATE INDEX idx_referrals_referred_email ON public.referrals(referred_email);

-- Comment
COMMENT ON TABLE public.referrals IS 'Tracks client referrals for the referral program';
COMMENT ON COLUMN public.referrals.referral_code IS 'Unique referral code in format IGU-NAME-XXXX';
COMMENT ON COLUMN public.referrals.status IS 'pending=unused, signed_up=referred user created account, converted=referred user paid, rewarded=referrer received reward';
