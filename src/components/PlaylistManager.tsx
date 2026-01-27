import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit, Trash2, GripVertical, Video } from "lucide-react";

interface VideoPlaylist {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface PlaylistVideo {
  id: string;
  playlist_id: string;
  video_id: string;
  order_number: number;
  educational_videos: {
    title: string;
    video_type: string;
  };
}

interface EducationalVideo {
  id: string;
  title: string;
  category: string;
  video_type: string;
}

export function PlaylistManager() {
  const [playlists, setPlaylists] = useState<VideoPlaylist[]>([]);
  const [videos, setVideos] = useState<EducationalVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlaylist, setEditingPlaylist] = useState<VideoPlaylist | null>(null);
  const [managingVideos, setManagingVideos] = useState<string | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<PlaylistVideo[]>([]);
  const [newPlaylist, setNewPlaylist] = useState({
    title: "",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    loadPlaylists();
    loadVideos();
  }, []);

  const loadPlaylists = async () => {
    try {
      const { data, error } = await supabase
        .from("video_playlists")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPlaylists(data || []);
    } catch (error: any) {
      toast.error("Failed to load playlists");
    } finally {
      setLoading(false);
    }
  };

  const loadVideos = async () => {
    try {
      const { data, error } = await supabase
        .from("educational_videos")
        .select("id, title, category, video_type")
        .order("title");

      if (error) throw error;
      setVideos(data || []);
    } catch (error: any) {
      toast.error("Failed to load videos");
    }
  };

  const loadPlaylistVideos = async (playlistId: string) => {
    try {
      const { data, error } = await supabase
        .from("playlist_videos")
        .select(`
          *,
          educational_videos (title, video_type)
        `)
        .eq("playlist_id", playlistId)
        .order("order_number");

      if (error) throw error;
      setPlaylistVideos(data as any || []);
    } catch (error: any) {
      toast.error("Failed to load playlist videos");
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylist.title.trim()) {
      toast.error("Please enter a playlist title");
      return;
    }

    try {
      const { error } = await supabase
        .from("video_playlists")
        .insert([newPlaylist]);

      if (error) throw error;

      toast.success("Playlist created successfully");
      setNewPlaylist({ title: "", description: "", is_active: true });
      loadPlaylists();
    } catch (error: any) {
      toast.error("Failed to create playlist");
    }
  };

  const handleUpdatePlaylist = async () => {
    if (!editingPlaylist) return;

    try {
      const { error } = await supabase
        .from("video_playlists")
        .update({
          title: editingPlaylist.title,
          description: editingPlaylist.description,
          is_active: editingPlaylist.is_active,
        })
        .eq("id", editingPlaylist.id);

      if (error) throw error;

      toast.success("Playlist updated successfully");
      setEditingPlaylist(null);
      loadPlaylists();
    } catch (error: any) {
      toast.error("Failed to update playlist");
    }
  };

  const handleDeletePlaylist = async (id: string) => {
    if (!confirm("Are you sure you want to delete this playlist?")) return;

    try {
      const { error } = await supabase
        .from("video_playlists")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Playlist deleted successfully");
      loadPlaylists();
    } catch (error: any) {
      toast.error("Failed to delete playlist");
    }
  };

  const handleAddVideoToPlaylist = async (playlistId: string, videoId: string) => {
    try {
      const maxOrder = playlistVideos.length > 0
        ? Math.max(...playlistVideos.map(pv => pv.order_number))
        : 0;

      const { error } = await supabase
        .from("playlist_videos")
        .insert([{
          playlist_id: playlistId,
          video_id: videoId,
          order_number: maxOrder + 1,
        }]);

      if (error) throw error;

      toast.success("Video added to playlist");
      loadPlaylistVideos(playlistId);
    } catch (error: any) {
      toast.error("Failed to add video to playlist");
    }
  };

  const handleRemoveVideoFromPlaylist = async (playlistVideoId: string, playlistId: string) => {
    try {
      const { error } = await supabase
        .from("playlist_videos")
        .delete()
        .eq("id", playlistVideoId);

      if (error) throw error;

      toast.success("Video removed from playlist");
      loadPlaylistVideos(playlistId);
    } catch (error: any) {
      toast.error("Failed to remove video");
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading playlists...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New Playlist</CardTitle>
          <CardDescription>Create a learning path for your clients</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Playlist Title</Label>
            <Input
              id="title"
              value={newPlaylist.title}
              onChange={(e) => setNewPlaylist({ ...newPlaylist, title: e.target.value })}
              placeholder="e.g., Beginner's Guide to Nutrition"
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={newPlaylist.description}
              onChange={(e) => setNewPlaylist({ ...newPlaylist, description: e.target.value })}
              placeholder="Describe what this learning path covers..."
            />
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              checked={newPlaylist.is_active}
              onCheckedChange={(checked) => setNewPlaylist({ ...newPlaylist, is_active: checked })}
            />
            <Label>Active (visible to clients)</Label>
          </div>
          <Button onClick={handleCreatePlaylist}>
            <Plus className="h-4 w-4 mr-2" />
            Create Playlist
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {playlists.map((playlist) => (
          <Card key={playlist.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle>{playlist.title}</CardTitle>
                  <CardDescription>{playlist.description}</CardDescription>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Status: {playlist.is_active ? "Active" : "Inactive"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setManagingVideos(playlist.id);
                          loadPlaylistVideos(playlist.id);
                        }}
                      >
                        <Video className="h-4 w-4 mr-2" />
                        Manage Videos
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Manage Playlist Videos</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Add Video to Playlist</Label>
                          <Select onValueChange={(videoId) => handleAddVideoToPlaylist(playlist.id, videoId)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a video to add" />
                            </SelectTrigger>
                            <SelectContent>
                              {videos.filter(v => !playlistVideos.some(pv => pv.video_id === v.id)).map((video) => (
                                <SelectItem key={video.id} value={video.id}>
                                  {video.title} ({video.category})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Videos in Playlist (in order)</Label>
                          {playlistVideos.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No videos in this playlist yet</p>
                          ) : (
                            playlistVideos.map((pv, index) => (
                              <div key={pv.id} className="flex items-center gap-2 p-2 border rounded">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{index + 1}.</span>
                                <span className="flex-1">{pv.educational_videos.title}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveVideoFromPlaylist(pv.id, playlist.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingPlaylist(playlist)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Playlist</DialogTitle>
                      </DialogHeader>
                      {editingPlaylist && (
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="edit-title">Title</Label>
                            <Input
                              id="edit-title"
                              value={editingPlaylist.title}
                              onChange={(e) =>
                                setEditingPlaylist({ ...editingPlaylist, title: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor="edit-description">Description</Label>
                            <Textarea
                              id="edit-description"
                              value={editingPlaylist.description || ""}
                              onChange={(e) =>
                                setEditingPlaylist({ ...editingPlaylist, description: e.target.value })
                              }
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={editingPlaylist.is_active}
                              onCheckedChange={(checked) =>
                                setEditingPlaylist({ ...editingPlaylist, is_active: checked })
                              }
                            />
                            <Label>Active</Label>
                          </div>
                          <Button onClick={handleUpdatePlaylist}>Update Playlist</Button>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeletePlaylist(playlist.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}