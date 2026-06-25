import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClientPageLayout } from "@/components/layouts/ClientPageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Dumbbell, PlayCircle, Route, AlertCircle, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useClientAccess, getAccessDeniedMessage } from "@/hooks/useClientAccess";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { ExercisesTab } from "@/components/learn/ExercisesTab";
import { VideosTab } from "@/components/learn/VideosTab";
import { PlaylistViewer } from "@/components/PlaylistViewer";
import { EducationalVideosManager } from "@/components/EducationalVideosManager";
import { AssignToClientDialog, AssignTarget } from "@/components/educational/AssignToClientDialog";

type LearnTab = "exercises" | "videos" | "pathways";
const TABS: { value: LearnTab; label: string; icon: typeof Dumbbell }[] = [
  { value: "exercises", label: "Exercises", icon: Dumbbell },
  { value: "videos", label: "Videos", icon: PlayCircle },
  { value: "pathways", label: "Pathways", icon: Route },
];

function LearnContent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const access = useClientAccess();
  const hasRedirected = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const tab: LearnTab = tabParam === "videos" || tabParam === "pathways" ? tabParam : "exercises";
  const [search, setSearch] = useState("");
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);

  useDocumentTitle({ title: "Learn", description: "Exercises, videos, and learning pathways" });

  const setTab = (next: LearnTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  // Access gate -- staff OR active subscription (read-only browse), same as the
  // old Exercise Library / Educational Videos pages this replaces.
  useEffect(() => {
    if (access.loading || hasRedirected.current) return;
    if (!(access.isStaff || access.hasActiveSubscription)) {
      hasRedirected.current = true;
      toast({ variant: "destructive", title: "Access not available", description: getAccessDeniedMessage(access) });
      navigate("/dashboard");
    }
  }, [access, navigate, toast]);

  if (access.loading) {
    return (
      <div className="container mx-auto px-4 pt-6 pb-24 md:pt-8 md:pb-12 max-w-7xl">
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (access.error) {
    return (
      <div className="container mx-auto px-4 pt-6 pb-24 md:pt-8 md:pb-12 max-w-7xl">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Unable to load your access information. Please refresh the page.</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  const isStaff = access.isStaff;
  const isCoachPreview = access.isCoach && !access.isAdmin;
  // Admin manages the video catalogue via the CMS in place of the browse list.
  const showVideoCms = access.isAdmin && tab === "videos";

  const handleOpenAssignVideo = (videoId: string) => setAssignTarget({ kind: "video", id: videoId, title: "" });
  const handleOpenAssignPlaylist = (playlistId: string, playlistTitle: string) =>
    setAssignTarget({ kind: "playlist", id: playlistId, title: playlistTitle });

  return (
    <>
      <div className="container mx-auto px-4 pt-6 pb-24 md:pt-8 md:pb-12 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold">Learn</h1>
          <p className="text-muted-foreground mt-1">
            Everything to study in one place -- the exercise library, your coach's videos, and guided pathways.
          </p>
        </div>

        {isCoachPreview && (
          <Alert className="mb-6">
            <Eye className="h-4 w-4" />
            <AlertDescription>Coach preview -- this is what active clients see. Use the assign action to push content to a client.</AlertDescription>
          </Alert>
        )}

        {/* Segmented control + shared search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-6">
          <div className="inline-flex rounded-lg border bg-card p-1 self-start" role="tablist" aria-label="Learn sections">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-[40px]",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {t.label}
                </button>
              );
            })}
          </div>

          {!showVideoCms && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === "exercises" ? "Search exercises..." : tab === "videos" ? "Search videos..." : "Search pathways..."}
                className="pl-10"
              />
            </div>
          )}
        </div>

        {/* Active tab */}
        {tab === "exercises" && <ExercisesTab search={search} />}

        {tab === "videos" &&
          (access.isAdmin ? (
            <EducationalVideosManager />
          ) : (
            <VideosTab
              search={search}
              hideCompleteButton={isCoachPreview}
              onAssign={isStaff ? handleOpenAssignVideo : undefined}
              onGoToPathways={() => setTab("pathways")}
            />
          ))}

        {tab === "pathways" && (
          <PlaylistViewer hideCompleteButton={isStaff} onAssignPlaylist={isStaff ? handleOpenAssignPlaylist : undefined} />
        )}
      </div>

      <AssignToClientDialog open={!!assignTarget} onClose={() => setAssignTarget(null)} target={assignTarget} />
    </>
  );
}

export default function Learn() {
  return (
    <ClientPageLayout>
      <LearnContent />
    </ClientPageLayout>
  );
}
