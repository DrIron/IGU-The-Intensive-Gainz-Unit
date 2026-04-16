import { memo, useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, ClipboardPaste, Plus, X, Search, AlertTriangle, Dumbbell, RefreshCw, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAYS_OF_WEEK,
  MUSCLE_GROUPS,
  MUSCLE_MAP,
  SUBDIVISIONS,
  BODY_REGIONS,
  BODY_REGION_LABELS,
  getMuscleDisplay,
  resolveParentMuscleId,
  SUBDIVISIONS_BY_PARENT,
  SUBDIVISION_MAP,
  type MuscleSlotData,
  type SlotExercise,
  type BodyRegion,
} from "@/types/muscle-builder";

interface MobileDayDetailProps {
  slots: MuscleSlotData[];
  selectedDayIndex: number;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
  onAddMuscle: (dayIndex: number, muscleId: string) => void;
  onSetExercise?: (slotId: string, exercise: SlotExercise) => void;
  onClearExercise?: (slotId: string) => void;
  onAddReplacement?: (slotId: string, exercise: SlotExercise) => void;
  onRemoveReplacement?: (slotId: string, replacementIndex: number) => void;
  onOpenExercisePicker?: (slotId: string, muscleId: string, mode: 'primary' | 'replacement') => void;
  onTogglePerSet?: (slotId: string) => void;
  onUpdateSetDetail?: (slotId: string, setIndex: number, field: keyof import("@/types/workout-builder").SetPrescription, value: number | string | undefined) => void;
  onSetExerciseInstructions?: (slotId: string, instructions: string) => void;
  onSetSlotClientInputs?: (slotId: string, columns: string[] | undefined) => void;
  globalClientInputs?: string[];
  copiedDayIndex?: number | null;
  onCopyDay?: (dayIndex: number) => void;
  onPasteDay?: (dayIndex: number) => void;
  highlightedMuscleId?: string | null;
  onSetAllSets?: (muscleId: string, sets: number) => void;
  onReorderSlot?: (dayIndex: number, fromIndex: number, toIndex: number) => void;
  weekCount?: number;
  onApplyToRemaining?: (slotId: string, fields: Record<string, unknown>) => void;
}

