import { memo, useCallback, useState } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMuscleDisplay } from "@/types/muscle-builder";

interface MuscleSlotCardProps {
  slotId: string;
  muscleId: string;
  sets: number;
  draggableIndex: number;
  onSetSets: (slotId: string, sets: number) => void;
  onRemove: (slotId: string) => void;
  isHighlighted?: boolean;
  onSetAllSets?: (muscleId: string, sets: number) => void;
  alwaysShowControls?: boolean;
}

export const MuscleSlotCard = memo(function MuscleSlotCard({
  slotId,
  muscleId,
  sets,
  draggableIndex,
  onSetSets,
  onRemove,
  isHighlighted,
  onSetAllSets,
  alwaysShowControls,
}: MuscleSlotCardProps) {
  const [bulkOpen, setBulkOpen] = useState(false);

  const handleSetsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val)) {
        onSetSets(slotId, val);
      }
    },
    [slotId, onSetSets]
  );

  const handleRemove = useCallback(() => {
    onRemove(slotId);
  }, [slotId, onRemove]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onSetSets(slotId, sets + 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onSetSets(slotId, sets - 1);
      }
    },
    [slotId, sets, onSetSets]
  );

  const handleBulkApply = useCallback(() => {
    onSetAllSets?.(muscleId, sets);
    setBulkOpen(false);
  }, [muscleId, sets, onSetAllSets]);

  const muscle = getMuscleDisplay(muscleId);
  if (!muscle) return null;

  return (
    <Draggable draggableId={`slot-${slotId}`} index={draggableIndex}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={cn(
            `group flex items-center gap-2 px-2 py-1.5 rounded-md border text-sm transition-all cursor-grab active:cursor-grabbing`,
            snapshot.isDragging
              ? 'shadow-lg ring-2 ring-primary/50 bg-card'
              : 'bg-card/50 border-border/50 hover:border-border',
            isHighlighted && 'ring-2 ring-primary animate-pulse bg-primary/10',
          )}
          style={{
            ...provided.draggableProps.style,
            backgroundColor: snapshot.isDragging || isHighlighted ? undefined : `${muscle.colorHex}08`,
          }}
        >
          <div className={`w-2 h-2 rounded-full shrink-0 ${muscle.colorClass}`} />
          {onSetAllSets ? (
            <Popover open={bulkOpen} onOpenChange={setBulkOpen}>
              <PopoverTrigger asChild>
                <span
                  className="font-medium truncate flex-1 text-foreground cursor-pointer hover:underline"
                  onDoubleClick={e => { e.stopPropagation(); setBulkOpen(true); }}
                >
                  {muscle.label}
                </span>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" onClick={e => e.stopPropagation()}>
                <p className="text-sm mb-2">
                  Set all <strong>{muscle.label}</strong> to {sets} sets?
                </p>
                <Button size="sm" onClick={handleBulkApply}>
                  Apply to all days
                </Button>
              </PopoverContent>
            </Popover>
          ) : (
            <span className="font-medium truncate flex-1 text-foreground">{muscle.label}</span>
          )}
          <Input
            type="number"
            min={1}
            max={20}
            value={sets}
            onChange={handleSetsChange}
            onKeyDown={handleKeyDown}
            className="w-12 h-6 text-center text-xs px-1 bg-background/50"
            onClick={e => e.stopPropagation()}
          />
          <span className="text-[10px] text-muted-foreground">sets</span>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-5 w-5 transition-opacity shrink-0",
              alwaysShowControls ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </Draggable>
  );
});
