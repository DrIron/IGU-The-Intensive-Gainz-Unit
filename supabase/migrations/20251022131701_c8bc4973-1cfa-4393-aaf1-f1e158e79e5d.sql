-- Add unique constraint to weekly_progress for upsert operations
ALTER TABLE public.weekly_progress
ADD CONSTRAINT weekly_progress_user_goal_week_unique 
UNIQUE (user_id, goal_id, week_number);