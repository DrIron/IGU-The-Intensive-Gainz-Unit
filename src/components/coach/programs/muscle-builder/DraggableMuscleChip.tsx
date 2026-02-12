import { memo } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import type { MuscleGroupDef } from "@/types/muscle-builder";

interface DraggableMuscleChipProps {
  muscle: MuscleGroupDef;
  index: number;
  placementCount: number;
}

export const DraggableMuscleChip = memo(function DraggableMuscleChip({
  muscle,
  index,
  placementCount,
}: DraggableMuscleChipProps) {
  return (
    <Draggable draggableId={`palette-${muscle.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm cursor-grab active:cursor-grabbing border transition-colors ${
            snapshot.isDragging
              ? 'shadow-lg ring-2 ring-primary/50 bg-card'
              : 'bg-card/50 hover:bg-card border-border/50'
          }`}
        >
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${muscle.colorClass}`} />
          <span className="font-medium text-foreground">{muscle.label}</span>
          {placementCount > 0 && (
            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] leading-none">
              {placementCount}
            </Badge>
          )}
        </div>
      )}
    </Draggable>
  );
});
