-- ============================================================
-- Migration: Refeed Days Table
-- Phase 22: IGU Nutrition System Enhancement
--
-- Track scheduled refeed days with target and actual macros
-- ============================================================

CREATE TABLE IF NOT EXISTS public.refeed_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES public.nutrition_phases(id) ON DELETE CASCADE,

  -- Scheduling
  scheduled_date date NOT NULL,

  -- Refeed type
  refeed_type text NOT NULL CHECK (refeed_type IN (
    'moderate',     -- 10-15% above deficit calories, +50-100g carbs
    'full',         -- To maintenance or slightly above
    'high_carb',    -- Maintenance + high carb, lower fat
    'free_meal'     -- Single unrestricted meal (not full day)
  )),

  -- Status
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'completed',
    'skipped',
    'partial'        -- Started but didn't complete as planned
  )),

  -- Target macros (what coach/dietitian prescribed)
  target_calories numeric,
  target_protein_g numeric,
  target_fat_g numeric,
  target_carb_g numeric,

  -- Actual logged macros
  actual_calories numeric,
  actual_protein_g numeric,
  actual_fat_g numeric,
  actual_carb_g numeric,

  -- Performance context
  pre_refeed_weight_kg numeric,       -- Morning weight before refeed
  post_refeed_weight_kg numeric,      -- Morning weight after refeed
  training_notes text,                -- What training was done that day

  -- Notes
  coach_notes text,
  client_notes text,

  -- Metadata
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  -- One refeed per phase per date
  UNIQUE(phase_id, scheduled_date)
);

-- Enable RLS
ALTER TABLE public.refeed_days ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Users can view their own refeed days
CREATE POLICY "refeed_days_self_select"
ON public.refeed_days
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = refeed_days.phase_id
      AND np.user_id = auth.uid()
  )
);

-- Users can update actual values and notes
CREATE POLICY "refeed_days_self_update"
ON public.refeed_days
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = refeed_days.phase_id
      AND np.user_id = auth.uid()
  )
);

-- Care team can view
CREATE POLICY "refeed_days_care_team_select"
ON public.refeed_days
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = refeed_days.phase_id
      AND public.is_care_team_member_for_client(auth.uid(), np.user_id)
  )
);

-- Care team with nutrition edit permission can manage
CREATE POLICY "refeed_days_care_team_insert"
ON public.refeed_days
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = refeed_days.phase_id
      AND public.can_edit_nutrition(auth.uid(), np.user_id)
  )
);

CREATE POLICY "refeed_days_care_team_update"
ON public.refeed_days
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = refeed_days.phase_id
      AND public.can_edit_nutrition(auth.uid(), np.user_id)
  )
);

CREATE POLICY "refeed_days_care_team_delete"
ON public.refeed_days
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.nutrition_phases np
    WHERE np.id = refeed_days.phase_id
      AND public.can_edit_nutrition(auth.uid(), np.user_id)
  )
);

-- Admins full access
CREATE POLICY "refeed_days_admin_all"
ON public.refeed_days
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_refeed_days_phase_id ON public.refeed_days(phase_id);
CREATE INDEX idx_refeed_days_scheduled_date ON public.refeed_days(scheduled_date);
CREATE INDEX idx_refeed_days_status ON public.refeed_days(status);
CREATE INDEX idx_refeed_days_upcoming ON public.refeed_days(scheduled_date) WHERE status = 'scheduled';

-- Add updated_at trigger
CREATE TRIGGER update_refeed_days_updated_at
BEFORE UPDATE ON public.refeed_days
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.refeed_days IS 'Scheduled refeed days with target and actual macro tracking';
COMMENT ON COLUMN public.refeed_days.refeed_type IS 'Type: moderate (+50-100g carbs), full (to maintenance), high_carb (high carb/low fat), free_meal (single meal)';
