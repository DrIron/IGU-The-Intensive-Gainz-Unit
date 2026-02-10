-- Linear Progression & Auto-Regulation Feedback
-- Adds progression config to exercise prescriptions and a suggestions log table

-- 1. Coach-side: progression config on exercise prescriptions
ALTER TABLE exercise_prescriptions
  ADD COLUMN IF NOT EXISTS linear_progression_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS progression_config JSONB DEFAULT NULL;

-- progression_config schema:
-- {
--   "load_increment_kg": 2.5,
--   "load_increment_lb": 5,
--   "unit": "kg" | "lb",
--   "rir_threshold": 2,
--   "rep_range_check": true,
--   "suggestion_style": "gentle" | "direct" | "data_only"
-- }

-- 2. Client-side: log every suggestion shown + client response
CREATE TABLE IF NOT EXISTS progression_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES profiles_public(id),
  client_module_exercise_id UUID NOT NULL REFERENCES client_module_exercises(id) ON DELETE CASCADE,
  exercise_library_id UUID NOT NULL REFERENCES exercise_library(id),
  session_date DATE NOT NULL,
  set_number INT NOT NULL,

  -- What was prescribed (snapshot for historical reference)
  prescribed_weight DECIMAL,
  prescribed_rep_min INT,
  prescribed_rep_max INT,
  prescribed_rir INT,

  -- What the client did
  performed_weight DECIMAL,
  performed_reps INT,
  performed_rir INT,
  performed_rpe DECIMAL,

  -- The suggestion
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN (
    'increase_load', 'hold_steady', 'reduce_load', 'increase_reps', 'none'
  )),
  suggestion_text TEXT NOT NULL,
  suggested_increment DECIMAL,

  -- Client response
  client_response TEXT CHECK (client_response IN ('accepted', 'dismissed', 'ignored')),
  client_response_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE progression_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS: Clients see own suggestions
CREATE POLICY "Clients see own suggestions"
  ON progression_suggestions FOR SELECT
  USING (client_id = auth.uid());

-- RLS: Coaches/care team see their clients' suggestions
CREATE POLICY "Coaches see client suggestions"
  ON progression_suggestions FOR SELECT
  USING (
    public.is_care_team_member_for_client(auth.uid(), client_id)
  );

-- RLS: Clients insert own suggestions (generated client-side after set completion)
CREATE POLICY "Clients insert own suggestions"
  ON progression_suggestions FOR INSERT
  WITH CHECK (client_id = auth.uid());

-- RLS: Clients update own suggestions (to record response)
CREATE POLICY "Clients update own suggestions"
  ON progression_suggestions FOR UPDATE
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- Indexes
CREATE INDEX idx_progression_suggestions_client_date
  ON progression_suggestions(client_id, session_date DESC);
CREATE INDEX idx_progression_suggestions_exercise
  ON progression_suggestions(exercise_library_id, client_id);
CREATE INDEX idx_progression_suggestions_cme
  ON progression_suggestions(client_module_exercise_id);
