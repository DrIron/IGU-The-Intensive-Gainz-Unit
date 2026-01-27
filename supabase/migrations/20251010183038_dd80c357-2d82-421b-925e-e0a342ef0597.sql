-- Add status column to coaches table
ALTER TABLE public.coaches 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'old'));

-- Create index for faster status lookups
CREATE INDEX IF NOT EXISTS idx_coaches_status ON public.coaches(status);

-- Update existing coaches to active status
UPDATE public.coaches SET status = 'active' WHERE status IS NULL OR status = 'pending';