-- ============================================================
-- Migration: Diet Breaks Table
-- Phase 22: IGU Nutrition System Enhancement
--
-- Track actual diet break execution (not just settings in nutrition_phases)
--
-- IMPORTANT: maintenance_calories is calculated from ACTUAL logged data:
--   maintenance = recent_avg_intake + (weekly_weight_change × 7700 / 7)
-- NOT from theoretical TDEE formulas.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.diet_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES public.nutrition_phases(id) ON DELETE CASCADE,

  -- Scheduled vs actual dates
  scheduled_start_date date NOT NULL,
  scheduled_end_date date NOT NULL,
  actual_start_date date,
  actual_end_date date,

  -- Status tracking
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',     -- Planned but not started
    'active',        -- Currently in progress
    'completed',     -- Finished successfully
    'skipped',       -- Client/coach decided to skip
    'cancelled'      -- Cancelled before starting
  )),

  -- Maintenance calories (calculated from actual data)
  -- Formula: recent_avg_intake + (weekly_weight_change × 7700 / 7)
  maintenance_calories numeric,

  -- Macros during break
  maintenance_protein_g numeric,
  maintenance_fat_g numeric,
  maintenance_carb_g numeric,

  -- Pre-break data (for maintenance calculation)
  pre_break_avg_intake numeric,      -- Average daily intake before break
  pre_break_weight_change_rate numeric, -- kg per week before break

  -- Performance tracking
  pre_break_weight_kg numeric,       -- Weight when break started
  post_break_weight_kg numeric,      -- Weight when break ended
  weight_change_during_break_kg numeric, -- Calculated: post - pre

  -- Notes and reasons
  reason text,                        -- Why the break was taken
  coach_notes text,
  client_feedback text,

  -- Who initiated/approved
  initiated_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamp with time zone,

  -- Metadata
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.diet_breaks ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Users can view their own diet breaks
CREATE POLICY "diet_breaks_self_select"
ON public.diet_breaks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = diet_breaks.phase_id
      AND np.user_id = auth.uid()
  )
);

-- Users can update limited fields (feedback, actual dates)
CREATE POLICY "diet_breaks_self_update"
ON public.diet_breaks
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = diet_breaks.phase_id
      AND np.user_id = auth.uid()
  )
);

-- Care team can view and manage diet breaks
CREATE POLICY "diet_breaks_care_team_select"
ON public.diet_breaks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = diet_breaks.phase_id
      AND public.is_care_team_member_for_client(auth.uid(), np.user_id)
  )
);

CREATE POLICY "diet_breaks_care_team_insert"
ON public.diet_breaks
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = diet_breaks.phase_id
      AND public.can_edit_nutrition(auth.uid(), np.user_id)
  )
);

CREATE POLICY "diet_breaks_care_team_update"
ON public.diet_breaks
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = diet_breaks.phase_id
      AND public.can_edit_nutrition(auth.uid(), np.user_id)
  )
);

CREATE POLICY "diet_breaks_care_team_delete"
ON public.diet_breaks
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = diet_breaks.phase_id
      AND public.can_edit_nutrition(auth.uid(), np.user_id)
  )
);

-- Admins full access
CREATE POLICY "diet_breaks_admin_all"
ON public.diet_breaks
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_diet_breaks_phase_id ON public.diet_breaks(phase_id);
CREATE INDEX idx_diet_breaks_status ON public.diet_breaks(status);
CREATE INDEX idx_diet_breaks_scheduled_start ON public.diet_breaks(scheduled_start_date);
CREATE INDEX idx_diet_breaks_active ON public.diet_breaks(phase_id) WHERE status = 'active';

-- Add updated_at trigger
CREATE TRIGGER update_diet_breaks_updated_at
BEFORE UPDATE ON public.diet_breaks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.diet_breaks IS 'Track actual diet break periods with calculated maintenance calories from real data';
COMMENT ON COLUMN public.diet_breaks.maintenance_calories IS 'Calculated from: recent_avg_intake + (weekly_weight_change × 7700 / 7) - NOT from TDEE formulas';
COMMENT ON COLUMN public.diet_breaks.pre_break_avg_intake IS 'Average daily calorie intake in the weeks leading up to the break';
COMMENT ON COLUMN public.diet_breaks.pre_break_weight_change_rate IS 'Rate of weight change (kg/week) before break, used for maintenance calculation';
