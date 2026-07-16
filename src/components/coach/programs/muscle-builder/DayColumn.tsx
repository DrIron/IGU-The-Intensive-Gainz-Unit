import { memo, useMemo, useState, useCallback } from "react";
import { type BoardDayOption } from "@/lib/boardDates";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Copy, ClipboardPaste, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  estimateSessionDuration,
  type SetDurationInputs,
} from "@/lib/sessionDuration";
import { SessionBlock } from "./SessionBlock";
import { MuscleDistributionRibbon } from "../shared/MuscleDistributionRibbon";
import { ProgramStatStrip } from "../shared/ProgramStatStrip";
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
  /** Board v2 Calendar mode: real-date label (e.g. "Mon 30 Jun") replacing the weekday name. */
  dayDateLabel?: string;
  slots: MuscleSlotData[];
  sessions: SessionData[];
  isSelected: boolean;
  onSelectDay: (dayIndex: number) => void;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
  onAddMuscleToSession: (sessionId: string, muscleId: string) => void;
  onAddActivityToSession: (sessionId: string, activityId: string, activityType: ActivityType) => void;
  onAddExerciseToSession: (sessionId: string, exercise: { exerciseId: string; name: string }, activityType: ActivityType) => void;
  onAddSession: (dayIndex: number, sessionType: ActivityType) => void;
  onRenameSession: (sessionId: string, name: string) => void;
  onSetSessionType: (sessionId: string, type: ActivityType) => void;
  onRemoveSession: (sessionId: string) => void;
  onDuplicateSessionToDay: (sessionId: string, toDayIndex: number) => void;
  onMoveSessionToDay: (sessionId: string, toDayIndex: number) => void;
  /** Start-anchored day labels for the session pickers + header fallback. */
  dayOptions: BoardDayOption[];
  onReorderSession: (dayIndex: number, fromIndex: number, toIndex: number) => void;
  onSetExercise?: (slotId: string, exercise: SlotExercise) => void;
  onClearExercise?: (slotId: string) => void;
  onAddReplacement?: (slotId: string, exercise: SlotExercise) => void;
  onRemoveReplacement?: (slotId: string, replacementIndex: number) => void;
  onOpenExercisePicker?: (slotId: string, muscleId: string, mode: 'primary' | 'replacement') => void;
  onTogglePerSet?: (slotId: string) => void;
  onUpdateSetDetail?: (slotId: string, setIndex: number, field: keyof import("@/types/workout-builder").SetPrescription, value: number | string | undefined) => void;
  onSetSetInstruction?: (slotId: string, setIndex: number, patch: import("@/types/workout-builder").SetInstructionPatch) => void;
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
  placementCounts?: Map<string, number>;
  recentMuscleIds?: string[];
  // Phase 2 — Weekly deltas
  weekIndex?: number;
  isDeloadByWeek?: boolean[];
  onSetSlotDeltaRules?: (slotId: string, rules: import("./weeklyDeltaEngine").WeeklyDeltaRule[]) => void;
  // Phase 4 — Inheritance bar on W2+
  w1RuleTargetsBySlotId?: Map<string, import("./weeklyDeltaEngine").DeltaTarget[]>;
  onClearSlotOverride?: (slotId: string, target: import("./weeklyDeltaEngine").DeltaTarget) => void;
}

export const DayColumn = memo(function DayColumn({
  dayIndex,
  dayDateLabel,
  dayOptions,
  slots,
  sessions,
  isSelected,
  onSelectDay,
  onSetSlotDetails,
  onRemove,
  onAddMuscleToSession,
  onAddActivityToSession,
  onAddExerciseToSession,
  onAddSession,
  onRenameSession,
  onSetSessionType,
  onRemoveSession,
  onDuplicateSessionToDay,
  onMoveSessionToDay,
  onReorderSession,
  onSetExercise,
  onClearExercise,
  onAddReplacement,
  onRemoveReplacement,
  onOpenExercisePicker,
  onTogglePerSet,
  onUpdateSetDetail,
  onSetSetInstruction,
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
  placementCounts,
  recentMuscleIds,
  weekIndex,
  isDeloadByWeek,
  onSetSlotDeltaRules,
  w1RuleTargetsBySlotId,
  onClearSlotOverride,
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

  // CC9 exclusion: this is a drag-and-drop EDITING container, not a navigation tile. The
  // whole-card click is a secondary "select day" convenience over a surface full of its own
  // interactive controls (sessions, drag handles, popovers). Wrapping that in role="button"
  // would nest interactive content inside a button — an a11y anti-pattern worse than the bare
  // onClick, and it also breaks the visualNoOp render-stability guard. A proper keyboard path
  // for day-selection is a separate, non-mechanical slice.
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
        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className="text-sm font-semibold text-muted-foreground truncate">
            {dayDateLabel ?? dayOptions.find(o => o.dayIndex === dayIndex)?.label ?? DAYS_OF_WEEK[dayIndex - 1]}
          </span>
          <div className="flex items-center gap-1 shrink-0">
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
          </div>
        </div>
        <ProgramStatStrip sets={totalSets} duration={sessionDuration} className="mt-1" />
        <MuscleDistributionRibbon segments={muscleDistribution} className="mt-1.5" />
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
              return (
                <SessionBlock
                  key={session.id}
                  session={session}
                  slots={sessionSlots}
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
                  onSetSetInstruction={onSetSetInstruction}
                  onSetExerciseInstructions={onSetExerciseInstructions}
                  onSetSlotClientInputs={onSetSlotClientInputs}
                  onSetSlotColumns={onSetSlotColumns}
                  onSetActivityDetails={onSetActivityDetails}
                  onSetAllSets={onSetAllSets}
                  onApplyToRemaining={onApplyToRemaining}
                  weekIndex={weekIndex}
                  isDeloadByWeek={isDeloadByWeek}
                  onSetSlotDeltaRules={onSetSlotDeltaRules}
                  w1RuleTargetsBySlotId={w1RuleTargetsBySlotId}
                  onClearSlotOverride={onClearSlotOverride}
                  onAddMuscleToSession={onAddMuscleToSession}
                  onAddActivityToSession={onAddActivityToSession}
                  onAddExerciseToSession={onAddExerciseToSession}
                  onRenameSession={onRenameSession}
                  onSetSessionType={onSetSessionType}
                  onRemoveSession={onRemoveSession}
                  onDuplicateSessionToDay={onDuplicateSessionToDay}
                  onMoveSessionToDay={onMoveSessionToDay}
                  dayOptions={dayOptions}
                  onReorderSession={onReorderSession}
                  placementCounts={placementCounts}
                  recentMuscleIds={recentMuscleIds}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
