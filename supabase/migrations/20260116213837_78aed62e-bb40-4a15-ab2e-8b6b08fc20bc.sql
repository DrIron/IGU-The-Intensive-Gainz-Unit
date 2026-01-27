-- Add last_assigned_at column to coaches table for round-robin fairness in assignment
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ;

-- Add a comment explaining the column
COMMENT ON COLUMN public.coaches.last_assigned_at IS 'Timestamp of when this coach was last assigned a new client. Used for round-robin fairness in auto-assignment.';