import { memo, useCallback, useState } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getMuscleDisplay,
  MUSCLE_MAP,
  SUBDIVISION_MAP,
} from "@/types/muscle-builder";

interface MuscleSlotCardProps {
  slotId: string;
  muscleId: string;
  sets: number;
  repMin: number;
  repMax: number;
  tempo?: string;
  rir?: number;
  rpe?: number;
  draggableIndex: number;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
  isHighlighted?: boolean;
  onSetAllSets?: (muscleId: string, sets: number) => void;
  alwaysShowControls?: boolean;
}

/** Format slot label: subdivisions show "Parent > Sub", parents show their label */
function formatSlotLabel(muscleId: string): string {
  const sub = SUBDIVISION_MAP.get(muscleId);
  if (sub) {
    const parent = MUSCLE_MAP.get(sub.parentId);
    const shortLabel = sub.label.replace(/\s*\(.*?\)\s*/, '');
    return `${parent?.label ?? sub.parentId} \u203A ${shortLabel}`;
  }
  const display = getMuscleDisplay(muscleId);
  return display?.label ?? muscleId;
}

export const MuscleSlotCard = memo(function MuscleSlotCard({
  slotId,
  muscleId,
  sets,
  repMin,
  repMax,
  tempo,
  rir,
  rpe,
  draggableIndex,
  onSetSlotDetails,
  onRemove,
  isHighlighted,
  onSetAllSets,
  alwaysShowControls,
}: MuscleSlotCardProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(slotId);
  }, [slotId, onRemove]);

  const handleBulkApply = useCallback(() => {
    onSetAllSets?.(muscleId, sets);
  }, [muscleId, sets, onSetAllSets]);

  const muscle = getMuscleDisplay(muscleId);
  if (!muscle) return null;

  const label = formatSlotLabel(muscleId);
  const hasTempo = !!tempo && tempo.length === 4;
  const needsIntensity = hasTempo && rir == null && rpe == null;

  return (
    <Draggable draggableId={`slot-${slotId}`} index={draggableIndex}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            `group flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-sm transition-all`,
            snapshot.isDragging
              ? 'shadow-lg ring-2 ring-primary/50 bg-card'
              : 'bg-card/50 border-border/50 hover:border-border',
            isHighlighted && 'ring-2 ring-primary animate-pulse bg-primary/10',
          )}
          style={{
            ...provided.draggableProps.style,
            backgroundColor: snapshot.isDragging || isHighlighted ? undefined : `${muscle.colorHex}08`,
          }}
        >
          {/* Drag handle */}
          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing shrink-0 flex items-center">
            <div className={`w-2 h-2 rounded-full ${muscle.colorClass}`} />
          </div>

          {/* Clickable area → opens popover */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                onClick={e => e.stopPropagation()}
              >
                <span className="font-medium truncate text-foreground">{label}</span>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: `${muscle.colorHex}20`, color: muscle.colorHex }}
                >
                  {sets}s
                </span>
                {hasTempo && (
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {tempo}
                  </span>
                )}
                {needsIntensity && (
                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-3"
              onClick={e => e.stopPropagation()}
              align="start"
              side="right"
              sideOffset={8}
            >
              <SlotEditorPopover
                slotId={slotId}
                label={label}
                sets={sets}
                repMin={repMin}
                repMax={repMax}
                tempo={tempo}
                rir={rir}
                rpe={rpe}
                onSetSlotDetails={onSetSlotDetails}
                onSetAllSets={onSetAllSets ? handleBulkApply : undefined}
                muscleLabel={muscle.label}
              />
            </PopoverContent>
          </Popover>

          {/* Delete */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-5 w-5 transition-opacity shrink-0",
              alwaysShowControls ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </Draggable>
  );
});

/* ── Slot Editor Popover Content ──────────────────────────── */

interface SlotEditorPopoverProps {
  slotId: string;
  label: string;
  sets: number;
  repMin: number;
  repMax: number;
  tempo?: string;
  rir?: number;
  rpe?: number;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onSetAllSets?: () => void;
  muscleLabel: string;
}

function SlotEditorPopover({
  slotId,
  label,
  sets,
  repMin,
  repMax,
  tempo,
  rir,
  rpe,
  onSetSlotDetails,
  onSetAllSets,
  muscleLabel,
}: SlotEditorPopoverProps) {
  const hasTempo = !!tempo && tempo.length === 4;
  const needsIntensity = hasTempo && rir == null && rpe == null;

  const update = useCallback(
    (details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => {
      onSetSlotDetails(slotId, details);
    },
    [slotId, onSetSlotDetails],
  );

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{label}</p>

      {/* Sets */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Sets</Label>
        <Input
          type="number"
          min={1}
          max={20}
          value={sets}
          onChange={e => {
            const v = parseInt(e.target.value);
            if (!isNaN(v)) update({ sets: v });
          }}
          className="h-8 text-sm"
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* Rep Range */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Rep Range</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={100}
            value={repMin}
            onChange={e => {
              const v = parseInt(e.target.value);
              if (!isNaN(v)) update({ repMin: v });
            }}
            className="h-8 text-sm flex-1"
            onClick={e => e.stopPropagation()}
          />
          <span className="text-xs text-muted-foreground">&mdash;</span>
          <Input
            type="number"
            min={1}
            max={100}
            value={repMax}
            onChange={e => {
              const v = parseInt(e.target.value);
              if (!isNaN(v)) update({ repMax: v });
            }}
            className="h-8 text-sm flex-1"
            onClick={e => e.stopPropagation()}
          />
        </div>
      </div>

      {/* Tempo */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Tempo</Label>
        <Input
          type="text"
          maxLength={4}
          pattern="[0-9]{4}"
          inputMode="numeric"
          placeholder="3120"
          value={tempo ?? ''}
          onChange={e => {
            const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
            update({ tempo: v || undefined });
          }}
          className="h-8 text-sm font-mono"
          onClick={e => e.stopPropagation()}
        />
        <p className="text-[10px] text-muted-foreground">ecc-pause-con-pause in seconds</p>
      </div>

      {/* RIR */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">RIR (Reps in Reserve)</Label>
        <Input
          type="number"
          min={0}
          max={10}
          placeholder="2"
          value={rir ?? ''}
          onChange={e => {
            const v = e.target.value === '' ? undefined : parseInt(e.target.value);
            update({ rir: v != null && !isNaN(v) ? Math.max(0, Math.min(10, v)) : undefined });
          }}
          className="h-8 text-sm"
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* RPE */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">RPE (Rate of Perceived Exertion)</Label>
        <Input
          type="number"
          min={1}
          max={10}
          step={0.5}
          placeholder="8"
          value={rpe ?? ''}
          onChange={e => {
            const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
            update({ rpe: v != null && !isNaN(v) ? Math.max(1, Math.min(10, v)) : undefined });
          }}
          className="h-8 text-sm"
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* Validation hint */}
      {needsIntensity && (
        <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Add RIR or RPE for TUST tracking
          </p>
        </div>
      )}

      {/* Info */}
      <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/30">
        <p>Working set: RIR &le; 5 or RPE &ge; 5</p>
        <p>Only working sets count for TUST</p>
      </div>

      {/* Bulk apply */}
      {onSetAllSets && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={onSetAllSets}
        >
          Apply {sets} sets to all {muscleLabel}
        </Button>
      )}
    </div>
  );
}
