-- ============================================================
-- Phase 26: Add requested_subroles to coach_applications
-- Stores which subroles an applicant is requesting
-- ============================================================

ALTER TABLE public.coach_applications
  ADD COLUMN IF NOT EXISTS requested_subroles text[] DEFAULT '{}';

-- Add gender column if missing (some applications may not have it)
ALTER TABLE public.coach_applications
  ADD COLUMN IF NOT EXISTS gender text;
