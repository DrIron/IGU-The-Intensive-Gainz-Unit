-- Create nutrition phases table (replaces nutrition_goals for 1:1 clients)
CREATE TABLE IF NOT EXISTS nutrition_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES auth.users(id),
  phase_name TEXT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  end_date TIMESTAMP WITH TIME ZONE,
  estimated_end_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Goal settings
  goal_type TEXT NOT NULL CHECK (goal_type IN ('fat_loss', 'maintenance', 'muscle_gain')),
  starting_weight_kg NUMERIC NOT NULL,
  target_weight_kg NUMERIC,
  target_body_fat_percentage NUMERIC,
  weekly_rate_percentage NUMERIC NOT NULL,
  
  -- Diet breaks
  diet_break_enabled BOOLEAN NOT NULL DEFAULT false,
  diet_break_frequency_weeks INTEGER,
  diet_break_duration_weeks INTEGER,
  
  -- Macros
  protein_intake_g_per_kg NUMERIC NOT NULL,
  protein_based_on_ffm BOOLEAN NOT NULL DEFAULT false,
  fat_intake_percentage NUMERIC NOT NULL,
  
  -- Assigned values
  daily_calories NUMERIC NOT NULL,
  protein_grams NUMERIC NOT NULL,
  fat_grams NUMERIC NOT NULL,
  carb_grams NUMERIC NOT NULL,
  
  -- Metadata
  coach_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create weight logs table
CREATE TABLE IF NOT EXISTS weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES nutrition_phases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  weight_kg NUMERIC NOT NULL,
  week_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(phase_id, log_date)
);

-- Create circumference logs table
CREATE TABLE IF NOT EXISTS circumference_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES nutrition_phases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  week_number INTEGER NOT NULL,
  waist_cm NUMERIC,
  chest_cm NUMERIC,
  hips_cm NUMERIC,
  thighs_cm NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(phase_id, week_number)
);

-- Create adherence logs table
CREATE TABLE IF NOT EXISTS adherence_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES nutrition_phases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  followed_calories BOOLEAN NOT NULL,
  tracked_accurately BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(phase_id, week_number)
);

-- Create nutrition adjustments table
CREATE TABLE IF NOT EXISTS nutrition_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES nutrition_phases(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  
  -- Weight change data
  actual_weight_change_percentage NUMERIC,
  expected_weight_change_percentage NUMERIC,
  deviation_percentage NUMERIC,
  
  -- Adjustment calculations
  suggested_calorie_adjustment INTEGER,
  approved_calorie_adjustment INTEGER,
  new_daily_calories NUMERIC,
  new_protein_grams NUMERIC,
  new_fat_grams NUMERIC,
  new_carb_grams NUMERIC,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  coach_notes TEXT,
  is_diet_break_week BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES auth.users(id),
  
  UNIQUE(phase_id, week_number)
);

-- Create coach notes table
CREATE TABLE IF NOT EXISTS coach_nutrition_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES nutrition_phases(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  is_reminder BOOLEAN NOT NULL DEFAULT false,
  reminder_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE nutrition_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE circumference_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE adherence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_nutrition_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for nutrition_phases
CREATE POLICY "Users can view their own nutrition phases"
  ON nutrition_phases FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view their clients' nutrition phases"
  ON nutrition_phases FOR SELECT
  USING (
    auth.uid() = coach_id OR
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Coaches can create nutrition phases for their clients"
  ON nutrition_phases FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'coach'::app_role) AND
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriptions.user_id = nutrition_phases.user_id
      AND subscriptions.coach_id = auth.uid()
      AND subscriptions.status = 'active'
    )
  );

CREATE POLICY "Coaches can update their clients' nutrition phases"
  ON nutrition_phases FOR UPDATE
  USING (
    auth.uid() = coach_id OR
    has_role(auth.uid(), 'admin'::app_role)
  );

-- RLS Policies for weight_logs
CREATE POLICY "Users can view their own weight logs"
  ON weight_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view their clients' weight logs"
  ON weight_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nutrition_phases
      WHERE nutrition_phases.id = weight_logs.phase_id
      AND nutrition_phases.coach_id = auth.uid()
    ) OR
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Users can insert their own weight logs"
  ON weight_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weight logs"
  ON weight_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own weight logs"
  ON weight_logs FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for circumference_logs
CREATE POLICY "Users can view their own circumference logs"
  ON circumference_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view their clients' circumference logs"
  ON circumference_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nutrition_phases
      WHERE nutrition_phases.id = circumference_logs.phase_id
      AND nutrition_phases.coach_id = auth.uid()
    ) OR
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Users can insert their own circumference logs"
  ON circumference_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own circumference logs"
  ON circumference_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own circumference logs"
  ON circumference_logs FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for adherence_logs
CREATE POLICY "Users can view their own adherence logs"
  ON adherence_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view their clients' adherence logs"
  ON adherence_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nutrition_phases
      WHERE nutrition_phases.id = adherence_logs.phase_id
      AND nutrition_phases.coach_id = auth.uid()
    ) OR
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Users can insert their own adherence logs"
  ON adherence_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own adherence logs"
  ON adherence_logs FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for nutrition_adjustments
CREATE POLICY "Users can view their own adjustments"
  ON nutrition_adjustments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nutrition_phases
      WHERE nutrition_phases.id = nutrition_adjustments.phase_id
      AND nutrition_phases.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can view their clients' adjustments"
  ON nutrition_adjustments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nutrition_phases
      WHERE nutrition_phases.id = nutrition_adjustments.phase_id
      AND nutrition_phases.coach_id = auth.uid()
    ) OR
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Coaches can create adjustments"
  ON nutrition_adjustments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nutrition_phases
      WHERE nutrition_phases.id = nutrition_adjustments.phase_id
      AND nutrition_phases.coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update adjustments"
  ON nutrition_adjustments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM nutrition_phases
      WHERE nutrition_phases.id = nutrition_adjustments.phase_id
      AND nutrition_phases.coach_id = auth.uid()
    ) OR
    has_role(auth.uid(), 'admin'::app_role)
  );

-- RLS Policies for coach_nutrition_notes
CREATE POLICY "Coaches can view their own notes"
  ON coach_nutrition_notes FOR SELECT
  USING (
    auth.uid() = coach_id OR
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Coaches can create notes"
  ON coach_nutrition_notes FOR INSERT
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches can update their own notes"
  ON coach_nutrition_notes FOR UPDATE
  USING (auth.uid() = coach_id);

CREATE POLICY "Coaches can delete their own notes"
  ON coach_nutrition_notes FOR DELETE
  USING (auth.uid() = coach_id);

-- Create indexes for better performance
CREATE INDEX idx_nutrition_phases_user_id ON nutrition_phases(user_id);
CREATE INDEX idx_nutrition_phases_coach_id ON nutrition_phases(coach_id);
CREATE INDEX idx_nutrition_phases_active ON nutrition_phases(is_active);
CREATE INDEX idx_weight_logs_phase_id ON weight_logs(phase_id);
CREATE INDEX idx_weight_logs_week ON weight_logs(week_number);
CREATE INDEX idx_circumference_logs_phase_id ON circumference_logs(phase_id);
CREATE INDEX idx_adherence_logs_phase_id ON adherence_logs(phase_id);
CREATE INDEX idx_nutrition_adjustments_phase_id ON nutrition_adjustments(phase_id);
CREATE INDEX idx_coach_nutrition_notes_phase_id ON coach_nutrition_notes(phase_id);

-- Add trigger for updated_at
CREATE TRIGGER update_nutrition_phases_updated_at
  BEFORE UPDATE ON nutrition_phases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();