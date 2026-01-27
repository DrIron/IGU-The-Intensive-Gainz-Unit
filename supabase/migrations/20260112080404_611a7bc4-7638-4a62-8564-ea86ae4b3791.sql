-- 1) Create the care_team_role enum
CREATE TYPE public.care_team_role AS ENUM (
  'primary_coach',
  'nutrition',
  'lifestyle',
  'bodybuilding',
  'powerlifting',
  'running',
  'mobility',
  'physiotherapist',
  'other'
);

-- 2) Create the client_care_team table
CREATE TABLE public.client_care_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_role care_team_role NOT NULL DEFAULT 'primary_coach',
  is_primary boolean NOT NULL DEFAULT false,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES public.profiles(id)
);

-- Create indexes for efficient lookups
CREATE INDEX idx_client_care_team_user_id ON public.client_care_team(user_id);
CREATE INDEX idx_client_care_team_subscription_id ON public.client_care_team(subscription_id);
CREATE INDEX idx_client_care_team_staff_user_id ON public.client_care_team(staff_user_id);

-- Partial unique index to ensure only one primary per subscription
CREATE UNIQUE INDEX idx_client_care_team_one_primary_per_subscription 
  ON public.client_care_team(subscription_id) 
  WHERE is_primary = true;

-- Enable RLS
ALTER TABLE public.client_care_team ENABLE ROW LEVEL SECURITY;

-- RLS Policies for SELECT
CREATE POLICY "Clients can view their own care team"
  ON public.client_care_team
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can view care teams they are part of"
  ON public.client_care_team
  FOR SELECT
  USING (auth.uid() = staff_user_id);

CREATE POLICY "Admins can view all care teams"
  ON public.client_care_team
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for INSERT/UPDATE/DELETE (admin only for now)
CREATE POLICY "Admins can insert care team members"
  ON public.client_care_team
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update care team members"
  ON public.client_care_team
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete care team members"
  ON public.client_care_team
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- 3) Add focus_areas column to form_submissions
ALTER TABLE public.form_submissions
  ADD COLUMN focus_areas text[] NULL;