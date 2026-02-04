-- Ensure coaches can read their own coaches_public row
-- (They need this for the profile page)

-- First check if policy exists, drop if so
DROP POLICY IF EXISTS "coaches_public_coach_read_own" ON public.coaches_public;

-- Allow coaches to read their own coaches_public row
CREATE POLICY "coaches_public_coach_read_own"
ON public.coaches_public
FOR SELECT
TO authenticated
USING (
  coach_id IN (
    SELECT id FROM public.coaches WHERE user_id = auth.uid()
  )
);

-- Allow coaches to update their own coaches_public row
DROP POLICY IF EXISTS "coaches_public_coach_update_own" ON public.coaches_public;

CREATE POLICY "coaches_public_coach_update_own"
ON public.coaches_public
FOR UPDATE
TO authenticated
USING (
  coach_id IN (
    SELECT id FROM public.coaches WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  coach_id IN (
    SELECT id FROM public.coaches WHERE user_id = auth.uid()
  )
);
