import { useState } from "react";
import { useExerciseLibraryData, type ExerciseRow } from "@/hooks/useExerciseLibrary";
import { ExerciseBrowse } from "@/components/exercise/ExerciseBrowse";
import { ExerciseDemoCard, type ExerciseDemoData } from "@/components/exercise/ExerciseDemoCard";
import { SwapExerciseDialog } from "@/components/coach/programs/SwapExerciseDialog";

/**
 * Exercises tab of the Learn hub. A thin client-side wrapper around the shared `ExerciseBrowse`
 * (the region → muscle → exercise drill, slice 2/2b) in `mode="browse"`: a row's ⓘ opens the shared
 * `ExerciseDemoCard`, whose "Find similar" hands off to the `SwapExerciseDialog`. The same
 * `ExerciseBrowse` backs the coach picker in `mode="picker"`.
 */

const rowName = (r: ExerciseRow): string => r.client_name ?? r.name;

export function ExercisesTab({ search }: { search: string }) {
  // CC10 split: distinguish a failed read (LoadError) from a genuinely empty result (EmptyState).
  const { data: rows = [], isLoading, isError, refetch } = useExerciseLibraryData();
  const [demoTarget, setDemoTarget] = useState<ExerciseRow | null>(null);
  const [similarTarget, setSimilarTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
      <ExerciseBrowse
        mode="browse"
        rows={rows}
        search={search}
        loading={isLoading}
        error={isError}
        onRetry={() => void refetch()}
        showInfo
        onInfo={(ex) => setDemoTarget(ex)}
      />

      {demoTarget && (
        <ExerciseDemoCard
          exercise={demoTarget as ExerciseDemoData}
          context="library"
          open={!!demoTarget}
          onOpenChange={(o) => !o && setDemoTarget(null)}
          onFindSimilar={() => {
            const t = demoTarget;
            setDemoTarget(null);
            if (t) setSimilarTarget({ id: t.id, name: rowName(t) });
          }}
        />
      )}

      <SwapExerciseDialog
        open={!!similarTarget}
        onOpenChange={(o) => !o && setSimilarTarget(null)}
        exerciseId={similarTarget?.id ?? null}
        exerciseName={similarTarget?.name}
        viewOnly
      />
    </>
  );
}
