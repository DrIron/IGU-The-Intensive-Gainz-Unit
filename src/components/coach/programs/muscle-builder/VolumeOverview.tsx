import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

export const VolumeOverview = memo(function VolumeOverview({
  entries,
  summary,
  onMuscleClick,
}: VolumeOverviewProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Add muscles to see volume analysis
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryCard label="Total Sets" value={summary.totalSets} />
        <SummaryCard label="Muscles" value={summary.musclesTargeted} />
        <SummaryCard label="Training Days" value={summary.trainingDays} />
        <SummaryCard label="Avg Sets/Muscle" value={summary.avgSetsPerMuscle} />
      </div>

      {/* Volume bars */}
      <div className="space-y-1.5">
        <TooltipProvider>
          {entries.map(entry => {
            const maxBar = entry.muscle.landmarks.MRV;
            const barWidth = Math.min(100, (entry.totalSets / maxBar) * 100);
            const mevMark = (entry.muscle.landmarks.MEV / maxBar) * 100;
            const mrvMark = 100; // MRV is the full bar width

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

                    {/* Sets + reps */}
                    <div className="text-right shrink-0 w-24">
                      <span className="font-mono text-xs">{entry.totalSets}</span>
                      {entry.totalRepsMin > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-1">
                          ({entry.totalRepsMin}-{entry.totalRepsMax})
                        </span>
                      )}
                    </div>

                    {/* Bar */}
                    <div className="flex-1 relative h-5 bg-muted/50 rounded overflow-hidden">
                      {/* MEV marker */}
                      <div
                        className="absolute top-0 bottom-0 w-px bg-amber-500/60 z-10"
                        style={{ left: `${mevMark}%` }}
                      />
                      {/* MRV marker */}
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-500/60 z-10"
                        style={{ left: `${mrvMark}%` }}
                      />
                      {/* Fill bar */}
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

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="p-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="font-mono text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
