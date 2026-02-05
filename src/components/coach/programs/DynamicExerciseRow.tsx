// src/components/coach/programs/DynamicExerciseRow.tsx
// Exercise row with dynamic, configurable columns

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Trash2,
  Youtube,
  Info,
  History,
} from "lucide-react";
import {
  ColumnConfig,
  ExercisePrescription,
  PrescriptionColumnType,
  getColumnValue,
  setColumnValue,
  EnhancedExerciseDisplay,
} from "@/types/workout-builder";
import { ColumnConfigDropdown } from "./ColumnConfigDropdown";

interface DynamicExerciseRowProps {
  exercise: EnhancedExerciseDisplay;
  columns: ColumnConfig[];
  onColumnsChange: (columns: ColumnConfig[]) => void;
  onPrescriptionChange: (prescription: ExercisePrescription) => void;
  onInstructionsChange: (instructions: string) => void;
  onDelete: () => void;
  onShowHistory?: () => void;
  isDragging?: boolean;
  dragHandleProps?: any;
}

export function DynamicExerciseRow({
  exercise,
  columns,
  onColumnsChange,
  onPrescriptionChange,
  onInstructionsChange,
  onDelete,
  onShowHistory,
  isDragging,
  dragHandleProps,
}: DynamicExerciseRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleColumns = columns.filter((c) => c.visible).sort((a, b) => a.order - b.order);

  const handleColumnValueChange = useCallback(
    (columnType: PrescriptionColumnType, value: string | number | null) => {
      const updated = setColumnValue(exercise.prescription, columnType, value);
      onPrescriptionChange(updated);
    },
    [exercise.prescription, onPrescriptionChange]
  );

  const renderColumnInput = (column: ColumnConfig) => {
    const value = getColumnValue(exercise.prescription, column.type as PrescriptionColumnType);

    // Determine input type based on column
    const isNumeric = ['sets', 'reps', 'weight', 'rir', 'rpe', 'percent_1rm', 'rest', 'time', 'distance'].includes(
      column.type
    );
    const isTextarea = column.type === 'notes';
    const isRepRange = column.type === 'rep_range';

    if (isTextarea) {
      return (
        <Textarea
          value={value?.toString() || ''}
          onChange={(e) => handleColumnValueChange(column.type as PrescriptionColumnType, e.target.value)}
          placeholder={column.placeholder || 'Notes...'}
          className="h-16 text-sm resize-none"
        />
      );
    }

    if (isRepRange) {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            value={exercise.prescription.rep_range_min || ''}
            onChange={(e) =>
              onPrescriptionChange({
                ...exercise.prescription,
                rep_range_min: parseInt(e.target.value) || undefined,
              })
            }
            className="h-8 text-sm w-14 text-center"
            placeholder="Min"
          />
          <span className="text-muted-foreground text-xs">-</span>
          <Input
            type="number"
            min={1}
            value={exercise.prescription.rep_range_max || ''}
            onChange={(e) =>
              onPrescriptionChange({
                ...exercise.prescription,
                rep_range_max: parseInt(e.target.value) || undefined,
              })
            }
            className="h-8 text-sm w-14 text-center"
            placeholder="Max"
          />
        </div>
      );
    }

    return (
      <div className="relative">
        <Input
          type={isNumeric ? 'number' : 'text'}
          value={value?.toString() || ''}
          onChange={(e) =>
            handleColumnValueChange(
              column.type as PrescriptionColumnType,
              isNumeric ? parseFloat(e.target.value) || null : e.target.value
            )
          }
          className="h-8 text-sm"
          placeholder={column.placeholder || column.label}
        />
        {column.unit && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {column.unit}
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      className={`border rounded-lg transition-shadow ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : 'hover:shadow-sm'
      }`}
    >
      {/* Exercise Header Row */}
      <div className="flex items-center gap-2 p-3">
        {/* Drag Handle */}
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Expand/Collapse */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>

        {/* Exercise Name & Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{exercise.exercise.name}</span>
            <Badge variant="outline" className="text-xs shrink-0">
              {exercise.exercise.primary_muscle}
            </Badge>
            {exercise.exercise.default_video_url && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={exercise.exercise.default_video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary"
                    >
                      <Youtube className="h-4 w-4" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>Watch demo video</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Last Performance Hint */}
          {exercise.last_performance && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Last: {exercise.last_performance.performed_reps} reps @{' '}
              {exercise.last_performance.performed_load}kg
              {exercise.last_performance.performed_rir !== undefined &&
                ` (RIR ${exercise.last_performance.performed_rir})`}
            </div>
          )}
        </div>

        {/* Column Config */}
        <ColumnConfigDropdown columns={columns} onColumnsChange={onColumnsChange} />

        {/* History Button */}
        {onShowHistory && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onShowHistory}>
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View exercise history</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Delete Button */}
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
      </div>

      {/* Dynamic Column Inputs */}
      <div className="px-3 pb-3">
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${Math.min(visibleColumns.length, 6)}, minmax(80px, 1fr))`,
          }}
        >
          {visibleColumns.map((column) => (
            <div key={column.id} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                {column.label}
                {column.unit && <span className="text-[10px]">({column.unit})</span>}
              </label>
              {renderColumnInput(column)}
            </div>
          ))}
        </div>
      </div>

      {/* Expanded Content: Instructions & More */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-2 border-t bg-muted/30 space-y-3">
            {/* Instructions */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Instructions for Client
              </label>
              <Textarea
                value={exercise.instructions || ''}
                onChange={(e) => onInstructionsChange(e.target.value)}
                placeholder="Add specific instructions, cues, or notes for this exercise..."
                rows={2}
                className="text-sm"
              />
            </div>

            {/* Personal Best */}
            {exercise.personal_best && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                  PR
                </Badge>
                <span className="text-muted-foreground">
                  {exercise.personal_best.max_load}kg
                  {exercise.personal_best.max_reps_at_weight &&
                    ` x ${exercise.personal_best.max_reps_at_weight} reps`}
                  <span className="text-xs ml-1">
                    ({new Date(exercise.personal_best.date).toLocaleDateString()})
                  </span>
                </span>
              </div>
            )}

            {/* Tempo Info */}
            {exercise.prescription.tempo && (
              <div className="flex items-center gap-2 text-sm">
                <Info className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Tempo {exercise.prescription.tempo}: Eccentric-Pause-Concentric-Pause
                </span>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default DynamicExerciseRow;
