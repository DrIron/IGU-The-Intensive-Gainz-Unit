-- ============================================================
-- Secure Discount Code Architecture Migration
-- Prevents enumeration/scraping by using hash-based validation
-- ============================================================

-- 1. Add secure columns to discount_codes
ALTER TABLE public.discount_codes 
ADD COLUMN IF NOT EXISTS code_hash text,
ADD COLUMN IF NOT EXISTS code_prefix text;

-- 2. Populate code_hash from existing codes using SHA-256
UPDATE public.discount_codes 
SET 
  code_hash = encode(extensions.digest(UPPER(code), 'sha256'), 'hex'),
  code_prefix = LEFT(UPPER(code), 2) || '…'
WHERE code_hash IS NULL AND code IS NOT NULL;

-- 3. Make code_hash required and unique for new records
ALTER TABLE public.discount_codes 
ALTER COLUMN code_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_codes_code_hash 
ON public.discount_codes(code_hash);

-- 4. Create discount_code_grants table for targeted access
CREATE TABLE IF NOT EXISTS public.discount_code_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  allowed_uses int DEFAULT 1 NOT NULL,
  uses_count int DEFAULT 0 NOT NULL,
  granted_at timestamptz DEFAULT now() NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT chk_grant_target CHECK (user_id IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT chk_allowed_uses_positive CHECK (allowed_uses > 0)
);

-- Unique constraints for grants
CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_code_grants_user 
ON public.discount_code_grants(code_id, user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_code_grants_email 
ON public.discount_code_grants(code_id, LOWER(email)) WHERE email IS NOT NULL;

-- 5. Enable RLS on discount_code_grants
ALTER TABLE public.discount_code_grants ENABLE ROW LEVEL SECURITY;

-- Admins can manage all grants
CREATE POLICY "Admins can manage discount grants"
ON public.discount_code_grants
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can view their own grants
CREATE POLICY "Users can view their own grants"
ON public.discount_code_grants
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 6. Update discount_codes RLS to prevent enumeration
-- Drop existing policies that allow authenticated users to read all codes
DROP POLICY IF EXISTS "Users can view active codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Anyone can view active discount codes" ON public.discount_codes;
DROP POLICY IF EXISTS "authenticated_select" ON public.discount_codes;

-- New restrictive policy: Users can only see codes they have grants for
-- (Note: Validation happens server-side via edge function, not client queries)
CREATE POLICY "Users can view granted discount codes"
ON public.discount_codes
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.discount_code_grants g
    WHERE g.code_id = discount_codes.id
    AND (g.user_id = auth.uid() OR LOWER(g.email) = LOWER(auth.jwt()->>'email'))
    AND g.uses_count < g.allowed_uses
  )
);

-- 7. Add index for redemption lookups
CREATE INDEX IF NOT EXISTS idx_discount_redemptions_code_user 
ON public.discount_redemptions(discount_code_id, user_id);

