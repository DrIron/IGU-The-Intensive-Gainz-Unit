-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to hash discount codes using pgcrypto (normalize: trim, uppercase)
CREATE OR REPLACE FUNCTION public.discount_code_hash(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.discount_code_hash(text) IS 
'Hashes a discount code using SHA-256 after normalizing (trim + uppercase). Used for secure code lookups.';

-- Drop the old hash-based validation function if it exists
DROP FUNCTION IF EXISTS public.validate_discount_code_hash(text, uuid, uuid);

-- Create the new validation function that takes plaintext code
CREATE OR REPLACE FUNCTION public.validate_discount_code(
  p_code text,
  p_service_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  is_valid boolean,
  code_id uuid,
  percent_off numeric,
  amount_off_kwd numeric,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_hash text;
  v_code_record record;
  v_total_redemptions bigint;
  v_user_redemptions bigint;
  v_grant_exists boolean;
  v_user_email text;
BEGIN
  -- Compute hash from plaintext code
  v_code_hash := public.discount_code_hash(p_code);
  
  -- Look up the code by hash
  SELECT 
    dc.id,
    dc.discount_type,
    dc.discount_value,
    dc.is_active,
    dc.starts_at,
    dc.expires_at,
    dc.service_id,
    dc.max_redemptions AS max_redemptions_total,
    dc.per_user_limit AS max_redemptions_per_user,
    dc.min_price_kwd
  INTO v_code_record
  FROM public.discount_codes dc
  WHERE dc.code_hash = v_code_hash;
  
  -- Code not found
  IF v_code_record.id IS NULL THEN
    RETURN QUERY SELECT 
      false::boolean,
      NULL::uuid,
      NULL::numeric,
      NULL::numeric,
      'Invalid discount code'::text;
    RETURN;
  END IF;
  
  -- Check if active
  IF NOT v_code_record.is_active THEN
    RETURN QUERY SELECT 
      false::boolean,
      v_code_record.id,
      NULL::numeric,
      NULL::numeric,
      'This discount code is no longer active'::text;
    RETURN;
  END IF;
  
  -- Check starts_at
  IF v_code_record.starts_at IS NOT NULL AND now() < v_code_record.starts_at THEN
    RETURN QUERY SELECT 
      false::boolean,
      v_code_record.id,
      NULL::numeric,
      NULL::numeric,
      'This discount code is not yet valid'::text;
    RETURN;
  END IF;
  
  -- Check expires_at
  IF v_code_record.expires_at IS NOT NULL AND now() > v_code_record.expires_at THEN
    RETURN QUERY SELECT 
      false::boolean,
      v_code_record.id,
      NULL::numeric,
      NULL::numeric,
      'This discount code has expired'::text;
    RETURN;
  END IF;
  
  -- Check service restriction
  IF v_code_record.service_id IS NOT NULL AND v_code_record.service_id != p_service_id THEN
    RETURN QUERY SELECT 
      false::boolean,
      v_code_record.id,
      NULL::numeric,
      NULL::numeric,
      'This discount code is not valid for this service'::text;
    RETURN;
  END IF;
  
  -- Check max_redemptions_total
  IF v_code_record.max_redemptions_total IS NOT NULL THEN
    SELECT COUNT(*) INTO v_total_redemptions
    FROM public.discount_redemptions dr
    WHERE dr.discount_code_id = v_code_record.id;
    
    IF v_total_redemptions >= v_code_record.max_redemptions_total THEN
      RETURN QUERY SELECT 
        false::boolean,
        v_code_record.id,
        NULL::numeric,
        NULL::numeric,
        'This discount code has reached its maximum number of uses'::text;
      RETURN;
    END IF;
  END IF;
  
  -- Check max_redemptions_per_user
  IF v_code_record.max_redemptions_per_user IS NOT NULL AND p_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_user_redemptions
    FROM public.discount_redemptions dr
    WHERE dr.discount_code_id = v_code_record.id
      AND dr.user_id = p_user_id;
    
    IF v_user_redemptions >= v_code_record.max_redemptions_per_user THEN
      RETURN QUERY SELECT 
        false::boolean,
        v_code_record.id,
        NULL::numeric,
        NULL::numeric,
        'You have already used this discount code the maximum number of times'::text;
      RETURN;
    END IF;
  END IF;
  
  -- Check grant requirement (user_id or email match)
  -- Get user email from auth.users
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;
  
  SELECT EXISTS (
    SELECT 1 
    FROM public.discount_code_grants dcg
    WHERE dcg.code_id = v_code_record.id
      AND dcg.uses_count < dcg.allowed_uses
      AND (
        dcg.user_id = p_user_id
        OR (dcg.email IS NOT NULL AND lower(dcg.email) = lower(v_user_email))
      )
  ) INTO v_grant_exists;
  
  IF NOT v_grant_exists THEN
    RETURN QUERY SELECT 
      false::boolean,
      v_code_record.id,
      NULL::numeric,
      NULL::numeric,
      'You do not have access to use this discount code'::text;
    RETURN;
  END IF;
  
  -- All validations passed - return success with discount details
  RETURN QUERY SELECT 
    true::boolean,
    v_code_record.id,
    CASE WHEN v_code_record.discount_type = 'percent' THEN v_code_record.discount_value ELSE NULL END,
    CASE WHEN v_code_record.discount_type = 'fixed' THEN v_code_record.discount_value ELSE NULL END,
    'Valid'::text;
END;
$$;

-- Restrict function execution to service_role only (for edge functions)
REVOKE EXECUTE ON FUNCTION public.validate_discount_code(text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_discount_code(text, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_discount_code(text, uuid, uuid) FROM authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.validate_discount_code(text, uuid, uuid) IS 
'Validates a discount code for a user and service. Returns structured result with is_valid, code_id, discount amounts, and reason. Requires grant access.';