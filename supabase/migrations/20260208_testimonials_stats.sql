-- Add stats columns to testimonials for displaying transformation metrics
ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS weight_change_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS duration_weeks INTEGER,
  ADD COLUMN IF NOT EXISTS goal_type TEXT;

-- Add comment explaining the columns
COMMENT ON COLUMN public.testimonials.weight_change_kg IS 'Weight change in kg (positive for gain, negative for loss)';
COMMENT ON COLUMN public.testimonials.duration_weeks IS 'Number of weeks in the program';
COMMENT ON COLUMN public.testimonials.goal_type IS 'Primary goal: fat_loss, muscle_gain, strength, performance, etc.';
