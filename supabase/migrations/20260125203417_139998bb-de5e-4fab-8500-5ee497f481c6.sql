-- ============================================================
-- SECURITY FIX: Restrict team_plan_settings to authenticated users
-- Previously allowed public read with condition "true"
-- ============================================================

-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Anyone can view team plan settings" ON public.team_plan_settings;

-- Create new policy: authenticated users only
CREATE POLICY "Team plan settings viewable by authenticated users"
ON public.team_plan_settings
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Ensure RLS is enabled
ALTER TABLE public.team_plan_settings ENABLE ROW LEVEL SECURITY;

-- Add security comment
COMMENT ON TABLE public.team_plan_settings IS 
'SECURITY: Team plan configuration (start dates, announcements). 
RLS: SELECT restricted to authenticated users only. 
Anonymous users blocked from viewing program dates.';