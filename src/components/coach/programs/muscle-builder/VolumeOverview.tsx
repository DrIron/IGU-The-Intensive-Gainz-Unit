import { memo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BarChart3, List, X, Info } from "lucide-react";
import {
  getLandmarkColor,
  getLandmarkBgColor,
  getLandmarkLabel,
} from "@/types/muscle-builder";
import type { MuscleVolumeEntry, VolumeSummary } from "../muscle-builder/hooks/useMusclePlanVolume";

interface VolumeOverviewProps {
  entries: MuscleVolumeEntry[];
  summary: VolumeSummary;
  onMuscleClick?: (muscleId: string) => void;
}

/** Format seconds as minutes with 1 decimal, or seconds if < 60 */
function formatTust(seconds: number): string {
  if (seconds === 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

/** Format TUST range */
function formatTustRange(min: number, max: number): string {
  if (min === 0 && max === 0) return '0s';
  if (min === max) return formatTust(min);
  return `${formatTust(min)}-${formatTust(max)}`;
}

export const VolumeOverview = memo(function VolumeOverview({
  entries,
  summary,
  onMuscleClick,
}: VolumeOverviewProps) {
  const [viewMode, setViewMode] = useState<'sets' | 'detailed'>('sets');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const anyHasTempo = entries.some(e => e.hasTempo);
  const isDetailed = viewMode === 'detailed';

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Add muscles to see volume analysis
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Instruction banner (show once, dismissible) */}
      {isDetailed && !bannerDismissed && (
        <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground flex-1">
            Plan with working sets only (RIR &le; 5 / RPE &ge; 5). Add tempo to track time under significant tension.
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            onClick={() => setBannerDismissed(true)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="flex items-center justify-between gap-2">
        <div className={`grid gap-2 flex-1 ${isDetailed ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'}`}>
          <SummaryCard label="Total Sets" value={summary.totalSets} />
          <SummaryCard label="Muscles" value={summary.musclesTargeted} />
          <SummaryCard label="Training Days" value={summary.trainingDays} />
          <SummaryCard label="Avg Sets/Muscle" value={summary.avgSetsPerMuscle} />
          {isDetailed && summary.totalTustSecondsMax > 0 && (
            <SummaryCard label="Total TUST" value={formatTustRange(summary.totalTustSecondsMin, summary.totalTustSecondsMax)} isString />
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 border rounded-md p-0.5 shrink-0">
          <Button
            variant={viewMode === 'sets' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewMode('sets')}
            title="Sets view"
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === 'detailed' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewMode('detailed')}
            title="Detailed view"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Volume bars */}
      <div className="space-y-1.5">
        <TooltipProvider>
          {entries.map(entry => {
            const maxBar = entry.muscle.landmarks.MRV;
            const barWidth = Math.min(100, (entry.totalSets / maxBar) * 100);
            const mevMark = (entry.muscle.landmarks.MEV / maxBar) * 100;
            const mrvMark = 100;

            return (
              <Tooltip key={entry.muscle.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`flex items-center gap-2 group ${onMuscleClick ? 'cursor-pointer hover:bg-muted/30 rounded-md px-1 -mx-1 transition-colors' : 'cursor-default'}`}
                    onClick={() => onMuscleClick?.(entry.muscle.id)}
                  >
                    {/* Muscle label */}
                    <div className="flex items-center gap-1.5 w-28 shrink-0">
                      <div className={`w-2 h-2 rounded-full ${entry.muscle.colorClass}`} />
                      <span className="text-xs font-medium truncate">{entry.muscle.label}</span>
                    </div>

                    {/* Sets + reps (+ TUST in detailed mode) */}
                    <div className={`text-right shrink-0 ${isDetailed ? 'w-44' : 'w-24'}`}>
                      <span className="font-mono text-xs">{entry.totalSets}</span>
                      {entry.totalRepsMin > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-1">
                          ({entry.totalRepsMin}-{entry.totalRepsMax})
                        </span>
                      )}
                      {isDetailed && entry.hasTempo && entry.tustSecondsMax > 0 && (
                        <span className="text-[10px] text-primary/70 ml-1.5">
                          TUST: {formatTustRange(entry.tustSecondsMin, entry.tustSecondsMax)}
                        </span>
                      )}
                    </div>

                    {/* Bar */}
                    <div className="flex-1 relative h-5 bg-muted/50 rounded overflow-hidden">
                      <div
                        className="absolute top-0 bottom-0 w-px bg-amber-500/60 z-10"
                        style={{ left: `${mevMark}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-500/60 z-10"
                        style={{ left: `${mrvMark}%` }}
                      />
                      <div
                        className={`absolute inset-y-0 left-0 rounded transition-all ${getLandmarkBgColor(entry.zone)}`}
                        style={{ width: `${barWidth}%`, opacity: 0.7 }}
                      />
                    </div>

                    {/* Zone badge */}
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 w-16 justify-center ${getLandmarkColor(entry.zone)}`}
                    >
                      {getLandmarkLabel(entry.zone)}
                    </Badge>

                    {/* Frequency */}
                    <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0">
                      {entry.frequency}×
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <div className="space-y-0.5">
                    <p className="font-medium">{entry.muscle.label}: {entry.totalSets} sets/week ({entry.totalRepsMin}-{entry.totalRepsMax} reps)</p>
                    {entry.hasTempo && entry.tustSecondsMax > 0 && (
                      <p className="text-primary/80">TUST: {formatTustRange(entry.tustSecondsMin, entry.tustSecondsMax)}</p>
                    )}
                    {entry.workingSets > 0 && (
                      <p>Working sets: {entry.workingSets} of {entry.totalSets}</p>
                    )}
                    <p>MV: {entry.muscle.landmarks.MV} | MEV: {entry.muscle.landmarks.MEV} | MAV: {entry.muscle.landmarks.MAV} | MRV: {entry.muscle.landmarks.MRV}</p>
                    <p>Frequency: {entry.frequency}× per week</p>
                    {entry.subdivisionBreakdown.length > 0 && (
                      <div className="pt-1 mt-1 border-t border-border/30">
                        {entry.subdivisionBreakdown.map(sub => (
                          <p key={sub.muscleId} className="text-muted-foreground">
                            {sub.label}: {sub.sets} sets
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500/60" /> MEV</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500/60" /> MRV</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-zinc-500" /> Below MV</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" /> Maintenance</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Productive</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500" /> Near MRV</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" /> Over MRV</span>
      </div>
    </div>
  );
});

function SummaryCard({ label, value, isString }: { label: string; value: number | string; isString?: boolean }) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="p-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`font-mono font-bold ${isString ? 'text-sm' : 'text-lg'}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
