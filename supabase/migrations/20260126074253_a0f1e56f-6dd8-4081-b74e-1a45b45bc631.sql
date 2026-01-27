-- Drop existing coach SELECT policy
DROP POLICY IF EXISTS "Coaches can view client nutrition goals" ON public.nutrition_goals;

-- Simplified policy: Coaches can only SELECT if currently active coach (ended_at IS NULL)
CREATE POLICY "Coaches can view client nutrition goals"
ON public.nutrition_goals
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND public.is_active_coach_for_client(user_id)
);