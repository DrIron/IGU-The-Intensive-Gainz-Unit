-- Create RPC function to get videos with access states for efficient bulk checking
CREATE OR REPLACE FUNCTION public.get_educational_videos_with_access()
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  category text,
  is_pinned boolean,
  is_free_preview boolean,
  created_at timestamptz,
  access_state text,
  is_completed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT 
    ev.id,
    ev.title,
    -- Only show description for accessible videos
    CASE 
      WHEN public.can_access_video(ev.id) THEN ev.description
      ELSE NULL
    END as description,
    ev.category,
    ev.is_pinned,
    ev.is_free_preview,
    ev.created_at,
    -- Determine access state
    CASE
      WHEN ev.is_free_preview = true THEN 'preview'::text
      WHEN public.can_access_video(ev.id) THEN 'unlocked'::text
      ELSE 'locked'::text
    END as access_state,
    -- Check if user has completed this video
    EXISTS (
      SELECT 1 FROM public.video_progress vp
      WHERE vp.video_id = ev.id 
        AND vp.user_id = v_user_id 
        AND vp.completed_at IS NOT NULL
    ) as is_completed
  FROM public.educational_videos ev
  WHERE ev.is_active = true
  ORDER BY ev.is_pinned DESC, ev.created_at DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_educational_videos_with_access() TO authenticated;

-- Create function to mark video as complete
CREATE OR REPLACE FUNCTION public.mark_video_complete(p_video_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Verify user can access this video
  IF NOT public.can_access_video(p_video_id) THEN
    RAISE EXCEPTION 'Access denied to this video';
  END IF;
  
  -- Insert or update progress
  INSERT INTO public.video_progress (user_id, video_id, completed_at, last_watched_at)
  VALUES (v_user_id, p_video_id, now(), now())
  ON CONFLICT (user_id, video_id) 
  DO UPDATE SET 
    completed_at = COALESCE(video_progress.completed_at, now()),
    last_watched_at = now();
  
  RETURN true;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.mark_video_complete(uuid) TO authenticated;