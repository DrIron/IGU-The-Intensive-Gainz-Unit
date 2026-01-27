-- Update nutrition_phases RLS to use tenure-based access (active coach only)
-- Drop existing coach SELECT policy
DROP POLICY IF EXISTS "Coaches can view their clients' nutrition phases" ON public.nutrition_phases;

-- Create new policy: Coaches can only SELECT if currently active coach
CREATE POLICY "Coaches can view their clients' nutrition phases"
ON public.nutrition_phases
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND public.is_active_coach_for_client(user_id)
);

-- Update coach UPDATE policy to also use active relationship check
DROP POLICY IF EXISTS "Coaches can update their clients' nutrition phases" ON public.nutrition_phases;

CREATE POLICY "Coaches can update their clients' nutrition phases"
ON public.nutrition_phases
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND public.is_active_coach_for_client(user_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND public.is_active_coach_for_client(user_id)
  )
);

-- Update coach INSERT policy to also use active relationship check
DROP POLICY IF EXISTS "Coaches can create nutrition phases for their clients" ON public.nutrition_phases;

CREATE POLICY "Coaches can create nutrition phases for their clients"
ON public.nutrition_phases
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND public.is_active_coach_for_client(user_id)
  )
);