-- ============================================================
-- Migration: Extend Existing Tables
-- Phase 22: IGU Nutrition System Enhancement
--
-- Add new columns to existing nutrition tables
-- ============================================================

-- ============================================================
-- Extend nutrition_phases table
-- ============================================================

-- Add fiber tracking
ALTER TABLE public.nutrition_phases
ADD COLUMN IF NOT EXISTS fiber_grams numeric;

-- Add steps target (observational - does NOT affect calorie math)
-- This is a reference for what was recommended at phase creation
ALTER TABLE public.nutrition_phases
ADD COLUMN IF NOT EXISTS steps_target integer;

-- ============================================================
-- Extend nutrition_goals table (Team Plan version)
-- ============================================================

-- Track which coach created this goal (for Team Plans where coach changes)
ALTER TABLE public.nutrition_goals
ADD COLUMN IF NOT EXISTS coach_id_at_creation uuid REFERENCES auth.users(id);

-- ============================================================
-- Extend nutrition_adjustments table
-- ============================================================

-- Add status for the tolerance band system:
-- - 'no_change': within ±100 kcal (don't bother)
-- - 'pending': needs approval
-- - 'approved': adjustment applied
-- - 'rejected': coach rejected
-- - 'flag_review': > 20% adjustment, flagged for review but allowed

-- First, update the check constraint to include new statuses
-- Note: We need to drop and recreate the constraint
DO $$
BEGIN
  -- Check if the constraint exists and drop it
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nutrition_adjustments_status_check'
  ) THEN
    ALTER TABLE public.nutrition_adjustments
    DROP CONSTRAINT nutrition_adjustments_status_check;
  END IF;
END $$;

ALTER TABLE public.nutrition_adjustments
ADD CONSTRAINT nutrition_adjustments_status_check
CHECK (status IN ('pending', 'approved', 'rejected', 'no_change', 'flag_review'));

-- Add column to track if this adjustment was flagged (> 20% change)
ALTER TABLE public.nutrition_adjustments
ADD COLUMN IF NOT EXISTS is_flagged boolean DEFAULT false;

-- Add column for flag reason
ALTER TABLE public.nutrition_adjustments
ADD COLUMN IF NOT EXISTS flag_reason text;

-- Add approved/rejected by dietitian (if applicable)
ALTER TABLE public.nutrition_adjustments
ADD COLUMN IF NOT EXISTS reviewed_by_dietitian_id uuid REFERENCES auth.users(id);

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON COLUMN public.nutrition_phases.fiber_grams IS 'Daily fiber target in grams';
COMMENT ON COLUMN public.nutrition_phases.steps_target IS 'Recommended daily steps at phase creation - observational only, does not affect calorie math';
COMMENT ON COLUMN public.nutrition_goals.coach_id_at_creation IS 'Coach who originally created this goal (for Team Plans where coach may change)';
COMMENT ON COLUMN public.nutrition_adjustments.is_flagged IS 'True if adjustment > 20% of current calories - flagged for human review';
COMMENT ON COLUMN public.nutrition_adjustments.flag_reason IS 'Why this adjustment was flagged (e.g., "Adjustment of -450 kcal is 25% of current intake")';
COMMENT ON COLUMN public.nutrition_adjustments.reviewed_by_dietitian_id IS 'If dietitian reviewed/approved this adjustment (when client has dietitian assigned)';
