-- Create educational_videos table
CREATE TABLE IF NOT EXISTS public.educational_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  video_type TEXT NOT NULL CHECK (video_type IN ('youtube', 'loom')),
  category TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.educational_videos ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage educational videos"
  ON public.educational_videos
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can view videos
CREATE POLICY "Authenticated users can view educational videos"
  ON public.educational_videos
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Create updated_at trigger
CREATE TRIGGER update_educational_videos_updated_at
  BEFORE UPDATE ON public.educational_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_educational_videos_category ON public.educational_videos(category);
CREATE INDEX idx_educational_videos_pinned ON public.educational_videos(is_pinned);
CREATE INDEX idx_educational_videos_created_at ON public.educational_videos(created_at DESC);