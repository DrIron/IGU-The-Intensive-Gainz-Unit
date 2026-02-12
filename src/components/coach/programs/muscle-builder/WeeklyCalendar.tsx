import { memo } from "react";
import { DayColumn } from "./DayColumn";
import type { MuscleSlotData } from "@/types/muscle-builder";

interface WeeklyCalendarProps {
  slots: MuscleSlotData[];
  selectedDayIndex: number;
  onSelectDay: (dayIndex: number) => void;
  onSetSets: (dayIndex: number, muscleId: string, sets: number) => void;
  onRemove: (dayIndex: number, muscleId: string) => void;
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
  onSetSets,
  onRemove,
  copiedDayIndex,
  onCopyDay,
  onPasteDay,
  highlightedMuscleId,
  onSetAllSets,
}: WeeklyCalendarProps) {
  const days = [1, 2, 3, 4, 5, 6, 7];

  return (
    <>
      {/* Mobile: horizontal snap scroll */}
      <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2 sm:hidden">
        {days.map(dayIndex => (
          <DayColumn
            key={dayIndex}
            dayIndex={dayIndex}
            slots={slots}
            isSelected={selectedDayIndex === dayIndex}
            onSelectDay={onSelectDay}
            onSetSets={onSetSets}
            onRemove={onRemove}
            className="snap-start w-[75vw] max-w-[280px] shrink-0"
            copiedDayIndex={copiedDayIndex}
            onCopyDay={onCopyDay}
            onPasteDay={onPasteDay}
            highlightedMuscleId={highlightedMuscleId}
            onSetAllSets={onSetAllSets}
          />
        ))}
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
            onSetSets={onSetSets}
            onRemove={onRemove}
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
