-- Fix permissive INSERT policy on discount_validation_log
-- Edge functions use service_role which bypasses RLS, so we don't need this policy
DROP POLICY IF EXISTS "Service can insert validation logs" ON public.discount_validation_log;

-- Only service_role (edge functions) should insert validation logs
-- No authenticated user INSERT policy needed since service_role bypasses RLS