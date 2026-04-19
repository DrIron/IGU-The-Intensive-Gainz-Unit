import { memo, useMemo, useState, useCallback } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Plus, ChevronRight, ArrowUp, ArrowDown, Trash2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { MuscleSlotCard } from "./MuscleSlotCard";
import { ActivitySlotCard } from "./ActivitySlotCard";
import {
  MUSCLE_GROUPS,
  BODY_REGIONS,
  BODY_REGION_LABELS,
  SUBDIVISIONS_BY_PARENT,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_COLORS,
  ACTIVITIES_BY_CATEGORY,
  DAYS_OF_WEEK,
  defaultSessionName,
  resolveParentMuscleId,
  type ActivityType,
  type MuscleSlotData,
  type SessionData,
  type SlotExercise,
} from "@/types/muscle-builder";

const ALL_ACTIVITY_TYPES: ActivityType[] = ['strength', 'cardio', 'hiit', 'yoga_mobility', 'recovery', 'sport_specific'];

interface SessionBlockProps {
  session: SessionData;
  slots: MuscleSlotData[];
  draggableStartIndex: number;       // starting index for hello-pangea Draggable within the day
  sessionPosition: number;           // position among day's sessions (0-indexed)
  daySessionsCount: number;
  highlightedMuscleId?: string | null;
  globalClientInputs?: string[];
  weekCount?: number;
  // Slot callbacks
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
  onSetExercise?: (slotId: string, exercise: SlotExercise) => void;
  onClearExercise?: (slotId: string) => void;
  onAddReplacement?: (slotId: string, exercise: SlotExercise) => void;
  onRemoveReplacement?: (slotId: string, replacementIndex: number) => void;
  onOpenExercisePicker?: (slotId: string, muscleId: string, mode: 'primary' | 'replacement') => void;
  onTogglePerSet?: (slotId: string) => void;
  onUpdateSetDetail?: (slotId: string, setIndex: number, field: keyof import("@/types/workout-builder").SetPrescription, value: number | string | undefined) => void;
  onSetExerciseInstructions?: (slotId: string, instructions: string) => void;
  onSetSlotClientInputs?: (slotId: string, columns: string[] | undefined) => void;
  onSetSlotColumns?: (slotId: string, columns: string[]) => void;
  onSetActivityDetails?: (slotId: string, details: Record<string, unknown>) => void;
  onSetAllSets?: (muscleId: string, sets: number) => void;
  onApplyToRemaining?: (slotId: string, fields: Record<string, unknown>) => void;
  // Session callbacks
  onAddMuscleToSession: (sessionId: string, muscleId: string) => void;
  onAddActivityToSession: (sessionId: string, activityId: string, activityType: ActivityType) => void;
  onRenameSession: (sessionId: string, name: string) => void;
  onSetSessionType: (sessionId: string, type: ActivityType) => void;
  onRemoveSession: (sessionId: string) => void;
  onDuplicateSessionToDay: (sessionId: string, toDayIndex: number) => void;
  onReorderSession: (dayIndex: number, fromIndex: number, toIndex: number) => void;
}

/**
 * SessionBlock — one coach-defined session within a day.
 *
 * Renders as a nested subcard inside DayColumn: colored dot + inline-editable
 * name + kebab menu (rename, change type, duplicate to day, reorder, remove),
 * then a droppable slot list, then a "+ Add" affordance.
 *
 * Each session has its own Droppable (`session-{id}`) so hello-pangea/dnd can
 * distinguish reorder-within-session from move-across-sessions; the reducer
 * wires those to REORDER_IN_SESSION and MOVE_SLOT_TO_SESSION respectively.
 */