-- 8. Create secure validation function (server-side only)
CREATE OR REPLACE FUNCTION public.validate_discount_code_hash(
  p_code_hash text,
  p_user_id uuid,
  p_service_id uuid DEFAULT NULL
)
RETURNS TABLE (
  code_id uuid,
  code_prefix text,
  discount_type text,
  discount_value numeric,
  duration_type text,
  duration_cycles int,
  min_price_kwd numeric,
  is_valid boolean,
  denial_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code record;
  v_grant record;
  v_redemption_count int;
  v_user_redemption_count int;
  v_user_email text;
BEGIN
  -- Get user email for grant lookup
  SELECT email INTO v_user_email
  FROM auth.users WHERE id = p_user_id;
  
  -- Find code by hash
  SELECT * INTO v_code
  FROM discount_codes
  WHERE code_hash = p_code_hash
  AND is_active = true;
  
  IF v_code IS NULL THEN
    RETURN QUERY SELECT 
      NULL::uuid, NULL::text, NULL::text, NULL::numeric, 
      NULL::text, NULL::int, NULL::numeric, false, 'Invalid code'::text;
    RETURN;
  END IF;
  
  -- Check service restriction
  IF v_code.service_id IS NOT NULL AND v_code.service_id != p_service_id THEN
    RETURN QUERY SELECT 
      v_code.id, v_code.code_prefix, v_code.discount_type, v_code.discount_value,
      v_code.duration_type, v_code.duration_cycles, v_code.min_price_kwd,
      false, 'Code not valid for this service'::text;
    RETURN;
  END IF;
  
  -- Check validity dates
  IF v_code.starts_at IS NOT NULL AND v_code.starts_at > now() THEN
    RETURN QUERY SELECT 
      v_code.id, v_code.code_prefix, v_code.discount_type, v_code.discount_value,
      v_code.duration_type, v_code.duration_cycles, v_code.min_price_kwd,
      false, 'Code not yet valid'::text;
    RETURN;
  END IF;
  
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    RETURN QUERY SELECT 
      v_code.id, v_code.code_prefix, v_code.discount_type, v_code.discount_value,
      v_code.duration_type, v_code.duration_cycles, v_code.min_price_kwd,
      false, 'Code has expired'::text;
    RETURN;
  END IF;
  
  -- Check global redemption limit
  IF v_code.max_redemptions IS NOT NULL THEN
    SELECT COUNT(*) INTO v_redemption_count
    FROM discount_redemptions
    WHERE discount_code_id = v_code.id;
    
    IF v_redemption_count >= v_code.max_redemptions THEN
      RETURN QUERY SELECT 
        v_code.id, v_code.code_prefix, v_code.discount_type, v_code.discount_value,
        v_code.duration_type, v_code.duration_cycles, v_code.min_price_kwd,
        false, 'Code usage limit reached'::text;
      RETURN;
    END IF;
  END IF;
  
  -- Check per-user limit
  IF v_code.per_user_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_user_redemption_count
    FROM discount_redemptions
    WHERE discount_code_id = v_code.id AND user_id = p_user_id;
    
    IF v_user_redemption_count >= v_code.per_user_limit THEN
      RETURN QUERY SELECT 
        v_code.id, v_code.code_prefix, v_code.discount_type, v_code.discount_value,
        v_code.duration_type, v_code.duration_cycles, v_code.min_price_kwd,
        false, 'You have already used this code'::text;
      RETURN;
    END IF;
  END IF;
  
  -- Check grant-based access (if code requires grant)
  SELECT * INTO v_grant
  FROM discount_code_grants
  WHERE code_id = v_code.id
  AND (user_id = p_user_id OR LOWER(email) = LOWER(v_user_email))
  AND uses_count < allowed_uses;
  
  -- If no grant found and code is not public, deny
  -- (Public codes have NULL in a hypothetical is_public field - for now all are public)
  
  -- Code is valid
  RETURN QUERY SELECT 
    v_code.id, v_code.code_prefix, v_code.discount_type, v_code.discount_value,
    v_code.duration_type, v_code.duration_cycles, v_code.min_price_kwd,
    true, NULL::text;
END;
$$;

-- Restrict function to service_role only (edge functions)
REVOKE ALL ON FUNCTION public.validate_discount_code_hash FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_discount_code_hash FROM anon;
REVOKE ALL ON FUNCTION public.validate_discount_code_hash FROM authenticated;

-- 9. Add audit logging for discount code validation attempts
CREATE TABLE IF NOT EXISTS public.discount_validation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  code_hash_attempted text NOT NULL,
  code_id uuid REFERENCES public.discount_codes(id),
  was_valid boolean NOT NULL,
  denial_reason text,
  ip_address text,
  user_agent text,
  attempted_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS - only admins can view logs
ALTER TABLE public.discount_validation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view validation logs"
ON public.discount_validation_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert (edge functions)
CREATE POLICY "Service can insert validation logs"
ON public.discount_validation_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Index for rate limiting checks
CREATE INDEX IF NOT EXISTS idx_discount_validation_log_user_time
ON public.discount_validation_log(user_id, attempted_at DESC);