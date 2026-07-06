import { useNavigate } from "react-router-dom";
import { ClientPageLayout } from "@/components/layouts/ClientPageLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, History } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { ExerciseHistoryPanel } from "@/components/workouts/ExerciseHistoryPanel";

/**
 * Full-page Exercise History. The picker + rep-max analysis + per-set table all
 * live in ExerciseHistoryPanel (the single UI source, also mounted in the
 * Workouts > History tab); this page only adds the layout + header chrome so the
 * two surfaces can't drift. HX1: actual logged rep-maxes, no estimation.
 */
function ExerciseHistoryContent() {
  const navigate = useNavigate();

  useDocumentTitle({
    title: "Exercise History",
    description: "View your exercise performance history",
  });

  return (
    <ClientPageLayout>
      <div className="container mx-auto max-w-4xl px-4 py-8 pb-24 md:pb-8 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="h-6 w-6 text-primary" />
              Exercise History
            </h1>
            <p className="text-muted-foreground">Track your progress over time</p>
          </div>
        </div>

        <ExerciseHistoryPanel />
      </div>
    </ClientPageLayout>
  );
}

export default function ExerciseHistory() {
  return <ExerciseHistoryContent />;
}
