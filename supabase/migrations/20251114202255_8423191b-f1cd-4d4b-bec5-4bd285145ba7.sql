-- Create video playlists table
CREATE TABLE public.video_playlists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create playlist videos junction table
CREATE TABLE public.playlist_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID NOT NULL REFERENCES public.video_playlists(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.educational_videos(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(playlist_id, video_id),
  UNIQUE(playlist_id, order_number)
);

-- Enable RLS
ALTER TABLE public.video_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_videos ENABLE ROW LEVEL SECURITY;

-- RLS policies for video_playlists
CREATE POLICY "Admins can manage playlists"
  ON public.video_playlists
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view active playlists"
  ON public.video_playlists
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

-- RLS policies for playlist_videos
CREATE POLICY "Admins can manage playlist videos"
  ON public.playlist_videos
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view playlist videos"
  ON public.playlist_videos
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM public.video_playlists 
      WHERE id = playlist_videos.playlist_id AND is_active = true
    )
  );

-- Create updated_at trigger for video_playlists
CREATE TRIGGER update_video_playlists_updated_at
  BEFORE UPDATE ON public.video_playlists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_playlist_videos_playlist_id ON public.playlist_videos(playlist_id);
CREATE INDEX idx_playlist_videos_video_id ON public.playlist_videos(video_id);
CREATE INDEX idx_playlist_videos_order ON public.playlist_videos(playlist_id, order_number);