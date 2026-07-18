import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { useExerciseLibraryData, type ExerciseRow } from "@/hooks/useExerciseLibrary";
import { ExerciseBrowse } from "@/components/exercise/ExerciseBrowse";
import { ExerciseDemoCard, type ExerciseDemoData } from "@/components/exercise/ExerciseDemoCard";

/**
 * Coach Exercise Library (`/coach/exercises`) — a READ-ONLY reference browse (slice 2c). A thin
 * wrapper around the shared `ExerciseBrowse` (region → muscle → exercise drill), matching the client
 * Learn tab and the program-builder picker. A row's ⓘ opens the shared `ExerciseDemoCard` in
 * `context="coach"` (dense `name` subline + resistance/positioning detail — coaches want precision).
 *
 * Rows scope to `is_global || own` (the coach sees global + their own customs, with a Custom badge),
 * mirroring the picker. No create/edit/add-to-program actions — this surface stays reference-only.
 * The CoachDashboardLayout shell + "Exercise Library" header live in the parent.
 */
export function ExerciseLibrary({ coachUserId }: { coachUserId?: string }) {
  const { data: rows = [], isLoading, isError, refetch } = useExerciseLibraryData();
  const [search, setSearch] = useState("");
  const [demoTarget, setDemoTarget] = useState<ExerciseRow | null>(null);

  const scopedRows = useMemo(
    () => rows.filter((r) => r.is_global || r.created_by_coach_id === coachUserId),
    [rows, coachUserId],
  );

  return (
    <div className="space-y-4">
      {/* The header advertises "Browse and search"; a single input feeds the shared browse's search. */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          placeholder="Search exercises..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <ExerciseBrowse
        mode="browse"
        rows={scopedRows}
        search={search}
        loading={isLoading}
        error={isError}
        onRetry={() => void refetch()}
        showInfo
        onInfo={(ex) => setDemoTarget(ex)}
        renderRowBadge={(r) =>
          !r.is_global ? (
            <Badge variant="secondary" className="shrink-0 text-xs">
              Custom
            </Badge>
          ) : null
        }
      />

      {demoTarget && (
        <ExerciseDemoCard
          exercise={demoTarget as ExerciseDemoData}
          context="coach"
          open={!!demoTarget}
          onOpenChange={(o) => !o && setDemoTarget(null)}
        />
      )}
    </div>
  );
}
