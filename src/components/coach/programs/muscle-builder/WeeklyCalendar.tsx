import { memo, useCallback } from "react";
import { DayColumn } from "./DayColumn";
import type { MuscleSlotData } from "@/types/muscle-builder";

interface WeeklyCalendarProps {
  slots: MuscleSlotData[];
  selectedDayIndex: number;
  onSelectDay: (dayIndex: number) => void;
  onSetSets: (dayIndex: number, muscleId: string, sets: number) => void;
  onRemove: (dayIndex: number, muscleId: string) => void;
}

export const WeeklyCalendar = memo(function WeeklyCalendar({
  slots,
  selectedDayIndex,
  onSelectDay,
  onSetSets,
  onRemove,
}: WeeklyCalendarProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
      {[1, 2, 3, 4, 5, 6, 7].map(dayIndex => (
        <DayColumn
          key={dayIndex}
          dayIndex={dayIndex}
          slots={slots}
          isSelected={selectedDayIndex === dayIndex}
          onSelectDay={onSelectDay}
          onSetSets={onSetSets}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
});
