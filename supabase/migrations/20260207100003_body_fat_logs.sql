-- ============================================================
-- Migration: Body Fat Logs Table
-- Phase 22: IGU Nutrition System Enhancement
--
-- Dedicated body fat percentage tracking with measurement method
-- ============================================================

CREATE TABLE IF NOT EXISTS public.body_fat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL,

  -- Body fat measurement
  body_fat_percentage numeric NOT NULL CHECK (body_fat_percentage > 0 AND body_fat_percentage < 100),

  -- Measurement method (important for tracking consistency)
  method text NOT NULL CHECK (method IN (
    'dexa',           -- DEXA scan (gold standard)
    'bod_pod',        -- Air displacement
    'hydrostatic',    -- Underwater weighing
    'bioelectrical',  -- BIA scale
    'skinfold',       -- Caliper measurement
    'navy_method',    -- Circumference formula
    'visual',         -- Visual estimation
    'other'
  )),

  -- Optional: calculated fat-free mass for FFM-based protein targets
  fat_free_mass_kg numeric,

  -- Optional notes (e.g., fasted, time of day, scale model)
  notes text,

  -- Metadata
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  -- One entry per user per day per method
  UNIQUE(user_id, log_date, method)
);

-- Enable RLS
ALTER TABLE public.body_fat_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Users can CRUD their own body fat logs
CREATE POLICY "body_fat_logs_self_select"
ON public.body_fat_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "body_fat_logs_self_insert"
ON public.body_fat_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "body_fat_logs_self_update"
ON public.body_fat_logs
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "body_fat_logs_self_delete"
ON public.body_fat_logs
FOR DELETE
USING (auth.uid() = user_id);

-- Care team can READ body fat logs
CREATE POLICY "body_fat_logs_care_team_select"
ON public.body_fat_logs
FOR SELECT
USING (
  public.is_care_team_member_for_client(auth.uid(), user_id)
);

-- Admins full access
CREATE POLICY "body_fat_logs_admin_all"
ON public.body_fat_logs
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_body_fat_logs_user_id ON public.body_fat_logs(user_id);
CREATE INDEX idx_body_fat_logs_log_date ON public.body_fat_logs(log_date);
CREATE INDEX idx_body_fat_logs_user_date ON public.body_fat_logs(user_id, log_date);
CREATE INDEX idx_body_fat_logs_method ON public.body_fat_logs(method);

-- Add updated_at trigger
CREATE TRIGGER update_body_fat_logs_updated_at
BEFORE UPDATE ON public.body_fat_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.body_fat_logs IS 'Body fat percentage measurements with tracking method for consistency';
COMMENT ON COLUMN public.body_fat_logs.method IS 'Measurement method: dexa, bod_pod, hydrostatic, bioelectrical, skinfold, navy_method, visual, other';
COMMENT ON COLUMN public.body_fat_logs.fat_free_mass_kg IS 'Calculated FFM for protein recommendations based on lean mass';
