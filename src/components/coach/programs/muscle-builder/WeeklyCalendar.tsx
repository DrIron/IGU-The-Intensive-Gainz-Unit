import { memo, useCallback } from "react";
import { DayColumn } from "./DayColumn";
import { MobileWeekStrip } from "./MobileWeekStrip";
import { MobileDayDetail } from "./MobileDayDetail";
import type { MuscleSlotData } from "@/types/muscle-builder";

interface WeeklyCalendarProps {
  slots: MuscleSlotData[];
  selectedDayIndex: number;
  onSelectDay: (dayIndex: number) => void;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
  onAddMuscle?: (dayIndex: number, muscleId: string) => void;
  copiedDayIndex?: number | null;
  onCopyDay?: (dayIndex: number) => void;
  onPasteDay?: (dayIndex: number) => void;
  highlightedMuscleId?: string | null;
  onSetAllSets?: (muscleId: string, sets: number) => void;
}

export const WeeklyCalendar = memo(function WeeklyCalendar({
  slots,
  selectedDayIndex,
  onSelectDay,
  onSetSlotDetails,
  onRemove,
  onAddMuscle,
  copiedDayIndex,
  onCopyDay,
  onPasteDay,
  highlightedMuscleId,
  onSetAllSets,
}: WeeklyCalendarProps) {
  const days = [1, 2, 3, 4, 5, 6, 7];

  const handleAddMuscle = useCallback(
    (dayIndex: number, muscleId: string) => {
      onAddMuscle?.(dayIndex, muscleId);
    },
    [onAddMuscle],
  );

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
          selectedDayIndex={selectedDayIndex}
          onSetSlotDetails={onSetSlotDetails}
          onRemove={onRemove}
          onAddMuscle={handleAddMuscle}
          copiedDayIndex={copiedDayIndex}
          onCopyDay={onCopyDay}
          onPasteDay={onPasteDay}
          highlightedMuscleId={highlightedMuscleId}
          onSetAllSets={onSetAllSets}
        />
      </div>
      {/* Desktop: responsive grid */}
      <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {days.map(dayIndex => (
          <DayColumn
            key={dayIndex}
            dayIndex={dayIndex}
            slots={slots}
            isSelected={selectedDayIndex === dayIndex}
            onSelectDay={onSelectDay}
            onSetSlotDetails={onSetSlotDetails}
            onRemove={onRemove}
            onAddMuscle={onAddMuscle}
            copiedDayIndex={copiedDayIndex}
            onCopyDay={onCopyDay}
            onPasteDay={onPasteDay}
            highlightedMuscleId={highlightedMuscleId}
            onSetAllSets={onSetAllSets}
          />
        ))}
      </div>
    </>
  );
});
