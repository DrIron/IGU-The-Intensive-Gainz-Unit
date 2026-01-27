-- ============================================================================
-- SIMPLIFIED VIDEO ACCESS FUNCTION FOR RLS
-- Drop ALL dependent policies first, then recreate everything
-- ============================================================================

-- 1. Drop ALL policies that depend on video access functions
DROP POLICY IF EXISTS "users_insert_own_progress" ON public.video_progress;
DROP POLICY IF EXISTS "clients_view_entitled_videos" ON public.educational_videos;
DROP POLICY IF EXISTS "staff_view_all_videos" ON public.educational_videos;

-- 2. Drop the old functions (now safe since policies are gone)
DROP FUNCTION IF EXISTS public.can_access_video(uuid, uuid);
DROP FUNCTION IF EXISTS public.user_has_video_entitlement(uuid, uuid);
DROP FUNCTION IF EXISTS public.user_has_video_entitlement(uuid);
DROP FUNCTION IF EXISTS public.video_prerequisite_met(uuid, uuid);
DROP FUNCTION IF EXISTS public.video_prerequisite_met(uuid);

-- 3. Create RLS-safe helper: can_access_video(p_video_id)
-- Uses auth.uid() internally - safe for direct use in RLS policies
CREATE OR REPLACE FUNCTION public.can_access_video(p_video_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_free_preview boolean;
  v_prerequisite_id uuid;
  v_has_entitlement boolean;
  v_prerequisite_completed boolean;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Rule 1: No auth → false
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Rule 2: Admin always has access
  IF public.has_role(v_user_id, 'admin') THEN
    RETURN true;
  END IF;
  
  -- Rule 3: Coach always has access
  IF public.has_role(v_user_id, 'coach') THEN
    RETURN true;
  END IF;
  
  -- Get video metadata (is_free_preview, prerequisite_video_id)
  SELECT 
    ev.is_free_preview,
    ev.prerequisite_video_id
  INTO v_is_free_preview, v_prerequisite_id
  FROM educational_videos ev
  WHERE ev.id = p_video_id
    AND ev.is_active = true;
  
  -- Video not found or inactive → false
  IF v_is_free_preview IS NULL THEN
    RETURN false;
  END IF;
  
  -- Rule 4: Free preview → true for authenticated
  IF v_is_free_preview = true THEN
    RETURN true;
  END IF;
  
  -- Rule 5: Check subscription entitlement
  -- User must have ACTIVE subscription with service that has entitlement to this video
  SELECT EXISTS (
    SELECT 1
    FROM subscriptions s
    INNER JOIN video_entitlements ve ON ve.service_id = s.service_id
    WHERE s.user_id = v_user_id
      AND s.status = 'active'
      AND ve.video_id = p_video_id
  ) INTO v_has_entitlement;
  
  IF NOT v_has_entitlement THEN
    RETURN false;
  END IF;
  
  -- Rule 6: Check prerequisite if exists
  IF v_prerequisite_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM video_progress vp
      WHERE vp.user_id = v_user_id
        AND vp.video_id = v_prerequisite_id
        AND vp.completed_at IS NOT NULL
    ) INTO v_prerequisite_completed;
    
    IF NOT v_prerequisite_completed THEN
      RETURN false;
    END IF;
  END IF;
  
  -- All checks passed
  RETURN true;
END;
$$;

-- 4. Create simplified helper functions
CREATE OR REPLACE FUNCTION public.user_has_video_entitlement(p_video_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM subscriptions s
    INNER JOIN video_entitlements ve ON ve.service_id = s.service_id
    WHERE s.user_id = auth.uid()
      AND s.status = 'active'
      AND ve.video_id = p_video_id
  )
$$;

CREATE OR REPLACE FUNCTION public.video_prerequisite_met(p_video_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN ev.prerequisite_video_id IS NULL THEN true
      ELSE EXISTS (
        SELECT 1 FROM video_progress vp
        WHERE vp.user_id = auth.uid()
          AND vp.video_id = ev.prerequisite_video_id
          AND vp.completed_at IS NOT NULL
      )
    END
  FROM educational_videos ev
  WHERE ev.id = p_video_id
$$;

-- 5. Recreate all RLS policies using new functions

-- Staff (admin/coach) can view all videos
CREATE POLICY "staff_view_all_videos"
ON public.educational_videos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'coach')
);

-- Clients can view videos they can access (uses simplified function)
CREATE POLICY "clients_view_entitled_videos"
ON public.educational_videos
FOR SELECT
TO authenticated
USING (
  NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'))
  AND public.can_access_video(id)
);

-- Users can insert their own progress if they can access the video
CREATE POLICY "users_insert_own_progress"
ON public.video_progress
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_access_video(video_id)
);

-- Add documentation
COMMENT ON FUNCTION public.can_access_video(uuid) IS 
'RLS-safe video access check. Returns true if current user (auth.uid()) can access the video.
Logic: admin→true, coach→true, free_preview→true, else requires active subscription with entitlement + completed prerequisite.';

COMMENT ON FUNCTION public.user_has_video_entitlement(uuid) IS 
'Check if current user has active subscription with entitlement to this video.';

COMMENT ON FUNCTION public.video_prerequisite_met(uuid) IS 
'Check if video prerequisite is completed (or no prerequisite required).';