-- ============================================================================
-- EDUCATIONAL VIDEOS RLS - STRICT ACCESS CONTROL
-- ============================================================================

-- Ensure RLS is enabled on all tables
ALTER TABLE public.educational_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_progress ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1. EDUCATIONAL_VIDEOS POLICIES
-- ============================================================================

-- Drop ALL existing policies to start clean
DROP POLICY IF EXISTS "staff_view_all_videos" ON public.educational_videos;
DROP POLICY IF EXISTS "clients_view_entitled_videos" ON public.educational_videos;
DROP POLICY IF EXISTS "admins_insert_videos" ON public.educational_videos;
DROP POLICY IF EXISTS "admins_update_videos" ON public.educational_videos;
DROP POLICY IF EXISTS "admins_delete_videos" ON public.educational_videos;
DROP POLICY IF EXISTS "Anyone can view videos" ON public.educational_videos;
DROP POLICY IF EXISTS "Authenticated can view videos" ON public.educational_videos;

-- Admins can SELECT all videos (active or inactive)
CREATE POLICY "admins_select_all_videos"
ON public.educational_videos
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Coaches can SELECT all active videos
CREATE POLICY "coaches_select_active_videos"
ON public.educational_videos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach')
  AND is_active = true
);

-- Clients can SELECT only entitled/free videos that are active
-- Uses can_access_video which checks: admin, coach, free_preview, entitlement, prerequisite
CREATE POLICY "clients_select_entitled_videos"
ON public.educational_videos
FOR SELECT
TO authenticated
USING (
  -- Not admin and not coach (they have their own policies)
  NOT public.has_role(auth.uid(), 'admin')
  AND NOT public.has_role(auth.uid(), 'coach')
  -- Must be active AND user must have access
  AND is_active = true
  AND public.can_access_video(id)
);

-- Only admins can INSERT videos
CREATE POLICY "admins_insert_videos"
ON public.educational_videos
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can UPDATE videos
CREATE POLICY "admins_update_videos"
ON public.educational_videos
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can DELETE videos
CREATE POLICY "admins_delete_videos"
ON public.educational_videos
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- 2. VIDEO_ENTITLEMENTS POLICIES (ADMIN-ONLY)
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "admins_view_entitlements" ON public.video_entitlements;
DROP POLICY IF EXISTS "admins_manage_entitlements" ON public.video_entitlements;

-- Admins can SELECT all entitlements
CREATE POLICY "admins_select_entitlements"
ON public.video_entitlements
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can INSERT entitlements
CREATE POLICY "admins_insert_entitlements"
ON public.video_entitlements
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can UPDATE entitlements
CREATE POLICY "admins_update_entitlements"
ON public.video_entitlements
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can DELETE entitlements
CREATE POLICY "admins_delete_entitlements"
ON public.video_entitlements
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- NO policy for normal users - they cannot see entitlement mappings

-- ============================================================================
-- 3. VIDEO_PROGRESS POLICIES
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "users_view_own_progress" ON public.video_progress;
DROP POLICY IF EXISTS "staff_view_client_progress" ON public.video_progress;
DROP POLICY IF EXISTS "users_insert_own_progress" ON public.video_progress;
DROP POLICY IF EXISTS "users_update_own_progress" ON public.video_progress;

-- Users can SELECT their own progress
CREATE POLICY "users_select_own_progress"
ON public.video_progress
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins can SELECT all progress
CREATE POLICY "admins_select_all_progress"
ON public.video_progress
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Coaches can SELECT progress of their assigned clients
CREATE POLICY "coaches_select_client_progress"
ON public.video_progress
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach')
  AND (
    public.is_primary_coach_for_user(auth.uid(), user_id)
    OR public.is_on_active_care_team_for_client(auth.uid(), user_id)
  )
);

-- Users can INSERT their own progress (only if they can access the video)
CREATE POLICY "users_insert_own_progress"
ON public.video_progress
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_access_video(video_id)
);

-- Users can UPDATE their own progress
CREATE POLICY "users_update_own_progress"
ON public.video_progress
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Admins can INSERT/UPDATE/DELETE any progress (for data management)
CREATE POLICY "admins_manage_all_progress"
ON public.video_progress
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- REVOKE ANON ACCESS (defense in depth)
-- ============================================================================

REVOKE ALL ON public.educational_videos FROM anon;
REVOKE ALL ON public.video_entitlements FROM anon;
REVOKE ALL ON public.video_progress FROM anon;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.educational_videos IS 
'Educational video content. RLS: Admins see all, coaches see active, clients see only entitled/free active videos.';

COMMENT ON TABLE public.video_entitlements IS 
'Maps videos to services for access control. RLS: Admin-only - users cannot inspect entitlement mappings.';

COMMENT ON TABLE public.video_progress IS 
'User video completion tracking. RLS: Users see/edit own progress, admins see all, coaches see assigned clients.';