import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { Video, Pin, History, Sparkles, AlertTriangle, UserCheck, Dumbbell, Apple } from "lucide-react";
import { VideoAccessCard, VideoAccessState } from "@/components/video/VideoAccessCard";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useToast } from "@/hooks/use-toast";

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

interface LinkedContentRow {
  link_id: string;
  kind: "video" | "playlist";
  video_id: string | null;
  playlist_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  is_pinned: boolean;
  is_free_preview: boolean;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  access_state: VideoAccessState;
  is_completed: boolean;
  is_required: boolean;
  sort_order: number;
  note: string | null;
  program_template_id?: string;
  program_template_title?: string;
  nutrition_phase_id?: string;
  phase_name?: string;
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
  "Other",
];

interface VideosTabProps {
  /** Shared search owned by the Learn shell. */
  search: string;
  /** Coach/admin preview hides the "mark complete" affordance. */
  hideCompleteButton?: boolean;
  /** Coach/admin: assign a video to a client. */
  onAssign?: (videoId: string) => void;
  /** Switch the Learn shell to the Pathways tab. */
  onGoToPathways?: () => void;
}

/**
 * Videos tab of the unified Learn area. Ported from EducationalVideos' video
 * rendering; search is shared (owned by Learn), category filter stays local.
 */
