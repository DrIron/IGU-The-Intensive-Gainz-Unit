import { memo, useMemo, useState, useCallback } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Copy, ClipboardPaste, Plus, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MuscleSlotCard } from "./MuscleSlotCard";
import { ActivitySlotCard } from "./ActivitySlotCard";
import {
  DAYS_OF_WEEK,
  MUSCLE_GROUPS,
  BODY_REGIONS,
  BODY_REGION_LABELS,
  SUBDIVISIONS_BY_PARENT,
  resolveParentMuscleId,
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
          </div>
        </div>
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
                <div className="flex items-center justify-center h-[80px] text-[11px] text-muted-foreground/50">
                  Rest day
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
