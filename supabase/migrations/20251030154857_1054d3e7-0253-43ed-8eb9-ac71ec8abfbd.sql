-- Add steps tracking to nutrition phases (1:1 client nutrition)
ALTER TABLE public.nutrition_phases 
ADD COLUMN IF NOT EXISTS steps_goal integer;

COMMENT ON COLUMN public.nutrition_phases.steps_goal IS 'Target daily step count for the nutrition phase';