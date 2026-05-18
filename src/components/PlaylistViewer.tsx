import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ListOrdered } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VideoAccessCard, VideoAccessState } from "@/components/video/VideoAccessCard";
import { useVideoProgress } from "@/hooks/useVideoProgress";

interface VideoPlaylist {
  id: string;
  title: string;
  description: string | null;
}

interface PlaylistVideo {
  playlist_video_id: string;
  order_number: number;
  video_id: string;
  title: string;
  description: string | null;
  category: string;
  is_pinned: boolean;
  is_free_preview: boolean;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  access_state: VideoAccessState;
  is_completed: boolean;
}

interface PlaylistViewerProps {
  hideCompleteButton?: boolean;
}

export function PlaylistViewer({ hideCompleteButton = false }: PlaylistViewerProps) {
  const [playlists, setPlaylists] = useState<VideoPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<PlaylistVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingVideoId, setCompletingVideoId] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const { markComplete, loading: progressLoading } = useVideoProgress();

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
    } catch (error: unknown) {
      console.error("Error loading playlists:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadPlaylists();
  }, [loadPlaylists]);

  const loadPlaylistVideos = useCallback(async (playlistId: string) => {
    try {
      const { data, error } = await supabase.rpc("get_playlist_videos_with_access", {
        p_playlist_id: playlistId,
      });
      if (error) throw error;
      setPlaylistVideos((data ?? []) as PlaylistVideo[]);
    } catch (error: unknown) {
      console.error("Error loading playlist videos:", error);
      setPlaylistVideos([]);
    }
  }, []);

  useEffect(() => {
    if (selectedPlaylist) {
      loadPlaylistVideos(selectedPlaylist);
    }
  }, [selectedPlaylist, loadPlaylistVideos]);

  const handleVideoComplete = async (videoId: string) => {
    setCompletingVideoId(videoId);
    const success = await markComplete(videoId);
    if (success) {
      setPlaylistVideos((prev) =>
        prev.map((v) => (v.video_id === videoId ? { ...v, is_completed: true } : v))
      );
    }
    setCompletingVideoId(null);
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

  const currentPlaylist = playlists.find((p) => p.id === selectedPlaylist);
  const totalVideos = playlistVideos.length;
  const completedVideos = playlistVideos.filter((v) => v.is_completed).length;
  const progressPercent = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;

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
            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {completedVideos} of {totalVideos} videos completed
                </span>
                <span className="font-medium">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          </CardHeader>
        </Card>
      )}

      {totalVideos === 0 ? (
        <Alert>
          <ListOrdered className="h-4 w-4" />
          <AlertDescription>
            This learning path doesn't have any videos yet.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {playlistVideos.map((pv) => (
            <VideoAccessCard
              key={pv.playlist_video_id}
              id={pv.video_id}
              title={pv.title}
              description={pv.description}
              category={pv.category}
              isPinned={pv.is_pinned}
              isFreePreview={pv.is_free_preview}
              accessState={pv.access_state}
              isCompleted={pv.is_completed}
              numberBadge={pv.order_number}
              thumbnailUrl={pv.thumbnail_url}
              durationSeconds={pv.duration_seconds}
              onComplete={handleVideoComplete}
              completionLoading={completingVideoId === pv.video_id || progressLoading}
              hideCompleteButton={hideCompleteButton}
            />
          ))}
        </div>
      )}
    </div>
  );
}
