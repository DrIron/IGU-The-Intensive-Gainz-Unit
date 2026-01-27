-- Enable RLS on nutrition_goals
ALTER TABLE public.nutrition_goals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own nutrition goals" ON public.nutrition_goals;
DROP POLICY IF EXISTS "Users can insert own nutrition goals" ON public.nutrition_goals;
DROP POLICY IF EXISTS "Users can update own nutrition goals" ON public.nutrition_goals;
DROP POLICY IF EXISTS "Users can delete own nutrition goals" ON public.nutrition_goals;
DROP POLICY IF EXISTS "Admins full access nutrition goals" ON public.nutrition_goals;
DROP POLICY IF EXISTS "Coaches can view client nutrition goals" ON public.nutrition_goals;

-- Helper function: Check if caller is currently an active coach for a client
CREATE OR REPLACE FUNCTION public.is_active_coach_for_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_client_relationships
    WHERE coach_id = auth.uid()
      AND client_id = p_client_id
      AND ended_at IS NULL
  )
$$;

-- Helper function: Check if caller was the coach during record creation
CREATE OR REPLACE FUNCTION public.was_coach_during_record(
  p_client_id uuid,
  p_record_created_at timestamptz,
  p_coach_id_at_creation uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    -- Must be the coach who was assigned when record was created
    p_coach_id_at_creation = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.coach_client_relationships
      WHERE coach_id = auth.uid()
        AND client_id = p_client_id
        AND started_at <= p_record_created_at
        AND (ended_at IS NULL OR ended_at >= p_record_created_at)
    )
$$;

-- Policy: Clients can SELECT their own nutrition goals
CREATE POLICY "Clients can view own nutrition goals"
ON public.nutrition_goals
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Clients can INSERT their own nutrition goals
CREATE POLICY "Clients can insert own nutrition goals"
ON public.nutrition_goals
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Clients can UPDATE their own nutrition goals
CREATE POLICY "Clients can update own nutrition goals"
ON public.nutrition_goals
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Clients can DELETE their own nutrition goals
CREATE POLICY "Clients can delete own nutrition goals"
ON public.nutrition_goals
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Admins have full access
CREATE POLICY "Admins full access to nutrition goals"
ON public.nutrition_goals
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: Coaches can SELECT client nutrition goals (time-based)
-- Allowed if: currently active coach OR was coach during record creation
CREATE POLICY "Coaches can view client nutrition goals"
ON public.nutrition_goals
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND (
    public.is_active_coach_for_client(user_id)
    OR public.was_coach_during_record(user_id, created_at, coach_id_at_creation)
  )
);

-- Coaches should NOT edit historical body metrics (recommended approach)
-- No UPDATE policy for coaches on nutrition_goals

-- Add comments for documentation
COMMENT ON FUNCTION public.is_active_coach_for_client(uuid) IS 'Returns true if the authenticated user is currently an active coach for the specified client (relationship not ended).';
COMMENT ON FUNCTION public.was_coach_during_record(uuid, timestamptz, uuid) IS 'Returns true if the authenticated user was the assigned coach when the record was created and had an active relationship during that time.';