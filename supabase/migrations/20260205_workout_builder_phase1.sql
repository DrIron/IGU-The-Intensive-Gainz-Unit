-- ============================================================
-- IGU Phase 1: Dynamic Column System Migration
-- Run this migration to add column configuration support
-- ============================================================

-- Add column configuration to exercise_prescriptions
-- This stores the coach's preferred columns for each exercise
ALTER TABLE public.exercise_prescriptions
ADD COLUMN IF NOT EXISTS column_config JSONB DEFAULT '[]'::jsonb;

-- Add session metadata to day_modules for multi-session support
ALTER TABLE public.day_modules
ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'strength';

ALTER TABLE public.day_modules
ADD COLUMN IF NOT EXISTS session_timing TEXT DEFAULT 'anytime';

-- Add session metadata to client_day_modules
ALTER TABLE public.client_day_modules
ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'strength';

ALTER TABLE public.client_day_modules
ADD COLUMN IF NOT EXISTS session_timing TEXT DEFAULT 'anytime';

-- Create enum types for session configuration (if not exists)
DO $$ BEGIN
  CREATE TYPE public.session_type AS ENUM (
    'strength', 'cardio', 'hiit', 'mobility', 'recovery', 'sport_specific', 'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.session_timing AS ENUM (
    'morning', 'afternoon', 'evening', 'anytime'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add coach column presets table for saved configurations
CREATE TABLE IF NOT EXISTS public.coach_column_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.coaches(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  column_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, name)
);

CREATE INDEX IF NOT EXISTS idx_coach_column_presets_coach ON public.coach_column_presets(coach_id);

ALTER TABLE public.coach_column_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage own presets"
  ON public.coach_column_presets FOR ALL
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Add direct calendar entries table for ad-hoc workouts
CREATE TABLE IF NOT EXISTS public.direct_calendar_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_user_id UUID NOT NULL REFERENCES public.coaches(user_id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'strength',
  session_timing TEXT NOT NULL DEFAULT 'anytime',
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_user_id, session_date, title)
);

CREATE INDEX IF NOT EXISTS idx_direct_calendar_client ON public.direct_calendar_sessions(client_user_id);
CREATE INDEX IF NOT EXISTS idx_direct_calendar_date ON public.direct_calendar_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_direct_calendar_coach ON public.direct_calendar_sessions(coach_user_id);

ALTER TABLE public.direct_calendar_sessions ENABLE ROW LEVEL SECURITY;

-- Client can view their own sessions
CREATE POLICY "Clients can view own direct sessions"
  ON public.direct_calendar_sessions FOR SELECT
  TO authenticated
  USING (client_user_id = auth.uid());

-- Coaches can manage sessions for their clients
CREATE POLICY "Coaches can manage client direct sessions"
  ON public.direct_calendar_sessions FOR ALL
  TO authenticated
  USING (
    coach_user_id = auth.uid()
    OR public.has_active_coach_access_to_client(auth.uid(), client_user_id)
  )
  WITH CHECK (
    coach_user_id = auth.uid()
    OR public.has_active_coach_access_to_client(auth.uid(), client_user_id)
  );

-- Admin full access
CREATE POLICY "Admin full access to direct sessions"
  ON public.direct_calendar_sessions FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Direct calendar session exercises
CREATE TABLE IF NOT EXISTS public.direct_session_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_session_id UUID NOT NULL REFERENCES public.direct_calendar_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercise_library(id) ON DELETE RESTRICT,
  section TEXT NOT NULL DEFAULT 'main',
  sort_order INT NOT NULL DEFAULT 0,
  instructions TEXT,
  prescription_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  column_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_direct_session_exercises_session ON public.direct_session_exercises(direct_session_id);

ALTER TABLE public.direct_session_exercises ENABLE ROW LEVEL SECURITY;

-- Access via parent session
CREATE POLICY "Access direct session exercises via session"
  ON public.direct_session_exercises FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.direct_calendar_sessions dcs
      WHERE dcs.id = direct_session_exercises.direct_session_id
      AND (
        dcs.client_user_id = auth.uid()
        OR dcs.coach_user_id = auth.uid()
        OR public.has_active_coach_access_to_client(auth.uid(), dcs.client_user_id)
        OR public.is_admin(auth.uid())
      )
    )
  );

-- Add comments for documentation
COMMENT ON COLUMN public.exercise_prescriptions.column_config IS
  'JSON array of column configurations: [{id, type, label, visible, order}]';

COMMENT ON COLUMN public.day_modules.session_type IS
  'Type of session: strength, cardio, hiit, mobility, recovery, sport_specific, other';

COMMENT ON COLUMN public.day_modules.session_timing IS
  'Time of day preference: morning, afternoon, evening, anytime';

COMMENT ON TABLE public.coach_column_presets IS
  'Saved column configuration presets for quick application to exercises';

COMMENT ON TABLE public.direct_calendar_sessions IS
  'Ad-hoc workout sessions created directly on client calendar without program template';

-- Function to get default column config for a coach
CREATE OR REPLACE FUNCTION public.get_default_column_config(p_coach_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_config JSONB;
BEGIN
  SELECT column_config INTO v_config
  FROM public.coach_column_presets
  WHERE coach_id = p_coach_id AND is_default = true
  LIMIT 1;

  IF v_config IS NULL THEN
    -- Return standard default columns
    v_config := '[
      {"id": "sets", "type": "prescription", "label": "Sets", "visible": true, "order": 0},
      {"id": "reps", "type": "prescription", "label": "Reps", "visible": true, "order": 1},
      {"id": "weight", "type": "prescription", "label": "Weight", "visible": true, "order": 2},
      {"id": "rir", "type": "prescription", "label": "RIR", "visible": true, "order": 3},
      {"id": "rest", "type": "prescription", "label": "Rest", "visible": true, "order": 4}
    ]'::jsonb;
  END IF;

  RETURN v_config;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_default_column_config TO authenticated;