export const SessionBlock = memo(function SessionBlock({
  session,
  slots,
  draggableStartIndex,
  sessionPosition,
  daySessionsCount,
  highlightedMuscleId,
  globalClientInputs,
  weekCount,
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
  onSetActivityDetails,
  onSetAllSets,
  onApplyToRemaining,
  onAddMuscleToSession,
  onAddActivityToSession,
  onRenameSession,
  onSetSessionType,
  onRemoveSession,
  onDuplicateSessionToDay,
  onReorderSession,
}: SessionBlockProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(session.name ?? '');
  const [addOpen, setAddOpen] = useState(false);
  const [expandedParent, setExpandedParent] = useState<string | null>(null);

  const typeColors = ACTIVITY_TYPE_COLORS[session.type];
  const isStrength = session.type === 'strength';
  const displayName = session.name?.trim() || defaultSessionName(session.type);

  const sessionSlots = useMemo(
    () => slots.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [slots],
  );

  const commitName = useCallback(() => {
    const trimmed = nameDraft.trim();
    onRenameSession(session.id, trimmed);
    setIsEditingName(false);
  }, [nameDraft, onRenameSession, session.id]);

  const handleAddMuscle = useCallback(
    (muscleId: string) => {
      onAddMuscleToSession(session.id, muscleId);
      setAddOpen(false);
      setExpandedParent(null);
    },
    [onAddMuscleToSession, session.id],
  );

  const handleAddActivity = useCallback(
    (activityId: string) => {
      onAddActivityToSession(session.id, activityId, session.type);
      setAddOpen(false);
    },
    [onAddActivityToSession, session.id, session.type],
  );

  return (
    <div
      className={cn(
        // Subcard styling — subtle background + border so sessions read as
        // a group without competing with the outer day Card.
        "rounded-md border border-border/40 bg-muted/20 p-1.5 space-y-1",
      )}
    >
      {/* Header: dot + name + kebab */}
      <div className="flex items-center gap-1.5 min-w-0">
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", typeColors.colorClass)} />
        {isEditingName ? (
          <Input
            autoFocus
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') { setNameDraft(session.name ?? ''); setIsEditingName(false); }
            }}
            onClick={e => e.stopPropagation()}
            className="h-5 text-[11px] px-1 py-0 flex-1 min-w-0"
            placeholder={defaultSessionName(session.type)}
          />
        ) : (
          <button
            type="button"
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate flex-1 min-w-0 text-left hover:text-foreground transition-colors"
            onClick={e => { e.stopPropagation(); setNameDraft(session.name ?? ''); setIsEditingName(true); }}
            title="Rename session"
          >
            {displayName}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 opacity-60 hover:opacity-100"
              onClick={e => e.stopPropagation()}
              aria-label="Session actions"
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={e => { e.stopPropagation(); setNameDraft(session.name ?? ''); setIsEditingName(true); }}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Change type</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {ALL_ACTIVITY_TYPES.map(t => (
                  <DropdownMenuItem
                    key={t}
                    disabled={t === session.type}
                    onClick={e => { e.stopPropagation(); onSetSessionType(session.id, t); }}
                  >
                    <div className={cn("w-1.5 h-1.5 rounded-full mr-2", ACTIVITY_TYPE_COLORS[t].colorClass)} />
                    {ACTIVITY_TYPE_LABELS[t]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Copy className="h-3 w-3 mr-2" /> Duplicate to day
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {DAYS_OF_WEEK.map((day, i) => (
                  <DropdownMenuItem
                    key={day}
                    onClick={e => { e.stopPropagation(); onDuplicateSessionToDay(session.id, i + 1); }}
                  >
                    {day}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={sessionPosition === 0}
              onClick={e => { e.stopPropagation(); onReorderSession(session.dayIndex, sessionPosition, sessionPosition - 1); }}
            >
              <ArrowUp className="h-3 w-3 mr-2" /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={sessionPosition === daySessionsCount - 1}
              onClick={e => { e.stopPropagation(); onReorderSession(session.dayIndex, sessionPosition, sessionPosition + 1); }}
            >
              <ArrowDown className="h-3 w-3 mr-2" /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={e => { e.stopPropagation(); onRemoveSession(session.id); }}
            >
              <Trash2 className="h-3 w-3 mr-2" /> Delete session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Slot list — own Droppable so drag-reorder within + moves across
          sessions are distinguishable to hello-pangea/dnd. */}
      <Droppable droppableId={`session-${session.id}`} type="MUSCLE_SLOT">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "space-y-1 rounded transition-colors min-h-[28px] p-0.5",
              snapshot.isDraggingOver && "bg-primary/5 outline outline-1 outline-dashed outline-primary/40",
            )}
          >
            {sessionSlots.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-[10px] text-muted-foreground/50 italic text-center py-1">
                Empty session
              </div>
            )}
            {sessionSlots.map((slot, i) => {
              const globalIdx = draggableStartIndex + i;
              if (isStrength) {
                return (
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
                    draggableIndex={globalIdx}
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
              }
              return (
                <ActivitySlotCard
                  key={slot.id}
                  slot={slot}
                  draggableIndex={globalIdx}
                  onRemove={onRemove}
                  onSetActivityDetails={onSetActivityDetails}
                />
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {/* Add affordance — muscles for strength sessions, activities of the
          session's type for non-strength. Keeps the add flow scoped to the
          session type so coaches don't accidentally mix types. */}
      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-6 text-[10px] text-muted-foreground hover:text-foreground justify-start px-1.5"
            onClick={e => e.stopPropagation()}
          >
            <Plus className="h-3 w-3 mr-1" />
            {isStrength ? 'Add muscle' : 'Add activity'}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-52 p-2 max-h-80 overflow-y-auto"
          onClick={e => e.stopPropagation()}
          align="start"
        >
          {isStrength ? (
            BODY_REGIONS.map(region => {
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
                              onClick={() => handleAddMuscle(muscle.id)}
                            >
                              <div className={cn("w-2 h-2 rounded-full shrink-0", muscle.colorClass)} />
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
                                  onClick={() => handleAddMuscle(sub.id)}
                                >
                                  <div className={cn("w-1.5 h-1.5 rounded-full shrink-0 opacity-70", muscle.colorClass)} />
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
            })
          ) : (
            // Non-strength session: list activities scoped to the session's type
            <div className="flex flex-col gap-0.5">
              {(ACTIVITIES_BY_CATEGORY.get(session.type) || []).map(activity => (
                <button
                  key={activity.id}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded text-xs hover:bg-muted/50 transition-colors text-left"
                  onClick={() => handleAddActivity(activity.id)}
                >
                  <div className={cn("w-2 h-2 rounded-full shrink-0", activity.colorClass)} />
                  <span>{activity.label}</span>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
});
