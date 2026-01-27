-- ===========================================================================
-- FORM SUBMISSIONS PRIVACY SPLIT: Separate PHI/PII from non-sensitive data
-- ===========================================================================

-- A) Create form_submissions_public (non-sensitive onboarding metadata)
CREATE TABLE public.form_submissions_public (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Service/Coach selection
  service_id UUID REFERENCES public.services(id),
  preferred_coach_id UUID REFERENCES public.coaches(user_id),
  coach_preference_type TEXT CHECK (coach_preference_type IN ('choose', 'auto')),
  
  -- Non-sensitive preferences
  training_experience TEXT,
  training_days_per_week INTEGER,
  training_goals TEXT[],
  focus_areas TEXT[],
  gym_access_type TEXT,
  preferred_gym_location TEXT,
  preferred_training_times TEXT[],
  nutrition_approach TEXT,
  
  -- Flags (no details)
  injury_flag BOOLEAN DEFAULT false,
  medical_review_required BOOLEAN DEFAULT false,
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  documents_verified BOOLEAN DEFAULT false,
  documents_approved_at TIMESTAMPTZ,
  documents_approved_by_coach UUID REFERENCES public.coaches(user_id),
  
  -- Referral (non-PII)
  heard_about_us TEXT,
  discord_username TEXT,
  
  -- Legal agreements (timestamps only, no PII)
  agreed_terms BOOLEAN DEFAULT false,
  agreed_terms_at TIMESTAMPTZ,
  agreed_privacy BOOLEAN DEFAULT false,
  agreed_privacy_at TIMESTAMPTZ,
  agreed_medical_disclaimer BOOLEAN DEFAULT false,
  agreed_medical_disclaimer_at TIMESTAMPTZ,
  agreed_refund_policy BOOLEAN DEFAULT false,
  agreed_refund_policy_at TIMESTAMPTZ,
  agreed_intellectual_property BOOLEAN DEFAULT false,
  agreed_intellectual_property_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure one submission per user
  CONSTRAINT unique_user_submission_public UNIQUE (user_id)
);

-- B) Create form_submissions_medical_private (PHI + sensitive data)
CREATE TABLE public.form_submissions_medical_private (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL UNIQUE REFERENCES public.form_submissions_public(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- PAR-Q Health Screening (PHI)
  parq_heart_condition BOOLEAN,
  parq_chest_pain_active BOOLEAN,
  parq_chest_pain_inactive BOOLEAN,
  parq_balance_dizziness BOOLEAN,
  parq_bone_joint_problem BOOLEAN,
  parq_medication BOOLEAN,
  parq_other_reason BOOLEAN,
  parq_injuries_conditions TEXT,
  parq_additional_details TEXT,
  
  -- Sensitive contact info collected during onboarding
  -- (duplicated from profiles_private for form context)
  date_of_birth DATE,
  
  -- For future: encrypted payload for additional PHI
  encrypted_payload TEXT,
  
  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT unique_user_medical_private UNIQUE (user_id)
);

-- Enable RLS on both tables
ALTER TABLE public.form_submissions_public ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions_medical_private ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- RLS Policies for form_submissions_public
-- ===========================================================================

-- Admins can do everything
CREATE POLICY "Admins full access to form_submissions_public"
ON public.form_submissions_public
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can read/update their own submission
CREATE POLICY "Users can read own submission_public"
ON public.form_submissions_public
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own submission_public"
ON public.form_submissions_public
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own submission_public"
ON public.form_submissions_public
FOR UPDATE
USING (auth.uid() = user_id);

-- Coaches can read their assigned clients' submissions (non-sensitive data only)
CREATE POLICY "Coaches can read assigned clients form_submissions_public"
ON public.form_submissions_public
FOR SELECT
USING (
  preferred_coach_id = auth.uid()
  OR user_id IN (
    SELECT s.user_id FROM public.subscriptions s 
    WHERE s.coach_id = auth.uid()
  )
);

-- ===========================================================================
-- RLS Policies for form_submissions_medical_private (STRICT - No coach access)
-- ===========================================================================

-- Admins only for medical data
CREATE POLICY "Admins full access to form_submissions_medical_private"
ON public.form_submissions_medical_private
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can read/insert their own medical data
CREATE POLICY "Users can read own medical_private"
ON public.form_submissions_medical_private
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own medical_private"
ON public.form_submissions_medical_private
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own medical_private"
ON public.form_submissions_medical_private
FOR UPDATE
USING (auth.uid() = user_id);

-- NO COACH ACCESS to medical_private table

-- ===========================================================================
-- Indexes for performance
-- ===========================================================================

CREATE INDEX idx_form_submissions_public_user_id ON public.form_submissions_public(user_id);
CREATE INDEX idx_form_submissions_public_preferred_coach ON public.form_submissions_public(preferred_coach_id);
CREATE INDEX idx_form_submissions_public_status ON public.form_submissions_public(status);
CREATE INDEX idx_form_submissions_medical_private_user_id ON public.form_submissions_medical_private(user_id);
CREATE INDEX idx_form_submissions_medical_private_submission_id ON public.form_submissions_medical_private(submission_id);

-- ===========================================================================
-- Add triggers for updated_at
-- ===========================================================================

CREATE TRIGGER update_form_submissions_public_updated_at
  BEFORE UPDATE ON public.form_submissions_public
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_submissions_medical_private_updated_at
  BEFORE UPDATE ON public.form_submissions_medical_private
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================================
-- Add comments documenting the split
-- ===========================================================================

COMMENT ON TABLE public.form_submissions_public IS 'Non-sensitive onboarding metadata. Coaches CAN access this for their assigned clients.';
COMMENT ON TABLE public.form_submissions_medical_private IS 'PHI/sensitive medical data (PAR-Q). Coaches CANNOT access this. Admin-only.';
COMMENT ON TABLE public.form_submissions IS 'DEPRECATED: Legacy table. Use form_submissions_public + form_submissions_medical_private instead.';