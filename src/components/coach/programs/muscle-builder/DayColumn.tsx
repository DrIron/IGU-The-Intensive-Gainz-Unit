import { memo, useMemo } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, ClipboardPaste } from "lucide-react";
import { cn } from "@/lib/utils";
import { MuscleSlotCard } from "./MuscleSlotCard";
import { DAYS_OF_WEEK, type MuscleSlotData } from "@/types/muscle-builder";

interface DayColumnProps {
  dayIndex: number;
  slots: MuscleSlotData[];
  isSelected: boolean;
  onSelectDay: (dayIndex: number) => void;
  onSetSets: (slotId: string, sets: number) => void;
  onRemove: (slotId: string) => void;
  className?: string;
  copiedDayIndex?: number | null;
  onCopyDay?: (dayIndex: number) => void;
  onPasteDay?: (dayIndex: number) => void;
  highlightedMuscleId?: string | null;
  onSetAllSets?: (muscleId: string, sets: number) => void;
}

export const DayColumn = memo(function DayColumn({
  dayIndex,
  slots,
  isSelected,
  onSelectDay,
  onSetSets,
  onRemove,
  className,
  copiedDayIndex,
  onCopyDay,
  onPasteDay,
  highlightedMuscleId,
  onSetAllSets,
}: DayColumnProps) {
  const daySlots = useMemo(
    () => slots.filter(s => s.dayIndex === dayIndex).sort((a, b) => a.sortOrder - b.sortOrder),
    [slots, dayIndex]
  );

  const totalSets = useMemo(
    () => daySlots.reduce((sum, s) => sum + s.sets, 0),
    [daySlots]
  );

  const hasCopied = copiedDayIndex != null;
  const isCopiedDay = copiedDayIndex === dayIndex;

  return (
    <Card
      data-day-index={dayIndex}
      className={cn(
        `group min-w-[140px] flex-1 transition-all cursor-pointer`,
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
            {/* Copy button — visible on hover when day has slots */}
            {daySlots.length > 0 && onCopyDay && (
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
            {/* Paste button — visible when another day is copied */}
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
          </div>
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
                  key={slot.id}
                  slotId={slot.id}
                  muscleId={slot.muscleId}
                  sets={slot.sets}
                  draggableIndex={i}
                  onSetSets={onSetSets}
                  onRemove={onRemove}
                  isHighlighted={highlightedMuscleId === slot.muscleId}
                  onSetAllSets={onSetAllSets}
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
