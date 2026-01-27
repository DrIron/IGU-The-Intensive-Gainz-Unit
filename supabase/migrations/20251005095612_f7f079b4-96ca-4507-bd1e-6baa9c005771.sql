-- Create enum for form types
CREATE TYPE form_type AS ENUM ('one_to_one_in_person', 'one_to_one_online', 'buns_of_steel', 'fe_squad');

-- Create enum for training experience
CREATE TYPE training_experience AS ENUM ('beginner_0_6', 'intermediate_6_24', 'advanced_24_plus');

-- Create enum for nutrition approach
CREATE TYPE nutrition_approach AS ENUM ('calorie_counting', 'macros_calories', 'intuitive_eating', 'not_sure');

-- Create enum for how heard about us
CREATE TYPE referral_source AS ENUM ('instagram', 'tiktok', 'friend_referral', 'other');

-- Create table for form submissions
CREATE TABLE public.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type form_type NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Personal Details
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  discord_username TEXT,
  heard_about_us referral_source NOT NULL,
  heard_about_us_other TEXT,
  preferred_coach_id UUID REFERENCES public.coaches(id),
  training_goals TEXT NOT NULL,
  training_experience training_experience NOT NULL,
  
  -- Plan Selection
  plan_name TEXT,
  
  -- PAR-Q Questionnaire
  parq_heart_condition BOOLEAN NOT NULL DEFAULT false,
  parq_chest_pain_active BOOLEAN NOT NULL DEFAULT false,
  parq_chest_pain_inactive BOOLEAN NOT NULL DEFAULT false,
  parq_balance_dizziness BOOLEAN NOT NULL DEFAULT false,
  parq_bone_joint_problem BOOLEAN NOT NULL DEFAULT false,
  parq_medication BOOLEAN NOT NULL DEFAULT false,
  parq_other_reason BOOLEAN NOT NULL DEFAULT false,
  parq_injuries_conditions TEXT,
  parq_additional_details TEXT,
  needs_medical_review BOOLEAN NOT NULL DEFAULT false,
  
  -- In-Person Specific
  preferred_training_times TEXT[], -- array for multiple selections
  preferred_gym_location TEXT,
  
  -- Online Specific
  training_days_per_week TEXT,
  gym_access_type TEXT,
  home_gym_equipment TEXT,
  
  -- Team Specific
  accepts_team_program BOOLEAN,
  accepts_lower_body_only BOOLEAN, -- Buns of Steel only
  understands_no_nutrition BOOLEAN,
  
  -- Legal Agreements
  agreed_terms BOOLEAN NOT NULL DEFAULT false,
  agreed_privacy BOOLEAN NOT NULL DEFAULT false,
  agreed_medical_disclaimer BOOLEAN NOT NULL DEFAULT false,
  agreed_refund_policy BOOLEAN NOT NULL DEFAULT false,
  
  -- Nutrition approach (common)
  nutrition_approach nutrition_approach,
  
  -- Metadata
  submission_status TEXT DEFAULT 'pending',
  airtable_record_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can insert their own form submissions"
  ON public.form_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own form submissions"
  ON public.form_submissions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all form submissions"
  ON public.form_submissions
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins and coaches can update form submissions"
  ON public.form_submissions
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'coach'::app_role)
  );

-- Create trigger for updated_at
CREATE TRIGGER update_form_submissions_updated_at
  BEFORE UPDATE ON public.form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();