-- Add arms and calfs measurements to weekly_progress table
ALTER TABLE public.weekly_progress
ADD COLUMN arms_cm numeric,
ADD COLUMN calfs_cm numeric;