const musclesByRegion = new Map<BodyRegion, typeof MUSCLE_GROUPS>();
for (const region of BODY_REGIONS) {
  musclesByRegion.set(region, MUSCLE_GROUPS.filter(m => m.bodyRegion === region));
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

export const MobileDayDetail = memo(function MobileDayDetail({
  slots,
  selectedDayIndex,
  onSetSlotDetails,
  onRemove,
  onAddMuscle,
  onClearExercise,
  onRemoveReplacement,
  onOpenExercisePicker,
  onTogglePerSet,
  onUpdateSetDetail,
  onSetExerciseInstructions,
  onSetSlotClientInputs,
  globalClientInputs,
  copiedDayIndex,
  onCopyDay,
  onPasteDay,
  highlightedMuscleId,
  onReorderSlot,
  weekCount,
  onApplyToRemaining,
}: MobileDayDetailProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const daySlots = useMemo(
    () => slots.filter(s => s.dayIndex === selectedDayIndex).sort((a, b) => a.sortOrder - b.sortOrder),
    [slots, selectedDayIndex],
  );

  const totalSets = useMemo(
    () => daySlots.reduce((sum, s) => sum + s.sets, 0),
    [daySlots],
  );

  const hasCopied = copiedDayIndex != null;
  const isCopiedDay = copiedDayIndex === selectedDayIndex;

  const handleAddMuscle = useCallback(
    (muscleId: string) => {
      onAddMuscle(selectedDayIndex, muscleId);
    },
    [onAddMuscle, selectedDayIndex],
  );

  const filteredItems = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const parents = MUSCLE_GROUPS.filter(
      m => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
    const subs = SUBDIVISIONS.filter(
      s => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    );
    return { parents, subs };
  }, [search]);

  return (
    <Card className="border-border/50">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {DAYS_OF_WEEK[selectedDayIndex - 1]}
            </span>
            {totalSets > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {totalSets} sets
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {daySlots.length > 0 && onCopyDay && (
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7", isCopiedDay && "text-primary")}
                onClick={() => onCopyDay(selectedDayIndex)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
            {hasCopied && !isCopiedDay && onPasteDay && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary"
                onClick={() => onPasteDay(selectedDayIndex)}
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-0 space-y-2">
        {pickerOpen ? (
          /* -- Inline Muscle Picker -- */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Add Muscle</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => { setPickerOpen(false); setSearch(""); }}
              >
                Done
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search muscles..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>

            {filteredItems ? (
              <div className="flex flex-wrap gap-1.5">
                {filteredItems.parents.map(muscle => (
                  <MuscleChip
                    key={muscle.id}
                    muscleId={muscle.id}
                    label={muscle.label}
                    colorClass={muscle.colorClass}
                    onTap={handleAddMuscle}
                  />
                ))}
                {filteredItems.subs.map(sub => {
                  const parent = MUSCLE_MAP.get(sub.parentId);
                  if (!parent) return null;
                  return (
                    <MuscleChip
                      key={sub.id}
                      muscleId={sub.id}
                      label={sub.label}
                      colorClass={parent.colorClass}
                      onTap={handleAddMuscle}
                      isSubdivision
                    />
                  );
                })}
                {filteredItems.parents.length === 0 && filteredItems.subs.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">
                    {search ? `No muscles match "${search}"` : "No muscles found"}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {BODY_REGIONS.map(region => {
                  const muscles = musclesByRegion.get(region) || [];
                  return (
                    <div key={region}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                        {BODY_REGION_LABELS[region]}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {muscles.map(muscle => (
                          <MuscleChip
                            key={muscle.id}
                            muscleId={muscle.id}
                            label={muscle.label}
                            colorClass={muscle.colorClass}
                            onTap={handleAddMuscle}
                          />
                        ))}
                      </div>
                      {muscles.map(muscle => {
                        const subs = SUBDIVISIONS_BY_PARENT.get(muscle.id);
                        if (!subs || subs.length === 0) return null;
                        return (
                          <div key={`${muscle.id}-subs`} className="flex flex-wrap gap-1 mt-1 ml-2">
                            {subs.map(sub => (
                              <MuscleChip
                                key={sub.id}
                                muscleId={sub.id}
                                label={sub.label}
                                colorClass={muscle.colorClass}
                                onTap={handleAddMuscle}
                                isSubdivision
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* -- Slot List -- */
          <>
            {daySlots.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/50">
                Rest day &mdash; tap + to add muscles
              </div>
            ) : (
              <div className="space-y-1.5">
                {daySlots.map((slot, index) => {
                  const muscle = getMuscleDisplay(slot.muscleId);
                  if (!muscle) return null;
                  return (
                    <MobileSlotRow
                      key={slot.id}
                      slot={slot}
                      muscle={muscle}
                      label={formatSlotLabel(slot.muscleId)}
                      isHighlighted={highlightedMuscleId != null && resolveParentMuscleId(slot.muscleId) === highlightedMuscleId}
                      onSetSlotDetails={onSetSlotDetails}
                      onRemove={onRemove}
                      onClearExercise={onClearExercise}
                      onRemoveReplacement={onRemoveReplacement}
                      onOpenExercisePicker={onOpenExercisePicker}
                      onTogglePerSet={onTogglePerSet}
                      onUpdateSetDetail={onUpdateSetDetail}
                      onSetExerciseInstructions={onSetExerciseInstructions}
                      onSetSlotClientInputs={onSetSlotClientInputs}
                      globalClientInputs={globalClientInputs}
                      canMoveUp={index > 0}
                      canMoveDown={index < daySlots.length - 1}
                      onMoveUp={onReorderSlot ? () => onReorderSlot(selectedDayIndex, index, index - 1) : undefined}
                      onMoveDown={onReorderSlot ? () => onReorderSlot(selectedDayIndex, index, index + 1) : undefined}
                      weekCount={weekCount}
                      onApplyToRemaining={onApplyToRemaining}
                    />
                  );
                })}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Muscle
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
});

/* -- Tappable muscle chip for the picker -- */

interface MuscleChipProps {
  muscleId: string;
  label: string;
  colorClass: string;
  onTap: (muscleId: string) => void;
  isSubdivision?: boolean;
}

const MuscleChip = memo(function MuscleChip({ muscleId, label, colorClass, onTap, isSubdivision }: MuscleChipProps) {
  return (
    <button
      onClick={() => onTap(muscleId)}
      className={`inline-flex items-center gap-1.5 rounded-md bg-card/50 hover:bg-card border active:scale-95 transition-all ${
        isSubdivision
          ? 'px-2 py-1 text-xs border-dashed border-border/40'
          : 'px-2.5 py-1.5 text-sm border-border/50'
      }`}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${colorClass}`} style={isSubdivision ? { opacity: 0.7 } : undefined} />
      <span className={isSubdivision ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
    </button>
  );
});

/* -- Mobile slot row (minimal card + tap to edit popover) -- */

interface MobileSlotRowProps {
  slot: MuscleSlotData;
  muscle: { label: string; colorClass: string; colorHex: string };
  label: string;
  isHighlighted: boolean;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
  onClearExercise?: (slotId: string) => void;
  onRemoveReplacement?: (slotId: string, replacementIndex: number) => void;
  onOpenExercisePicker?: (slotId: string, muscleId: string, mode: 'primary' | 'replacement') => void;
  onTogglePerSet?: (slotId: string) => void;
  onUpdateSetDetail?: (slotId: string, setIndex: number, field: keyof import("@/types/workout-builder").SetPrescription, value: number | string | undefined) => void;
  onSetExerciseInstructions?: (slotId: string, instructions: string) => void;
  onSetSlotClientInputs?: (slotId: string, columns: string[] | undefined) => void;
  globalClientInputs?: string[];
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  weekCount?: number;
  onApplyToRemaining?: (slotId: string, fields: Record<string, unknown>) => void;
}

const MobileSlotRow = memo(function MobileSlotRow({
  slot,
  muscle,
  label,
  isHighlighted,
  onSetSlotDetails,
  onRemove,
  onClearExercise,
  onRemoveReplacement,
  onOpenExercisePicker,
  onTogglePerSet,
  onUpdateSetDetail,
  onSetExerciseInstructions,
  onSetSlotClientInputs,
  globalClientInputs,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  weekCount,
  onApplyToRemaining,
}: MobileSlotRowProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const hasTempo = !!slot.tempo && slot.tempo.length === 4;
  const needsIntensity = hasTempo && slot.rir == null && slot.rpe == null;

  const update = useCallback(
    (details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => {
      onSetSlotDetails(slot.id, details);
    },
    [slot.id, onSetSlotDetails],
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-2 rounded-md border text-sm",
        isHighlighted
          ? "ring-2 ring-primary animate-pulse bg-primary/10"
          : "bg-card/50 border-border/50",
      )}
      style={{ backgroundColor: isHighlighted ? undefined : `${muscle.colorHex}08` }}
    >
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${muscle.colorClass}`} />

      <Drawer open={popoverOpen} onOpenChange={setPopoverOpen}>
        <DrawerTrigger asChild>
          <button className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
            <span className="font-medium truncate text-foreground">
              {slot.exercise ? slot.exercise.name : label}
            </span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
              style={{ backgroundColor: `${muscle.colorHex}20`, color: muscle.colorHex }}
            >
              {slot.sets}s
            </span>
            {hasTempo && (
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">{slot.tempo}</span>
            )}
            {slot.exercise && (
              <Dumbbell className="h-3 w-3 text-emerald-500 shrink-0" />
            )}
            {slot.replacements && slot.replacements.length > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                +{slot.replacements.length}
              </span>
            )}
            {needsIntensity && (
              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
            )}
          </button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerTitle className="sr-only">{label}</DrawerTitle>
          <ScrollArea className="overflow-y-auto px-4 pb-6 pt-2" style={{ maxHeight: 'calc(85vh - 2rem)' }}>
          <div className="space-y-4">
            {/* Header with muscle label */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: muscle.colorHex }} />
                <p className="text-base font-semibold">{label}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setPopoverOpen(false)}>
                Done
              </Button>
            </div>

            {/* Sets & Rep Range side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Sets</Label>
                <Input
                  type="number" min={1} max={20} value={slot.sets}
                  onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) update({ sets: v }); }}
                  className="h-10 text-base" inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rep Range</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number" min={1} max={100} value={slot.repMin ?? 8}
                    onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) update({ repMin: v }); }}
                    className="h-10 text-base flex-1" inputMode="numeric"
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input
                    type="number" min={1} max={100} value={slot.repMax ?? 12}
                    onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) update({ repMax: v }); }}
                    className="h-10 text-base flex-1" inputMode="numeric"
                  />
                </div>
              </div>
            </div>

            {/* Tempo, RIR, RPE in a row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tempo</Label>
                <Input
                  type="text" maxLength={4} pattern="[0-9]{4}" inputMode="numeric" placeholder="3120"
                  value={slot.tempo ?? ''}
                  onChange={e => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4); update({ tempo: v || undefined }); }}
                  className="h-10 text-base font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">RIR</Label>
                <Input
                  type="number" min={0} max={10} placeholder="2"
                  value={slot.rir ?? ''}
                  onChange={e => {
                    const v = e.target.value === '' ? undefined : parseInt(e.target.value);
                    update({ rir: v != null && !isNaN(v) ? Math.max(0, Math.min(10, v)) : undefined });
                  }}
                  className="h-10 text-base" inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">RPE</Label>
                <Input
                  type="number" min={1} max={10} step={0.5} placeholder="8"
                  value={slot.rpe ?? ''}
                  onChange={e => {
                    const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
                    update({ rpe: v != null && !isNaN(v) ? Math.max(1, Math.min(10, v)) : undefined });
                  }}
                  className="h-10 text-base" inputMode="numeric"
                />
              </div>
            </div>

            {needsIntensity && (
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-600 dark:text-amber-400">Add RIR or RPE for TUST tracking</p>
              </div>
            )}

            {/* Exercise Section */}
            {onOpenExercisePicker && (
              <div className="space-y-3 pt-3 border-t border-border/30">
                <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Dumbbell className="h-3.5 w-3.5" />
                  Exercise
                </Label>

                {slot.exercise ? (
                  <div className="flex items-center gap-2.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                    <Dumbbell className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-sm font-medium truncate flex-1">{slot.exercise.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => { setPopoverOpen(false); onOpenExercisePicker(slot.id, slot.muscleId, 'primary'); }} title="Change">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      {onClearExercise && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => onClearExercise(slot.id)} title="Remove">
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="w-full h-10 text-sm border-dashed"
                    onClick={() => { setPopoverOpen(false); onOpenExercisePicker(slot.id, slot.muscleId, 'primary'); }}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Choose Exercise
                  </Button>
                )}

                {slot.exercise && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      Replacements (optional)
                    </Label>
                    {slot.replacements && slot.replacements.length > 0 && (
                      <div className="space-y-1.5">
                        {slot.replacements.map((rep, i) => (
                          <div key={`${rep.exerciseId}-${i}`} className="flex items-center gap-2 rounded border border-border/50 bg-muted/20 px-3 py-2">
                            <span className="text-sm truncate flex-1">{rep.name}</span>
                            {onRemoveReplacement && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => onRemoveReplacement(slot.id, i)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <Button variant="ghost" size="sm" className="w-full text-xs h-9"
                      onClick={() => { setPopoverOpen(false); onOpenExercisePicker(slot.id, slot.muscleId, 'replacement'); }}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Replacement
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t border-border/30">
              <p>Working set: RIR &le; 5 or RPE &ge; 5</p>
              <p>Only working sets count for TUST</p>
            </div>

            {onApplyToRemaining && weekCount && weekCount > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs border-primary/30 text-primary hover:bg-primary/5 mt-2"
                onClick={() => {
                  onApplyToRemaining(slot.id, {
                    sets: slot.sets, repMin: slot.repMin, repMax: slot.repMax,
                    tempo: slot.tempo, rir: slot.rir, rpe: slot.rpe,
                    exercise: slot.exercise ? { ...slot.exercise } : undefined,
                    setsDetail: slot.setsDetail ? [...slot.setsDetail] : undefined,
                  });
                  setPopoverOpen(false);
                }}
              >
                Apply slot to remaining weeks
              </Button>
            )}
          </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {onMoveUp && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 disabled:opacity-30"
          disabled={!canMoveUp}
          onClick={onMoveUp}
          aria-label="Move up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
      )}
      {onMoveDown && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 disabled:opacity-30"
          disabled={!canMoveDown}
          onClick={onMoveDown}
          aria-label="Move down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-100"
        onClick={() => onRemove(slot.id)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});
