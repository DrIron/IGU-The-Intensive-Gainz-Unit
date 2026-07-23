import { memo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BarChart3, List, X, Info, ChevronDown, ChevronRight } from "lucide-react";
import { getLandmarkBgColor } from "@/types/muscle-builder";
import { LandmarkZoneChip } from "../shared/LandmarkZoneChip";
import { VolumeTiles } from "../shared/VolumeTiles";
import { formatTustRange } from "../shared/volumeFormat";
import type { MuscleVolumeEntry, VolumeSummary } from "../muscle-builder/hooks/useMusclePlanVolume";
import type { MovementLens, CardioLens } from "./multiLensVolume";

interface VolumeOverviewProps {
  entries: MuscleVolumeEntry[];
  summary: VolumeSummary;
  onMuscleClick?: (muscleId: string) => void;
  /** Phase 3 (canonical authoring only): extra lenses rendered as sibling sections below the muscle
   *  lens. Omitted everywhere else → byte-identical. Empty lenses render nothing. */
  movementLens?: MovementLens | null;
  cardioLens?: CardioLens | null;
}

export const VolumeOverview = memo(function VolumeOverview({
  entries,
  summary,
  onMuscleClick,
  movementLens,
  cardioLens,
}: VolumeOverviewProps) {
  const [viewMode, setViewMode] = useState<'sets' | 'detailed'>('sets');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const isDetailed = viewMode === 'detailed';
  const hasMovement = (movementLens?.rows.length ?? 0) > 0;
  const hasCardio = (cardioLens?.modalities.length ?? 0) > 0;

  if (entries.length === 0 && !hasMovement && !hasCardio) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Add muscles to see volume analysis
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.length > 0 && (
        <MuscleLens
          entries={entries}
          summary={summary}
          onMuscleClick={onMuscleClick}
          viewMode={viewMode}
          setViewMode={setViewMode}
          bannerDismissed={bannerDismissed}
          setBannerDismissed={setBannerDismissed}
        />
      )}
      {hasMovement && movementLens && <MovementLensSection lens={movementLens} />}
      {hasCardio && cardioLens && <CardioLensSection lens={cardioLens} />}
    </div>
  );
});

/** The existing muscle (landmark) lens — extracted verbatim so the new lenses sit beside it. */
function MuscleLens({
  entries,
  summary,
  onMuscleClick,
  viewMode,
  setViewMode,
  bannerDismissed,
  setBannerDismissed,
}: {
  entries: MuscleVolumeEntry[];
  summary: VolumeSummary;
  onMuscleClick?: (muscleId: string) => void;
  viewMode: 'sets' | 'detailed';
  setViewMode: (m: 'sets' | 'detailed') => void;
  bannerDismissed: boolean;
  setBannerDismissed: (v: boolean) => void;
}) {
  const isDetailed = viewMode === 'detailed';
  // Fragment (not a wrapping div): the memo's outer `space-y-4` div provides the spacing, so the
  // muscle-only DOM stays byte-identical to the pre-multi-lens render (visual-no-op guard).
  return (
    <>
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
        <VolumeTiles summary={summary} detailed={isDetailed} />

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
                    <LandmarkZoneChip zone={entry.zone} />

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
    </>
  );
}

/** MOVEMENT lens — plain weekly sets per Squat/Press/Hinge (no landmarks). Collapsible (expanded by
 *  default); Press drills into Horizontal/Anterior subGroups (collapsed by default). */
function MovementLensSection({ lens }: { lens: MovementLens }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const maxSets = Math.max(1, ...lens.rows.map(r => r.sets));

  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="space-y-1.5 pt-3 border-t border-border/30">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Movement
        <span className="font-mono font-normal text-[10px] normal-case">{lens.totalSets} sets</span>
      </button>
      {open && (
        <div className="space-y-1">
          {lens.rows.map(row => {
            const canDrill = row.subGroups.length > 0;
            const isExpanded = expanded.has(row.id);
            return (
              <div key={row.id}>
                <div
                  className={`flex items-center gap-2 rounded-md px-1 -mx-1 ${canDrill ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                  onClick={canDrill ? () => toggle(row.id) : undefined}
                >
                  <div className="flex items-center gap-1 w-28 shrink-0">
                    {canDrill
                      ? (isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />)
                      : <span className="w-3 shrink-0" />}
                    <span className="text-xs font-medium truncate">{row.label}</span>
                  </div>
                  <span className="font-mono text-xs w-10 text-right shrink-0">{row.sets}</span>
                  <div className="flex-1 h-4 bg-muted/50 rounded overflow-hidden">
                    <div className="h-full bg-primary/50 rounded" style={{ width: `${(row.sets / maxSets) * 100}%` }} />
                  </div>
                </div>
                {canDrill && isExpanded && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {row.subGroups.map(sg => (
                      <div key={sg.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="w-24 truncate">{sg.label}</span>
                        <span className="font-mono">{sg.sets}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** CARDIO lens — minutes per modality (+ HR-zone distribution when present). */
function CardioLensSection({ lens }: { lens: CardioLens }) {
  const maxMin = Math.max(1, ...lens.modalities.map(m => m.minutes));
  return (
    <div className="space-y-1.5 pt-3 border-t border-border/30">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Cardio
        <span className="font-mono font-normal text-[10px] normal-case">{lens.totalMinutes} min</span>
      </div>
      <div className="space-y-1">
        {lens.modalities.map(m => (
          <div key={m.label} className="flex items-center gap-2">
            <span className="text-xs font-medium truncate w-28 shrink-0">{m.label}</span>
            <span className="font-mono text-xs w-12 text-right shrink-0">{m.minutes}m</span>
            <div className="flex-1 h-4 bg-muted/50 rounded overflow-hidden">
              <div className="h-full bg-green-500/50 rounded" style={{ width: `${(m.minutes / maxMin) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      {lens.hrZones.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {lens.hrZones.map(z => (
            <span key={z.zone} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Z{z.zone}: {z.minutes}m
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
