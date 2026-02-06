-- ============================================================
-- Migration: Step Logs Table
-- Phase 22: IGU Nutrition System Enhancement
--
-- IMPORTANT: Steps are OBSERVATIONAL DATA ONLY
-- They do NOT modify TDEE, calorie targets, or adjustment math.
-- Used for coaching recommendations (e.g., "add 2k steps before cutting calories")
-- NO foreign key to nutrition_adjustments or any calculation tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.step_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL,

  -- Step count (daily total)
  steps integer NOT NULL CHECK (steps >= 0),

  -- Optional: where did this data come from
  source text, -- e.g., 'manual', 'apple_health', 'google_fit', 'fitbit', 'garmin'

  -- Optional: notes for the day
  notes text,

  -- Metadata
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  -- One entry per user per day
  UNIQUE(user_id, log_date)
);

-- Enable RLS
ALTER TABLE public.step_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Users can CRUD their own step logs
CREATE POLICY "step_logs_self_select"
ON public.step_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "step_logs_self_insert"
ON public.step_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "step_logs_self_update"
ON public.step_logs
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "step_logs_self_delete"
ON public.step_logs
FOR DELETE
USING (auth.uid() = user_id);

-- Care team (coach, dietitian, etc.) can READ step logs
CREATE POLICY "step_logs_care_team_select"
ON public.step_logs
FOR SELECT
USING (
  public.is_care_team_member_for_client(auth.uid(), user_id)
);

-- Admins full access
CREATE POLICY "step_logs_admin_all"
ON public.step_logs
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_step_logs_user_id ON public.step_logs(user_id);
CREATE INDEX idx_step_logs_log_date ON public.step_logs(log_date);
CREATE INDEX idx_step_logs_user_date ON public.step_logs(user_id, log_date);

-- Add updated_at trigger
CREATE TRIGGER update_step_logs_updated_at
BEFORE UPDATE ON public.step_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.step_logs IS 'Daily step tracking - observational data only, does NOT affect TDEE or calorie calculations';
COMMENT ON COLUMN public.step_logs.steps IS 'Daily step count - used for coaching context, not calorie math';
COMMENT ON COLUMN public.step_logs.source IS 'Data source: manual, apple_health, google_fit, fitbit, garmin, etc.';
