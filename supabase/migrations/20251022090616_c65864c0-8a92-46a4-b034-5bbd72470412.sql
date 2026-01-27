-- Create nutrition goals table to store client goals/phases
CREATE TABLE public.nutrition_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Phase info
  phase_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_date TIMESTAMP WITH TIME ZONE,
  estimated_end_date TIMESTAMP WITH TIME ZONE,
  
  -- Goal inputs
  age INTEGER NOT NULL,
  sex TEXT NOT NULL,
  height_cm NUMERIC NOT NULL,
  starting_weight_kg NUMERIC NOT NULL,
  body_fat_percentage NUMERIC,
  activity_level TEXT NOT NULL,
  goal_type TEXT NOT NULL, -- 'loss', 'gain', 'maintenance'
  target_type TEXT, -- 'weight' or 'body_fat'
  target_weight_kg NUMERIC,
  target_body_fat NUMERIC,
  
  -- Macro settings
  protein_intake_g_per_kg NUMERIC NOT NULL,
  fat_intake_percentage NUMERIC NOT NULL,
  
  -- Diet break settings
  diet_breaks_enabled BOOLEAN NOT NULL DEFAULT false,
  diet_break_frequency_weeks INTEGER,
  diet_break_duration_weeks INTEGER,
  
  -- Calculated outputs
  daily_calories NUMERIC NOT NULL,
  protein_grams NUMERIC NOT NULL,
  fat_grams NUMERIC NOT NULL,
  carb_grams NUMERIC NOT NULL,
  fiber_grams NUMERIC,
  weekly_rate_percentage NUMERIC NOT NULL, -- e.g., 0.7 for 0.7%/week
  estimated_duration_weeks INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create weekly progress table
CREATE TABLE public.weekly_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.nutrition_goals(id) ON DELETE CASCADE,
  
  week_number INTEGER NOT NULL,
  week_start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Weight logs (array of daily weights)
  weight_logs JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{date: "2025-01-01", weight: 75.5}, ...]
  average_weight_kg NUMERIC,
  
  -- Circumference measurements (every 2 weeks)
  waist_cm NUMERIC,
  chest_cm NUMERIC,
  hips_cm NUMERIC,
  glutes_cm NUMERIC,
  thigh_cm NUMERIC,
  body_fat_percentage NUMERIC,
  
  -- Adherence
  followed_calories BOOLEAN,
  tracked_accurately BOOLEAN,
  
  -- Adjustments
  weight_change_kg NUMERIC,
  weight_change_percentage NUMERIC,
  expected_change_kg NUMERIC,
  calorie_adjustment INTEGER DEFAULT 0,
  new_daily_calories NUMERIC,
  is_diet_break_week BOOLEAN DEFAULT false,
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(goal_id, week_number)
);

-- Enable RLS
ALTER TABLE public.nutrition_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for nutrition_goals
CREATE POLICY "Users can view their own nutrition goals"
  ON public.nutrition_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own nutrition goals"
  ON public.nutrition_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own nutrition goals"
  ON public.nutrition_goals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view their clients' nutrition goals"
  ON public.nutrition_goals FOR SELECT
  USING (
    user_id IN (
      SELECT subscriptions.user_id
      FROM subscriptions
      WHERE subscriptions.coach_id = auth.uid()
        AND subscriptions.status = 'active'
    )
  );

CREATE POLICY "Coaches can update their clients' nutrition goals"
  ON public.nutrition_goals FOR UPDATE
  USING (
    user_id IN (
      SELECT subscriptions.user_id
      FROM subscriptions
      WHERE subscriptions.coach_id = auth.uid()
        AND subscriptions.status = 'active'
    )
  );

CREATE POLICY "Admins can view all nutrition goals"
  ON public.nutrition_goals FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all nutrition goals"
  ON public.nutrition_goals FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for weekly_progress
CREATE POLICY "Users can view their own weekly progress"
  ON public.weekly_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own weekly progress"
  ON public.weekly_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weekly progress"
  ON public.weekly_progress FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view their clients' weekly progress"
  ON public.weekly_progress FOR SELECT
  USING (
    user_id IN (
      SELECT subscriptions.user_id
      FROM subscriptions
      WHERE subscriptions.coach_id = auth.uid()
        AND subscriptions.status = 'active'
    )
  );

CREATE POLICY "Coaches can update their clients' weekly progress"
  ON public.weekly_progress FOR UPDATE
  USING (
    user_id IN (
      SELECT subscriptions.user_id
      FROM subscriptions
      WHERE subscriptions.coach_id = auth.uid()
        AND subscriptions.status = 'active'
    )
  );

CREATE POLICY "Admins can view all weekly progress"
  ON public.weekly_progress FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all weekly progress"
  ON public.weekly_progress FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_nutrition_goals_updated_at
  BEFORE UPDATE ON public.nutrition_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_weekly_progress_updated_at
  BEFORE UPDATE ON public.weekly_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();