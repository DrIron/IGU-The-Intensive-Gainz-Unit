import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ListOrdered, Video, Youtube, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface VideoPlaylist {
  id: string;
  title: string;
  description: string | null;
}

interface PlaylistVideo {
  id: string;
  order_number: number;
  educational_videos: {
    id: string;
    title: string;
    description: string | null;
    video_url: string;
    video_type: string;
    category: string;
  };
}

export function PlaylistViewer() {
  const [playlists, setPlaylists] = useState<VideoPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<PlaylistVideo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlaylists = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("video_playlists")
        .select("id, title, description")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPlaylists(data || []);

      if (data && data.length > 0) {
        setSelectedPlaylist((current) => current ?? data[0].id);
      }
    } catch (error: any) {
      console.error("Error loading playlists:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    if (selectedPlaylist) {
      loadPlaylistVideos(selectedPlaylist);
    }
  }, [selectedPlaylist]);

  const loadPlaylistVideos = async (playlistId: string) => {
    try {
      const { data, error } = await supabase
        .from("playlist_videos")
        .select(`
          id,
          order_number,
          educational_videos (
            id,
            title,
            description,
            video_url,
            video_type,
            category
          )
        `)
        .eq("playlist_id", playlistId)
        .order("order_number");

      if (error) throw error;
      setPlaylistVideos(data as any || []);
    } catch (error: any) {
      console.error("Error loading playlist videos:", error);
    }
  };

  const getEmbedUrl = (videoUrl: string, videoType: string) => {
    if (videoType === 'youtube') {
      const match = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
      return match ? `https://www.youtube.com/embed/${match[1]}` : null;
    } else {
      const match = videoUrl.match(/loom\.com\/share\/([^?]+)/);
      return match ? `https://www.loom.com/embed/${match[1]}` : null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (playlists.length === 0) {
    return (
      <Alert>
        <ListOrdered className="h-4 w-4" />
        <AlertDescription>
          No learning paths available yet. Check back soon!
        </AlertDescription>
      </Alert>
    );
  }

  const currentPlaylist = playlists.find(p => p.id === selectedPlaylist);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {playlists.map((playlist) => (
          <Button
            key={playlist.id}
            variant={selectedPlaylist === playlist.id ? "default" : "outline"}
            onClick={() => setSelectedPlaylist(playlist.id)}
          >
            <ListOrdered className="h-4 w-4 mr-2" />
            {playlist.title}
          </Button>
        ))}
      </div>

      {currentPlaylist && (
        <Card>
          <CardHeader>
            <CardTitle>{currentPlaylist.title}</CardTitle>
            <CardDescription>{currentPlaylist.description}</CardDescription>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">
                  {playlistVideos.length} videos in this learning path
                </span>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-4">
        {playlistVideos.map((pv) => {
          const video = pv.educational_videos;
          const embedUrl = getEmbedUrl(video.video_url, video.video_type);
          
          return (
            <Card key={pv.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="secondary" className="text-lg font-bold">
                        {pv.order_number}
                      </Badge>
                      <CardTitle className="text-lg">{video.title}</CardTitle>
                    </div>
                    <CardDescription>{video.description}</CardDescription>
                  </div>
                  <Badge variant="outline">
                    {video.video_type === 'youtube' ? (
                      <Youtube className="h-3 w-3 mr-1" />
                    ) : (
                      <Video className="h-3 w-3 mr-1" />
                    )}
                    {video.video_type}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {embedUrl ? (
                  <div className="relative w-full pt-[56.25%]">
                    <iframe
                      src={embedUrl}
                      className="absolute top-0 left-0 w-full h-full"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <Button
                      variant="outline"
                      onClick={() => window.open(video.video_url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Watch Video
                    </Button>
                  </div>
                )}
                <div className="p-4 border-t">
                  <Badge variant="outline">{video.category}</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}