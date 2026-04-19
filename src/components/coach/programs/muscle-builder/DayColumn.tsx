import { memo, useMemo, useState, useCallback } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Copy, ClipboardPaste, Plus, ChevronRight, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  estimateSessionDuration,
  formatDurationRange,
  type SetDurationInputs,
} from "@/lib/sessionDuration";
import { MuscleSlotCard } from "./MuscleSlotCard";
import { ActivitySlotCard } from "./ActivitySlotCard";
import {
  DAYS_OF_WEEK,
  MUSCLE_GROUPS,
  BODY_REGIONS,
  BODY_REGION_LABELS,
  SUBDIVISIONS_BY_PARENT,
  resolveParentMuscleId,
  getMuscleDisplay,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_COLORS,
  type ActivityType,
  type MuscleSlotData,
  type SlotExercise,
} from "@/types/muscle-builder";

interface DayColumnProps {
  dayIndex: number;
  slots: MuscleSlotData[];
  isSelected: boolean;
  onSelectDay: (dayIndex: number) => void;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
  onAddMuscle?: (dayIndex: number, muscleId: string) => void;
  onSetExercise?: (slotId: string, exercise: SlotExercise) => void;
  onClearExercise?: (slotId: string) => void;
  onAddReplacement?: (slotId: string, exercise: SlotExercise) => void;
  onRemoveReplacement?: (slotId: string, replacementIndex: number) => void;
  onOpenExercisePicker?: (slotId: string, muscleId: string, mode: 'primary' | 'replacement') => void;
  onTogglePerSet?: (slotId: string) => void;
  onUpdateSetDetail?: (slotId: string, setIndex: number, field: keyof import("@/types/workout-builder").SetPrescription, value: number | string | undefined) => void;
  onDeleteSetAtIndex?: (slotId: string, setIndex: number) => void;
  onApplySetToRemaining?: (slotId: string, fromIndex: number) => void;
  onSetExerciseInstructions?: (slotId: string, instructions: string) => void;
  onSetSlotClientInputs?: (slotId: string, columns: string[] | undefined) => void;
  onSetSlotColumns?: (slotId: string, columns: string[]) => void;
  onSetActivityDetails?: (slotId: string, details: Record<string, unknown>) => void;
  globalClientInputs?: string[];
  className?: string;
  copiedDayIndex?: number | null;
  onCopyDay?: (dayIndex: number) => void;
  onPasteDay?: (dayIndex: number) => void;
  highlightedMuscleId?: string | null;
  onSetAllSets?: (muscleId: string, sets: number) => void;
  weekCount?: number;
  onApplyToRemaining?: (slotId: string, fields: Record<string, unknown>) => void;
}

