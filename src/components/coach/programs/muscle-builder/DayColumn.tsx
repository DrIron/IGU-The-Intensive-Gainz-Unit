import { memo, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Copy, ClipboardPaste, Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  estimateSessionDuration,
  formatDurationRange,
  type SetDurationInputs,
} from "@/lib/sessionDuration";
import { SessionBlock } from "./SessionBlock";
import {
  DAYS_OF_WEEK,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_COLORS,
  resolveParentMuscleId,
  getMuscleDisplay,
  type ActivityType,
  type MuscleSlotData,
  type SessionData,
  type SlotExercise,
} from "@/types/muscle-builder";

const ADDABLE_SESSION_TYPES: ActivityType[] = ['strength', 'cardio', 'hiit', 'yoga_mobility', 'recovery', 'sport_specific'];

interface DayColumnProps {
  dayIndex: number;
  slots: MuscleSlotData[];
  sessions: SessionData[];
  isSelected: boolean;
  onSelectDay: (dayIndex: number) => void;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
  onAddMuscleToSession: (sessionId: string, muscleId: string) => void;
  onAddActivityToSession: (sessionId: string, activityId: string, activityType: ActivityType) => void;
  onAddSession: (dayIndex: number, sessionType: ActivityType) => void;
  onRenameSession: (sessionId: string, name: string) => void;
  onSetSessionType: (sessionId: string, type: ActivityType) => void;
  onRemoveSession: (sessionId: string) => void;
  onDuplicateSessionToDay: (sessionId: string, toDayIndex: number) => void;
  onReorderSession: (dayIndex: number, fromIndex: number, toIndex: number) => void;
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
  sessions,
  isSelected,
  onSelectDay,
  onSetSlotDetails,
  onRemove,
  onAddMuscleToSession,
  onAddActivityToSession,
  onAddSession,
  onRenameSession,
  onSetSessionType,
  onRemoveSession,
  onDuplicateSessionToDay,
  onReorderSession,
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
  const [addSessionOpen, setAddSessionOpen] = useState(false);

  const daySlots = useMemo(
    () => slots.filter(s => s.dayIndex === dayIndex),
    [slots, dayIndex]
  );

  const daySessions = useMemo(
    () => sessions.filter(s => s.dayIndex === dayIndex).sort((a, b) => a.sortOrder - b.sortOrder),
    [sessions, dayIndex]
  );

  const totalSets = useMemo(
    () => daySlots.filter(s => !s.activityType || s.activityType === 'strength').reduce((sum, s) => sum + s.sets, 0),
    [daySlots]
  );

  // Session duration estimate (strength only)
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

  // Muscle-distribution ribbon — still driven by strength slots regardless of session grouping.
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

  const handleAddSession = useCallback((type: ActivityType) => {
    onAddSession(dayIndex, type);
    setAddSessionOpen(false);
  }, [onAddSession, dayIndex]);

  const hasCopied = copiedDayIndex != null;
  const isCopiedDay = copiedDayIndex === dayIndex;
  const hasAnyContent = daySessions.length > 0 || daySlots.length > 0;

  // Compute a running draggable index (hello-pangea/dnd wants unique indices
  // per Droppable; each SessionBlock has its own Droppable, but we still pass
  // a per-session start index so Draggable indices are stable across renders).
  let draggableCursor = 0;

  return (
    <Card
      data-day-index={dayIndex}
      className={cn(
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
            {/* + Session — opens a quick type picker */}
            <Popover open={addSessionOpen} onOpenChange={setAddSessionOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => e.stopPropagation()}
                  title="Add session"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-44 p-1"
                onClick={e => e.stopPropagation()}
                align="end"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Session type</p>
                {ADDABLE_SESSION_TYPES.map(t => (
                  <button
                    key={t}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted w-full text-left"
                    onClick={() => handleAddSession(t)}
                  >
                    <div className={cn("w-1.5 h-1.5 rounded-full", ACTIVITY_TYPE_COLORS[t].colorClass)} />
                    <span>{ACTIVITY_TYPE_LABELS[t]}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            {/* Copy day */}
            {hasAnyContent && onCopyDay && (
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
        {/* Muscle-distribution ribbon */}
        {muscleDistribution.length > 0 && (
          <div
            className="mt-1.5 h-[2px] w-full flex overflow-hidden rounded-full bg-muted/30"
            aria-hidden
          >
            {muscleDistribution.map(({ id, colorHex, pct }) => (
              <div key={id} style={{ width: `${pct}%`, backgroundColor: colorHex }} />
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {daySessions.length === 0 ? (
          // Rest day — diagonal hatch + muted badge.
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
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={e => { e.stopPropagation(); setAddSessionOpen(true); }}
            >
              Add session
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {daySessions.map((session, i) => {
              const sessionSlots = slotsBySessionId.get(session.id) || [];
              const startIdx = draggableCursor;
              draggableCursor += sessionSlots.length;
              return (
                <SessionBlock
                  key={session.id}
                  session={session}
                  slots={sessionSlots}
                  draggableStartIndex={startIdx}
                  sessionPosition={i}
                  daySessionsCount={daySessions.length}
                  highlightedMuscleId={highlightedMuscleId}
                  globalClientInputs={globalClientInputs}
                  weekCount={weekCount}
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
                  onSetActivityDetails={onSetActivityDetails}
                  onSetAllSets={onSetAllSets}
                  onApplyToRemaining={onApplyToRemaining}
                  onAddMuscleToSession={onAddMuscleToSession}
                  onAddActivityToSession={onAddActivityToSession}
                  onRenameSession={onRenameSession}
                  onSetSessionType={onSetSessionType}
                  onRemoveSession={onRemoveSession}
                  onDuplicateSessionToDay={onDuplicateSessionToDay}
                  onReorderSession={onReorderSession}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
