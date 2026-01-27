-- Alter the check constraint to allow legacy values
ALTER TABLE public.form_submissions_public 
DROP CONSTRAINT IF EXISTS form_submissions_public_coach_preference_type_check;

ALTER TABLE public.form_submissions_public 
ADD CONSTRAINT form_submissions_public_coach_preference_type_check 
CHECK (coach_preference_type IN ('choose', 'auto', 'specific', 'random'));