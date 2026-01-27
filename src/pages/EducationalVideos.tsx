import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Video, Pin, Search, ListOrdered, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlaylistViewer } from "@/components/PlaylistViewer";
import { EducationalVideosManager } from "@/components/EducationalVideosManager";
import { VideoAccessCard, VideoAccessState } from "@/components/video/VideoAccessCard";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useToast } from "@/hooks/use-toast";
import { useClientAccess, getAccessDeniedMessage } from "@/hooks/useClientAccess";

interface VideoWithAccess {
  id: string;
  title: string;
  description: string | null;
  category: string;
  is_pinned: boolean;
  is_free_preview: boolean;
  created_at: string;
  access_state: VideoAccessState;
  is_completed: boolean;
}

const CATEGORIES = [
  "All Categories",
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
  const [videos, setVideos] = useState<VideoWithAccess[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<VideoWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [searchQuery, setSearchQuery] = useState("");
  const [videosLoaded, setVideosLoaded] = useState(false);
  const [completingVideoId, setCompletingVideoId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const access = useClientAccess();
  const hasRedirected = useRef(false);
  const { markComplete, loading: progressLoading } = useVideoProgress();

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
  }, [access.loading, access.isStaff, access.hasActiveSubscription, navigate, toast]);

  // Load videos when access is granted
  useEffect(() => {
    const canAccess = access.isStaff || access.hasActiveSubscription;
    if (!access.loading && canAccess && !videosLoaded) {
      loadVideos();
      setVideosLoaded(true);
    }
  }, [access.loading, access.isStaff, access.hasActiveSubscription, videosLoaded]);

  useEffect(() => {
    filterVideos();
  }, [videos, selectedCategory, searchQuery]);

  const loadVideos = async () => {
    try {
      setLoading(true);
      
      // Use the RPC function that returns access states
      const { data, error } = await supabase.rpc("get_educational_videos_with_access");

      if (error) throw error;
      
      setVideos((data || []) as VideoWithAccess[]);
    } catch (error: any) {
      console.error('Error loading videos:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load videos. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterVideos = () => {
    let filtered = [...videos];

    if (selectedCategory !== "All Categories") {
      filtered = filtered.filter(v => v.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(v => 
        v.title.toLowerCase().includes(query) ||
        v.description?.toLowerCase().includes(query) ||
        v.category.toLowerCase().includes(query)
      );
    }

    setFilteredVideos(filtered);
  };

  const handleVideoComplete = async (videoId: string) => {
    setCompletingVideoId(videoId);
    const success = await markComplete(videoId);
    
    if (success) {
      // Update local state to reflect completion
      setVideos(prev => prev.map(v => 
        v.id === videoId ? { ...v, is_completed: true } : v
      ));
    }
    setCompletingVideoId(null);
  };

  const pinnedVideos = filteredVideos.filter(v => v.is_pinned);
  const regularVideos = filteredVideos.filter(v => !v.is_pinned);

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

  // If user is coach or admin, show the manager component
  if (access.isStaff) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <div className="container mx-auto px-4 py-24 max-w-7xl">
          <EducationalVideosManager />
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

        <Tabs defaultValue="videos" className="space-y-6">
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
            {/* Search and Filter Section */}
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
                  {CATEGORIES.map(cat => (
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
                {/* Featured/Pinned Videos */}
                {pinnedVideos.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Pin className="h-5 w-5 text-primary" />
                      <h2 className="text-2xl font-semibold">Featured Videos</h2>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {pinnedVideos.map(video => (
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
                          onComplete={handleVideoComplete}
                          completionLoading={completingVideoId === video.id || progressLoading}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Regular Videos */}
                {regularVideos.length > 0 && (
                  <div className="space-y-4">
                    {pinnedVideos.length > 0 && (
                      <h2 className="text-2xl font-semibold">All Videos</h2>
                    )}
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {regularVideos.map(video => (
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
                          onComplete={handleVideoComplete}
                          completionLoading={completingVideoId === video.id || progressLoading}
                        />
                      ))}
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
          </TabsContent>

          <TabsContent value="paths">
            <PlaylistViewer />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
