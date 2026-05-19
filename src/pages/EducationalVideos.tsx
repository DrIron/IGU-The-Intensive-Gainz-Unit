import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Video, Pin, Search, ListOrdered, AlertCircle, Eye, History, Sparkles, AlertTriangle, UserCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlaylistViewer } from "@/components/PlaylistViewer";
import { EducationalVideosManager } from "@/components/EducationalVideosManager";
import { VideoAccessCard, VideoAccessState } from "@/components/video/VideoAccessCard";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useToast } from "@/hooks/use-toast";
import { useClientAccess, getAccessDeniedMessage } from "@/hooks/useClientAccess";
import { loadFilterState, saveFilterState } from "@/lib/educationalContent";
import { AssignToClientDialog, AssignTarget } from "@/components/educational/AssignToClientDialog";

const ALL_CATEGORIES_LABEL = "All Categories";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface VideoWithAccess {
  id: string;
  title: string;
  description: string | null;
  category: string;
  is_pinned: boolean;
  is_free_preview: boolean;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  created_at: string;
  access_state: VideoAccessState;
  is_completed: boolean;
  last_accessed_at: string | null;
  is_required: boolean;
  is_assigned_by_coach: boolean;
  prerequisite_title: string | null;
}

const CATEGORIES = [
  ALL_CATEGORIES_LABEL,
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

export default function EducationalVideos() {
  const initialFilter = loadFilterState();

  const [videos, setVideos] = useState<VideoWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(initialFilter.category);
  const [searchQuery, setSearchQuery] = useState(initialFilter.q);
  const [tab, setTab] = useState<"videos" | "paths">(initialFilter.tab);
  const [videosLoaded, setVideosLoaded] = useState(false);
  const [completingVideoId, setCompletingVideoId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);

  const { toast } = useToast();
  const navigate = useNavigate();
  const access = useClientAccess();
  const hasRedirected = useRef(false);
  const { markComplete, loading: progressLoading } = useVideoProgress();

  // Persist filter state on change.
  useEffect(() => {
    saveFilterState({ q: searchQuery, category: selectedCategory, tab });
  }, [searchQuery, selectedCategory, tab]);

  // Handle access control
  useEffect(() => {
    if (access.loading || hasRedirected.current) return;

    const canAccess = access.isStaff || access.hasActiveSubscription;

    if (!canAccess) {
      hasRedirected.current = true;
      toast({
        variant: "destructive",
        title: "Access not available",
        description: getAccessDeniedMessage(access),
      });
      navigate("/dashboard");
    }
  }, [access, navigate, toast]);

  const loadVideos = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_educational_videos_with_access");
      if (error) throw error;
      setVideos((data || []) as VideoWithAccess[]);
    } catch (error: unknown) {
      console.error('Error loading videos:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load videos. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load videos when access is granted
  useEffect(() => {
    const canAccess = access.isStaff || access.hasActiveSubscription;
    if (!access.loading && canAccess && !videosLoaded) {
      loadVideos();
      setVideosLoaded(true);
    }
  }, [access.loading, access.isStaff, access.hasActiveSubscription, videosLoaded, loadVideos]);

  const handleVideoComplete = async (videoId: string) => {
    setCompletingVideoId(videoId);
    const success = await markComplete(videoId);
    if (success) {
      setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, is_completed: true } : v)));
    }
    setCompletingVideoId(null);
  };

  // Filter pipeline -- replaces the old separate `filteredVideos` state.
  const filteredVideos = videos.filter((v) => {
    if (selectedCategory !== ALL_CATEGORIES_LABEL && v.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !v.title.toLowerCase().includes(q) &&
        !v.description?.toLowerCase().includes(q) &&
        !v.category.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  // Section derivations (only when filters are inactive).
  const filtersInactive = searchQuery.trim() === "" && selectedCategory === ALL_CATEGORIES_LABEL;

  // PR F: Required + From-your-coach take priority over Continue/Featured/Recent.
  const required = filtersInactive ? videos.filter((v) => v.is_required && !v.is_completed) : [];
  const requiredIds = new Set(required.map((v) => v.id));

  const assigned = filtersInactive
    ? videos.filter((v) => v.is_assigned_by_coach && !v.is_completed && !requiredIds.has(v.id))
    : [];
  const assignedIds = new Set(assigned.map((v) => v.id));

  const continueWatching = filtersInactive
    ? videos
        .filter((v) => v.last_accessed_at && !v.is_completed && !requiredIds.has(v.id) && !assignedIds.has(v.id))
        .sort((a, b) => (b.last_accessed_at ?? "").localeCompare(a.last_accessed_at ?? ""))
        .slice(0, 4)
    : [];
  const continueIds = new Set(continueWatching.map((v) => v.id));

  const featured = filteredVideos.filter(
    (v) => v.is_pinned && !continueIds.has(v.id) && !requiredIds.has(v.id) && !assignedIds.has(v.id)
  );
  const featuredIds = new Set(featured.map((v) => v.id));

  const recentlyAdded = filtersInactive
    ? videos
        .filter((v) => {
          if (continueIds.has(v.id) || featuredIds.has(v.id) || requiredIds.has(v.id) || assignedIds.has(v.id)) return false;
          const ageMs = Date.now() - new Date(v.created_at).getTime();
          return ageMs <= THIRTY_DAYS_MS;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 4)
    : [];
  const recentIds = new Set(recentlyAdded.map((v) => v.id));

  const allOther = filteredVideos.filter(
    (v) =>
      !continueIds.has(v.id) &&
      !featuredIds.has(v.id) &&
      !recentIds.has(v.id) &&
      !requiredIds.has(v.id) &&
      !assignedIds.has(v.id)
  );

  const handleOpenAssignVideo = (videoId: string) => {
    const video = videos.find((v) => v.id === videoId);
    if (!video) return;
    setAssignTarget({ kind: "video", id: video.id, title: video.title });
  };

  const handleOpenAssignPlaylist = (playlistId: string, playlistTitle: string) => {
    setAssignTarget({ kind: "playlist", id: playlistId, title: playlistTitle });
  };

  const renderCard = (
    video: VideoWithAccess,
    hideCompleteButton: boolean,
    onAssign?: (videoId: string) => void
  ) => (
    <VideoAccessCard
      key={video.id}
      id={video.id}
      title={video.title}
      description={video.description}
      category={video.category}
      isPinned={video.is_pinned}
      isFreePreview={video.is_free_preview}
      accessState={video.access_state}
      isCompleted={video.is_completed}
      thumbnailUrl={video.thumbnail_url}
      durationSeconds={video.duration_seconds}
      isRequired={video.is_required}
      isAssignedByCoach={video.is_assigned_by_coach}
      prerequisiteTitle={video.prerequisite_title}
      onComplete={hideCompleteButton ? undefined : handleVideoComplete}
      completionLoading={hideCompleteButton ? false : completingVideoId === video.id || progressLoading}
      hideCompleteButton={hideCompleteButton}
      onAssign={onAssign}
    />
  );

  const renderVideosTab = (hideCompleteButton: boolean, onAssign?: (videoId: string) => void) => (
    <>
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading videos...</p>
        </div>
      ) : (
        <>
          {required.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h2 className="text-2xl font-semibold text-destructive">Required for you</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {required.map((v) => renderCard(v, hideCompleteButton, onAssign))}
              </div>
            </div>
          )}

          {assigned.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-semibold">From your coach</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {assigned.map((v) => renderCard(v, hideCompleteButton, onAssign))}
              </div>
            </div>
          )}

          {continueWatching.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-semibold">Continue Watching</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {continueWatching.map((v) => renderCard(v, hideCompleteButton, onAssign))}
              </div>
            </div>
          )}

          {featured.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Pin className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-semibold">Featured Videos</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {featured.map((v) => renderCard(v, hideCompleteButton, onAssign))}
              </div>
            </div>
          )}

          {recentlyAdded.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-semibold">Recently Added</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {recentlyAdded.map((v) => renderCard(v, hideCompleteButton, onAssign))}
              </div>
            </div>
          )}

          {allOther.length > 0 && (
            <div className="space-y-4">
              {(required.length > 0 || assigned.length > 0 || continueWatching.length > 0 || featured.length > 0 || recentlyAdded.length > 0) && (
                <h2 className="text-2xl font-semibold">All Videos</h2>
              )}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {allOther.map((v) => renderCard(v, hideCompleteButton, onAssign))}
              </div>
            </div>
          )}

          {filteredVideos.length === 0 && videos.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Video className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Educational videos are coming soon</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  For now, your main instructions will come from your program guide and updates from your coach. Check back here for technique breakdowns and deep-dive lessons.
                </p>
              </CardContent>
            </Card>
          )}

          {filteredVideos.length === 0 && videos.length > 0 && (
            <Alert>
              <Video className="h-4 w-4" />
              <AlertDescription>
                No videos found matching your criteria. Try adjusting your search or filter.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </>
  );

  // Loading state
  if (access.loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <div className="container mx-auto px-4 py-24 max-w-7xl">
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (access.error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <div className="container mx-auto px-4 py-24 max-w-7xl">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-muted-foreground">Unable to load your access information. Please refresh the page.</p>
            <Button onClick={() => window.location.reload()} className="mt-4">
              Refresh Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Admins get the full manager UI
  if (access.isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <div className="container mx-auto px-4 py-24 max-w-7xl">
          <EducationalVideosManager />
        </div>
      </div>
    );
  }

  // Coaches (non-admin) see the client browse UI as a read-only preview.
  if (access.isCoach && !access.isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <div className="container mx-auto px-4 py-24 max-w-7xl">
          <Alert className="mb-6">
            <Eye className="h-4 w-4" />
            <AlertDescription>Coach preview -- this is what active clients see.</AlertDescription>
          </Alert>

          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Video className="h-10 w-10 text-primary" />
              Educational Resources
            </h1>
            <p className="text-muted-foreground text-lg">
              Browse our collection of training videos and learning paths
            </p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "videos" | "paths")} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="videos">
                <Video className="h-4 w-4 mr-2" />
                All Videos
              </TabsTrigger>
              <TabsTrigger value="paths">
                <ListOrdered className="h-4 w-4 mr-2" />
                Learning Paths
              </TabsTrigger>
            </TabsList>

            <TabsContent value="videos" className="space-y-6">
              {renderVideosTab(true, handleOpenAssignVideo)}
            </TabsContent>

            <TabsContent value="paths">
              <PlaylistViewer hideCompleteButton onAssignPlaylist={handleOpenAssignPlaylist} />
            </TabsContent>
          </Tabs>
          <AssignToClientDialog
            open={!!assignTarget}
            onClose={() => setAssignTarget(null)}
            target={assignTarget}
          />
        </div>
      </div>
    );
  }

  // Client view
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      <div className="container mx-auto px-4 py-24 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <Video className="h-10 w-10 text-primary" />
            Educational Resources
          </h1>
          <p className="text-muted-foreground text-lg">
            Browse our collection of training videos and learning paths
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "videos" | "paths")} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="videos">
              <Video className="h-4 w-4 mr-2" />
              All Videos
            </TabsTrigger>
            <TabsTrigger value="paths">
              <ListOrdered className="h-4 w-4 mr-2" />
              Learning Paths
            </TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="space-y-6">
            {renderVideosTab(false)}
          </TabsContent>

          <TabsContent value="paths">
            <PlaylistViewer />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
