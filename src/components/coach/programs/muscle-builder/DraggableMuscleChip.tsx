import { memo } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import type { MuscleGroupDef } from "@/types/muscle-builder";

interface DraggableMuscleChipProps {
  muscle: MuscleGroupDef | { id: string; label: string; colorClass: string; colorHex: string };
  index: number;
  placementCount: number;
  isSubdivision?: boolean;
}

export const DraggableMuscleChip = memo(function DraggableMuscleChip({
  muscle,
  index,
  placementCount,
  isSubdivision,
}: DraggableMuscleChipProps) {
  return (
    <Draggable draggableId={`palette-${muscle.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`inline-flex items-center gap-1.5 rounded-md cursor-grab active:cursor-grabbing border transition-colors ${
            isSubdivision
              ? 'px-2 py-1 text-xs ml-3 border-dashed border-border/40'
              : 'px-2.5 py-1.5 text-sm'
          } ${
            snapshot.isDragging
              ? 'shadow-lg ring-2 ring-primary/50 bg-card'
              : 'bg-card/50 hover:bg-card border-border/50'
          }`}
        >
          <div
            className={`rounded-full shrink-0 ${muscle.colorClass} ${isSubdivision ? 'w-2 h-2' : 'w-2.5 h-2.5'}`}
            style={isSubdivision ? { opacity: 0.7 } : undefined}
          />
          <span className={`font-medium text-foreground ${isSubdivision ? 'text-muted-foreground' : ''}`}>
            {muscle.label}
          </span>
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
