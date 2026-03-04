-- ============================================
-- Phase 2: Medical Reviews SLA Tracking
-- ============================================
-- Tracks PAR-Q medical review lifecycle with SLA timing.
-- Populated when submit-onboarding flags a user for medical review.

CREATE TABLE IF NOT EXISTS public.medical_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles_public(id) ON DELETE CASCADE,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles_public(id),
  review_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cleared', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT medical_reviews_user_id_key UNIQUE (user_id)
);

-- Indexes
CREATE INDEX idx_medical_reviews_status ON public.medical_reviews(status);
CREATE INDEX idx_medical_reviews_flagged_at ON public.medical_reviews(flagged_at)
  WHERE status = 'pending';

-- RLS
ALTER TABLE public.medical_reviews ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage medical reviews"
  ON public.medical_reviews
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- Users can read their own review
CREATE POLICY "Users can read own medical review"
  ON public.medical_reviews
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert (from edge functions)
CREATE POLICY "Service role can insert medical reviews"
  ON public.medical_reviews
  FOR INSERT
  WITH CHECK (true);

-- No updated_at trigger needed — table uses reviewed_at for state changes
