import { useCallback, useMemo, useRef, useState, memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { GripVertical, Trash2, History, Plus, TrendingUp, Settings2 } from "lucide-react";
import {
  ColumnConfig,
  EnhancedExerciseDisplayV2,
  SetPrescription,
  ProgressionConfig,
  DEFAULT_PROGRESSION_CONFIG,
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

export const ExerciseCardV2 = memo(function ExerciseCardV2({
  exercise,
  onExerciseChange,
  onDelete,
  onShowHistory,
  isDragging,
  dragHandleProps,
  isReadOnly,
}: ExerciseCardV2Props) {
  // Stable per-index callback maps to avoid creating new functions on every render
  const setChangeCallbacksRef = useRef<Map<number, (updated: SetPrescription) => void>>(new Map());
  const deleteSetCallbacksRef = useRef<Map<number, () => void>>(new Map());

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

  // Get stable per-index callbacks
  const getSetChangeCallback = useCallback(
    (index: number) => {
      // Invalidate cache when handleSetChange changes
      const existing = setChangeCallbacksRef.current.get(index);
      if (existing) return existing;
      const cb = (updated: SetPrescription) => handleSetChange(index, updated);
      setChangeCallbacksRef.current.set(index, cb);
      return cb;
    },
    [handleSetChange]
  );

  const getDeleteSetCallback = useCallback(
    (index: number) => {
      const existing = deleteSetCallbacksRef.current.get(index);
      if (existing) return existing;
      const cb = () => handleDeleteSet(index);
      deleteSetCallbacksRef.current.set(index, cb);
      return cb;
    },
    [handleDeleteSet]
  );

  // Clear callback caches when the underlying handlers change
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: clear cache when handler changes
  useMemo(() => { setChangeCallbacksRef.current = new Map(); }, [handleSetChange]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: clear cache when handler changes
  useMemo(() => { deleteSetCallbacksRef.current = new Map(); }, [handleDeleteSet]);

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

  // Stable callback for instructions textarea
  const handleInstructionsChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onExerciseChange({ instructions: e.target.value });
    },
    [onExerciseChange]
  );

  // Linear Progression config state (popover open)
  const [progressionPopoverOpen, setProgressionPopoverOpen] = useState(false);

  const hasRirOrRpe = exercise.prescription_columns.some(
    (c) => c.visible && (c.type === "rir" || c.type === "rpe")
  );

  const handleToggleProgression = useCallback(
    (enabled: boolean) => {
      onExerciseChange({
        linear_progression_enabled: enabled,
        progression_config: enabled
          ? (exercise.progression_config ?? DEFAULT_PROGRESSION_CONFIG)
          : exercise.progression_config,
      });
    },
    [onExerciseChange, exercise.progression_config]
  );

  const handleProgressionConfigChange = useCallback(
    (updates: Partial<ProgressionConfig>) => {
      const current = exercise.progression_config ?? DEFAULT_PROGRESSION_CONFIG;
      onExerciseChange({
        progression_config: { ...current, ...updates },
      });
    },
    [onExerciseChange, exercise.progression_config]
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
          onChange={handleInstructionsChange}
          placeholder="Add coaching notes..."
          rows={1}
          className="text-sm resize-none min-h-[32px]"
          disabled={isReadOnly}
        />
      </div>

      {/* Linear Progression Toggle */}
      {!isReadOnly && (
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Linear Progression</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Switch
                    checked={exercise.linear_progression_enabled ?? false}
                    onCheckedChange={handleToggleProgression}
                    disabled={!hasRirOrRpe}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </TooltipTrigger>
                {!hasRirOrRpe && (
                  <TooltipContent>
                    Enable RIR or RPE columns first
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
          {exercise.linear_progression_enabled && (
            <Popover
              open={progressionPopoverOpen}
              onOpenChange={setProgressionPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Progression Settings</h4>

                  {/* Unit toggle */}
                  <div className="space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <div className="flex gap-1">
                      {(["kg", "lb"] as const).map((u) => (
                        <Button
                          key={u}
                          variant={
                            (exercise.progression_config?.unit ??
                              DEFAULT_PROGRESSION_CONFIG.unit) === u
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          className="flex-1 h-7 text-xs"
                          onClick={() =>
                            handleProgressionConfigChange({ unit: u })
                          }
                        >
                          {u}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Load increment */}
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Load Increment (
                      {(exercise.progression_config?.unit ??
                        DEFAULT_PROGRESSION_CONFIG.unit) === "kg"
                        ? "kg"
                        : "lb"}
                      )
                    </Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      className="h-8 text-sm"
                      value={
                        (exercise.progression_config?.unit ??
                          DEFAULT_PROGRESSION_CONFIG.unit) === "kg"
                          ? (exercise.progression_config?.load_increment_kg ??
                              DEFAULT_PROGRESSION_CONFIG.load_increment_kg)
                          : (exercise.progression_config?.load_increment_lb ??
                              DEFAULT_PROGRESSION_CONFIG.load_increment_lb)
                      }
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const unit =
                          exercise.progression_config?.unit ??
                          DEFAULT_PROGRESSION_CONFIG.unit;
                        handleProgressionConfigChange(
                          unit === "kg"
                            ? { load_increment_kg: val }
                            : { load_increment_lb: val }
                        );
                      }}
                    />
                  </div>

                  {/* RIR threshold */}
                  <div className="space-y-1">
                    <Label className="text-xs">
                      RIR Surplus Threshold
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      className="h-8 text-sm"
                      value={
                        exercise.progression_config?.rir_threshold ??
                        DEFAULT_PROGRESSION_CONFIG.rir_threshold
                      }
                      onChange={(e) =>
                        handleProgressionConfigChange({
                          rir_threshold: parseInt(e.target.value) || 2,
                        })
                      }
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Suggest increase when RIR surplus is at least this value
                    </p>
                  </div>

                  {/* Rep range check */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="rep-range-check"
                      checked={
                        exercise.progression_config?.rep_range_check ??
                        DEFAULT_PROGRESSION_CONFIG.rep_range_check
                      }
                      onCheckedChange={(checked) =>
                        handleProgressionConfigChange({
                          rep_range_check: !!checked,
                        })
                      }
                    />
                    <Label htmlFor="rep-range-check" className="text-xs">
                      Require hitting top of rep range before load increase
                    </Label>
                  </div>

                  {/* Suggestion style */}
                  <div className="space-y-1">
                    <Label className="text-xs">Suggestion Style</Label>
                    <div className="flex gap-1">
                      {(
                        [
                          { value: "gentle", label: "Gentle" },
                          { value: "direct", label: "Direct" },
                          { value: "data_only", label: "Data" },
                        ] as const
                      ).map((s) => (
                        <Button
                          key={s.value}
                          variant={
                            (exercise.progression_config?.suggestion_style ??
                              DEFAULT_PROGRESSION_CONFIG.suggestion_style) ===
                            s.value
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          className="flex-1 h-7 text-xs"
                          onClick={() =>
                            handleProgressionConfigChange({
                              suggestion_style: s.value,
                            })
                          }
                        >
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

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
                onSetChange={getSetChangeCallback(index)}
                onDeleteSet={getDeleteSetCallback(index)}
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
}, (prevProps, nextProps) => {
  return (
    prevProps.exercise.id === nextProps.exercise.id &&
    prevProps.exercise.sets === nextProps.exercise.sets &&
    prevProps.exercise.instructions === nextProps.exercise.instructions &&
    prevProps.exercise.prescription_columns === nextProps.exercise.prescription_columns &&
    prevProps.exercise.input_columns === nextProps.exercise.input_columns &&
    prevProps.exercise.linear_progression_enabled === nextProps.exercise.linear_progression_enabled &&
    prevProps.exercise.progression_config === nextProps.exercise.progression_config &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isReadOnly === nextProps.isReadOnly &&
    prevProps.onExerciseChange === nextProps.onExerciseChange &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onShowHistory === nextProps.onShowHistory &&
    prevProps.exercise.last_performance === nextProps.exercise.last_performance &&
    prevProps.exercise.exercise.name === nextProps.exercise.exercise.name &&
    prevProps.exercise.exercise.primary_muscle === nextProps.exercise.exercise.primary_muscle &&
    prevProps.exercise.exercise.default_video_url === nextProps.exercise.exercise.default_video_url
  );
});
