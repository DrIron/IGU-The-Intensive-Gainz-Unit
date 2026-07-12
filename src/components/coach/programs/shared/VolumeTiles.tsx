import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatTustRange } from "./volumeFormat";
import type { VolumeSummary } from "../muscle-builder/hooks/useMusclePlanVolume";

/**
 * VolumeTiles — the summary tile row above the volume bars (Total Sets, Muscles,
 * Training Days, Avg Sets/Muscle, and TUST in detailed mode).
 *
 * Lifted from `muscle-builder/VolumeOverview.tsx` (§11.2). Presentational only:
 * the caller supplies an already-computed `VolumeSummary` (from
 * `useMusclePlanVolume`); this component does no math and no fetching.
 *
 * Consumers (§11.2): builder volume rail, detail summary band, in-use surfaces.
 */
interface VolumeTilesProps {
  summary: VolumeSummary;
  /**
   * Detailed mode adds the TUST tile (when there is any TUST to show) and widens
   * the grid to 5 columns. Mirrors VolumeOverview's `viewMode === 'detailed'`.
   */
  detailed?: boolean;
  className?: string;
}

export function VolumeTiles({ summary, detailed = false, className }: VolumeTilesProps) {
  const showTust = detailed && summary.totalTustSecondsMax > 0;

  return (
    <div
      className={cn(
        "grid gap-2 flex-1",
        detailed ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4",
        className,
      )}
    >
      <VolumeTile label="Total Sets" value={summary.totalSets} />
      <VolumeTile label="Muscles" value={summary.musclesTargeted} />
      <VolumeTile label="Training Days" value={summary.trainingDays} />
      <VolumeTile label="Avg Sets/Muscle" value={summary.avgSetsPerMuscle} />
      {showTust && (
        <VolumeTile
          label="Total TUST"
          value={formatTustRange(summary.totalTustSecondsMin, summary.totalTustSecondsMax)}
          isString
        />
      )}
    </div>
  );
}

/** One tile: mono value over a mono uppercase label. */
function VolumeTile({
  label,
  value,
  isString,
}: {
  label: string;
  value: number | string;
  isString?: boolean;
}) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="p-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn("font-mono font-bold", isString ? "text-sm" : "text-lg")}>{value}</p>
      </CardContent>
    </Card>
  );
}
