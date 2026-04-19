import { memo } from "react";
import { DayColumn } from "./DayColumn";
import { MobileWeekStrip } from "./MobileWeekStrip";
import { MobileDayDetail } from "./MobileDayDetail";
import type { ActivityType, MuscleSlotData, SessionData, SlotExercise } from "@/types/muscle-builder";

interface WeeklyCalendarProps {
  slots: MuscleSlotData[];
  sessions: SessionData[];
  selectedDayIndex: number;
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
  copiedDayIndex?: number | null;
  onCopyDay?: (dayIndex: number) => void;
  onPasteDay?: (dayIndex: number) => void;
  highlightedMuscleId?: string | null;
  onSetAllSets?: (muscleId: string, sets: number) => void;
  onReorderSlot?: (dayIndex: number, fromIndex: number, toIndex: number) => void;
  weekCount?: number;
  onApplyToRemaining?: (slotId: string, fields: Record<string, unknown>) => void;
}

export const WeeklyCalendar = memo(function WeeklyCalendar({
  slots,
  sessions,
  selectedDayIndex,
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
  onDeleteSetAtIndex,
  onApplySetToRemaining,
  onSetExerciseInstructions,
  onSetSlotClientInputs,
  onSetSlotColumns,
  onSetActivityDetails,
  globalClientInputs,
  copiedDayIndex,
  onCopyDay,
  onPasteDay,
  highlightedMuscleId,
  onSetAllSets,
  onReorderSlot,
  weekCount,
  onApplyToRemaining,
}: WeeklyCalendarProps) {
  const days = [1, 2, 3, 4, 5, 6, 7];

  return (
    <>
      {/* Mobile: compact week strip + inline day detail */}
      <div className="sm:hidden space-y-2">
        <MobileWeekStrip
          slots={slots}
          selectedDayIndex={selectedDayIndex}
          onSelectDay={onSelectDay}
        />
        <MobileDayDetail
          slots={slots}
          sessions={sessions}
          selectedDayIndex={selectedDayIndex}
          onSetSlotDetails={onSetSlotDetails}
          onRemove={onRemove}
          onAddMuscleToSession={onAddMuscleToSession}
          onAddActivityToSession={onAddActivityToSession}
          onAddSession={onAddSession}
          onRenameSession={onRenameSession}
          onSetSessionType={onSetSessionType}
          onRemoveSession={onRemoveSession}
          onDuplicateSessionToDay={onDuplicateSessionToDay}
          onSetExercise={onSetExercise}
          onClearExercise={onClearExercise}
          onAddReplacement={onAddReplacement}
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
          copiedDayIndex={copiedDayIndex}
          onCopyDay={onCopyDay}
          onPasteDay={onPasteDay}
          highlightedMuscleId={highlightedMuscleId}
          onSetAllSets={onSetAllSets}
          onReorderSlot={onReorderSlot}
          weekCount={weekCount}
          onApplyToRemaining={onApplyToRemaining}
        />
      </div>
      {/* Desktop: responsive grid */}
      <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {days.map(dayIndex => (
          <DayColumn
            key={dayIndex}
            dayIndex={dayIndex}
            slots={slots}
            sessions={sessions}
            isSelected={selectedDayIndex === dayIndex}
            onSelectDay={onSelectDay}
            onSetSlotDetails={onSetSlotDetails}
            onRemove={onRemove}
            onAddMuscleToSession={onAddMuscleToSession}
            onAddActivityToSession={onAddActivityToSession}
            onAddSession={onAddSession}
            onRenameSession={onRenameSession}
            onSetSessionType={onSetSessionType}
            onRemoveSession={onRemoveSession}
            onDuplicateSessionToDay={onDuplicateSessionToDay}
            onReorderSession={onReorderSession}
            onSetExercise={onSetExercise}
            onClearExercise={onClearExercise}
            onAddReplacement={onAddReplacement}
            onRemoveReplacement={onRemoveReplacement}
            onOpenExercisePicker={onOpenExercisePicker}
            onTogglePerSet={onTogglePerSet}
            onUpdateSetDetail={onUpdateSetDetail}
            onDeleteSetAtIndex={onDeleteSetAtIndex}
            onApplySetToRemaining={onApplySetToRemaining}
            onSetExerciseInstructions={onSetExerciseInstructions}
            onSetSlotClientInputs={onSetSlotClientInputs}
            onSetSlotColumns={onSetSlotColumns}
            onSetActivityDetails={onSetActivityDetails}
            globalClientInputs={globalClientInputs}
            copiedDayIndex={copiedDayIndex}
            onCopyDay={onCopyDay}
            onPasteDay={onPasteDay}
            highlightedMuscleId={highlightedMuscleId}
            onSetAllSets={onSetAllSets}
            weekCount={weekCount}
            onApplyToRemaining={onApplyToRemaining}
          />
        ))}
      </div>
    </>
  );
});
