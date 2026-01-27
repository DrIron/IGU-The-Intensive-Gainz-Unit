-- Drop the existing policy
DROP POLICY IF EXISTS "Coaches can update their assigned clients' profiles" ON public.profiles;

-- Create improved policy with WITH CHECK clause
CREATE POLICY "Coaches can update their assigned clients' profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  id IN (
    SELECT subscriptions.user_id
    FROM subscriptions
    WHERE subscriptions.coach_id = auth.uid()
  )
)
WITH CHECK (
  id IN (
    SELECT subscriptions.user_id
    FROM subscriptions
    WHERE subscriptions.coach_id = auth.uid()
  )
);