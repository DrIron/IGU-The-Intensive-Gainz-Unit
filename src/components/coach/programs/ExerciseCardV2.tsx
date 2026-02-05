import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GripVertical, Trash2, History, Plus } from "lucide-react";
import {
  ColumnConfig,
  EnhancedExerciseDisplayV2,
  SetPrescription,
} from "@/types/workout-builder";
import { VideoThumbnail } from "./VideoThumbnail";
import { SetRowEditor } from "./SetRowEditor";
import { ColumnCategoryHeader } from "./ColumnCategoryHeader";
import { ColumnConfigDropdown } from "./ColumnConfigDropdown";

interface ExerciseCardV2Props {
  exercise: EnhancedExerciseDisplayV2;
  onExerciseChange: (updates: Partial<EnhancedExerciseDisplayV2>) => void;
  onDelete: () => void;
  onShowHistory?: () => void;
  isDragging?: boolean;
  dragHandleProps?: any;
  isReadOnly?: boolean;
}

export function ExerciseCardV2({
  exercise,
  onExerciseChange,
  onDelete,
  onShowHistory,
  isDragging,
  dragHandleProps,
  isReadOnly,
}: ExerciseCardV2Props) {
  const handleSetChange = useCallback(
    (setIndex: number, updated: SetPrescription) => {
      const newSets = [...exercise.sets];
      newSets[setIndex] = updated;
      onExerciseChange({ sets: newSets });
    },
    [exercise.sets, onExerciseChange]
  );

  const handleDeleteSet = useCallback(
    (setIndex: number) => {
      if (exercise.sets.length <= 1) return;
      const newSets = exercise.sets
        .filter((_, i) => i !== setIndex)
        .map((s, i) => ({ ...s, set_number: i + 1 }));
      onExerciseChange({ sets: newSets });
    },
    [exercise.sets, onExerciseChange]
  );

  const handleAddSet = useCallback(() => {
    const lastSet = exercise.sets[exercise.sets.length - 1];
    const newSet: SetPrescription = lastSet
      ? { ...lastSet, set_number: lastSet.set_number + 1 }
      : { set_number: exercise.sets.length + 1 };
    onExerciseChange({ sets: [...exercise.sets, newSet] });
  }, [exercise.sets, onExerciseChange]);

  const handleAddPrescriptionColumn = useCallback(
    (column: ColumnConfig) => {
      onExerciseChange({
        prescription_columns: [...exercise.prescription_columns, column],
      });
    },
    [exercise.prescription_columns, onExerciseChange]
  );

  const handleAddInputColumn = useCallback(
    (column: ColumnConfig) => {
      onExerciseChange({
        input_columns: [...exercise.input_columns, column],
      });
    },
    [exercise.input_columns, onExerciseChange]
  );

  const handleRemoveColumn = useCallback(
    (columnId: string) => {
      const inPrescription = exercise.prescription_columns.some(
        (c) => c.id === columnId
      );
      if (inPrescription) {
        onExerciseChange({
          prescription_columns: exercise.prescription_columns.filter(
            (c) => c.id !== columnId
          ),
        });
      } else {
        onExerciseChange({
          input_columns: exercise.input_columns.filter(
            (c) => c.id !== columnId
          ),
        });
      }
    },
    [exercise.prescription_columns, exercise.input_columns, onExerciseChange]
  );

  const handleReorderPrescriptionColumns = useCallback(
    (reordered: ColumnConfig[]) => {
      // Merge reordered visible columns back with hidden ones
      const hidden = exercise.prescription_columns.filter(
        (c) => !c.visible || c.type === "sets"
      );
      onExerciseChange({ prescription_columns: [...reordered, ...hidden] });
    },
    [exercise.prescription_columns, onExerciseChange]
  );

  const handleReorderInputColumns = useCallback(
    (reordered: ColumnConfig[]) => {
      const hidden = exercise.input_columns.filter((c) => !c.visible);
      onExerciseChange({ input_columns: [...reordered, ...hidden] });
    },
    [exercise.input_columns, onExerciseChange]
  );

  // Handle column config changes from the ColumnConfigDropdown (presets/reorder)
  const handleColumnsChange = useCallback(
    (columns: ColumnConfig[]) => {
      onExerciseChange({ prescription_columns: columns });
    },
    [onExerciseChange]
  );

  return (
    <div
      className={`border rounded-lg transition-shadow bg-card ${
        isDragging ? "shadow-lg ring-2 ring-primary" : "shadow-sm hover:shadow-md"
      }`}
    >
      {/* Title Row */}
      <div className="flex items-center gap-2 p-3 border-b">
        {/* Drag Handle */}
        {!isReadOnly && (
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing shrink-0"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        {/* Video Thumbnail */}
        <VideoThumbnail
          videoUrl={exercise.exercise.default_video_url}
          exerciseName={exercise.exercise.name}
        />

        {/* Exercise Name & Muscle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {exercise.exercise.name}
            </span>
            <Badge variant="outline" className="text-xs shrink-0">
              {exercise.exercise.primary_muscle}
            </Badge>
          </div>
          {exercise.last_performance && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Last: {exercise.last_performance.performed_reps} reps @{" "}
              {exercise.last_performance.performed_load}kg
              {exercise.last_performance.performed_rir !== undefined &&
                ` (RIR ${exercise.last_performance.performed_rir})`}
            </div>
          )}
        </div>

        {/* Column Config (gear) */}
        {!isReadOnly && (
          <ColumnConfigDropdown
            columns={exercise.prescription_columns}
            onColumnsChange={handleColumnsChange}
          />
        )}

        {/* History */}
        {onShowHistory && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={onShowHistory}
                >
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View exercise history</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Delete */}
        {!isReadOnly && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove exercise</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Coach Instructions */}
      <div className="px-3 py-2 border-b">
        <Textarea
          value={exercise.instructions || ""}
          onChange={(e) => onExerciseChange({ instructions: e.target.value })}
          placeholder="Add coaching notes..."
          rows={1}
          className="text-sm resize-none min-h-[32px]"
          disabled={isReadOnly}
        />
      </div>

      {/* Sets Table */}
      <div className="overflow-x-auto">
        <Table>
          <ColumnCategoryHeader
            prescriptionColumns={exercise.prescription_columns}
            inputColumns={exercise.input_columns}
            onAddPrescriptionColumn={handleAddPrescriptionColumn}
            onAddInputColumn={handleAddInputColumn}
            onRemoveColumn={handleRemoveColumn}
            onReorderPrescriptionColumns={handleReorderPrescriptionColumns}
            onReorderInputColumns={handleReorderInputColumns}
            isReadOnly={isReadOnly}
          />
          <TableBody>
            {exercise.sets.map((set, index) => (
              <SetRowEditor
                key={set.set_number}
                set={set}
                setIndex={index}
                prescriptionColumns={exercise.prescription_columns}
                inputColumns={exercise.input_columns}
                onSetChange={(updated) => handleSetChange(index, updated)}
                onDeleteSet={() => handleDeleteSet(index)}
                isReadOnly={isReadOnly}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add Set Button */}
      {!isReadOnly && (
        <div className="flex justify-end p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddSet}
            className="text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Set
          </Button>
        </div>
      )}
    </div>
  );
}
