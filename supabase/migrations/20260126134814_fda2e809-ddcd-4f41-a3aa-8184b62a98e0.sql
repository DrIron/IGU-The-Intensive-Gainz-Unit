-- ============================================================================
-- EDUCATIONAL VIDEOS ACCESS CONTROL MODEL
-- ============================================================================

-- 1. Add new fields to educational_videos table
-- Keep existing fields for backward compatibility during transition
ALTER TABLE public.educational_videos
ADD COLUMN IF NOT EXISTS module text,
ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS storage_bucket text DEFAULT 'educational-videos',
ADD COLUMN IF NOT EXISTS storage_path text,
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS is_free_preview boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS requires_completion boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS prerequisite_video_id uuid REFERENCES public.educational_videos(id) ON DELETE SET NULL;

-- Add index on module for efficient filtering
CREATE INDEX IF NOT EXISTS idx_educational_videos_module ON public.educational_videos(module);
CREATE INDEX IF NOT EXISTS idx_educational_videos_order ON public.educational_videos(order_index);
CREATE INDEX IF NOT EXISTS idx_educational_videos_active ON public.educational_videos(is_active) WHERE is_active = true;

-- 2. Create video_entitlements table for service-based access control
CREATE TABLE IF NOT EXISTS public.video_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.educational_videos(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  tier text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(video_id, service_id, tier)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_video_entitlements_video ON public.video_entitlements(video_id);
CREATE INDEX IF NOT EXISTS idx_video_entitlements_service ON public.video_entitlements(service_id);

-- 3. Create video_progress table for tracking user progress
CREATE TABLE IF NOT EXISTS public.video_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.educational_videos(id) ON DELETE CASCADE,
  completed_at timestamptz,
  last_watched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

-- Create index for efficient user progress lookups
CREATE INDEX IF NOT EXISTS idx_video_progress_user ON public.video_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_video_progress_completed ON public.video_progress(user_id) WHERE completed_at IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.educational_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_progress ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can view videos" ON public.educational_videos;
DROP POLICY IF EXISTS "Authenticated can view videos" ON public.educational_videos;
DROP POLICY IF EXISTS "educational_videos_select" ON public.educational_videos;

-- ============================================================================
-- HELPER FUNCTIONS FOR VIDEO ACCESS
-- ============================================================================

-- Check if user has entitlement to a video through their subscription
CREATE OR REPLACE FUNCTION public.user_has_video_entitlement(p_user_id uuid, p_video_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- User has active subscription with matching service entitlement
    SELECT 1
    FROM subscriptions s
    JOIN video_entitlements ve ON ve.service_id = s.service_id
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'pending_payment')
      AND ve.video_id = p_video_id
  )
$$;

-- Check if prerequisite is completed (or no prerequisite required)
CREATE OR REPLACE FUNCTION public.video_prerequisite_met(p_user_id uuid, p_video_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      -- No prerequisite required
      WHEN ev.prerequisite_video_id IS NULL THEN true
      -- Prerequisite exists, check if completed
      ELSE EXISTS (
        SELECT 1 FROM video_progress vp
        WHERE vp.user_id = p_user_id
          AND vp.video_id = ev.prerequisite_video_id
          AND vp.completed_at IS NOT NULL
      )
    END
  FROM educational_videos ev
  WHERE ev.id = p_video_id
$$;

-- Full video access check (combines entitlement + prerequisite + active + free preview)
CREATE OR REPLACE FUNCTION public.can_access_video(p_user_id uuid, p_video_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE
      -- Admin always has access
      WHEN public.has_role(p_user_id, 'admin') THEN true
      -- Coach always has access
      WHEN public.has_role(p_user_id, 'coach') THEN true
      -- Video must be active
      WHEN NOT EXISTS (SELECT 1 FROM educational_videos WHERE id = p_video_id AND is_active = true) THEN false
      -- Free preview videos are accessible to all authenticated
      WHEN EXISTS (SELECT 1 FROM educational_videos WHERE id = p_video_id AND is_free_preview = true) THEN true
      -- Check entitlement and prerequisite
      ELSE public.user_has_video_entitlement(p_user_id, p_video_id)
           AND public.video_prerequisite_met(p_user_id, p_video_id)
    END
$$;

-- ============================================================================
-- EDUCATIONAL_VIDEOS POLICIES
-- ============================================================================

-- Staff (admin/coach) can view all videos
CREATE POLICY "staff_view_all_videos"
ON public.educational_videos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'coach')
);

-- Clients can view active videos they have entitlement to OR free preview videos
CREATE POLICY "clients_view_entitled_videos"
ON public.educational_videos
FOR SELECT
TO authenticated
USING (
  -- Not staff (handled by other policy)
  NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'))
  AND is_active = true
  AND (
    -- Free preview accessible to all
    is_free_preview = true
    -- OR has entitlement through subscription
    OR public.user_has_video_entitlement(auth.uid(), id)
  )
);

-- Only admins can insert videos
CREATE POLICY "admins_insert_videos"
ON public.educational_videos
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update videos
CREATE POLICY "admins_update_videos"
ON public.educational_videos
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete videos
CREATE POLICY "admins_delete_videos"
ON public.educational_videos
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- VIDEO_ENTITLEMENTS POLICIES
-- ============================================================================

-- Admins can view all entitlements
CREATE POLICY "admins_view_entitlements"
ON public.video_entitlements
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can manage entitlements
CREATE POLICY "admins_manage_entitlements"
ON public.video_entitlements
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- VIDEO_PROGRESS POLICIES
-- ============================================================================

-- Users can view their own progress
CREATE POLICY "users_view_own_progress"
ON public.video_progress
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Staff can view progress of their clients
CREATE POLICY "staff_view_client_progress"
ON public.video_progress
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.is_on_active_care_team_for_client(auth.uid(), user_id)
  OR public.is_primary_coach_for_user(auth.uid(), user_id)
);

-- Users can insert their own progress
CREATE POLICY "users_insert_own_progress"
ON public.video_progress
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_access_video(auth.uid(), video_id)
);

-- Users can update their own progress
CREATE POLICY "users_update_own_progress"
ON public.video_progress
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Revoke anon access
REVOKE ALL ON public.educational_videos FROM anon;
REVOKE ALL ON public.video_entitlements FROM anon;
REVOKE ALL ON public.video_progress FROM anon;

-- Grant authenticated access (RLS will filter)
GRANT SELECT ON public.educational_videos TO authenticated;
GRANT SELECT ON public.video_entitlements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.video_progress TO authenticated;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.video_entitlements IS 'Maps educational videos to service tiers for access control. Videos are accessible if user has active subscription with matching service_id.';
COMMENT ON TABLE public.video_progress IS 'Tracks user video completion for prerequisite gating and progress reporting.';
COMMENT ON COLUMN public.educational_videos.storage_path IS 'Path within storage_bucket. Use signed URLs for playback - never store public URLs.';
COMMENT ON COLUMN public.educational_videos.is_free_preview IS 'If true, video is accessible to all authenticated users regardless of subscription.';
COMMENT ON COLUMN public.educational_videos.prerequisite_video_id IS 'If set, user must complete this video before accessing the current one.';