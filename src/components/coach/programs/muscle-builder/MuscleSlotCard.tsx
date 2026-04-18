import { memo, useCallback, useState } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, AlertTriangle, Dumbbell, Plus, RefreshCw, Settings2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getMuscleDisplay,
  MUSCLE_MAP,
  SUBDIVISION_MAP,
  type SlotExercise,
} from "@/types/muscle-builder";
import type { SetPrescription } from "@/types/workout-builder";
import { AVAILABLE_PRESCRIPTION_COLUMNS, AVAILABLE_CLIENT_COLUMNS } from "@/types/workout-builder";

interface MuscleSlotCardProps {
  slotId: string;
  muscleId: string;
  sets: number;
  repMin: number;
  repMax: number;
  tempo?: string;
  rir?: number;
  rpe?: number;
  exercise?: SlotExercise;
  replacements?: SlotExercise[];
  setsDetail?: SetPrescription[];
  prescriptionColumns?: string[];
  clientInputColumns?: string[];
  globalClientInputs?: string[];
  draggableIndex: number;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
  onSetExercise?: (slotId: string, exercise: SlotExercise) => void;
  onClearExercise?: (slotId: string) => void;
  onAddReplacement?: (slotId: string, exercise: SlotExercise) => void;
  onRemoveReplacement?: (slotId: string, replacementIndex: number) => void;
  onOpenExercisePicker?: (slotId: string, muscleId: string, mode: 'primary' | 'replacement') => void;
  onTogglePerSet?: (slotId: string) => void;
  onUpdateSetDetail?: (slotId: string, setIndex: number, field: keyof SetPrescription, value: number | string | undefined) => void;
  onSetExerciseInstructions?: (slotId: string, instructions: string) => void;
  onSetSlotClientInputs?: (slotId: string, columns: string[] | undefined) => void;
  onSetSlotColumns?: (slotId: string, columns: string[]) => void;
  isHighlighted?: boolean;
  onSetAllSets?: (muscleId: string, sets: number) => void;
  alwaysShowControls?: boolean;
  weekCount?: number;
  onApplyToRemaining?: (slotId: string, fields: Record<string, unknown>) => void;
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
  exercise,
  replacements,
  setsDetail,
  prescriptionColumns,
  clientInputColumns,
  globalClientInputs,
  draggableIndex,
  onSetSlotDetails,
  onRemove,
  onSetExercise,
  onClearExercise,
  onAddReplacement,
  onRemoveReplacement,
  onOpenExercisePicker,
  onTogglePerSet,
  onUpdateSetDetail,
  onSetExerciseInstructions,
  onSetSlotClientInputs,
  onSetSlotColumns,
  isHighlighted,
  onSetAllSets,
  alwaysShowControls,
  weekCount,
  onApplyToRemaining,
}: MuscleSlotCardProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(slotId);
  }, [slotId, onRemove]);

  const handleBulkApply = useCallback(() => {
    onSetAllSets?.(muscleId, sets);
  }, [muscleId, sets, onSetAllSets]);

  const handleOpenPicker = useCallback((mode: 'primary' | 'replacement') => {
    onOpenExercisePicker?.(slotId, muscleId, mode);
  }, [slotId, muscleId, onOpenExercisePicker]);

  const muscle = getMuscleDisplay(muscleId);
  if (!muscle) return null;

  const label = formatSlotLabel(muscleId);
  const hasTempo = !!tempo && tempo.length === 4;
  const needsIntensity = hasTempo && rir == null && rpe == null;
  const hasExercise = !!exercise;
  const hasPerSet = !!setsDetail && setsDetail.length > 0;

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
                <span className="font-medium truncate text-foreground">
                  {hasExercise ? exercise.name : label}
                </span>
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
                {hasExercise && (
                  <Dumbbell className="h-3 w-3 text-emerald-500 shrink-0" />
                )}
                {hasPerSet && (
                  <Settings2 className="h-3 w-3 text-blue-400 shrink-0" />
                )}
                {replacements && replacements.length > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                    +{replacements.length}
                  </span>
                )}
                {needsIntensity && !hasPerSet && (
                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-0"
              onClick={e => e.stopPropagation()}
              align="start"
              side="right"
              sideOffset={8}
            >
              <ScrollArea className="max-h-[70vh]">
                <div className="p-3">
                  <SlotEditorPopover
                    slotId={slotId}
                    muscleId={muscleId}
                    label={label}
                    sets={sets}
                    repMin={repMin}
                    repMax={repMax}
                    tempo={tempo}
                    rir={rir}
                    rpe={rpe}
                    exercise={exercise}
                    replacements={replacements}
                    setsDetail={setsDetail}
                    clientInputColumns={clientInputColumns}
                    globalClientInputs={globalClientInputs}
                    onSetSlotDetails={onSetSlotDetails}
                    onSetAllSets={onSetAllSets ? handleBulkApply : undefined}
                    onClearExercise={onClearExercise ? () => onClearExercise(slotId) : undefined}
                    onRemoveReplacement={onRemoveReplacement ? (i) => onRemoveReplacement(slotId, i) : undefined}
                    onOpenPicker={onOpenExercisePicker ? handleOpenPicker : undefined}
                    onTogglePerSet={onTogglePerSet ? () => onTogglePerSet(slotId) : undefined}
                    onUpdateSetDetail={onUpdateSetDetail ? (si, f, v) => onUpdateSetDetail(slotId, si, f, v) : undefined}
                    onSetExerciseInstructions={onSetExerciseInstructions ? (v) => onSetExerciseInstructions(slotId, v) : undefined}
                    onSetSlotClientInputs={onSetSlotClientInputs ? (v) => onSetSlotClientInputs(slotId, v) : undefined}
                    prescriptionColumns={prescriptionColumns}
                    onSetSlotColumns={onSetSlotColumns ? (v) => onSetSlotColumns(slotId, v) : undefined}
                    muscleLabel={muscle.label}
                    muscleColorHex={muscle.colorHex}
                    weekCount={weekCount}
                    onApplyToRemaining={onApplyToRemaining ? (fields) => onApplyToRemaining(slotId, fields) : undefined}
                  />
                </div>
              </ScrollArea>
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
  muscleId: string;
  label: string;
  sets: number;
  repMin: number;
  repMax: number;
  tempo?: string;
  rir?: number;
  rpe?: number;
  exercise?: SlotExercise;
  replacements?: SlotExercise[];
  setsDetail?: SetPrescription[];
  prescriptionColumns?: string[];
  clientInputColumns?: string[];
  globalClientInputs?: string[];
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onSetAllSets?: () => void;
  onClearExercise?: () => void;
  onRemoveReplacement?: (index: number) => void;
  onOpenPicker?: (mode: 'primary' | 'replacement') => void;
  onTogglePerSet?: () => void;
  onUpdateSetDetail?: (setIndex: number, field: keyof SetPrescription, value: number | string | undefined) => void;
  onSetExerciseInstructions?: (instructions: string) => void;
  onSetSlotClientInputs?: (columns: string[] | undefined) => void;
  onSetSlotColumns?: (columns: string[]) => void;
  muscleLabel: string;
  muscleColorHex: string;
  weekCount?: number;
  onApplyToRemaining?: (fields: Record<string, unknown>) => void;
}

function SlotEditorPopover({
  slotId,
  muscleId,
  label,
  sets,
  repMin,
  repMax,
  tempo,
  rir,
  rpe,
  exercise,
  replacements,
  setsDetail,
  clientInputColumns,
  globalClientInputs,
  onSetSlotDetails,
  onSetAllSets,
  onClearExercise,
  onRemoveReplacement,
  onOpenPicker,
  onTogglePerSet,
  onUpdateSetDetail,
  onSetExerciseInstructions,
  onSetSlotClientInputs,
  prescriptionColumns,
  onSetSlotColumns,
  muscleLabel,
  muscleColorHex,
  weekCount,
  onApplyToRemaining,
}: SlotEditorPopoverProps) {
  const hasTempo = !!tempo && tempo.length === 4;
  const needsIntensity = hasTempo && rir == null && rpe == null;
  const hasPerSet = !!setsDetail && setsDetail.length > 0;
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  // Active prescription columns for per-set table
  const DEFAULT_COLUMNS = ['rep_range', 'tempo', 'rir', 'rpe', 'rest'];
  const activeColumns = prescriptionColumns || DEFAULT_COLUMNS;

  const update = useCallback(
    (details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => {
      onSetSlotDetails(slotId, details);
    },
    [slotId, onSetSlotDetails],
  );

  const effectiveClientInputs = clientInputColumns || globalClientInputs || ['performed_weight', 'performed_reps', 'performed_rpe'];
  const isCustomClientInputs = !!clientInputColumns;

  return (
    <div className="space-y-3">
      {/* Muscle label with color indicator */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: muscleColorHex }} />
        <p className="text-sm font-medium">{label}</p>
      </div>

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

      {/* Per-set toggle */}
      {sets > 1 && onTogglePerSet && (
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground cursor-pointer" onClick={onTogglePerSet}>
            Customize each set
          </Label>
          <Switch checked={hasPerSet} onCheckedChange={onTogglePerSet} />
        </div>
      )}

      {/* ── Per-set table ──────────────────────────────────────── */}
      {hasPerSet && onUpdateSetDetail ? (
        <div className="space-y-2">
          {/* Column selector */}
          <div className="space-y-1.5">
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowColumnPicker(!showColumnPicker)}
            >
              <Settings2 className="h-2.5 w-2.5" />
              {showColumnPicker ? 'Hide columns' : 'Choose columns'}
            </button>
            {showColumnPicker && onSetSlotColumns && (
              <div className="flex flex-wrap gap-1">
                {AVAILABLE_PRESCRIPTION_COLUMNS.filter(c => c.type !== 'sets' && c.type !== 'custom').map(col => {
                  const active = activeColumns.includes(col.type);
                  return (
                    <button
                      key={col.type}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                        active ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400" : "border-border/50 text-muted-foreground hover:border-border"
                      )}
                      onClick={() => {
                        const next = active
                          ? activeColumns.filter(t => t !== col.type)
                          : [...activeColumns, col.type];
                        onSetSlotColumns(next.length > 0 ? next : ['rep_range']);
                      }}
                    >
                      {col.label.replace(/\s*\(.*?\)/, '')}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dynamic per-set table */}
          <div className="overflow-x-auto rounded-md border border-border/30">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-muted/30">
                  <th className="px-1.5 py-1 text-left font-medium text-muted-foreground w-7">#</th>
                  {activeColumns.includes('rep_range') && <th className="px-1 py-1 text-left font-medium text-muted-foreground">Reps</th>}
                  {activeColumns.includes('reps') && <th className="px-1 py-1 text-left font-medium text-muted-foreground w-10">Reps</th>}
                  {activeColumns.includes('weight') && <th className="px-1 py-1 text-left font-medium text-muted-foreground w-12">Wt</th>}
                  {activeColumns.includes('tempo') && <th className="px-1 py-1 text-left font-medium text-muted-foreground w-12">Tempo</th>}
                  {activeColumns.includes('rir') && <th className="px-1 py-1 text-left font-medium text-muted-foreground w-9">RIR</th>}
                  {activeColumns.includes('rpe') && <th className="px-1 py-1 text-left font-medium text-muted-foreground w-9">RPE</th>}
                  {activeColumns.includes('percent_1rm') && <th className="px-1 py-1 text-left font-medium text-muted-foreground w-11">%1RM</th>}
                  {activeColumns.includes('rest') && <th className="px-1 py-1 text-left font-medium text-muted-foreground w-11">Rest</th>}
                  {activeColumns.includes('time') && <th className="px-1 py-1 text-left font-medium text-muted-foreground w-11">Time</th>}
                  {activeColumns.includes('distance') && <th className="px-1 py-1 text-left font-medium text-muted-foreground w-11">Dist</th>}
                  {activeColumns.includes('notes') && <th className="px-1 py-1 text-left font-medium text-muted-foreground w-20">Notes</th>}
                </tr>
              </thead>
              <tbody>
                {setsDetail!.map((set, i) => (
                  <tr key={i} className="border-t border-border/20">
                    <td className="px-1.5 py-1 text-muted-foreground font-mono">{i + 1}</td>
                    {activeColumns.includes('rep_range') && (
                      <td className="px-0.5 py-0.5">
                        <div className="flex items-center gap-0.5">
                          <Input type="number" min={1} max={100} value={set.rep_range_min ?? ''}
                            onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdateSetDetail(i, 'rep_range_min', v != null && !isNaN(v) ? v : undefined); }}
                            className="h-6 text-[11px] w-9 px-1" onClick={e => e.stopPropagation()} />
                          <span className="text-muted-foreground text-[9px]">-</span>
                          <Input type="number" min={1} max={100} value={set.rep_range_max ?? ''}
                            onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdateSetDetail(i, 'rep_range_max', v != null && !isNaN(v) ? v : undefined); }}
                            className="h-6 text-[11px] w-9 px-1" onClick={e => e.stopPropagation()} />
                        </div>
                      </td>
                    )}
                    {activeColumns.includes('reps') && (
                      <td className="px-0.5 py-0.5">
                        <Input type="number" min={1} max={100} value={set.reps ?? ''}
                          onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdateSetDetail(i, 'reps', v != null && !isNaN(v) ? v : undefined); }}
                          className="h-6 text-[11px] w-9 px-1" onClick={e => e.stopPropagation()} />
                      </td>
                    )}
                    {activeColumns.includes('weight') && (
                      <td className="px-0.5 py-0.5">
                        <Input type="number" min={0} max={999} value={set.weight ?? ''} placeholder="kg"
                          onChange={e => { const v = e.target.value === '' ? undefined : parseFloat(e.target.value); onUpdateSetDetail(i, 'weight', v != null && !isNaN(v) ? v : undefined); }}
                          className="h-6 text-[11px] w-11 px-1" onClick={e => e.stopPropagation()} />
                      </td>
                    )}
                    {activeColumns.includes('tempo') && (
                      <td className="px-0.5 py-0.5">
                        <Input type="text" maxLength={4} inputMode="numeric" value={set.tempo ?? ''} placeholder="3120"
                          onChange={e => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4); onUpdateSetDetail(i, 'tempo', v || undefined); }}
                          className="h-6 text-[11px] font-mono w-11 px-1" onClick={e => e.stopPropagation()} />
                      </td>
                    )}
                    {activeColumns.includes('rir') && (
                      <td className="px-0.5 py-0.5">
                        <Input type="number" min={0} max={10} value={set.rir ?? ''} placeholder="2"
                          onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdateSetDetail(i, 'rir', v != null && !isNaN(v) ? Math.max(0, Math.min(10, v)) : undefined); }}
                          className="h-6 text-[11px] w-8 px-1" onClick={e => e.stopPropagation()} />
                      </td>
                    )}
                    {activeColumns.includes('rpe') && (
                      <td className="px-0.5 py-0.5">
                        <Input type="number" min={1} max={10} step={0.5} value={set.rpe ?? ''} placeholder="8"
                          onChange={e => { const v = e.target.value === '' ? undefined : parseFloat(e.target.value); onUpdateSetDetail(i, 'rpe', v != null && !isNaN(v) ? Math.max(1, Math.min(10, v)) : undefined); }}
                          className="h-6 text-[11px] w-8 px-1" onClick={e => e.stopPropagation()} />
                      </td>
                    )}
                    {activeColumns.includes('percent_1rm') && (
                      <td className="px-0.5 py-0.5">
                        <Input type="number" min={0} max={120} value={set.percent_1rm ?? ''} placeholder="%"
                          onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdateSetDetail(i, 'percent_1rm', v != null && !isNaN(v) ? v : undefined); }}
                          className="h-6 text-[11px] w-10 px-1" onClick={e => e.stopPropagation()} />
                      </td>
                    )}
                    {activeColumns.includes('rest') && (
                      <td className="px-0.5 py-0.5">
                        <Input type="number" min={0} max={600} value={set.rest_seconds ?? ''} placeholder="90"
                          onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdateSetDetail(i, 'rest_seconds', v != null && !isNaN(v) ? v : undefined); }}
                          className="h-6 text-[11px] w-10 px-1" onClick={e => e.stopPropagation()} />
                      </td>
                    )}
                    {activeColumns.includes('time') && (
                      <td className="px-0.5 py-0.5">
                        <Input type="number" min={0} max={7200} value={set.time_seconds ?? ''} placeholder="sec"
                          onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdateSetDetail(i, 'time_seconds', v != null && !isNaN(v) ? v : undefined); }}
                          className="h-6 text-[11px] w-10 px-1" onClick={e => e.stopPropagation()} />
                      </td>
                    )}
                    {activeColumns.includes('distance') && (
                      <td className="px-0.5 py-0.5">
                        <Input type="number" min={0} max={99999} value={set.distance_meters ?? ''} placeholder="m"
                          onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdateSetDetail(i, 'distance_meters', v != null && !isNaN(v) ? v : undefined); }}
                          className="h-6 text-[11px] w-10 px-1" onClick={e => e.stopPropagation()} />
                      </td>
                    )}
                    {activeColumns.includes('notes') && (
                      <td className="px-0.5 py-0.5">
                        <Input type="text" value={set.notes ?? ''} placeholder="..."
                          onChange={e => onUpdateSetDetail(i, 'notes', e.target.value || undefined)}
                          className="h-6 text-[11px] w-20 px-1" onClick={e => e.stopPropagation()} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Shared mode (flat values) ─────────────────────────── */
        <>
          {/* Rep Range */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Rep Range</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={1} max={100} value={repMin}
                onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) update({ repMin: v }); }}
                className="h-8 text-sm flex-1" onClick={e => e.stopPropagation()}
              />
              <span className="text-xs text-muted-foreground">&mdash;</span>
              <Input
                type="number" min={1} max={100} value={repMax}
                onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) update({ repMax: v }); }}
                className="h-8 text-sm flex-1" onClick={e => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Tempo */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tempo</Label>
            <Input
              type="text" maxLength={4} pattern="[0-9]{4}" inputMode="numeric" placeholder="3120"
              value={tempo ?? ''}
              onChange={e => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4); update({ tempo: v || undefined }); }}
              className="h-8 text-sm font-mono" onClick={e => e.stopPropagation()}
            />
          </div>

          {/* RIR */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">RIR</Label>
            <Input
              type="number" min={0} max={10} placeholder="2" value={rir ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? undefined : parseInt(e.target.value);
                update({ rir: v != null && !isNaN(v) ? Math.max(0, Math.min(10, v)) : undefined });
              }}
              className="h-8 text-sm" onClick={e => e.stopPropagation()}
            />
          </div>

          {/* RPE */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">RPE</Label>
            <Input
              type="number" min={1} max={10} step={0.5} placeholder="8" value={rpe ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
                update({ rpe: v != null && !isNaN(v) ? Math.max(1, Math.min(10, v)) : undefined });
              }}
              className="h-8 text-sm" onClick={e => e.stopPropagation()}
            />
          </div>

          {/* Validation hint */}
          {needsIntensity && (
            <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-600 dark:text-amber-400">Add RIR or RPE for TUST tracking</p>
            </div>
          )}
        </>
      )}

      {/* ── Exercise Section ─────────────────────────────────── */}
      {onOpenPicker && (
        <div className="space-y-2 pt-2 border-t border-border/30">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Dumbbell className="h-3 w-3" />
            Exercise
          </Label>

          {exercise ? (
            <>
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2">
                <Dumbbell className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span className="text-sm font-medium truncate flex-1">{exercise.name}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-5 w-5"
                    onClick={() => onOpenPicker('primary')} title="Change exercise">
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  {onClearExercise && (
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive"
                      onClick={onClearExercise} title="Remove exercise">
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Coach Instructions */}
              {onSetExerciseInstructions && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <FileText className="h-2.5 w-2.5" />
                    Coach Instructions
                  </Label>
                  <Textarea
                    placeholder="Focus on controlled eccentric, full ROM..."
                    value={exercise.instructions || ''}
                    onChange={e => onSetExerciseInstructions(e.target.value)}
                    className="text-xs min-h-[48px] resize-none"
                    rows={2}
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              )}

              {/* Replacements */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <RefreshCw className="h-2.5 w-2.5" />
                  Replacements (optional)
                </Label>

                {replacements && replacements.length > 0 && (
                  <div className="space-y-1">
                    {replacements.map((rep, i) => (
                      <div key={`${rep.exerciseId}-${i}`} className="flex items-center gap-2 rounded border border-border/50 bg-muted/20 px-2 py-1.5">
                        <span className="text-xs truncate flex-1">{rep.name}</span>
                        {onRemoveReplacement && (
                          <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => onRemoveReplacement(i)}>
                            <X className="h-2.5 w-2.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <Button variant="ghost" size="sm" className="w-full text-[11px] h-7"
                  onClick={() => onOpenPicker('replacement')}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Replacement
                </Button>
              </div>
            </>
          ) : (
            <Button variant="outline" size="sm" className="w-full text-xs border-dashed"
              onClick={() => onOpenPicker('primary')}>
              <Plus className="h-3 w-3 mr-1.5" />
              Choose Exercise
            </Button>
          )}
        </div>
      )}

      {/* ── Client Inputs Section ────────────────────────────── */}
      {onSetSlotClientInputs && (
        <div className="space-y-2 pt-2 border-t border-border/30">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Settings2 className="h-3 w-3" />
            Client Inputs
          </Label>

          <div className="flex items-center gap-2">
            <button
              className={cn("text-[11px] px-2 py-1 rounded-md border", !isCustomClientInputs ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground")}
              onClick={() => onSetSlotClientInputs(undefined)}
            >
              Plan defaults
            </button>
            <button
              className={cn("text-[11px] px-2 py-1 rounded-md border", isCustomClientInputs ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground")}
              onClick={() => onSetSlotClientInputs(effectiveClientInputs)}
            >
              Custom
            </button>
          </div>

          <div className="flex flex-wrap gap-1">
            {AVAILABLE_CLIENT_COLUMNS.map(col => {
              const active = effectiveClientInputs.includes(col.type);
              return (
                <button
                  key={col.type}
                  disabled={!isCustomClientInputs}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                    active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border/50 text-muted-foreground",
                    !isCustomClientInputs && "opacity-50 cursor-default"
                  )}
                  onClick={() => {
                    if (!isCustomClientInputs) return;
                    const next = active
                      ? effectiveClientInputs.filter(t => t !== col.type)
                      : [...effectiveClientInputs, col.type];
                    onSetSlotClientInputs(next);
                  }}
                >
                  {col.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/30">
        <p>Working set: RIR &le; 5 or RPE &ge; 5</p>
        <p>Only working sets count for TUST</p>
      </div>

      {/* Bulk apply */}
      {onSetAllSets && (
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={onSetAllSets}>
          Apply {sets} sets to all {muscleLabel}
        </Button>
      )}

      {/* Apply to remaining weeks */}
      {onApplyToRemaining && weekCount && weekCount > 1 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs border-primary/30 text-primary hover:bg-primary/5"
          onClick={() => onApplyToRemaining({
            sets, repMin, repMax, tempo, rir, rpe,
            exercise: exercise ? { ...exercise } : undefined,
            setsDetail: setsDetail ? [...setsDetail] : undefined,
          })}
        >
          Apply slot to remaining weeks
        </Button>
      )}
    </div>
  );
}
