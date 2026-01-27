-- Add steps tracking to nutrition goals
ALTER TABLE public.nutrition_goals 
ADD COLUMN IF NOT EXISTS steps_goal integer;

-- Add steps tracking to weekly progress
ALTER TABLE public.weekly_progress 
ADD COLUMN IF NOT EXISTS daily_steps_avg integer;

COMMENT ON COLUMN public.nutrition_goals.steps_goal IS 'Target daily step count for the nutrition phase';
COMMENT ON COLUMN public.weekly_progress.daily_steps_avg IS 'Average daily steps for the week';