export const DayColumn = memo(function DayColumn({
  dayIndex,
  slots,
  isSelected,
  onSelectDay,
  onSetSlotDetails,
  onRemove,
  onAddMuscle,
  onSetExercise,
  onClearExercise,
  onAddReplacement,
  onRemoveReplacement,
  onOpenExercisePicker,
  onTogglePerSet,
  onUpdateSetDetail,
  onDeleteSetAtIndex: _onDeleteSetAtIndex,
  onApplySetToRemaining: _onApplySetToRemaining,
  onSetExerciseInstructions,
  onSetSlotClientInputs,
  onSetSlotColumns,
  onSetActivityDetails,
  globalClientInputs,
  className,
  copiedDayIndex,
  onCopyDay,
  onPasteDay,
  highlightedMuscleId,
  onSetAllSets,
  weekCount,
  onApplyToRemaining,
}: DayColumnProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [expandedParent, setExpandedParent] = useState<string | null>(null);

  const daySlots = useMemo(
    () => slots.filter(s => s.dayIndex === dayIndex).sort((a, b) => a.sortOrder - b.sortOrder),
    [slots, dayIndex]
  );

  const totalSets = useMemo(
    () => daySlots.filter(s => !s.activityType || s.activityType === 'strength').reduce((sum, s) => sum + s.sets, 0),
    [daySlots]
  );

  // Session duration estimate (range). Each strength slot counts as one
  // "exercise" of N sets. We synthesize SetDurationInputs from the slot's
  // per-set detail when available, else from the slot-level tempo/reps with
  // default rest fallback. Skips non-strength activities (cardio/HIIT/etc.).
  const sessionDuration = useMemo(() => {
    const strengthSlots = daySlots.filter(s => !s.activityType || s.activityType === 'strength');
    if (strengthSlots.length === 0) return null;
    const exercises: SetDurationInputs[][] = strengthSlots.map(slot => {
      if (slot.setsDetail && slot.setsDetail.length > 0) {
        return slot.setsDetail.map(s => ({
          reps: s.reps,
          rep_range_min: s.rep_range_min,
          rep_range_max: s.rep_range_max,
          tempo: s.tempo,
          rest_seconds: s.rest_seconds,
          rest_seconds_max: s.rest_seconds_max,
        }));
      }
      // Slot-level: fan out N identical sets using slot's rep range + tempo.
      return Array.from({ length: Math.max(1, slot.sets) }, () => ({
        rep_range_min: slot.repMin,
        rep_range_max: slot.repMax,
        tempo: slot.tempo,
      }));
    });
    const est = estimateSessionDuration(exercises);
    if (est.minSeconds === 0 && est.maxSeconds === 0) return null;
    return est;
  }, [daySlots]);

  // Per-day muscle distribution — drives the 2px ribbon below the header so
  // the coach can read the body-region balance of the day without scrolling
  // to the volume chart.
  const muscleDistribution = useMemo(() => {
    if (daySlots.length === 0) return [] as Array<{ id: string; colorHex: string; pct: number }>;
    const totals = new Map<string, { sets: number; colorHex: string }>();
    for (const slot of daySlots) {
      if (slot.activityType && slot.activityType !== 'strength') continue;
      const parentId = resolveParentMuscleId(slot.muscleId);
      const display = getMuscleDisplay(parentId);
      if (!display) continue;
      const entry = totals.get(parentId);
      if (entry) entry.sets += slot.sets;
      else totals.set(parentId, { sets: slot.sets, colorHex: display.colorHex });
    }
    const sum = [...totals.values()].reduce((s, e) => s + e.sets, 0);
    if (sum === 0) return [];
    return [...totals.entries()]
      .sort(([, a], [, b]) => b.sets - a.sets)
      .map(([id, { sets, colorHex }]) => ({ id, colorHex, pct: (sets / sum) * 100 }));
  }, [daySlots]);

  // Group slots by activity type for collapsible sections
  const sessionGroups = useMemo(() => {
    const groups = new Map<string, MuscleSlotData[]>();
    for (const slot of daySlots) {
      const type = slot.activityType || 'strength';
      const list = groups.get(type) || [];
      list.push(slot);
      groups.set(type, list);
    }
    return groups;
  }, [daySlots]);

  const hasMultipleTypes = sessionGroups.size > 1;

  const handleAddMuscle = useCallback(
    (muscleId: string) => {
      onAddMuscle?.(dayIndex, muscleId);
    },
    [onAddMuscle, dayIndex],
  );

  const hasCopied = copiedDayIndex != null;
  const isCopiedDay = copiedDayIndex === dayIndex;

  return (
    <Card
      data-day-index={dayIndex}
      className={cn(
        // transition-colors only — the previous `transition-all` animated layout shifts
        // during drag-over, which made @hello-pangea/dnd hover feedback feel laggy.
        // min-w-0: the parent is a CSS grid with 7 equal tracks. A min-w-[160px]
        // here made each Card render wider than its grid cell and literally
        // overlap the next day's column at 1440×900. The grid track is
        // authoritative; let Card stretch to fit.
        `group min-w-0 flex-1 transition-colors cursor-pointer`,
        isSelected ? 'ring-2 ring-primary border-primary/50' : 'border-border/50 hover:border-border',
        className,
      )}
      onClick={() => onSelectDay(dayIndex)}
    >
      <CardHeader className="p-2 pb-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">
            {DAYS_OF_WEEK[dayIndex - 1]}
          </span>
          <div className="flex items-center gap-1">
            {/* Add muscle button (desktop click-to-add) */}
            {onAddMuscle && (
              <Popover open={addOpen} onOpenChange={setAddOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={e => e.stopPropagation()}
                    title="Add muscle"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-52 p-2 max-h-80 overflow-y-auto"
                  onClick={e => e.stopPropagation()}
                  align="start"
                >
                  {BODY_REGIONS.map(region => {
                    const muscles = MUSCLE_GROUPS.filter(m => m.bodyRegion === region);
                    return (
                      <div key={region} className="mb-2 last:mb-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">
                          {BODY_REGION_LABELS[region]}
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {muscles.map(muscle => {
                            const subs = SUBDIVISIONS_BY_PARENT.get(muscle.id);
                            const isExpanded = expandedParent === muscle.id;
                            return (
                              <div key={muscle.id}>
                                <div className="flex items-center gap-0.5">
                                  <button
                                    className="flex-1 flex items-center gap-1.5 px-1.5 py-1 rounded text-xs hover:bg-muted/50 transition-colors text-left"
                                    onClick={() => {
                                      handleAddMuscle(muscle.id);
                                      setAddOpen(false);
                                      setExpandedParent(null);
                                    }}
                                  >
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${muscle.colorClass}`} />
                                    <span>{muscle.label}</span>
                                  </button>
                                  {subs && subs.length > 0 && (
                                    <button
                                      className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                                      onClick={() => setExpandedParent(isExpanded ? null : muscle.id)}
                                    >
                                      <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                                    </button>
                                  )}
                                </div>
                                {isExpanded && subs && (
                                  <div className="ml-4 flex flex-col gap-0.5 mt-0.5">
                                    {subs.map(sub => (
                                      <button
                                        key={sub.id}
                                        className="flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] hover:bg-muted/50 transition-colors text-left text-muted-foreground"
                                        onClick={() => {
                                          handleAddMuscle(sub.id);
                                          setAddOpen(false);
                                          setExpandedParent(null);
                                        }}
                                      >
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${muscle.colorClass} opacity-70`} />
                                        <span>{sub.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </PopoverContent>
              </Popover>
            )}
            {/* Copy button */}
            {daySlots.length > 0 && onCopyDay && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-5 w-5 transition-opacity",
                  isCopiedDay ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-100"
                )}
                onClick={e => { e.stopPropagation(); onCopyDay(dayIndex); }}
                title="Copy day"
              >
                <Copy className="h-3 w-3" />
              </Button>
            )}
            {/* Paste button */}
            {hasCopied && !isCopiedDay && onPasteDay && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-primary opacity-100"
                onClick={e => { e.stopPropagation(); onPasteDay(dayIndex); }}
                title="Paste day"
              >
                <ClipboardPaste className="h-3 w-3" />
              </Button>
            )}
            {totalSets > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground">{totalSets} sets</span>
            )}
            {sessionDuration && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground"
                title={sessionDuration.inferred
                  ? "Estimate assumes 2-4s/rep tempo and 60-120s rest when not set"
                  : "Estimated session duration"}
              >
                <Clock className="h-2.5 w-2.5" aria-hidden />
                {formatDurationRange(sessionDuration.minSeconds, sessionDuration.maxSeconds)}
              </span>
            )}
          </div>
        </div>
        {/* Per-day muscle-distribution ribbon — 2px strip of color-coded
            segments so the coach can read body-region balance at a glance
            without scrolling to the volume chart. */}
        {muscleDistribution.length > 0 && (
          <div
            className="mt-1.5 h-[2px] w-full flex overflow-hidden rounded-full bg-muted/30"
            aria-hidden
          >
            {muscleDistribution.map(({ id, colorHex, pct }) => (
              <div
                key={id}
                style={{ width: `${pct}%`, backgroundColor: colorHex }}
              />
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <Droppable droppableId={`day-${dayIndex}`} type="MUSCLE_SLOT">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`min-h-[80px] space-y-1 rounded-md transition-colors p-1 ${
                snapshot.isDraggingOver
                  ? 'bg-primary/5 border border-dashed border-primary/50'
                  : 'border border-transparent'
              }`}
            >
              {daySlots.length === 0 && !snapshot.isDraggingOver && (
                // Distinct rest day — diagonal hatch + muted badge. Rest days
                // used to look identical to empty-but-planned days, which
                // made it hard to tell at a glance whether the coach had
                // simply not filled the column yet.
                <div
                  className="flex flex-col items-center justify-center gap-1.5 h-[80px] rounded-md border border-dashed border-border/40 text-[11px] text-muted-foreground/70"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, hsl(var(--muted) / 0.25) 0 6px, transparent 6px 12px)',
                  }}
                >
                  <span className="px-2 py-0.5 rounded-full bg-background/70 border border-border/40 text-[10px] uppercase tracking-wider font-medium">
                    Rest
                  </span>
                </div>
              )}
              {(() => {
                // Render slots with optional session type headers when multiple types present
                let globalIdx = 0;
                const rendered: React.ReactNode[] = [];
                const typeOrder: string[] = ['strength', 'cardio', 'hiit', 'yoga_mobility', 'recovery', 'sport_specific'];

                for (const type of typeOrder) {
                  const slotsForType = sessionGroups.get(type);
                  if (!slotsForType || slotsForType.length === 0) continue;

                  const isStrength = type === 'strength';
                  const typeColors = ACTIVITY_TYPE_COLORS[type as ActivityType];
                  const typeLabel = ACTIVITY_TYPE_LABELS[type as ActivityType];

                  // Session group header (only when multiple types)
                  if (hasMultipleTypes) {
                    rendered.push(
                      <div key={`header-${type}`} className="flex items-center gap-1.5 pt-1 pb-0.5 first:pt-0">
                        <div className={`w-1.5 h-1.5 rounded-full ${typeColors.colorClass}`} />
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{typeLabel}</span>
                      </div>
                    );
                  }

                  // Render slots for this type
                  for (const slot of slotsForType) {
                    const idx = globalIdx++;
                    if (isStrength) {
                      rendered.push(
                        <MuscleSlotCard
                          key={slot.id}
                          slotId={slot.id}
                          muscleId={slot.muscleId}
                          sets={slot.sets}
                          repMin={slot.repMin ?? 8}
                          repMax={slot.repMax ?? 12}
                          tempo={slot.tempo}
                          rir={slot.rir}
                          rpe={slot.rpe}
                          exercise={slot.exercise}
                          replacements={slot.replacements}
                          setsDetail={slot.setsDetail}
                          prescriptionColumns={slot.prescriptionColumns}
                          clientInputColumns={slot.clientInputColumns}
                          globalClientInputs={globalClientInputs}
                          draggableIndex={idx}
                          onSetSlotDetails={onSetSlotDetails}
                          onRemove={onRemove}
                          onSetExercise={onSetExercise}
                          onClearExercise={onClearExercise}
                          onAddReplacement={onAddReplacement}
                          onRemoveReplacement={onRemoveReplacement}
                          onOpenExercisePicker={onOpenExercisePicker}
                          onTogglePerSet={onTogglePerSet}
                          onUpdateSetDetail={onUpdateSetDetail}
                          onSetExerciseInstructions={onSetExerciseInstructions}
                          onSetSlotClientInputs={onSetSlotClientInputs}
                          onSetSlotColumns={onSetSlotColumns}
                          isHighlighted={highlightedMuscleId != null && resolveParentMuscleId(slot.muscleId) === highlightedMuscleId}
                          onSetAllSets={onSetAllSets}
                          weekCount={weekCount}
                          onApplyToRemaining={onApplyToRemaining}
                        />
                      );
                    } else {
                      rendered.push(
                        <ActivitySlotCard
                          key={slot.id}
                          slot={slot}
                          draggableIndex={idx}
                          onRemove={onRemove}
                          onSetActivityDetails={onSetActivityDetails}
                        />
                      );
                    }
                  }
                }
                return rendered;
              })()}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </CardContent>
    </Card>
  );
});
