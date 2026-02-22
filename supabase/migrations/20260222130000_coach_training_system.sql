-- ============================================
-- Phase 5: Coach Training System
-- ============================================
-- Required video training before coach activation.
-- New tables: coach_educational_content, coach_content_completions
-- Adds 'training' to coach status flow: pending_payout → training → active

-- ────────────────────────────────────────────
-- 1. Educational Content table
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_educational_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 10,
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.coach_educational_content ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active content
CREATE POLICY "Authenticated users can read active educational content"
  ON public.coach_educational_content FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins can manage all content
CREATE POLICY "Admins can manage educational content"
  ON public.coach_educational_content FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ────────────────────────────────────────────
-- 2. Content Completions table
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_content_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES public.coach_educational_content(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  time_spent_seconds INTEGER,
  UNIQUE (coach_user_id, content_id)
);

-- RLS
ALTER TABLE public.coach_content_completions ENABLE ROW LEVEL SECURITY;

-- Coaches can read and insert their own completions
CREATE POLICY "Coaches can read own completions"
  ON public.coach_content_completions FOR SELECT
  TO authenticated
  USING (coach_user_id = auth.uid());

CREATE POLICY "Coaches can insert own completions"
  ON public.coach_content_completions FOR INSERT
  TO authenticated
  WITH CHECK (coach_user_id = auth.uid());

-- Admins can read all completions
CREATE POLICY "Admins can read all completions"
  ON public.coach_content_completions FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ────────────────────────────────────────────
-- 3. check_training_completion() RPC
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_training_completion(p_coach_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required_count INTEGER;
  v_completed_count INTEGER;
  v_all_complete BOOLEAN;
BEGIN
  -- Count required active content
  SELECT COUNT(*)
  INTO v_required_count
  FROM coach_educational_content
  WHERE is_required = true AND is_active = true;

  -- Count completed required content for this coach
  SELECT COUNT(*)
  INTO v_completed_count
  FROM coach_content_completions cc
  JOIN coach_educational_content ce ON ce.id = cc.content_id
  WHERE cc.coach_user_id = p_coach_user_id
    AND ce.is_required = true
    AND ce.is_active = true;

  v_all_complete := (v_completed_count >= v_required_count AND v_required_count > 0);

  -- If all required content is complete, auto-transition to active
  IF v_all_complete THEN
    UPDATE coaches SET status = 'active' WHERE user_id = p_coach_user_id AND status = 'training';
    UPDATE coaches_public SET status = 'active' WHERE user_id = p_coach_user_id AND status = 'training';
  END IF;

  RETURN jsonb_build_object(
    'required_count', v_required_count,
    'completed_count', v_completed_count,
    'all_complete', v_all_complete
  );
END;
$$;

-- ────────────────────────────────────────────
-- 4. Indexes
-- ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_coach_content_completions_coach
  ON public.coach_content_completions(coach_user_id);

CREATE INDEX IF NOT EXISTS idx_coach_content_completions_content
  ON public.coach_content_completions(content_id);

CREATE INDEX IF NOT EXISTS idx_coach_educational_content_active
  ON public.coach_educational_content(is_active, sort_order)
  WHERE is_active = true;
