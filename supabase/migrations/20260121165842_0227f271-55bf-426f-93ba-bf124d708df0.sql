-- Security hardening: Remove coach access to profiles_legacy (contains PII)
-- Coaches must use profiles_public for non-sensitive data only

-- Drop the coach SELECT policy (exposes PII to coaches)
DROP POLICY IF EXISTS "Coaches can view assigned clients' profiles" ON public.profiles_legacy;

-- Drop the coach UPDATE policy (allows coaches to modify PII)
DROP POLICY IF EXISTS "Coaches can update their assigned clients' profiles" ON public.profiles_legacy;

-- Verify remaining policies are correct:
-- 1. "Admins can view all profiles" - SELECT - has_role(auth.uid(), 'admin') ✓
-- 2. "Admins can update all profiles" - UPDATE - has_role(auth.uid(), 'admin') ✓  
-- 3. "Users can view their own profile" - SELECT - auth.uid() = id ✓
-- 4. "Users can update their own profile" - UPDATE - auth.uid() = id ✓

-- Add comment documenting security decision
COMMENT ON TABLE public.profiles_legacy IS 'Legacy compatibility table containing PII (email, phone, DOB, full_name). Coaches MUST NOT have access. Use profiles_public for coach-facing queries.';