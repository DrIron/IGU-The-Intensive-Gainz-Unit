-- ============================================================
-- Migration: Step Recommendations Table
-- Phase 22: IGU Nutrition System Enhancement
--
-- Coach/dietitian step targets for clients
-- IMPORTANT: Observational guidance only - does NOT affect TDEE or calorie math
-- Used for recommendations like "try adding 2k steps before we cut more calories"
-- ============================================================

CREATE TABLE IF NOT EXISTS public.step_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Who made the recommendation
  recommended_by uuid NOT NULL REFERENCES auth.users(id),

  -- Target steps
  target_steps integer NOT NULL CHECK (target_steps > 0),
  min_steps integer,  -- Minimum acceptable (optional range)
  max_steps integer,  -- Upper target for extra credit (optional)

  -- Context
  reason text,  -- Why this target was set
  context text, -- e.g., 'You were averaging 4k, let's try 6k before cutting calories'

  -- Validity period
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,     -- NULL = ongoing until superseded

  -- Status
  is_active boolean NOT NULL DEFAULT true,

  -- Metadata
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.step_recommendations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Users can view their own step recommendations
CREATE POLICY "step_recommendations_self_select"
ON public.step_recommendations
FOR SELECT
USING (auth.uid() = user_id);

-- Care team can view
CREATE POLICY "step_recommendations_care_team_select"
ON public.step_recommendations
FOR SELECT
USING (
  public.is_care_team_member_for_client(auth.uid(), user_id)
);

-- Care team can create/manage recommendations
CREATE POLICY "step_recommendations_care_team_insert"
ON public.step_recommendations
FOR INSERT
WITH CHECK (
  public.is_care_team_member_for_client(auth.uid(), user_id)
  AND auth.uid() = recommended_by
);

CREATE POLICY "step_recommendations_care_team_update"
ON public.step_recommendations
FOR UPDATE
USING (
  public.is_care_team_member_for_client(auth.uid(), user_id)
);

CREATE POLICY "step_recommendations_care_team_delete"
ON public.step_recommendations
FOR DELETE
USING (
  public.is_care_team_member_for_client(auth.uid(), user_id)
);

-- Admins full access
CREATE POLICY "step_recommendations_admin_all"
ON public.step_recommendations
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- Function to deactivate old recommendations when new one is created
-- ============================================================
CREATE OR REPLACE FUNCTION public.deactivate_old_step_recommendations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Deactivate any existing active recommendations for this user
  UPDATE public.step_recommendations
  SET is_active = false,
      end_date = NEW.effective_date - INTERVAL '1 day',
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND is_active = true
    AND id != NEW.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER step_recommendations_deactivate_old
AFTER INSERT ON public.step_recommendations
FOR EACH ROW
EXECUTE FUNCTION public.deactivate_old_step_recommendations();

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_step_recommendations_user_id ON public.step_recommendations(user_id);
CREATE INDEX idx_step_recommendations_active ON public.step_recommendations(user_id) WHERE is_active = true;
CREATE INDEX idx_step_recommendations_recommended_by ON public.step_recommendations(recommended_by);
CREATE INDEX idx_step_recommendations_effective ON public.step_recommendations(effective_date);

-- Add updated_at trigger
CREATE TRIGGER update_step_recommendations_updated_at
BEFORE UPDATE ON public.step_recommendations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.step_recommendations IS 'Coach/dietitian step targets - observational guidance only, does NOT affect calorie calculations';
COMMENT ON COLUMN public.step_recommendations.target_steps IS 'Daily step target for coaching purposes - not used in TDEE math';
COMMENT ON COLUMN public.step_recommendations.context IS 'Coaching context: e.g., "try adding steps before cutting calories"';
