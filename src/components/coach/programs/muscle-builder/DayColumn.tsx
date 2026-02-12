import { memo, useMemo } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MuscleSlotCard } from "./MuscleSlotCard";
import { DAYS_OF_WEEK, type MuscleSlotData } from "@/types/muscle-builder";

interface DayColumnProps {
  dayIndex: number;
  slots: MuscleSlotData[];
  isSelected: boolean;
  onSelectDay: (dayIndex: number) => void;
  onSetSets: (dayIndex: number, muscleId: string, sets: number) => void;
  onRemove: (dayIndex: number, muscleId: string) => void;
}

export const DayColumn = memo(function DayColumn({
  dayIndex,
  slots,
  isSelected,
  onSelectDay,
  onSetSets,
  onRemove,
}: DayColumnProps) {
  const daySlots = useMemo(
    () => slots.filter(s => s.dayIndex === dayIndex).sort((a, b) => a.sortOrder - b.sortOrder),
    [slots, dayIndex]
  );

  const totalSets = useMemo(
    () => daySlots.reduce((sum, s) => sum + s.sets, 0),
    [daySlots]
  );

  return (
    <Card
      className={`min-w-[140px] flex-1 transition-all cursor-pointer ${
        isSelected ? 'ring-2 ring-primary border-primary/50' : 'border-border/50 hover:border-border'
      }`}
      onClick={() => onSelectDay(dayIndex)}
    >
      <CardHeader className="p-2 pb-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">
            {DAYS_OF_WEEK[dayIndex - 1]}
          </span>
          {totalSets > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground">{totalSets} sets</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <Droppable droppableId={`day-${dayIndex}`} type="MUSCLE_SLOT">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`min-h-[80px] space-y-1 rounded-md transition-colors p-1 ${
                snapshot.isDraggingOver
                  ? 'bg-primary/5 border border-dashed border-primary/50'
                  : 'border border-transparent'
              }`}
            >
              {daySlots.length === 0 && !snapshot.isDraggingOver && (
                <div className="flex items-center justify-center h-[80px] text-[11px] text-muted-foreground/50">
                  Rest day
                </div>
              )}
              {daySlots.map((slot, i) => (
                <MuscleSlotCard
                  key={`${slot.dayIndex}-${slot.muscleId}`}
                  muscleId={slot.muscleId}
                  sets={slot.sets}
                  dayIndex={slot.dayIndex}
                  draggableIndex={i}
                  onSetSets={onSetSets}
                  onRemove={onRemove}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </CardContent>
    </Card>
  );
});