export function VideosTab({ search, hideCompleteButton = false, onAssign, onGoToPathways }: VideosTabProps) {
  const { toast } = useToast();
  const { markComplete, loading: progressLoading } = useVideoProgress();

  const [videos, setVideos] = useState<VideoWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES_LABEL);
  const [completingVideoId, setCompletingVideoId] = useState<string | null>(null);
  const [programLinked, setProgramLinked] = useState<LinkedContentRow[]>([]);
  const [phaseLinked, setPhaseLinked] = useState<LinkedContentRow[]>([]);
  const linksFetched = useRef(false);
  const videosLoaded = useRef(false);

  const loadVideos = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_educational_videos_with_access");
      if (error) throw error;
      setVideos((data || []) as VideoWithAccess[]);
    } catch (error: unknown) {
      // CC10 SPLIT: without this, a failed fetch fell into the `videos.length === 0`
      // branch and told the client "Videos are coming soon" — an empty state asserting
      // a fact we never established. Empty != error.
      console.error("Error loading videos:", error);
      setLoadError(error instanceof Error ? error : new Error(String(error)));
      toast({ variant: "destructive", title: "Error", description: "Failed to load videos. Please try again." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (videosLoaded.current) return;
    videosLoaded.current = true;
    loadVideos();
  }, [loadVideos]);

  useEffect(() => {
    if (linksFetched.current) return;
    linksFetched.current = true;
    Promise.all([
      supabase.rpc("get_my_program_linked_content"),
      supabase.rpc("get_my_phase_linked_content"),
    ]).then(([prog, phase]) => {
      if (prog.error) console.error("[program-linked]", prog.error);
      else setProgramLinked((prog.data ?? []) as LinkedContentRow[]);
      if (phase.error) console.error("[phase-linked]", phase.error);
      else setPhaseLinked((phase.data ?? []) as LinkedContentRow[]);
    });
  }, []);

  const handleVideoComplete = async (videoId: string) => {
    setCompletingVideoId(videoId);
    const success = await markComplete(videoId);
    if (success) {
      setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, is_completed: true } : v)));
    }
    setCompletingVideoId(null);
  };

  const filteredVideos = videos.filter((v) => {
    if (selectedCategory !== ALL_CATEGORIES_LABEL && v.category !== selectedCategory) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!v.title.toLowerCase().includes(q) && !v.description?.toLowerCase().includes(q) && !v.category.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const filtersInactive = search.trim() === "" && selectedCategory === ALL_CATEGORIES_LABEL;

  const required = filtersInactive ? videos.filter((v) => v.is_required && !v.is_completed) : [];
  const requiredIds = new Set(required.map((v) => v.id));

  const programVideos = filtersInactive
    ? programLinked.filter((r) => r.kind === "video" && !r.is_completed && r.video_id && !requiredIds.has(r.video_id))
    : [];
  const programVideoIds = new Set(programVideos.map((r) => r.video_id).filter((x): x is string => !!x));
  const programPlaylistCount = filtersInactive ? programLinked.filter((r) => r.kind === "playlist" && !r.is_completed).length : 0;

  const phaseVideos = filtersInactive
    ? phaseLinked.filter(
        (r) => r.kind === "video" && !r.is_completed && r.video_id && !requiredIds.has(r.video_id) && !programVideoIds.has(r.video_id),
      )
    : [];
  const phaseVideoIds = new Set(phaseVideos.map((r) => r.video_id).filter((x): x is string => !!x));
  const phasePlaylistCount = filtersInactive ? phaseLinked.filter((r) => r.kind === "playlist" && !r.is_completed).length : 0;

  const assigned = filtersInactive
    ? videos.filter((v) => v.is_assigned_by_coach && !v.is_completed && !requiredIds.has(v.id) && !programVideoIds.has(v.id) && !phaseVideoIds.has(v.id))
    : [];
  const assignedIds = new Set(assigned.map((v) => v.id));

  const continueWatching = filtersInactive
    ? videos
        .filter((v) => v.last_accessed_at && !v.is_completed && !requiredIds.has(v.id) && !assignedIds.has(v.id) && !programVideoIds.has(v.id) && !phaseVideoIds.has(v.id))
        .sort((a, b) => (b.last_accessed_at ?? "").localeCompare(a.last_accessed_at ?? ""))
        .slice(0, 4)
    : [];
  const continueIds = new Set(continueWatching.map((v) => v.id));

  const featured = filteredVideos.filter(
    (v) => v.is_pinned && !continueIds.has(v.id) && !requiredIds.has(v.id) && !assignedIds.has(v.id) && !programVideoIds.has(v.id) && !phaseVideoIds.has(v.id),
  );
  const featuredIds = new Set(featured.map((v) => v.id));

  const recentlyAdded = filtersInactive
    ? videos
        .filter((v) => {
          if (continueIds.has(v.id) || featuredIds.has(v.id) || requiredIds.has(v.id) || assignedIds.has(v.id) || programVideoIds.has(v.id) || phaseVideoIds.has(v.id)) return false;
          return Date.now() - new Date(v.created_at).getTime() <= THIRTY_DAYS_MS;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 4)
    : [];
  const recentIds = new Set(recentlyAdded.map((v) => v.id));

  const allOther = filteredVideos.filter(
    (v) => !continueIds.has(v.id) && !featuredIds.has(v.id) && !recentIds.has(v.id) && !requiredIds.has(v.id) && !assignedIds.has(v.id) && !programVideoIds.has(v.id) && !phaseVideoIds.has(v.id),
  );

  const renderCard = (video: VideoWithAccess) => (
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

  const renderLinkedCard = (row: LinkedContentRow, contextKind: "program" | "phase", contextTitle: string) => (
    <VideoAccessCard
      key={row.link_id}
      id={row.video_id!}
      title={row.title}
      description={row.description}
      category={row.category ?? ""}
      isPinned={row.is_pinned}
      isFreePreview={row.is_free_preview}
      accessState={row.access_state}
      isCompleted={row.is_completed}
      thumbnailUrl={row.thumbnail_url}
      durationSeconds={row.duration_seconds}
      isRequired={row.is_required}
      linkedContext={{ kind: contextKind, title: contextTitle }}
      onComplete={hideCompleteButton ? undefined : handleVideoComplete}
      completionLoading={hideCompleteButton ? false : completingVideoId === row.video_id || progressLoading}
      hideCompleteButton={hideCompleteButton}
      onAssign={onAssign}
    />
  );

  const sectionGrid = "grid gap-6 md:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading videos...</p>
        </div>
      ) : loadError ? (
        <LoadError
          message="We couldn't load the video library. Check your connection and try again."
          onRetry={() => { setLoadError(null); void loadVideos(); }}
        />
      ) : (
        <>
          {required.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h2 className="text-2xl font-semibold text-destructive">Required for you</h2>
              </div>
              <div className={sectionGrid}>{required.map(renderCard)}</div>
            </div>
          )}

          {programVideos.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-indigo-600" />
                <h2 className="text-2xl font-semibold">For your current program</h2>
              </div>
              <p className="text-sm text-muted-foreground">Recommended by your coach to support your training.</p>
              <div className={sectionGrid}>{programVideos.map((row) => renderLinkedCard(row, "program", row.program_template_title ?? "your program"))}</div>
              {programPlaylistCount > 0 && onGoToPathways && (
                <p className="text-sm text-muted-foreground">
                  {programPlaylistCount} learning path{programPlaylistCount === 1 ? "" : "s"} also linked to your program --{" "}
                  <button type="button" onClick={onGoToPathways} className="underline hover:no-underline">
                    see Pathways
                  </button>
                  .
                </p>
              )}
            </div>
          )}

          {phaseVideos.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Apple className="h-5 w-5 text-indigo-600" />
                <h2 className="text-2xl font-semibold">For your current phase</h2>
              </div>
              <p className="text-sm text-muted-foreground">Recommended for your current nutrition phase.</p>
              <div className={sectionGrid}>{phaseVideos.map((row) => renderLinkedCard(row, "phase", row.phase_name ?? "your current phase"))}</div>
              {phasePlaylistCount > 0 && onGoToPathways && (
                <p className="text-sm text-muted-foreground">
                  {phasePlaylistCount} learning path{phasePlaylistCount === 1 ? "" : "s"} also linked to your phase --{" "}
                  <button type="button" onClick={onGoToPathways} className="underline hover:no-underline">
                    see Pathways
                  </button>
                  .
                </p>
              )}
            </div>
          )}

          {assigned.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-semibold">From your coach</h2>
              </div>
              <div className={sectionGrid}>{assigned.map(renderCard)}</div>
            </div>
          )}

          {continueWatching.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-semibold">Continue watching</h2>
              </div>
              <div className={sectionGrid}>{continueWatching.map(renderCard)}</div>
            </div>
          )}

          {featured.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Pin className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-semibold">Featured</h2>
              </div>
              <div className={sectionGrid}>{featured.map(renderCard)}</div>
            </div>
          )}

          {recentlyAdded.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-semibold">Recently added</h2>
              </div>
              <div className={sectionGrid}>{recentlyAdded.map(renderCard)}</div>
            </div>
          )}

          {allOther.length > 0 && (
            <div className="space-y-4">
              {(required.length > 0 || programVideos.length > 0 || phaseVideos.length > 0 || assigned.length > 0 || continueWatching.length > 0 || featured.length > 0 || recentlyAdded.length > 0) && (
                <h2 className="text-2xl font-semibold">All videos</h2>
              )}
              <div className={sectionGrid}>{allOther.map(renderCard)}</div>
            </div>
          )}

          {/* GENUINELY empty — no videos exist. A failed fetch is handled above and
              must never reach here (CC10: empty != error). */}
          {filteredVideos.length === 0 && videos.length === 0 && (
            <EmptyState
              icon={Video}
              title="Videos are coming soon"
              description="For now your instructions come from your program guide and your coach. Technique breakdowns will land here."
            />
          )}

          {filteredVideos.length === 0 && videos.length > 0 && (
            // CC8: EmptyState, not a bare Alert. Empty-search guard per CLAUDE.md —
            // never render `matching ""` when the search box is blank.
            <EmptyState
              icon={Video}
              size="sm"
              title={search ? `No videos matching "${search}"` : "No videos here yet"}
              description={
                search
                  ? "Try a different search, or clear the category filter."
                  : "Try another category — your coach adds new videos here."
              }
            />
          )}
        </>
      )}
    </div>
  );
}
