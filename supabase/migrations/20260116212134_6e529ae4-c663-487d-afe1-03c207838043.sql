-- Add missing columns to care_team_assignments for scope, permissions, and billing linkage
ALTER TABLE public.care_team_assignments 
ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'write' CHECK (scope IN ('read', 'write')),
ADD COLUMN IF NOT EXISTS is_billable boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS addon_id uuid REFERENCES public.subscription_addons(id) ON DELETE SET NULL;

-- Add index for faster lookups by addon
CREATE INDEX IF NOT EXISTS idx_care_team_assignments_addon_id ON public.care_team_assignments(addon_id);

-- Update RLS policies for care_team_assignments to allow scoped access

-- Drop existing policies first (they may need updating)
DROP POLICY IF EXISTS "Coaches can view their own care team assignments" ON public.care_team_assignments;
DROP POLICY IF EXISTS "Primary coaches can manage client care teams" ON public.care_team_assignments;
DROP POLICY IF EXISTS "Admins can manage all care team assignments" ON public.care_team_assignments;
DROP POLICY IF EXISTS "Clients can view their own care team" ON public.care_team_assignments;

-- Clients can view their own care team
CREATE POLICY "Clients can view their own care team"
ON public.care_team_assignments
FOR SELECT
USING (auth.uid() = client_id);

-- Admins have full access
CREATE POLICY "Admins can manage all care team assignments"
ON public.care_team_assignments
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Coaches can view assignments where they are the staff member
CREATE POLICY "Specialists can view their own assignments"
ON public.care_team_assignments
FOR SELECT
USING (auth.uid() = staff_user_id);

-- Primary coaches can manage care teams for their clients
-- (primary coach is determined from subscriptions.coach_id)
CREATE POLICY "Primary coaches can manage client care teams"
ON public.care_team_assignments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.id = care_team_assignments.subscription_id
    AND s.coach_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.id = care_team_assignments.subscription_id
    AND s.coach_id = auth.uid()
  )
);

-- Create a function to link addon to care team assignment when created
CREATE OR REPLACE FUNCTION public.link_addon_to_care_team()
RETURNS TRIGGER AS $$
BEGIN
  -- When a subscription addon is created, try to link it to the matching care team assignment
  UPDATE care_team_assignments
  SET addon_id = NEW.id, is_billable = true
  WHERE subscription_id = NEW.subscription_id
    AND staff_user_id = NEW.staff_user_id
    AND specialty = NEW.specialty
    AND status = 'active'
    AND addon_id IS NULL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-link addons
DROP TRIGGER IF EXISTS link_addon_to_care_team_trigger ON public.subscription_addons;
CREATE TRIGGER link_addon_to_care_team_trigger
AFTER INSERT ON public.subscription_addons
FOR EACH ROW
EXECUTE FUNCTION public.link_addon_to_care_team();