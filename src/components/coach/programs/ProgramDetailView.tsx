import { useMemo } from "react";
import { ArrowLeft, Layers, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMusclePlanVolume } from "./muscle-builder/hooks/useMusclePlanVolume";
import { useProgramSummaries } from "./useProgramSummaries";
import { MuscleDistributionBars } from "./shared/MuscleDistributionBars";
import { MuscleDistributionRibbon } from "./shared/MuscleDistributionRibbon";
import { ProgramStatStrip } from "./shared/ProgramStatStrip";
import { ProgramStatusPill } from "./shared/ProgramStatusPill";
import { deriveProgramStatus } from "./programStatus";
import { formatDurationRange } from "@/lib/sessionDuration";

/**
 * ProgramDetailView — first-cut read view for a saved mesocycle (§2B, PR2 scope).
 *
 * Header + summary tiles + MuscleDistributionBars + per-muscle landmark zones.
 * The week-by-week `WeekBreakdownCard`, deload markers and the macrocycle arc are
 * PR3 and deliberately NOT built here.
 *
 * Landmark zones (MEV/MAV/MRV) render ONLY here — §6.3 LOCKED them off the small
 * library card.
 *
 * Fed by the same adapter + `useMusclePlanVolume` as the library card, so the two
 * surfaces can never disagree about a program.
 */
interface ProgramDetailViewProps {
  programId: string;
  onBack: () => void;
  onEditInPlanningBoard?: (muscleTemplateId: string) => void;
  onAssign?: (programId: string) => void;
}

export function ProgramDetailView({
  programId,
  onBack,
  onEditInPlanningBoard,
  onAssign,
}: ProgramDetailViewProps) {
  const isMobile = useIsMobile();
  const ids = useMemo(() => [programId], [programId]);
  const { summaries, isLoading, error } = useProgramSummaries(ids);

  const summary = summaries.get(programId);
  const title = summary?.meta.title ?? "";
  const description = summary?.meta.description;
  const level = summary?.meta.level;
  const tags = summary?.meta.tags;
  const { volumeEntries, summary: volume } = useMusclePlanVolume(summary?.slots ?? []);

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Programs
      </Button>

      {isLoading ? (
        <DetailSkeleton />
      ) : error ? (
        <EmptyState
          icon={Layers}
          title="Couldn't load this program"
          description={error.message}
          action={{ label: "Back to Programs", onClick: onBack }}
        />
      ) : !summary ? (
        <EmptyState
          icon={Layers}
          title="Program not found"
          description="This program may have been deleted."
          action={{ label: "Back to Programs", onClick: onBack }}
        />
      ) : (
        <>
          {/* Header */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{title}</h1>
              <ProgramStatusPill
                status={deriveProgramStatus(summary.sets, summary.reach.clients)}
                count={summary.reach.clients}
              />
              {level && (
                <Badge variant="outline" className="capitalize">
                  {level}
                </Badge>
              )}
            </div>

            {description && <p className="text-sm text-muted-foreground">{description}</p>}

            <ProgramStatStrip
              sets={summary.sets}
              exercises={summary.exercises}
              duration={summary.duration}
            />

            <MuscleDistributionRibbon segments={summary.ribbon} height="h-1" className="mt-1" />

            {(tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {(tags ?? []).slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] font-normal">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {onEditInPlanningBoard && summary.muscleTemplateId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEditInPlanningBoard(summary.muscleTemplateId!)}
                >
                  <Layers className="h-4 w-4 mr-1.5" />
                  Edit in Planning Board
                </Button>
              )}
              {onAssign && (
                <Button size="sm" onClick={() => onAssign(programId)}>
                  <User className="h-4 w-4 mr-1.5" />
                  Assign
                </Button>
              )}
            </div>
          </div>

          {/* Summary tiles — 2x2 on mobile, 4-up on desktop. */}
          <div className={cn("grid gap-3", isMobile ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
            <MetricTile label="Sets / week" value={volume.totalSets} />
            <MetricTile label="Exercises" value={summary.exercises} />
            <MetricTile label="Muscles targeted" value={volume.musclesTargeted} />
            <MetricTile
              label="Est. time / session"
              value={
                summary.duration
                  ? formatDurationRange(summary.duration.minSeconds, summary.duration.maxSeconds)
                  : "--"
              }
            />
          </div>

          {/* Distribution — the ONLY place landmark zones render. */}
          <section className="space-y-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              Muscle distribution
            </h2>
            <MuscleDistributionBars entries={volumeEntries} />
          </section>
        </>
      )}
    </div>
  );
}

/** Mono value over a mono uppercase label — the house MetricCard idiom. */
function MetricTile({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="p-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="font-mono font-bold text-lg">{value}</p>
      </CardContent>
    </Card>
  );
}

/** Layout-shaped skeleton (CC6 house style — not a bare spinner). */
function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] w-full" />
        ))}
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    </div>
  );
}
