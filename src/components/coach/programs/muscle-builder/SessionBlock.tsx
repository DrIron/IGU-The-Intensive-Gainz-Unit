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
import { MoreVertical, Plus, ArrowUp, ArrowDown, Trash2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { MuscleSlotCard } from "./MuscleSlotCard";
import { ActivitySlotCard } from "./ActivitySlotCard";
import { SessionAddPicker } from "./SessionAddPicker";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_COLORS,
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
  placementCounts?: Map<string, number>;
  recentMuscleIds?: string[];
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
  placementCounts,
  recentMuscleIds,
}: SessionBlockProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(session.name ?? '');
  const [addOpen, setAddOpen] = useState(false);

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
      // Flat colored-accent layout: 2px left bar (session-type color) carries
      // the type signal so we drop the per-session border + tinted bg. This
      // saves ~8px of horizontal width and one layer of visual nesting in
      // the already-cramped 140px day columns at lg:grid-cols-7.
      // `group/session` lets the inline `+` reveal on hover only; the kebab
      // stays faintly visible at all times (opacity-50) so coaches can still
      // discover session actions, while the name keeps every available pixel
      // when not hovering.
      className="group/session border-l-2 pl-2 space-y-1"
      style={{ borderLeftColor: typeColors.colorHex }}
    >
      {/* Header: name + inline + + kebab. Colored dot dropped — left bar
          already carries the type signal, gives the name another ~10px. */}
      <div className="flex items-center gap-1 min-w-0">
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
            // Kept mixed case + no tracking so default labels like "Strength"
            // fit inside 140px day columns. Uppercase + tracking-wider
            // pushed "Strength" past the available width and truncated to
            // "STR…" in testing.
            className="text-[11px] font-semibold text-muted-foreground truncate flex-1 min-w-0 text-left hover:text-foreground transition-colors"
            onClick={e => { e.stopPropagation(); setNameDraft(session.name ?? ''); setIsEditingName(true); }}
            title="Rename session"
          >
            {displayName}
          </button>
        )}
        {/* Inline + opens the same picker the bottom-row button used to.
            Hidden until session-row hover so the session name keeps every
            pixel during scanning. */}
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              // Always faintly visible. The right-rail palette used to be the
              // discoverable add path, but with that gone the inline "+" is
              // the only one left -- hover-only would hide it from tablets
              // and any pointer-less device.
              className="h-5 w-5 shrink-0 opacity-50 hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity"
              onClick={e => e.stopPropagation()}
              aria-label={isStrength ? 'Add muscle' : 'Add activity'}
              title={isStrength ? 'Add muscle' : 'Add activity'}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-60 p-2 max-h-80 overflow-y-auto"
            onClick={e => e.stopPropagation()}
            align="end"
          >
            <SessionAddPicker
              sessionType={session.type}
              placementCounts={placementCounts}
              recentMuscleIds={recentMuscleIds}
              onAddMuscle={handleAddMuscle}
              onAddActivity={handleAddActivity}
              variant="compact"
            />
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              // Always faintly visible so the menu is discoverable — hovering
              // brightens. Previous opacity-0 group-hover pattern meant you
              // had to know the menu was there to find it.
              className="h-5 w-5 shrink-0 opacity-50 hover:opacity-100 transition-opacity"
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
              // No interior padding — the parent's px-1 already gives the
              // slot cards breathing room and we need every pixel of
              // horizontal space for muscle labels.
              "space-y-1 rounded transition-colors min-h-[28px]",
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
    </div>
  );
});
