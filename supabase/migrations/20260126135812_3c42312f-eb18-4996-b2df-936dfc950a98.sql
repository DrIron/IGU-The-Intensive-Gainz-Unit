-- ============================================================================
-- CREATE PRIVATE STORAGE BUCKET FOR EDUCATIONAL VIDEOS
-- ============================================================================

-- Create private bucket (public = false means signed URLs required)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'educational-videos',
  'educational-videos',
  false,  -- PRIVATE: requires signed URLs
  524288000,  -- 500MB max file size
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,  -- Ensure it's private
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

-- ============================================================================
-- STORAGE POLICIES FOR EDUCATIONAL VIDEOS BUCKET
-- ============================================================================

-- Drop any existing policies
DROP POLICY IF EXISTS "Admin upload educational videos" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete educational videos" ON storage.objects;
DROP POLICY IF EXISTS "Admin update educational videos" ON storage.objects;
DROP POLICY IF EXISTS "No direct read educational videos" ON storage.objects;

-- Only admins can upload videos
CREATE POLICY "Admin upload educational videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'educational-videos'
  AND public.has_role(auth.uid(), 'admin')
);

-- Only admins can update videos
CREATE POLICY "Admin update educational videos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'educational-videos'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'educational-videos'
  AND public.has_role(auth.uid(), 'admin')
);

-- Only admins can delete videos
CREATE POLICY "Admin delete educational videos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'educational-videos'
  AND public.has_role(auth.uid(), 'admin')
);

-- NO direct SELECT policy - all access goes through signed URLs via edge function
-- This is intentional: the edge function uses service_role to generate signed URLs

-- ============================================================================
-- VIDEO ACCESS AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.video_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  video_id uuid NOT NULL REFERENCES public.educational_videos(id) ON DELETE CASCADE,
  access_granted boolean NOT NULL,
  denial_reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_video_access_log_user ON public.video_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_video_access_log_video ON public.video_access_log(video_id);
CREATE INDEX IF NOT EXISTS idx_video_access_log_denied ON public.video_access_log(access_granted) WHERE access_granted = false;

-- Enable RLS
ALTER TABLE public.video_access_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view access logs
CREATE POLICY "admins_view_access_logs"
ON public.video_access_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Revoke direct INSERT from authenticated (edge function uses service_role)
REVOKE INSERT ON public.video_access_log FROM authenticated;
GRANT INSERT ON public.video_access_log TO service_role;

COMMENT ON TABLE public.video_access_log IS 
'Audit log for video access requests. Tracks both granted and denied access for security monitoring.';