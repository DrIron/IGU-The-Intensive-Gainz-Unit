-- ============================================
-- Phase 4: Enhanced Coach Application + Interview Pipeline
-- ============================================
-- Extends coach_applications with structured fields and interview tracking.
-- Adds new status values: interview_scheduled, interview_completed.

-- New columns for enhanced application form
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS coaching_modality TEXT
  CHECK (coaching_modality IN ('online', 'in_person', 'hybrid'));
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS current_client_count INTEGER DEFAULT 0;
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 20;
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS credentials_json JSONB DEFAULT '[]';
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS coaching_philosophy TEXT;
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS evidence_based_approach TEXT;

-- Interview tracking columns
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS interview_scheduled_at TIMESTAMPTZ;
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS interview_zoom_link TEXT;
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS interview_completed_at TIMESTAMPTZ;
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS interview_notes TEXT;

-- Update status constraint to include interview states
-- First find and drop the existing constraint
DO $$
BEGIN
  -- Drop all CHECK constraints on the status column
  EXECUTE (
    SELECT string_agg('ALTER TABLE public.coach_applications DROP CONSTRAINT ' || conname || ';', ' ')
    FROM pg_constraint
    WHERE conrelid = 'public.coach_applications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  );
EXCEPTION WHEN OTHERS THEN
  -- No constraint found, that's fine
  NULL;
END;
$$;

-- Add updated constraint with interview statuses
ALTER TABLE public.coach_applications
  ADD CONSTRAINT coach_applications_status_check
  CHECK (status IN ('pending', 'interview_scheduled', 'interview_completed', 'approved', 'rejected'));
