-- Add coach seat limits to coaches table
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS max_onetoone_clients INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS max_team_clients INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.coaches.max_onetoone_clients IS 'Maximum number of 1:1 clients this coach can have (null = unlimited)';
COMMENT ON COLUMN public.coaches.max_team_clients IS 'Maximum number of team plan clients this coach can have (null = unlimited)';

-- Add birthdate column to onboarding form submissions
ALTER TABLE public.form_submissions 
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Update profiles to ensure first_name, last_name, date_of_birth are properly set
-- (Already done in previous migration)