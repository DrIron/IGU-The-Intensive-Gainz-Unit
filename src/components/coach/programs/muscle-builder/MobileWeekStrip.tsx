import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { DAYS_OF_WEEK, type MuscleSlotData } from "@/types/muscle-builder";

interface MobileWeekStripProps {
  slots: MuscleSlotData[];
  selectedDayIndex: number;
  onSelectDay: (dayIndex: number) => void;
}

export const MobileWeekStrip = memo(function MobileWeekStrip({
  slots,
  selectedDayIndex,
  onSelectDay,
}: MobileWeekStripProps) {
  const slotCountByDay = useMemo(() => {
    const counts = new Map<number, number>();
    for (const slot of slots) {
      counts.set(slot.dayIndex, (counts.get(slot.dayIndex) || 0) + 1);
    }
    return counts;
  }, [slots]);

  return (
    <div className="grid grid-cols-7 gap-1">
      {[1, 2, 3, 4, 5, 6, 7].map(dayIndex => {
        const count = slotCountByDay.get(dayIndex) || 0;
        const isSelected = selectedDayIndex === dayIndex;

        return (
          <button
            key={dayIndex}
            onClick={() => onSelectDay(dayIndex)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs transition-all",
              isSelected
                ? "ring-2 ring-primary bg-primary/10 text-primary font-semibold"
                : "bg-card/50 border border-border/50 text-muted-foreground hover:bg-card",
            )}
          >
            <span className="text-[10px] uppercase tracking-wider">
              {DAYS_OF_WEEK[dayIndex - 1]}
            </span>
            <span className={cn(
              "text-sm font-mono",
              count > 0 ? "text-foreground" : "text-muted-foreground/40",
            )}>
              {count > 0 ? count : "\u00B7"}
            </span>
          </button>
        );
      })}
    </div>
  );
});
