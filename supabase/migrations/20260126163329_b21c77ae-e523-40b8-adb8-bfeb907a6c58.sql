-- Create function to increment grant usage count
CREATE OR REPLACE FUNCTION public.increment_grant_usage(p_code_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;
  
  -- Increment usage count for matching grant (by user_id or email)
  UPDATE discount_code_grants
  SET uses_count = uses_count + 1
  WHERE code_id = p_code_id
    AND (user_id = p_user_id OR (email IS NOT NULL AND lower(email) = lower(v_user_email)));
END;
$$;

-- Restrict to service_role only
REVOKE EXECUTE ON FUNCTION public.increment_grant_usage(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_grant_usage(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_grant_usage(uuid, uuid) FROM authenticated;