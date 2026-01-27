-- Create coach applications table
CREATE TABLE public.coach_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  phone_number TEXT,
  certifications TEXT[],
  years_of_experience INTEGER,
  specializations TEXT[],
  resume_url TEXT,
  motivation TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID,
  notes TEXT
);

-- Enable Row Level Security
ALTER TABLE public.coach_applications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to submit an application
CREATE POLICY "Anyone can submit coach application"
ON public.coach_applications
FOR INSERT
WITH CHECK (true);

-- Only admins can view applications
CREATE POLICY "Admins can view all coach applications"
ON public.coach_applications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'::app_role
  )
);

-- Only admins can update applications
CREATE POLICY "Admins can update coach applications"
ON public.coach_applications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'::app_role
  )
);

-- Create index for faster lookups
CREATE INDEX idx_coach_applications_status ON public.coach_applications(status);
CREATE INDEX idx_coach_applications_email ON public.coach_applications(email);