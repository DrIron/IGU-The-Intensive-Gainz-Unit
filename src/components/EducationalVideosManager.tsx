import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Pin, Video, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlaylistManager } from "./PlaylistManager";

interface EducationalVideo {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  video_type: 'youtube' | 'loom';
  category: string;
  is_pinned: boolean;
  created_at: string;
}

const CATEGORIES = [
  "Nutrition Basics",
  "Training Fundamentals",
  "Recovery & Rest",
  "Goal Setting",
  "Meal Prep",
  "Exercise Form",
  "Mindset & Motivation",
  "Supplement Guide",
  "Other"
];

export function EducationalVideosManager() {
  const { toast } = useToast();
  const [videos, setVideos] = useState<EducationalVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<EducationalVideo | null>(null);
  
  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoType, setVideoType] = useState<'youtube' | 'loom'>('youtube');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('educational_videos')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVideos((data || []) as EducationalVideo[]);
    } catch (error: any) {
      console.error('Error loading videos:', error);
      toast({
        title: "Error",
        description: "Failed to load videos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setVideoUrl("");
    setVideoType('youtube');
    setCategory(CATEGORIES[0]);
    setIsPinned(false);
    setEditingVideo(null);
  };

  const handleEdit = (video: EducationalVideo) => {
    setEditingVideo(video);
    setTitle(video.title);
    setDescription(video.description || "");
    setVideoUrl(video.video_url);
    setVideoType(video.video_type);
    setCategory(video.category);
    setIsPinned(video.is_pinned);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !videoUrl.trim()) {
      toast({
        title: "Validation Error",
        description: "Title and video URL are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const videoData = {
        title: title.trim(),
        description: description.trim() || null,
        video_url: videoUrl.trim(),
        video_type: videoType,
        category,
        is_pinned: isPinned,
      };

      if (editingVideo) {
        const { error } = await supabase
          .from('educational_videos')
          .update(videoData)
          .eq('id', editingVideo.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Video updated successfully",
        });
      } else {
        const { error } = await supabase
          .from('educational_videos')
          .insert(videoData);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Video added successfully",
        });
      }

      setDialogOpen(false);
      resetForm();
      loadVideos();
    } catch (error: any) {
      console.error('Error saving video:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save video",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this video?")) return;

    try {
      const { error } = await supabase
        .from('educational_videos')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Video deleted successfully",
      });

      loadVideos();
    } catch (error: any) {
      console.error('Error deleting video:', error);
      toast({
        title: "Error",
        description: "Failed to delete video",
        variant: "destructive",
      });
    }
  };

  const togglePin = async (video: EducationalVideo) => {
    try {
      const { error } = await supabase
        .from('educational_videos')
        .update({ is_pinned: !video.is_pinned })
        .eq('id', video.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: video.is_pinned ? "Video unpinned" : "Video pinned",
      });

      loadVideos();
    } catch (error: any) {
      console.error('Error toggling pin:', error);
      toast({
        title: "Error",
        description: "Failed to update video",
        variant: "destructive",
      });
    }
  };

  return (
    <Tabs defaultValue="videos" className="space-y-6">
      <TabsList>
        <TabsTrigger value="videos">Videos</TabsTrigger>
        <TabsTrigger value="playlists">Learning Paths</TabsTrigger>
      </TabsList>

      <TabsContent value="videos">
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Educational Videos
            </CardTitle>
            <CardDescription>
              Manage educational video content for clients
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Video
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingVideo ? "Edit Video" : "Add New Video"}</DialogTitle>
                <DialogDescription>
                  Add educational videos from YouTube or Loom
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Understanding Macros"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the video content..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="videoType">Video Platform *</Label>
                    <Select value={videoType} onValueChange={(value: 'youtube' | 'loom') => setVideoType(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="loom">Loom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="videoUrl">Video URL *</Label>
                  <Input
                    id="videoUrl"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=... or https://loom.com/share/..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the full URL from YouTube or Loom
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="pinned"
                    checked={isPinned}
                    onCheckedChange={setIsPinned}
                  />
                  <Label htmlFor="pinned" className="cursor-pointer">
                    Pin this video to the top
                  </Label>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit}>
                  {editingVideo ? "Update Video" : "Add Video"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Video className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No educational videos yet</p>
            <p className="text-sm">Click "Add Video" to get started</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.map((video) => (
                <TableRow key={video.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {video.is_pinned && <Pin className="h-4 w-4 text-primary" />}
                      <div>
                        <div className="font-medium">{video.title}</div>
                        {video.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {video.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{video.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {video.video_type === 'youtube' ? 'YouTube' : 'Loom'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {video.is_pinned ? (
                      <Badge>Pinned</Badge>
                    ) : (
                      <Badge variant="outline">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(video.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(video.video_url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePin(video)}
                      >
                        <Pin className={`h-4 w-4 ${video.is_pinned ? 'text-primary' : ''}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(video)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(video.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
      </TabsContent>

      <TabsContent value="playlists">
        <PlaylistManager />
      </TabsContent>
    </Tabs>
  );
}
