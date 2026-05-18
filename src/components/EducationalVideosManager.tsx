import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Pin, Video, ExternalLink, X, Clock, Search, GripVertical, MoreHorizontal, Eye, EyeOff, FolderInput, ListPlus } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlaylistManager } from "./PlaylistManager";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';
import {
  CATEGORIES,
  validateVideoUrl,
  detectVideoTypeFromUrl,
  fetchActiveServices,
  formatDuration,
  normalizeVideoUrl,
  loadAdminFilterState,
  saveAdminFilterState,
  ServiceOption,
  AdminStatusFilter,
  AdminTypeFilter,
  AdminSortKey,
} from "@/lib/educationalContent";

interface EducationalVideo {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  video_type: 'youtube' | 'loom';
  category: string;
  is_pinned: boolean;
  is_free_preview: boolean;
  is_active: boolean;
  required_service_ids: string[] | null;
  duration_seconds: number | null;
  order_index: number | null;
  required_for_role: "client" | "coach" | "all" | null;
  created_at: string;
}

interface PlaylistOption {
  id: string;
  title: string;
}

export function EducationalVideosManager() {
  const { toast } = useToast();
  const [videos, setVideos] = useState<EducationalVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<EducationalVideo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EducationalVideo | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoType, setVideoType] = useState<'youtube' | 'loom'>('youtube');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [isPinned, setIsPinned] = useState(false);
  const [isFreePreview, setIsFreePreview] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [requiredServiceIds, setRequiredServiceIds] = useState<string[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState<string>("");
  const [requiredForRole, setRequiredForRole] = useState<"client" | "coach" | "all" | null>(null);

  // PR E: admin search/filter/sort, persisted to localStorage.
  const initialFilter = useMemo(() => loadAdminFilterState(), []);
  const [searchQuery, setSearchQuery] = useState(initialFilter.q);
  const [categoryFilter, setCategoryFilter] = useState<string>(initialFilter.category);
  const [statusFilter, setStatusFilter] = useState<AdminStatusFilter>(initialFilter.status);
  const [typeFilter, setTypeFilter] = useState<AdminTypeFilter>(initialFilter.type);
  const [sortBy, setSortBy] = useState<AdminSortKey>(initialFilter.sort);

  // PR E: duplicate-URL detection.
  const [duplicateWarning, setDuplicateWarning] = useState<{ existing: EducationalVideo; normalized: string } | null>(null);

  // PR E: expanded bulk ops.
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState<string>(CATEGORIES[0]);
  const [bulkPlaylistOpen, setBulkPlaylistOpen] = useState(false);
  const [bulkPlaylistTarget, setBulkPlaylistTarget] = useState<string>("");
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const playlistsFetched = useRef(false);

  const loadVideos = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('educational_videos')
        .select('id, title, description, video_url, video_type, category, is_pinned, is_free_preview, is_active, required_service_ids, duration_seconds, order_index, required_for_role, created_at')
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
  }, [toast]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // PR E: persist admin filter state.
  useEffect(() => {
    saveAdminFilterState({
      q: searchQuery,
      category: categoryFilter,
      status: statusFilter,
      type: typeFilter,
      sort: sortBy,
    });
  }, [searchQuery, categoryFilter, statusFilter, typeFilter, sortBy]);

  // PR E: lazy-load active playlists (bulk-add target). Fires once on first need.
  const loadPlaylists = useCallback(async () => {
    if (playlistsFetched.current) return;
    playlistsFetched.current = true;
    const { data, error } = await supabase
      .from('video_playlists')
      .select('id, title')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load playlists:', error);
      playlistsFetched.current = false;
      return;
    }
    setPlaylists((data ?? []) as PlaylistOption[]);
  }, []);

  // PR E: derived list.
  const filteredVideos = useMemo(() => {
    return videos
      .filter((v) => {
        if (categoryFilter !== "all" && v.category !== categoryFilter) return false;
        if (typeFilter !== "all" && v.video_type !== typeFilter) return false;
        if (statusFilter === "active" && !v.is_active) return false;
        if (statusFilter === "inactive" && v.is_active) return false;
        if (statusFilter === "pinned" && !v.is_pinned) return false;
        if (statusFilter === "free_preview" && !v.is_free_preview) return false;
        if (statusFilter === "required" && !v.required_for_role) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            v.title.toLowerCase().includes(q) ||
            (v.description?.toLowerCase().includes(q) ?? false) ||
            v.category.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "order") return (a.order_index ?? 0) - (b.order_index ?? 0);
        if (sortBy === "created_desc") return b.created_at.localeCompare(a.created_at);
        if (sortBy === "created_asc") return a.created_at.localeCompare(b.created_at);
        if (sortBy === "title_asc") return a.title.localeCompare(b.title);
        if (sortBy === "title_desc") return b.title.localeCompare(a.title);
        return 0;
      });
  }, [videos, searchQuery, categoryFilter, statusFilter, typeFilter, sortBy]);

  // PR E: DnD reorder. Only enabled when sort=manual AND no filters narrow the list.
  const dndEnabled = sortBy === "order" && filteredVideos.length === videos.length;

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = Array.from(filteredVideos);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    const updates = reordered.map((v, idx) => ({ id: v.id, order_index: idx }));
    setVideos((prev) =>
      prev.map((v) => {
        const u = updates.find((x) => x.id === v.id);
        return u ? { ...v, order_index: u.order_index } : v;
      })
    );
    const results = await Promise.all(
      updates.map((u) =>
        supabase.from("educational_videos").update({ order_index: u.order_index }).eq("id", u.id)
      )
    );
    const firstError = results.find((r) => r.error);
    if (firstError?.error) {
      toast({ title: "Reorder failed", description: sanitizeErrorForUser(firstError.error), variant: "destructive" });
      loadVideos();
      return;
    }
    toast({ title: "Order saved" });
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setVideoUrl("");
    setVideoType('youtube');
    setCategory(CATEGORIES[0]);
    setIsPinned(false);
    setIsFreePreview(false);
    setIsActive(true);
    setRequiredServiceIds([]);
    setDurationMinutes("");
    setRequiredForRole(null);
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
    setIsFreePreview(video.is_free_preview ?? false);
    setIsActive(video.is_active ?? true);
    setRequiredServiceIds(video.required_service_ids ?? []);
    setDurationMinutes(video.duration_seconds ? String(Math.round(video.duration_seconds / 60)) : "");
    setRequiredForRole(video.required_for_role ?? null);
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

    const v = validateVideoUrl(videoUrl);
    if (!v.valid) {
      toast({ title: "Validation Error", description: v.error, variant: "destructive" });
      return;
    }

    // PR E: duplicate detection (new videos only -- edits keep their existing URL).
    if (!editingVideo) {
      const normalized = normalizeVideoUrl(videoUrl);
      const duplicate = videos.find((existing) => normalizeVideoUrl(existing.video_url) === normalized);
      if (duplicate) {
        setDuplicateWarning({ existing: duplicate, normalized });
        return;
      }
    }

    await _doSubmit();
  };

  const handleSubmitAnyway = async () => {
    setDuplicateWarning(null);
    await _doSubmit();
  };

  const _doSubmit = async () => {
    const v = validateVideoUrl(videoUrl);
    if (!v.valid) return; // already validated upstream; defensive guard.
    const effectiveVideoType = v.videoType;

    try {
      const videoData = {
        title: title.trim(),
        description: description.trim() || null,
        video_url: videoUrl.trim(),
        video_type: effectiveVideoType,
        category,
        is_pinned: isPinned,
        is_free_preview: isFreePreview,
        is_active: isActive,
        required_service_ids: requiredServiceIds.length > 0 ? requiredServiceIds : null,
        duration_seconds: durationMinutes.trim() === ""
          ? null
          : Math.max(1, Math.round(parseFloat(durationMinutes) * 60)),
        required_for_role: requiredForRole,
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
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const { error } = await supabase
        .from('educational_videos')
        .delete()
        .eq('id', deleteTarget.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Video deleted successfully",
      });

      setDeleteTarget(null);
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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredVideos.length && filteredVideos.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredVideos.map((v) => v.id)));
    }
  };

  const bulkSetField = async (field: "is_active" | "is_pinned", value: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const { error } = await supabase.from("educational_videos").update({ [field]: value }).in("id", ids);
    if (error) {
      toast({ title: "Bulk update failed", description: sanitizeErrorForUser(error), variant: "destructive" });
      return;
    }
    toast({ title: `${ids.length} video${ids.length === 1 ? "" : "s"} updated` });
    setSelectedIds(new Set());
    loadVideos();
  };

  const bulkMoveCategory = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("educational_videos")
      .update({ category: bulkCategoryTarget })
      .in("id", ids);
    if (error) {
      toast({ title: "Move failed", description: sanitizeErrorForUser(error), variant: "destructive" });
      return;
    }
    toast({ title: `${ids.length} video${ids.length === 1 ? "" : "s"} moved to ${bulkCategoryTarget}` });
    setBulkCategoryOpen(false);
    setSelectedIds(new Set());
    loadVideos();
  };

  const bulkAddToPlaylist = async () => {
    if (!bulkPlaylistTarget) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const { data: existing, error: readErr } = await supabase
      .from("playlist_videos")
      .select("video_id, order_number")
      .eq("playlist_id", bulkPlaylistTarget);
    if (readErr) {
      toast({ title: "Add to playlist failed", description: sanitizeErrorForUser(readErr), variant: "destructive" });
      return;
    }
    const existingVideoIds = new Set((existing ?? []).map((r) => r.video_id));
    const maxOrder = (existing ?? []).reduce((max, r) => Math.max(max, r.order_number ?? 0), 0);
    const toInsert = ids
      .filter((vid) => !existingVideoIds.has(vid))
      .map((vid, idx) => ({ playlist_id: bulkPlaylistTarget, video_id: vid, order_number: maxOrder + idx + 1 }));
    const skipped = ids.length - toInsert.length;
    if (toInsert.length === 0) {
      toast({ title: "All selected videos already in this playlist" });
      setBulkPlaylistOpen(false);
      return;
    }
    const { error: insertErr } = await supabase.from("playlist_videos").insert(toInsert);
    if (insertErr) {
      toast({ title: "Add to playlist failed", description: sanitizeErrorForUser(insertErr), variant: "destructive" });
      return;
    }
    const target = playlists.find((p) => p.id === bulkPlaylistTarget)?.title ?? "playlist";
    toast({
      title: `Added ${toInsert.length} to ${target}${skipped > 0 ? ` (${skipped} already present)` : ""}`,
    });
    setBulkPlaylistOpen(false);
    setSelectedIds(new Set());
  };

  const bulkDeleteVideos = async () => {
    try {
      const { error } = await supabase
        .from('educational_videos')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast({
        title: "Success",
        description: `${selectedIds.size} video${selectedIds.size > 1 ? "s" : ""} deleted.`,
      });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      loadVideos();
    } catch (error: any) {
      console.error('Error deleting videos:', error);
      toast({
        title: "Error",
        description: "Failed to delete videos",
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
            if (open && services.length === 0) {
              setServicesLoading(true);
              fetchActiveServices()
                .then(setServices)
                .catch((err) => {
                  console.error(err);
                  toast({ title: "Failed to load services", variant: "destructive" });
                })
                .finally(() => setServicesLoading(false));
            }
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (minutes)</Label>
                    <Input
                      id="duration"
                      type="number"
                      min={1}
                      placeholder="Optional"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="videoUrl">Video URL *</Label>
                  <Input
                    id="videoUrl"
                    value={videoUrl}
                    onChange={(e) => {
                      const next = e.target.value;
                      setVideoUrl(next);
                      const detected = detectVideoTypeFromUrl(next);
                      if (detected) setVideoType(detected);
                    }}
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

                <div className="flex items-center justify-between space-y-0">
                  <div className="space-y-0.5">
                    <Label htmlFor="freePreview" className="cursor-pointer">Free preview</Label>
                    <p className="text-xs text-muted-foreground">Visible to all authenticated users regardless of subscription.</p>
                  </div>
                  <Switch id="freePreview" checked={isFreePreview} onCheckedChange={setIsFreePreview} />
                </div>

                <div className="flex items-center justify-between space-y-0">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive" className="cursor-pointer">Active</Label>
                    <p className="text-xs text-muted-foreground">Inactive videos are hidden from clients and coaches. Useful for archiving without losing watch history.</p>
                  </div>
                  <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Visible to</Label>
                    <span className="text-xs text-muted-foreground">
                      {requiredServiceIds.length === 0
                        ? "All subscribers"
                        : `${requiredServiceIds.length} of ${services.length} services`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Leave empty for all active subscribers. Pick specific services to scope this video.</p>
                  {servicesLoading ? (
                    <p className="text-xs text-muted-foreground">Loading services...</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {services.map((svc) => (
                        <label key={svc.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <Checkbox
                            checked={requiredServiceIds.includes(svc.id)}
                            onCheckedChange={(checked) => {
                              setRequiredServiceIds((prev) =>
                                checked ? [...prev, svc.id] : prev.filter((id) => id !== svc.id)
                              );
                            }}
                          />
                          <span>{svc.name} <span className="text-muted-foreground">({svc.price_kwd} KWD)</span></span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Required viewing</Label>
                  <Select
                    value={requiredForRole ?? "none"}
                    onValueChange={(v) => setRequiredForRole(v === "none" ? null : (v as "client" | "coach" | "all"))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not required (optional viewing)</SelectItem>
                      <SelectItem value="client">Required for clients</SelectItem>
                      <SelectItem value="coach">Required for active coaches</SelectItem>
                      <SelectItem value="all">Required for everyone</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Required videos appear in a dedicated section on the user's library page and trigger a dashboard banner until completed.
                  </p>
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
          <>
          {/* PR E: search + filter + sort bar */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search title, description, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AdminStatusFilter)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="pinned">Pinned</SelectItem>
                <SelectItem value="free_preview">Free preview</SelectItem>
                <SelectItem value="required">Required</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AdminTypeFilter)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="loom">Loom</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as AdminSortKey)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="order">Manual order</SelectItem>
                <SelectItem value="created_desc">Newest first</SelectItem>
                <SelectItem value="created_asc">Oldest first</SelectItem>
                <SelectItem value="title_asc">Title A&rarr;Z</SelectItem>
                <SelectItem value="title_desc">Title Z&rarr;A</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Showing {filteredVideos.length} of {videos.length} videos.
          </p>

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-3 mb-4 rounded-lg border bg-muted/50">
              <span className="text-sm font-medium mr-2">{selectedIds.size} selected</span>
              <Button variant="outline" size="sm" onClick={() => bulkSetField("is_active", true)}>
                <Eye className="h-4 w-4 mr-2" /> Activate
              </Button>
              <Button variant="outline" size="sm" onClick={() => bulkSetField("is_active", false)}>
                <EyeOff className="h-4 w-4 mr-2" /> Deactivate
              </Button>
              <Button variant="outline" size="sm" onClick={() => bulkSetField("is_pinned", true)}>
                <Pin className="h-4 w-4 mr-2" /> Pin
              </Button>
              <Button variant="outline" size="sm" onClick={() => bulkSetField("is_pinned", false)}>
                <Pin className="h-4 w-4 mr-2" /> Unpin
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreHorizontal className="h-4 w-4 mr-2" /> More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { setBulkCategoryTarget(CATEGORIES[0]); setBulkCategoryOpen(true); }}>
                    <FolderInput className="h-4 w-4 mr-2" /> Move to category...
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      loadPlaylists();
                      setBulkPlaylistTarget(playlists[0]?.id ?? "");
                      setBulkPlaylistOpen(true);
                    }}
                  >
                    <ListPlus className="h-4 w-4 mr-2" /> Add to playlist...
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            </div>
          )}

          <DragDropContext onDragEnd={handleDragEnd}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredVideos.length > 0 && selectedIds.size === filteredVideos.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <Droppable droppableId="videos">
                {(provided) => (
                  <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                    {filteredVideos.map((video, idx) => (
                      <Draggable key={video.id} draggableId={video.id} index={idx} isDragDisabled={!dndEnabled}>
                        {(dragProvided, snapshot) => (
                          <TableRow
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`${selectedIds.has(video.id) ? "bg-muted/30" : ""} ${snapshot.isDragging ? "bg-accent" : ""}`}
                          >
                            <TableCell {...dragProvided.dragHandleProps} className="cursor-grab">
                              <GripVertical className={`h-4 w-4 text-muted-foreground ${dndEnabled ? "" : "opacity-50"}`} />
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(video.id)}
                                onCheckedChange={() => toggleSelect(video.id)}
                              />
                            </TableCell>
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
                                  {video.duration_seconds && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                      <Clock className="h-3 w-3" />
                                      {formatDuration(video.duration_seconds)}
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
                              <div className="flex flex-col gap-1 items-start">
                                {!video.is_active && (
                                  <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">Inactive</Badge>
                                )}
                                {video.is_pinned && <Badge>Pinned</Badge>}
                                {video.is_free_preview && <Badge variant="secondary">Free preview</Badge>}
                                {video.required_service_ids && video.required_service_ids.length > 0 && (
                                  <Badge variant="outline">Scoped: {video.required_service_ids.length}</Badge>
                                )}
                                {video.required_for_role && (
                                  <Badge variant="destructive" className="text-xs">Required: {video.required_for_role}</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(video.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => window.open(video.video_url, '_blank')}>
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => togglePin(video)}>
                                  <Pin className={`h-4 w-4 ${video.is_pinned ? 'text-primary' : ''}`} />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleEdit(video)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(video)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </TableBody>
                )}
              </Droppable>
            </Table>
          </DragDropContext>
          {!dndEnabled && (
            <p className="text-xs italic text-muted-foreground mt-2">
              Drag-to-reorder is available with &quot;Manual order&quot; sort and no filters applied.
            </p>
          )}
          </>
        )}
      </CardContent>
    </Card>
      </TabsContent>

      <TabsContent value="playlists">
        <PlaylistManager />
      </TabsContent>

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} video{selectedIds.size > 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              The selected videos will be permanently deleted.
              This cannot be undone. All access rules and progress tracking will also be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={bulkDeleteVideos}>
              Delete {selectedIds.size} Video{selectedIds.size > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk move-to-category */}
      <Dialog open={bulkCategoryOpen} onOpenChange={setBulkCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedIds.size} video{selectedIds.size === 1 ? "" : "s"} to category</DialogTitle>
            <DialogDescription>Pick a category. All selected videos will be reassigned.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={bulkCategoryTarget} onValueChange={setBulkCategoryTarget}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCategoryOpen(false)}>Cancel</Button>
            <Button onClick={bulkMoveCategory}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk add-to-playlist */}
      <Dialog open={bulkPlaylistOpen} onOpenChange={setBulkPlaylistOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {selectedIds.size} video{selectedIds.size === 1 ? "" : "s"} to a learning path</DialogTitle>
            <DialogDescription>
              Videos already in the playlist will be skipped. Order is appended after existing items.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {playlists.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active playlists yet.</p>
            ) : (
              <Select value={bulkPlaylistTarget} onValueChange={setBulkPlaylistTarget}>
                <SelectTrigger><SelectValue placeholder="Pick a playlist" /></SelectTrigger>
                <SelectContent>
                  {playlists.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPlaylistOpen(false)}>Cancel</Button>
            <Button onClick={bulkAddToPlaylist} disabled={!bulkPlaylistTarget}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate URL warning */}
      <Dialog open={!!duplicateWarning} onOpenChange={(o) => !o && setDuplicateWarning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Possible duplicate</DialogTitle>
            <DialogDescription>
              A video with this URL already exists: <strong>{duplicateWarning?.existing.title}</strong>. Save anyway?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateWarning(null)}>Cancel</Button>
            <Button onClick={handleSubmitAnyway}>Save anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete video?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be permanently deleted.
              This cannot be undone. All access rules and progress tracking for this video will also be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
