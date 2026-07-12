import { cn } from "@/lib/utils";
import { getLandmarkBgColor } from "@/types/muscle-builder";
import { LandmarkZoneChip } from "./LandmarkZoneChip";
import type { MuscleVolumeEntry } from "../muscle-builder/hooks/useMusclePlanVolume";

/**
 * MuscleDistributionBars — per-muscle weekly volume bars with MEV/MRV landmark
 * ticks and a zone chip (§11.2).
 *
 * The detail view's distribution section. This is where landmark zones live:
 * §6.3 LOCKED them OFF the small library card (per-muscle zones across ~11
 * muscles are far too dense for a card, and a single "worst zone" aggregate would
 * be a lie — one over-MRV muscle does not make a program over-MRV).
 *
 * Presentational only — the caller supplies `volumeEntries` from
 * `useMusclePlanVolume`; this does no math and no fetching (§11.1).
 *
 * Visually this is the same bar idiom as the builder's `VolumeOverview` rail, so
 * the detail view and the board read as one system.
 */
interface MuscleDistributionBarsProps {
  entries: MuscleVolumeEntry[];
  className?: string;
}

export function MuscleDistributionBars({ entries, className }: MuscleDistributionBarsProps) {
  if (entries.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No strength volume in this program yet.
      </p>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {entries.map((entry) => {
        const maxBar = entry.muscle.landmarks.MRV;
        const barWidth = Math.min(100, (entry.totalSets / maxBar) * 100);
        const mevMark = (entry.muscle.landmarks.MEV / maxBar) * 100;

        return (
          <div key={entry.muscle.id} className="flex items-center gap-2">
            {/* Muscle label */}
            <div className="flex items-center gap-1.5 w-28 shrink-0">
              <div className={cn("w-2 h-2 rounded-full", entry.muscle.colorClass)} />
              <span className="text-xs font-medium truncate">{entry.muscle.label}</span>
            </div>

            {/* Sets (mono) */}
            <div className="w-10 shrink-0 text-right">
              <span className="font-mono text-xs">{entry.totalSets}</span>
            </div>

            {/* Bar with MEV / MRV landmark ticks */}
            <div className="flex-1 relative h-5 bg-muted/50 rounded overflow-hidden">
              <div
                className="absolute top-0 bottom-0 w-px bg-amber-500/60 z-10"
                style={{ left: `${mevMark}%` }}
              />
              <div className="absolute top-0 bottom-0 right-0 w-px bg-red-500/60 z-10" />
              <div
                className={cn("absolute inset-y-0 left-0 rounded transition-all", getLandmarkBgColor(entry.zone))}
                style={{ width: `${barWidth}%`, opacity: 0.7 }}
              />
            </div>

            <LandmarkZoneChip zone={entry.zone} />

            {/* Frequency */}
            <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0">
              {entry.frequency}×
            </span>
          </div>
        );
      })}

      {/* Legend — same vocabulary as the builder's volume rail. */}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500/60" /> MEV</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500/60" /> MRV</span>
      </div>
    </div>
  );
}
