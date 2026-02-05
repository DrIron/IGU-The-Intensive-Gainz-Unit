// src/components/coach/programs/EnhancedModuleExerciseEditor.tsx
// V2 Exercise editor with per-set rows and dual column categories

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, AlertCircle } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { ExerciseCardV2 } from "./ExerciseCardV2";
import { WarmupSection } from "./WarmupSection";
import { ExercisePickerDialog } from "./ExercisePickerDialog";
import {
  ColumnConfig,
  EnhancedExerciseDisplayV2,
  SetPrescription,
  DEFAULT_PRESCRIPTION_COLUMNS,
  DEFAULT_INPUT_COLUMNS,
  ExerciseSection,
  EXERCISE_SECTIONS,
  splitColumnsByCategory,
  legacyPrescriptionToSets,
} from "@/types/workout-builder";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

interface EnhancedModuleExerciseEditorProps {
  moduleId: string;
  coachUserId: string;
  isReadOnly?: boolean;
}

interface GroupedExercises {
  warmup: EnhancedExerciseDisplayV2[];
  main: EnhancedExerciseDisplayV2[];
  accessory: EnhancedExerciseDisplayV2[];
  cooldown: EnhancedExerciseDisplayV2[];
}

export function EnhancedModuleExerciseEditor({
  moduleId,
  coachUserId,
  isReadOnly = false,
}: EnhancedModuleExerciseEditorProps) {
  const [exercises, setExercises] = useState<EnhancedExerciseDisplayV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [addToSection, setAddToSection] = useState<ExerciseSection>("main");
  const [defaultColumns, setDefaultColumns] = useState<ColumnConfig[]>(DEFAULT_PRESCRIPTION_COLUMNS);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const hasFetchedExercises = useRef(false);
  const { toast } = useToast();

  // Group exercises by section
  const groupedExercises: GroupedExercises = {
    warmup: exercises.filter((e) => e.section === "warmup").sort((a, b) => a.sort_order - b.sort_order),
    main: exercises.filter((e) => e.section === "main").sort((a, b) => a.sort_order - b.sort_order),
    accessory: exercises.filter((e) => e.section === "accessory").sort((a, b) => a.sort_order - b.sort_order),
    cooldown: exercises.filter((e) => e.section === "cooldown").sort((a, b) => a.sort_order - b.sort_order),
  };

  // Load exercises
  const loadExercises = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("module_exercises")
        .select(`
          *,
          exercise_library(*),
          exercise_prescriptions(*)
        `)
        .eq("day_module_id", moduleId)
        .order("section")
        .order("sort_order");

      if (error) throw error;

      const enhanced: EnhancedExerciseDisplayV2[] = (data || []).map((ex) => {
        const prescription = ex.exercise_prescriptions?.[0] || {};

        // Build legacy prescription object
        const legacyPrescription = {
          set_count: prescription.set_count || 3,
          rep_range_min: prescription.rep_range_min,
          rep_range_max: prescription.rep_range_max,
          tempo: prescription.tempo,
          rest_seconds: prescription.rest_seconds,
          rir: prescription.intensity_type === "RIR" ? prescription.intensity_value : undefined,
          rpe: prescription.intensity_type === "RPE" ? prescription.intensity_value : undefined,
          percent_1rm: prescription.intensity_type === "PERCENT_1RM" ? prescription.intensity_value : undefined,
          notes: prescription.progression_notes,
          custom_fields: prescription.custom_fields_json as Record<string, string | number> | undefined,
        };

        // Parse per-set data (V2) or expand from legacy
        let sets: SetPrescription[];
        const setsJson = (prescription as any).sets_json;
        if (setsJson && Array.isArray(setsJson)) {
          sets = setsJson;
        } else {
          sets = legacyPrescriptionToSets(legacyPrescription);
        }

        // Split column config into prescription vs input categories
        const allColumns: ColumnConfig[] =
          prescription.column_config && Array.isArray(prescription.column_config)
            ? (prescription.column_config as ColumnConfig[])
            : DEFAULT_PRESCRIPTION_COLUMNS;

        const { prescriptionColumns, inputColumns } = splitColumnsByCategory(allColumns);
        const finalInputColumns = inputColumns.length > 0 ? inputColumns : DEFAULT_INPUT_COLUMNS;

        return {
          id: ex.id,
          exercise_id: ex.exercise_id,
          section: ex.section as ExerciseSection,
          sort_order: ex.sort_order,
          instructions: ex.instructions,
          prescription: legacyPrescription,
          sets,
          prescription_columns: prescriptionColumns,
          input_columns: finalInputColumns,
          column_config: allColumns,
          exercise: {
            name: ex.exercise_library?.name || "Unknown Exercise",
            primary_muscle: ex.exercise_library?.primary_muscle || "",
            default_video_url: ex.exercise_library?.default_video_url,
          },
        };
      });

      setExercises(enhanced);
    } catch (error: any) {
      toast({
        title: "Error loading exercises",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [moduleId, toast]);

  useEffect(() => {
    if (hasFetchedExercises.current) return;
    hasFetchedExercises.current = true;
    loadExercises();
  }, [loadExercises]);

  // Load coach's default column preset
  useEffect(() => {
    const loadDefaultPreset = async () => {
      const { data } = await supabase
        .from("coach_column_presets")
        .select("column_config")
        .eq("coach_id", coachUserId)
        .eq("is_default", true)
        .single();

      if (data?.column_config) {
        setDefaultColumns(data.column_config as ColumnConfig[]);
      }
    };

    loadDefaultPreset();
  }, [coachUserId]);

  // Add exercise
  const addExercise = async (exerciseId: string, section: ExerciseSection) => {
    try {
      const sectionExercises = exercises.filter((e) => e.section === section);
      const maxOrder = Math.max(0, ...sectionExercises.map((e) => e.sort_order));

      const { data: newExercise, error: exerciseError } = await supabase
        .from("module_exercises")
        .insert({
          day_module_id: moduleId,
          exercise_id: exerciseId,
          section,
          sort_order: maxOrder + 1,
        })
        .select(`
          *,
          exercise_library(*)
        `)
        .single();

      if (exerciseError) throw exerciseError;

      // Create default sets
      const defaultSets: SetPrescription[] = [
        { set_number: 1, rep_range_min: 8, rep_range_max: 12, rest_seconds: 90, rir: 2 },
        { set_number: 2, rep_range_min: 8, rep_range_max: 12, rest_seconds: 90, rir: 2 },
        { set_number: 3, rep_range_min: 8, rep_range_max: 12, rest_seconds: 90, rir: 2 },
      ];

      // Split default columns
      const { prescriptionColumns, inputColumns } = splitColumnsByCategory(defaultColumns);
      const finalInputColumns = inputColumns.length > 0 ? inputColumns : DEFAULT_INPUT_COLUMNS;

      const { error: prescError } = await supabase
        .from("exercise_prescriptions")
        .insert({
          module_exercise_id: newExercise.id,
          set_count: 3,
          rep_range_min: 8,
          rep_range_max: 12,
          rest_seconds: 90,
          intensity_type: "RIR",
          intensity_value: 2,
          column_config: [...prescriptionColumns, ...finalInputColumns],
          sets_json: defaultSets,
        })
        .select()
        .single();

      if (prescError) throw prescError;

      const enhanced: EnhancedExerciseDisplayV2 = {
        id: newExercise.id,
        exercise_id: newExercise.exercise_id,
        section: section,
        sort_order: newExercise.sort_order,
        instructions: null,
        prescription: {
          set_count: 3,
          rep_range_min: 8,
          rep_range_max: 12,
          rest_seconds: 90,
          rir: 2,
        },
        sets: defaultSets,
        prescription_columns: prescriptionColumns,
        input_columns: finalInputColumns,
        column_config: [...prescriptionColumns, ...finalInputColumns],
        exercise: {
          name: newExercise.exercise_library?.name || "Unknown",
          primary_muscle: newExercise.exercise_library?.primary_muscle || "",
          default_video_url: newExercise.exercise_library?.default_video_url,
        },
      };

      setExercises([...exercises, enhanced]);
      setShowExercisePicker(false);

      toast({
        title: "Exercise added",
        description: `${enhanced.exercise.name} added to ${section}`,
      });
    } catch (error: any) {
      toast({
        title: "Error adding exercise",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Update exercise
  const updateExercise = (exerciseId: string, updates: Partial<EnhancedExerciseDisplayV2>) => {
    setExercises((prev) =>
      prev.map((ex) => (ex.id === exerciseId ? { ...ex, ...updates } : ex))
    );
    setHasUnsavedChanges(true);
  };

  // Delete exercise
  const deleteExercise = async (exerciseId: string) => {
    try {
      const { error } = await supabase.from("module_exercises").delete().eq("id", exerciseId);

      if (error) throw error;

      setExercises((prev) => prev.filter((ex) => ex.id !== exerciseId));

      toast({
        title: "Exercise removed",
      });
    } catch (error: any) {
      toast({
        title: "Error removing exercise",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Save all changes
  const saveChanges = async () => {
    setSaving(true);
    try {
      for (const exercise of exercises) {
        // Derive legacy intensity from first set
        const firstSet = exercise.sets[0];
        let intensityType: "RIR" | "RPE" | "PERCENT_1RM" | "TARGET_LOAD" | "OTHER" | null = null;
        let intensityValue: number | null = null;

        if (firstSet?.rir !== undefined) {
          intensityType = "RIR";
          intensityValue = firstSet.rir;
        } else if (firstSet?.rpe !== undefined) {
          intensityType = "RPE";
          intensityValue = firstSet.rpe;
        } else if (firstSet?.percent_1rm !== undefined) {
          intensityType = "PERCENT_1RM";
          intensityValue = firstSet.percent_1rm;
        }

        // Update module_exercise
        await supabase
          .from("module_exercises")
          .update({
            section: exercise.section,
            sort_order: exercise.sort_order,
            instructions: exercise.instructions,
          })
          .eq("id", exercise.id);

        // Update or create prescription
        const { data: existingPrescription } = await supabase
          .from("exercise_prescriptions")
          .select("id")
          .eq("module_exercise_id", exercise.id)
          .single();

        const prescriptionData = {
          // V2: per-set data
          sets_json: exercise.sets,

          // Legacy: first-set values for backward compatibility
          set_count: exercise.sets.length,
          rep_range_min: firstSet?.rep_range_min,
          rep_range_max: firstSet?.rep_range_max,
          tempo: firstSet?.tempo,
          rest_seconds: firstSet?.rest_seconds,
          intensity_type: intensityType,
          intensity_value: intensityValue,
          progression_notes: firstSet?.notes,
          custom_fields_json: firstSet?.custom_fields,

          // Recombine columns for storage
          column_config: [...exercise.prescription_columns, ...exercise.input_columns],
        };

        if (existingPrescription) {
          await supabase
            .from("exercise_prescriptions")
            .update(prescriptionData)
            .eq("id", existingPrescription.id);
        } else {
          await supabase.from("exercise_prescriptions").insert({
            module_exercise_id: exercise.id,
            ...prescriptionData,
          });
        }
      }

      setHasUnsavedChanges(false);
      toast({
        title: "Changes saved",
        description: "All exercise configurations have been saved.",
      });
    } catch (error: any) {
      toast({
        title: "Error saving changes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle drag and drop
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceSection = result.source.droppableId as ExerciseSection;
    const destSection = result.destination.droppableId as ExerciseSection;
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;

    const newExercises = [...exercises];
    const sourceItems = newExercises.filter((e) => e.section === sourceSection);
    const [movedItem] = sourceItems.splice(sourceIndex, 1);

    movedItem.section = destSection;

    const destItems = newExercises.filter((e) => e.section === destSection && e.id !== movedItem.id);
    destItems.splice(destIndex, 0, movedItem);

    destItems.forEach((item, index) => {
      item.sort_order = index + 1;
    });

    const updatedExercises = newExercises.map((ex) => {
      if (ex.id === movedItem.id) return movedItem;
      const destItem = destItems.find((d) => d.id === ex.id);
      if (destItem) return destItem;
      return ex;
    });

    setExercises(updatedExercises);
    setHasUnsavedChanges(true);
  };

  const renderSectionContent = (section: { value: ExerciseSection; label: string }) => {
    const sectionExercises = groupedExercises[section.value];

    return (
      <Droppable droppableId={section.value}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`space-y-3 min-h-[60px] p-2 rounded-lg border-2 border-dashed transition-colors ${
              snapshot.isDraggingOver
                ? "border-primary bg-primary/5"
                : "border-transparent"
            }`}
          >
            {sectionExercises.map((exercise, index) => (
              <Draggable key={exercise.id} draggableId={exercise.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                  >
                    <ExerciseCardV2
                      exercise={exercise}
                      onExerciseChange={(updates) =>
                        updateExercise(exercise.id, updates)
                      }
                      onDelete={() => deleteExercise(exercise.id)}
                      isDragging={snapshot.isDragging}
                      dragHandleProps={provided.dragHandleProps}
                      isReadOnly={isReadOnly}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {sectionExercises.length === 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No exercises in {section.label.toLowerCase()}. Drag exercises here or add new ones.
              </div>
            )}
          </div>
        )}
      </Droppable>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{exercises.length} exercises</Badge>
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
              Unsaved changes
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Button onClick={saveChanges} disabled={saving} size="sm">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          )}
          {!isReadOnly && (
            <div className="flex items-center gap-2">
              <Select value={addToSection} onValueChange={(v) => setAddToSection(v as ExerciseSection)}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXERCISE_SECTIONS.map((section) => (
                    <SelectItem key={section.value} value={section.value}>
                      {section.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => setShowExercisePicker(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Exercise
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Unsaved changes warning */}
      {hasUnsavedChanges && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Click "Save Changes" to persist your edits.
          </AlertDescription>
        </Alert>
      )}

      {/* Exercise sections with drag and drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        {EXERCISE_SECTIONS.map((section) => {
          const sectionExercises = groupedExercises[section.value];

          // Warmup uses collapsible WarmupSection
          if (section.value === "warmup") {
            if (sectionExercises.length === 0 && !isReadOnly) {
              // Show warmup section even when empty for adding exercises
              return (
                <WarmupSection key={section.value} exerciseCount={0}>
                  {renderSectionContent(section)}
                </WarmupSection>
              );
            }
            if (sectionExercises.length > 0) {
              return (
                <WarmupSection key={section.value} exerciseCount={sectionExercises.length}>
                  {renderSectionContent(section)}
                </WarmupSection>
              );
            }
            return null;
          }

          // Other sections: skip if empty (except main)
          if (sectionExercises.length === 0 && section.value !== "main") return null;

          return (
            <div key={section.value} className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-muted-foreground">{section.label}</h4>
                <Badge variant="secondary" className="text-xs">
                  {sectionExercises.length}
                </Badge>
              </div>
              {renderSectionContent(section)}
            </div>
          );
        })}
      </DragDropContext>

      {/* Exercise Picker Dialog */}
      <ExercisePickerDialog
        open={showExercisePicker}
        onOpenChange={setShowExercisePicker}
        onSelectExercise={(exerciseId) => addExercise(exerciseId, addToSection)}
        coachUserId={coachUserId}
      />
    </div>
  );
}

export default EnhancedModuleExerciseEditor;
