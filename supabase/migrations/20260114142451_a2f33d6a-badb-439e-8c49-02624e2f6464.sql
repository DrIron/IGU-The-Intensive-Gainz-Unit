-- Add column to track how coach was assigned
-- This helps admins understand whether the client selected their coach or was auto-matched
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS coach_assignment_method text DEFAULT 'auto'
CHECK (coach_assignment_method IN ('auto', 'preference', 'manual', 'reassigned'));

-- Add column to flag if manual coach assignment is needed
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS needs_coach_assignment boolean DEFAULT false;

COMMENT ON COLUMN public.subscriptions.coach_assignment_method IS 'How the coach was assigned: auto = system matched, preference = client selected, manual = admin assigned, reassigned = changed after initial assignment';
COMMENT ON COLUMN public.subscriptions.needs_coach_assignment IS 'True if no coach could be assigned and manual intervention is needed';