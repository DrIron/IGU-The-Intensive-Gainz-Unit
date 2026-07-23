import { memo, useMemo, useState, useCallback } from "react";
import { type BoardDayOption } from "@/lib/boardDates";
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
import { MoreVertical, Plus, ArrowUp, ArrowDown, Trash2, Copy, RotateCcw, ChevronDown, ChevronRight, CalendarArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { isBoardV2Enabled } from "@/lib/featureFlags";
import { useClientEditor } from "./ClientEditorContext";
import { SessionTypeBar } from "../shared/SessionTypeBar";
import { MuscleSlotCard } from "./MuscleSlotCard";
import { ActivitySlotCard } from "./ActivitySlotCard";
import { UnifiedSessionPicker } from "./UnifiedSessionPicker";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_COLORS,
  defaultSessionName,
  flatSessionLabel,
  deriveSessionColorHex,
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
  onSetSetInstruction?: (slotId: string, setIndex: number, patch: import("@/types/workout-builder").SetInstructionPatch) => void;
  onSetExerciseInstructions?: (slotId: string, instructions: string) => void;
  onSetSlotClientInputs?: (slotId: string, columns: string[] | undefined) => void;
  onSetSlotColumns?: (slotId: string, columns: string[]) => void;
  onSetActivityDetails?: (slotId: string, details: Record<string, unknown>) => void;
  onSetAllSets?: (muscleId: string, sets: number) => void;
  onApplyToRemaining?: (slotId: string, fields: Record<string, unknown>) => void;
  // Phase 2 — Weekly deltas
  weekIndex?: number;
  isDeloadByWeek?: boolean[];
  onSetSlotDeltaRules?: (slotId: string, rules: import("./weeklyDeltaEngine").WeeklyDeltaRule[]) => void;
  // Phase 4 — Inheritance bar on W2+
  w1RuleTargetsBySlotId?: Map<string, import("./weeklyDeltaEngine").DeltaTarget[]>;
  onClearSlotOverride?: (slotId: string, target: import("./weeklyDeltaEngine").DeltaTarget) => void;
  // Session callbacks
  onAddMuscleToSession: (sessionId: string, muscleId: string) => void;
  onAddActivityToSession: (sessionId: string, activityId: string, activityType: ActivityType) => void;
  onAddActivityGroupToSession: (sessionId: string, groupId: string, groupLabel: string, activityType: ActivityType) => void;
  onAddExerciseToSession: (sessionId: string, exercise: { exerciseId: string; name: string }, activityType: ActivityType) => void;
  onRenameSession: (sessionId: string, name: string) => void;
  onSetSessionType: (sessionId: string, type: ActivityType) => void;
  onRemoveSession: (sessionId: string) => void;
  onDuplicateSessionToDay: (sessionId: string, toDayIndex: number) => void;
  onMoveSessionToDay: (sessionId: string, toDayIndex: number) => void;
  /** Start-anchored day labels (calendar: "Thu Jul 2"; weeks: "Thu"; template: Mon-first). */
  dayOptions: BoardDayOption[];
  onReorderSession: (dayIndex: number, fromIndex: number, toIndex: number) => void;
  placementCounts?: Map<string, number>;
  recentMuscleIds?: string[];
  /** Canonical authoring (Phase 2): flat auto-named session (Session A/B…), no type picker, rail
   *  colour derived from contents. */
  flatSessions?: boolean;
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
  onSetSetInstruction,
  onSetExerciseInstructions,
  onSetSlotClientInputs,
  onSetSlotColumns,
  onSetActivityDetails,
  onSetAllSets,
  onApplyToRemaining,
  weekIndex,
  isDeloadByWeek,
  onSetSlotDeltaRules,
  w1RuleTargetsBySlotId,
  onClearSlotOverride,
  onAddMuscleToSession,
  onAddActivityGroupToSession,
  onAddExerciseToSession,
  onRenameSession,
  onSetSessionType,
  onRemoveSession,
  onDuplicateSessionToDay,
  onMoveSessionToDay,
  dayOptions,
  onReorderSession,
  placementCounts,
  recentMuscleIds,
  flatSessions = false,
}: SessionBlockProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(session.name ?? '');
  const [addOpen, setAddOpen] = useState(false);
  // P4 Editor v1: client (override) mode — flag a customized session + offer reset-to-template.
  const { clientMode, overriddenSessionIds, onResetSession } = useClientEditor();
  const isOverridden = clientMode && overriddenSessionIds.has(session.id);
  // Board v2: inline session expansion — default collapsed (header + summary), expand to the
  // slot cards (read view; tapping a card still opens its editor). Off → always expanded.
  const boardV2 = isBoardV2Enabled();
  const [expanded, setExpanded] = useState(!boardV2);
  const showSlots = !boardV2 || expanded;

  // Session-type colour now lives in the shared <SessionTypeBar>; ACTIVITY_TYPE_COLORS
  // is still used below for the type-picker dots in the kebab menu.
  // Canonical authoring: flat auto-name (Session A/B…) + no type in the fallback name.
  const fallbackName = flatSessions ? flatSessionLabel(sessionPosition) : defaultSessionName(session.type);
  const displayName = session.name?.trim() || fallbackName;
  // Canonical: rail colour from contents (null = neutral); legacy: from session.type.
  const contentColorHex = useMemo(() => (flatSessions ? deriveSessionColorHex(slots) : null), [flatSessions, slots]);

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

  const handleAddExercise = useCallback(
    (exercise: { exerciseId: string; name: string }, activityType: ActivityType) => {
      onAddExerciseToSession(session.id, exercise, activityType);
      setAddOpen(false);
    },
    [onAddExerciseToSession, session.id],
  );

  const handleAddActivityGroup = useCallback(
    (groupId: string, groupLabel: string, activityType: ActivityType) => {
      onAddActivityGroupToSession(session.id, groupId, groupLabel, activityType);
      setAddOpen(false);
    },
    [onAddActivityGroupToSession, session.id],
  );

  return (
    // Flat colored-accent layout: the 2px left bar (session-type color) carries
    // the type signal, so there is no per-session border or tinted bg. That saves
    // ~8px of horizontal width and one layer of visual nesting in the already-
    // cramped 140px day columns at lg:grid-cols-7. The rail itself now lives in
    // the shared `SessionTypeBar` so mobile renders the identical rail.
    //
    // `group/session` lets the inline `+` reveal on hover only; the kebab stays
    // faintly visible at all times (opacity-50) so coaches can still discover
    // session actions, while the name keeps every available pixel when not hovering.
    <SessionTypeBar
      activityType={session.type}
      isOverridden={isOverridden}
      useContentColor={flatSessions}
      contentColorHex={contentColorHex}
      className="group/session space-y-1"
    >
      {/* Header: name + inline + + kebab. Colored dot dropped — left bar
          already carries the type signal, gives the name another ~10px. */}
      <div className="flex items-center gap-1 min-w-0">
        {boardV2 && (
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse session" : "Expand session"}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        )}
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
            placeholder={fallbackName}
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
        {/* P4 client mode: reset this session's customization back to the template. */}
        {isOverridden && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
            title="Reset session to template"
            onClick={e => { e.stopPropagation(); onResetSession(session.id); }}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
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
              aria-label="Add to session"
              title="Add to session"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            // Cap to the collision-aware available height (not a fixed 24rem) so a "+" anchored high
            // in the viewport can't push the popover — and its category-tab row — off the top edge;
            // the content scrolls internally instead. collisionPadding keeps an 8px gutter.
            className="w-80 p-2 overflow-y-auto max-h-[min(24rem,var(--radix-popover-content-available-height))]"
            onClick={e => e.stopPropagation()}
            align="end"
            collisionPadding={8}
          >
            <UnifiedSessionPicker
              placementCounts={placementCounts}
              recentMuscleIds={recentMuscleIds}
              onAddMuscle={handleAddMuscle}
              onAddExercise={handleAddExercise}
              onAddActivityGroup={handleAddActivityGroup}
              variant="compact"
              enableGroupPick={flatSessions}
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
            {/* Canonical authoring: a session is a flat list — no type, so no "Change type". */}
            {!flatSessions && (
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
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Copy className="h-3 w-3 mr-2" /> Duplicate to day
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {dayOptions.map(opt => (
                  <DropdownMenuItem
                    key={opt.dayIndex}
                    onClick={e => { e.stopPropagation(); onDuplicateSessionToDay(session.id, opt.dayIndex); }}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CalendarArrowUp className="h-3 w-3 mr-2" /> Move to day
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {dayOptions.map(opt => (
                  <DropdownMenuItem
                    key={opt.dayIndex}
                    disabled={opt.dayIndex === session.dayIndex}
                    onClick={e => { e.stopPropagation(); onMoveSessionToDay(session.id, opt.dayIndex); }}
                  >
                    {opt.label}
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

      {/* Board v2 collapsed summary — tap to expand to the slot cards. */}
      {!showSlots && (
        <button
          type="button"
          className="w-full text-left text-[10px] text-muted-foreground hover:text-foreground py-1"
          onClick={() => setExpanded(true)}
        >
          {sessionSlots.length === 0
            ? "Empty session"
            : `${sessionSlots.length} item${sessionSlots.length === 1 ? "" : "s"} — tap to expand`}
        </button>
      )}

      {/* Slot list — own Droppable so drag-reorder within + moves across
          sessions are distinguishable to hello-pangea/dnd. */}
      {showSlots && (
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
              // hello-pangea/dnd requires Draggable indices to be 0-based and
              // contiguous within their parent Droppable. Each SessionBlock is
              // its own Droppable, so the index is the slot's position within
              // this session — not a running cursor across the whole day.
              // Card type is decided PER-SLOT (not per-session) so one session
              // can mix strength + cardio + mobility items (5g).
              const isStrengthSlot = !slot.activityType || slot.activityType === 'strength';
              if (isStrengthSlot) {
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
                    draggableIndex={i}
                    onSetSlotDetails={onSetSlotDetails}
                    onRemove={onRemove}
                    onSetExercise={onSetExercise}
                    onClearExercise={onClearExercise}
                    onAddReplacement={onAddReplacement}
                    onRemoveReplacement={onRemoveReplacement}
                    onOpenExercisePicker={onOpenExercisePicker}
                    onTogglePerSet={onTogglePerSet}
                    onUpdateSetDetail={onUpdateSetDetail}
                    onSetSetInstruction={onSetSetInstruction}
                    onSetExerciseInstructions={onSetExerciseInstructions}
                    onSetSlotClientInputs={onSetSlotClientInputs}
                    onSetSlotColumns={onSetSlotColumns}
                    isHighlighted={highlightedMuscleId != null && resolveParentMuscleId(slot.muscleId) === highlightedMuscleId}
                    onSetAllSets={onSetAllSets}
                    weekCount={weekCount}
                    onApplyToRemaining={onApplyToRemaining}
                    weekIndex={weekIndex}
                    isDeloadByWeek={isDeloadByWeek}
                    deltaRules={slot.deltaRules}
                    onSetSlotDeltaRules={onSetSlotDeltaRules}
                    w1RuleTargets={w1RuleTargetsBySlotId?.get(slot.id)}
                    manualOverrides={slot.manualOverrides}
                    onClearOverride={onClearSlotOverride}
                  />
                );
              }
              return (
                <ActivitySlotCard
                  key={slot.id}
                  slot={slot}
                  draggableIndex={i}
                  onRemove={onRemove}
                  onSetActivityDetails={onSetActivityDetails}
                />
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      )}
    </SessionTypeBar>
  );
});
