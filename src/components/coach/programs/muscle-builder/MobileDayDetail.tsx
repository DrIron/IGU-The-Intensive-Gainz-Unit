import { memo, useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Copy, ClipboardPaste, Plus, X, AlertTriangle, Dumbbell, RefreshCw, ArrowUp, ArrowDown, SlidersHorizontal, Clock, MoreVertical, Trash2 } from "lucide-react";
import { MobileSetCarousel } from "./MobileSetCarousel";
import { SessionAddPicker } from "./SessionAddPicker";
import { cn } from "@/lib/utils";
import {
  estimateSessionDuration,
  formatDurationRange,
  type SetDurationInputs,
} from "@/lib/sessionDuration";
import {
  DAYS_OF_WEEK,
  MUSCLE_MAP,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_COLORS,
  getMuscleDisplay,
  getShortMuscleLabel,
  resolveParentMuscleId,
  defaultSessionName,
  SUBDIVISION_MAP,
  type ActivityType,
  type MuscleSlotData,
  type SessionData,
  type SlotExercise,
} from "@/types/muscle-builder";

const SESSION_TYPES: ActivityType[] = ['strength', 'cardio', 'hiit', 'yoga_mobility', 'recovery', 'sport_specific'];

interface MobileDayDetailProps {
  slots: MuscleSlotData[];
  sessions: SessionData[];
  selectedDayIndex: number;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
  onAddMuscleToSession: (sessionId: string, muscleId: string) => void;
  onAddActivityToSession: (sessionId: string, activityId: string, activityType: ActivityType) => void;
  onAddSession: (dayIndex: number, sessionType: ActivityType) => void;
  onRenameSession: (sessionId: string, name: string) => void;
  onSetSessionType: (sessionId: string, type: ActivityType) => void;
  onRemoveSession: (sessionId: string) => void;
  onDuplicateSessionToDay: (sessionId: string, toDayIndex: number) => void;
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
  globalClientInputs?: string[];
  copiedDayIndex?: number | null;
  onCopyDay?: (dayIndex: number) => void;
  onPasteDay?: (dayIndex: number) => void;
  highlightedMuscleId?: string | null;
  onSetAllSets?: (muscleId: string, sets: number) => void;
  onReorderSlot?: (dayIndex: number, fromIndex: number, toIndex: number) => void;
  weekCount?: number;
  onApplyToRemaining?: (slotId: string, fields: Record<string, unknown>) => void;
  placementCounts?: Map<string, number>;
  recentMuscleIds?: string[];
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
  sessions,
  selectedDayIndex,
  onSetSlotDetails,
  onRemove,
  onAddMuscleToSession,
  onAddActivityToSession,
  onAddSession,
  onRenameSession,
  onSetSessionType,
  onRemoveSession,
  onDuplicateSessionToDay,
  onClearExercise,
  onRemoveReplacement,
  onOpenExercisePicker,
  onTogglePerSet,
  onUpdateSetDetail,
  onDeleteSetAtIndex,
  onApplySetToRemaining,
  onSetExerciseInstructions,
  onSetSlotClientInputs,
  onSetSlotColumns,
  globalClientInputs,
  copiedDayIndex,
  onCopyDay,
  onPasteDay,
  highlightedMuscleId,
  onReorderSlot,
  weekCount,
  onApplyToRemaining,
  placementCounts,
  recentMuscleIds,
}: MobileDayDetailProps) {
  // pickerSessionId: when non-null, the inline picker is scoped to adding
  // slots to this session. Null = no picker open.
  const [pickerSessionId, setPickerSessionId] = useState<string | null>(null);
  const [addSessionOpen, setAddSessionOpen] = useState(false);

  const daySlots = useMemo(
    () => slots.filter(s => s.dayIndex === selectedDayIndex).sort((a, b) => a.sortOrder - b.sortOrder),
    [slots, selectedDayIndex],
  );

  const daySessions = useMemo(
    () => sessions.filter(s => s.dayIndex === selectedDayIndex).sort((a, b) => a.sortOrder - b.sortOrder),
    [sessions, selectedDayIndex],
  );

  const slotsBySessionId = useMemo(() => {
    const map = new Map<string, MuscleSlotData[]>();
    for (const slot of daySlots) {
      const key = slot.sessionId || '__unassigned__';
      const list = map.get(key) || [];
      list.push(slot);
      map.set(key, list);
    }
    return map;
  }, [daySlots]);

  const totalSets = useMemo(
    () => daySlots.reduce((sum, s) => sum + s.sets, 0),
    [daySlots],
  );

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

  const hasCopied = copiedDayIndex != null;
  const isCopiedDay = copiedDayIndex === selectedDayIndex;

  const pickerSession = pickerSessionId ? daySessions.find(s => s.id === pickerSessionId) : null;

  const handleAddMuscle = useCallback(
    (muscleId: string) => {
      if (!pickerSessionId) return;
      onAddMuscleToSession(pickerSessionId, muscleId);
    },
    [onAddMuscleToSession, pickerSessionId],
  );

  const handleAddActivity = useCallback(
    (activityId: string) => {
      if (!pickerSessionId || !pickerSession) return;
      onAddActivityToSession(pickerSessionId, activityId, pickerSession.type);
    },
    [onAddActivityToSession, pickerSessionId, pickerSession],
  );

  return (
    <Card className="border-border/50">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-semibold truncate">
              {DAYS_OF_WEEK[selectedDayIndex - 1]}
            </span>
            {(totalSets > 0 || sessionDuration) && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-muted-foreground">
                {totalSets > 0 && <span>{totalSets} sets</span>}
                {sessionDuration && (
                  <span
                    className="inline-flex items-center gap-0.5"
                    title={sessionDuration.inferred
                      ? "Estimate assumes 2-4s/rep tempo and 60-120s rest when not set"
                      : "Estimated session duration"}
                  >
                    <Clock className="h-2.5 w-2.5" aria-hidden />
                    {formatDurationRange(sessionDuration.minSeconds, sessionDuration.maxSeconds)}
                  </span>
                )}
              </div>
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
        {pickerSessionId && pickerSession ? (
          /* -- Inline picker scoped to a session.
                Shared SessionAddPicker handles search, recents, counts, and
                the strength-vs-activity branch so the desktop popover and
                this drawer stay aligned. */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Add to {pickerSession.name?.trim() || defaultSessionName(pickerSession.type)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setPickerSessionId(null)}
              >
                Done
              </Button>
            </div>
            <SessionAddPicker
              sessionType={pickerSession.type}
              placementCounts={placementCounts}
              recentMuscleIds={recentMuscleIds}
              onAddMuscle={handleAddMuscle}
              onAddActivity={handleAddActivity}
              variant="roomy"
              autoFocusSearch
            />
          </div>
        ) : (
          /* -- Sessions list -- */
          <>
            {daySessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-xs text-muted-foreground/60">
                <span>Rest day</span>
                <button
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setAddSessionOpen(true)}
                >
                  Add session
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {daySessions.map(session => {
                  const sessionSlots = (slotsBySessionId.get(session.id) || [])
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder);
                  const typeColors = ACTIVITY_TYPE_COLORS[session.type];
                  return (
                    <div
                      key={session.id}
                      // Match desktop: 2px colored left bar carries the type
                      // signal so we drop the bordered subcard. Saves a layer
                      // of visual nesting and aligns with DayColumn / SessionBlock.
                      className="border-l-2 pl-2 space-y-1.5"
                      style={{ borderLeftColor: typeColors.colorHex }}
                    >
                      <MobileSessionHeader
                        session={session}
                        typeColorClass={typeColors.colorClass}
                        onRenameSession={onRenameSession}
                        onSetSessionType={onSetSessionType}
                        onRemoveSession={onRemoveSession}
                        onDuplicateSessionToDay={onDuplicateSessionToDay}
                      />
                      {sessionSlots.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground/60 italic py-1 text-center">
                          Empty session
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {sessionSlots.map((slot, index) => {
                            // index within the day's full ordered slot list drives
                            // the existing day-level REORDER. Compute it fresh so
                            // arrows still act as expected across sessions.
                            const dayIdx = daySlots.findIndex(s => s.id === slot.id);
                            const muscle = getMuscleDisplay(slot.muscleId);
                            if (!muscle) return null;
                            return (
                              <MobileSlotRow
                                key={slot.id}
                                slot={slot}
                                muscle={muscle}
                                label={getShortMuscleLabel(slot.muscleId)}
                                fullLabel={formatSlotLabel(slot.muscleId)}
                                isHighlighted={highlightedMuscleId != null && resolveParentMuscleId(slot.muscleId) === highlightedMuscleId}
                                onSetSlotDetails={onSetSlotDetails}
                                onRemove={onRemove}
                                onClearExercise={onClearExercise}
                                onRemoveReplacement={onRemoveReplacement}
                                onOpenExercisePicker={onOpenExercisePicker}
                                onTogglePerSet={onTogglePerSet}
                                onUpdateSetDetail={onUpdateSetDetail}
                                onDeleteSetAtIndex={onDeleteSetAtIndex}
                                onApplySetToRemaining={onApplySetToRemaining}
                                onSetExerciseInstructions={onSetExerciseInstructions}
                                onSetSlotClientInputs={onSetSlotClientInputs}
                                onSetSlotColumns={onSetSlotColumns}
                                globalClientInputs={globalClientInputs}
                                canMoveUp={index > 0}
                                canMoveDown={index < sessionSlots.length - 1}
                                onMoveUp={onReorderSlot && dayIdx > 0 ? () => onReorderSlot(selectedDayIndex, dayIdx, dayIdx - 1) : undefined}
                                onMoveDown={onReorderSlot && dayIdx < daySlots.length - 1 ? () => onReorderSlot(selectedDayIndex, dayIdx, dayIdx + 1) : undefined}
                                weekCount={weekCount}
                                onApplyToRemaining={onApplyToRemaining}
                              />
                            );
                          })}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-8 text-xs text-muted-foreground justify-start"
                        onClick={() => setPickerSessionId(session.id)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        {session.type === 'strength' ? 'Add muscle' : 'Add activity'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* + Session at day level */}
            <DropdownMenu open={addSessionOpen} onOpenChange={setAddSessionOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full h-9 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add session
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-44" align="center">
                {SESSION_TYPES.map(t => (
                  <DropdownMenuItem
                    key={t}
                    onClick={() => { onAddSession(selectedDayIndex, t); setAddSessionOpen(false); }}
                  >
                    <div className={cn("w-1.5 h-1.5 rounded-full mr-2", ACTIVITY_TYPE_COLORS[t].colorClass)} />
                    {ACTIVITY_TYPE_LABELS[t]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </CardContent>
    </Card>
  );
});

/* -- Mobile session header: colored dot + tap-to-rename + kebab -- */

interface MobileSessionHeaderProps {
  session: SessionData;
  typeColorClass: string;
  onRenameSession: (sessionId: string, name: string) => void;
  onSetSessionType: (sessionId: string, type: ActivityType) => void;
  onRemoveSession: (sessionId: string) => void;
  onDuplicateSessionToDay: (sessionId: string, toDayIndex: number) => void;
}

const MobileSessionHeader = memo(function MobileSessionHeader({
  session,
  typeColorClass,
  onRenameSession,
  onSetSessionType,
  onRemoveSession,
  onDuplicateSessionToDay,
}: MobileSessionHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.name ?? '');

  const commit = () => {
    onRenameSession(session.id, draft.trim());
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={cn("w-2 h-2 rounded-full shrink-0", typeColorClass)} />
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(session.name ?? ''); setEditing(false); }
          }}
          className="h-7 text-sm px-1.5 py-0 flex-1 min-w-0"
          placeholder={defaultSessionName(session.type)}
        />
      ) : (
        <button
          type="button"
          className="text-xs font-semibold uppercase tracking-wider text-foreground/80 truncate flex-1 min-w-0 text-left"
          onClick={() => { setDraft(session.name ?? ''); setEditing(true); }}
        >
          {session.name?.trim() || defaultSessionName(session.type)}
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Session actions">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => { setDraft(session.name ?? ''); setEditing(true); }}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Change type</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {SESSION_TYPES.map(t => (
                <DropdownMenuItem key={t} disabled={t === session.type} onClick={() => onSetSessionType(session.id, t)}>
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
                <DropdownMenuItem key={day} onClick={() => onDuplicateSessionToDay(session.id, i + 1)}>
                  {day}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onRemoveSession(session.id)}
          >
            <Trash2 className="h-3 w-3 mr-2" /> Delete session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

/* -- Mobile slot row (minimal card + tap to edit popover) -- */

interface MobileSlotRowProps {
  slot: MuscleSlotData;
  muscle: { label: string; colorClass: string; colorHex: string };
  /** Short label shown on the compact slot row */
  label: string;
  /** Full label ("Pecs › Clavicular (Upper)") shown inside the drawer where there's room */
  fullLabel: string;
  isHighlighted: boolean;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
  onClearExercise?: (slotId: string) => void;
  onRemoveReplacement?: (slotId: string, replacementIndex: number) => void;
  onOpenExercisePicker?: (slotId: string, muscleId: string, mode: 'primary' | 'replacement') => void;
  onTogglePerSet?: (slotId: string) => void;
  onUpdateSetDetail?: (slotId: string, setIndex: number, field: keyof import("@/types/workout-builder").SetPrescription, value: number | string | undefined) => void;
  onDeleteSetAtIndex?: (slotId: string, setIndex: number) => void;
  onApplySetToRemaining?: (slotId: string, fromIndex: number) => void;
  onSetExerciseInstructions?: (slotId: string, instructions: string) => void;
  onSetSlotClientInputs?: (slotId: string, columns: string[] | undefined) => void;
  onSetSlotColumns?: (slotId: string, columns: string[]) => void;
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
  fullLabel,
  isHighlighted,
  onSetSlotDetails,
  onRemove,
  onClearExercise,
  onRemoveReplacement,
  onOpenExercisePicker,
  onTogglePerSet,
  onUpdateSetDetail,
  onDeleteSetAtIndex,
  onApplySetToRemaining,
  onSetExerciseInstructions,
  onSetSlotClientInputs,
  onSetSlotColumns,
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
  const hasPerSet = !!slot.setsDetail && slot.setsDetail.length > 0;

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
          <DrawerTitle className="sr-only">{fullLabel}</DrawerTitle>
          <ScrollArea className="overflow-y-auto px-4 pb-6 pt-2" style={{ maxHeight: 'calc(85vh - 2rem)' }}>
          <div className="space-y-4">
            {/* Header with muscle label */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: muscle.colorHex }} />
                <p className="text-base font-semibold">{fullLabel}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setPopoverOpen(false)}>
                Done
              </Button>
            </div>

            {/* Sets & Rep Range side by side.
                Pencil icon on the Sets label opens the per-set carousel —
                if per-set isn't on yet we toggle it first so the carousel
                has a populated setsDetail to render. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Sets</Label>
                  {slot.sets > 1 && onTogglePerSet && onUpdateSetDetail && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!hasPerSet) onTogglePerSet(slot.id);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider rounded-full px-2 h-5 transition-colors",
                        hasPerSet
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80",
                      )}
                      title="Customise sets"
                      aria-pressed={hasPerSet}
                    >
                      <SlidersHorizontal className="h-3 w-3" />
                      {hasPerSet ? "On" : "Customise"}
                    </button>
                  )}
                </div>
                <Input
                  type="number" min={1} value={slot.sets}
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
                    disabled={hasPerSet}
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input
                    type="number" min={1} max={100} value={slot.repMax ?? 12}
                    onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) update({ repMax: v }); }}
                    className="h-10 text-base flex-1" inputMode="numeric"
                    disabled={hasPerSet}
                  />
                </div>
              </div>
            </div>

            {/* Per-set carousel OR flat tempo/RIR/RPE controls. When custom
                sets are on, each set gets its own card and the flat row would
                contradict them, so we replace. */}
            {hasPerSet && slot.setsDetail && onUpdateSetDetail ? (
              <MobileSetCarousel
                sets={slot.setsDetail}
                activeColumns={slot.prescriptionColumns && slot.prescriptionColumns.length > 0
                  ? slot.prescriptionColumns
                  : ['rep_range', 'tempo', 'rir', 'rest']}
                onUpdateSet={(index, field, value) => onUpdateSetDetail(slot.id, index, field, value)}
                onAddSet={() => update({ sets: slot.sets + 1 })}
                onDeleteSet={onDeleteSetAtIndex ? (index) => onDeleteSetAtIndex(slot.id, index) : undefined}
                onSetColumns={onSetSlotColumns ? (cols) => onSetSlotColumns(slot.id, cols) : undefined}
                onApplyToRemaining={onApplySetToRemaining ? (index) => onApplySetToRemaining(slot.id, index) : undefined}
              />
            ) : (
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
            )}

            {needsIntensity && !hasPerSet && (
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

                {slot.exercise && onSetExerciseInstructions && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Instructions (optional)
                    </Label>
                    <Textarea
                      value={slot.exercise.instructions ?? ""}
                      placeholder="Cues, setup, tempo notes for this exercise…"
                      className="min-h-[72px] text-sm"
                      onChange={(e) => onSetExerciseInstructions(slot.id, e.target.value)}
                    />
                  </div>
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
