-- Create staff_specialty enum
CREATE TYPE public.staff_specialty AS ENUM (
  'nutrition',
  'lifestyle',
  'bodybuilding',
  'powerlifting',
  'running',
  'calisthenics',
  'mobility',
  'physiotherapy'
);

-- Add specialties array to coaches table
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS specialties staff_specialty[] DEFAULT '{}';

-- Create care_team_assignments table
CREATE TABLE public.care_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  specialty staff_specialty NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'removed')),
  added_by uuid REFERENCES public.profiles(id),
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  removed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create partial unique index to prevent duplicate active assignments
CREATE UNIQUE INDEX care_team_unique_active_assignment 
ON public.care_team_assignments (client_id, staff_user_id, specialty) 
WHERE status = 'active';

-- Create indexes for performance
CREATE INDEX care_team_client_idx ON public.care_team_assignments(client_id);
CREATE INDEX care_team_staff_idx ON public.care_team_assignments(staff_user_id);
CREATE INDEX care_team_subscription_idx ON public.care_team_assignments(subscription_id);
CREATE INDEX care_team_status_idx ON public.care_team_assignments(status);

-- Enable RLS
ALTER TABLE public.care_team_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for care_team_assignments

-- Admins can do everything
CREATE POLICY "Admins can manage all care team assignments"
ON public.care_team_assignments
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Primary coaches can view and manage care team for their clients
CREATE POLICY "Primary coaches can view care team for their clients"
ON public.care_team_assignments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = care_team_assignments.subscription_id
    AND s.coach_id = auth.uid()
  )
);

CREATE POLICY "Primary coaches can insert care team members for their clients"
ON public.care_team_assignments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = care_team_assignments.subscription_id
    AND s.coach_id = auth.uid()
  )
);

CREATE POLICY "Primary coaches can update care team for their clients"
ON public.care_team_assignments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = care_team_assignments.subscription_id
    AND s.coach_id = auth.uid()
  )
);

-- Care team members can view their own assignments
CREATE POLICY "Staff can view their own assignments"
ON public.care_team_assignments
FOR SELECT
USING (staff_user_id = auth.uid() AND status = 'active');

-- Clients can view their own care team
CREATE POLICY "Clients can view their own care team"
ON public.care_team_assignments
FOR SELECT
USING (client_id = auth.uid());

-- Create trigger for updated_at
CREATE TRIGGER update_care_team_assignments_updated_at
BEFORE UPDATE ON public.care_team_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();