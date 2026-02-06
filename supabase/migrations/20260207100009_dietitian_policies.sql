-- ============================================================
-- Migration: Dietitian RLS Policies for Existing Tables
-- Phase 22: IGU Nutrition System Enhancement
--
-- Add dietitian SELECT/UPDATE policies to existing nutrition tables
-- Uses can_edit_nutrition() which enforces the hierarchy:
-- 1. Admin → yes
-- 2. Has active dietitian → only dietitian can edit
-- 3. No dietitian, has coach → coach can edit
-- 4. No dietitian, no coach → user can self-edit
-- ============================================================

-- ============================================================
-- nutrition_phases - Dietitian policies
-- ============================================================

-- Dietitians can view their clients' phases
CREATE POLICY "nutrition_phases_dietitian_select"
ON public.nutrition_phases
FOR SELECT
USING (
  public.is_dietitian_for_client(auth.uid(), user_id)
);

-- Dietitians can create phases (when they have edit permission)
CREATE POLICY "nutrition_phases_dietitian_insert"
ON public.nutrition_phases
FOR INSERT
WITH CHECK (
  public.can_edit_nutrition(auth.uid(), user_id)
);

-- Dietitians can update phases (when they have edit permission)
CREATE POLICY "nutrition_phases_dietitian_update"
ON public.nutrition_phases
FOR UPDATE
USING (
  public.can_edit_nutrition(auth.uid(), user_id)
);

-- ============================================================
-- weight_logs - Dietitian policies
-- ============================================================

-- Dietitians can view their clients' weight logs
CREATE POLICY "weight_logs_dietitian_select"
ON public.weight_logs
FOR SELECT
USING (
  public.is_dietitian_for_client(auth.uid(), user_id)
);

-- ============================================================
-- circumference_logs - Dietitian policies
-- ============================================================

-- Dietitians can view their clients' circumference logs
CREATE POLICY "circumference_logs_dietitian_select"
ON public.circumference_logs
FOR SELECT
USING (
  public.is_dietitian_for_client(auth.uid(), user_id)
);

-- ============================================================
-- adherence_logs - Dietitian policies
-- ============================================================

-- Dietitians can view their clients' adherence logs
CREATE POLICY "adherence_logs_dietitian_select"
ON public.adherence_logs
FOR SELECT
USING (
  public.is_dietitian_for_client(auth.uid(), user_id)
);

-- ============================================================
-- nutrition_adjustments - Dietitian policies
-- ============================================================

-- Dietitians can view their clients' adjustments
CREATE POLICY "nutrition_adjustments_dietitian_select"
ON public.nutrition_adjustments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = nutrition_adjustments.phase_id
      AND public.is_dietitian_for_client(auth.uid(), np.user_id)
  )
);

-- Dietitians can create adjustments (when they have edit permission)
CREATE POLICY "nutrition_adjustments_dietitian_insert"
ON public.nutrition_adjustments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = nutrition_adjustments.phase_id
      AND public.can_edit_nutrition(auth.uid(), np.user_id)
  )
);

-- Dietitians can update/approve adjustments (when they have edit permission)
CREATE POLICY "nutrition_adjustments_dietitian_update"
ON public.nutrition_adjustments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = nutrition_adjustments.phase_id
      AND public.can_edit_nutrition(auth.uid(), np.user_id)
  )
);

-- ============================================================
-- coach_nutrition_notes - Dietitian policies
-- ============================================================

-- Dietitians can view notes for their clients
CREATE POLICY "coach_nutrition_notes_dietitian_select"
ON public.coach_nutrition_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = coach_nutrition_notes.phase_id
      AND public.is_dietitian_for_client(auth.uid(), np.user_id)
  )
);

-- Dietitians can create notes (with their own ID as coach_id)
CREATE POLICY "coach_nutrition_notes_dietitian_insert"
ON public.coach_nutrition_notes
FOR INSERT
WITH CHECK (
  -- Must be the dietitian creating
  auth.uid() = coach_id
  AND EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = coach_nutrition_notes.phase_id
      AND public.is_dietitian_for_client(auth.uid(), np.user_id)
  )
);

-- Dietitians can update their own notes
CREATE POLICY "coach_nutrition_notes_dietitian_update"
ON public.coach_nutrition_notes
FOR UPDATE
USING (
  auth.uid() = coach_id
  AND public.is_dietitian(auth.uid())
);

-- Dietitians can delete their own notes
CREATE POLICY "coach_nutrition_notes_dietitian_delete"
ON public.coach_nutrition_notes
FOR DELETE
USING (
  auth.uid() = coach_id
  AND public.is_dietitian(auth.uid())
);

-- ============================================================
-- Update existing coach policies to respect dietitian hierarchy
-- When a dietitian is assigned, coaches become read-only for nutrition
-- ============================================================

-- Drop old coach update policy for nutrition_phases if it exists
DROP POLICY IF EXISTS "Coaches can update their clients' nutrition phases" ON public.nutrition_phases;

-- Create new policy that uses can_edit_nutrition (respects dietitian hierarchy)
CREATE POLICY "Care team can update nutrition phases"
ON public.nutrition_phases
FOR UPDATE
USING (
  public.can_edit_nutrition(auth.uid(), user_id)
);

-- Drop old coach insert policy for nutrition_adjustments if it exists
DROP POLICY IF EXISTS "Coaches can create adjustments" ON public.nutrition_adjustments;

-- Create new policy that uses can_edit_nutrition
CREATE POLICY "Care team can create adjustments"
ON public.nutrition_adjustments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = nutrition_adjustments.phase_id
      AND public.can_edit_nutrition(auth.uid(), np.user_id)
  )
);

-- Drop old coach update policy for nutrition_adjustments if it exists
DROP POLICY IF EXISTS "Coaches can update adjustments" ON public.nutrition_adjustments;

-- Create new policy that uses can_edit_nutrition
CREATE POLICY "Care team can update adjustments"
ON public.nutrition_adjustments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = nutrition_adjustments.phase_id
      AND public.can_edit_nutrition(auth.uid(), np.user_id)
  )
);

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON POLICY "nutrition_phases_dietitian_select" ON public.nutrition_phases IS 'Dietitians can view nutrition phases for their assigned clients';
COMMENT ON POLICY "nutrition_phases_dietitian_insert" ON public.nutrition_phases IS 'Dietitians can create phases when they have nutrition edit permission';
COMMENT ON POLICY "nutrition_phases_dietitian_update" ON public.nutrition_phases IS 'Dietitians can update phases when they have nutrition edit permission';
COMMENT ON POLICY "Care team can update nutrition phases" ON public.nutrition_phases IS 'Uses can_edit_nutrition() - respects dietitian hierarchy';
