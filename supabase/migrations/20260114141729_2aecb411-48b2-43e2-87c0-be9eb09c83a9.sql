-- Add coach preference fields to form_submissions table
-- coach_preference_type: 'auto' (recommended) or 'specific' (user selected a coach)
-- requested_coach_id: nullable UUID referencing the coach the user selected (when preference is 'specific')

-- First, add the coach_preference_type column
ALTER TABLE public.form_submissions
ADD COLUMN IF NOT EXISTS coach_preference_type text DEFAULT 'auto'
CHECK (coach_preference_type IN ('auto', 'specific'));

-- Add requested_coach_id column (separate from preferred_coach_id which will be deprecated)
-- This stores the coach the user specifically requested during onboarding
ALTER TABLE public.form_submissions
ADD COLUMN IF NOT EXISTS requested_coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL;

-- Add comment to clarify the purpose
COMMENT ON COLUMN public.form_submissions.coach_preference_type IS 'auto = system matches best coach; specific = user selected a coach';
COMMENT ON COLUMN public.form_submissions.requested_coach_id IS 'The coach ID the user selected when coach_preference_type is specific';