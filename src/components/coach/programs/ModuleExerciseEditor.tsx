import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ExercisePickerDialog } from "./ExercisePickerDialog";
import { Tables, Enums } from "@/integrations/supabase/types";

type ModuleExercise = Tables<"module_exercises"> & {
  exercise_library?: Tables<"exercise_library">;
  exercise_prescriptions?: Tables<"exercise_prescriptions">[];
};

interface ModuleExerciseEditorProps {
  moduleId: string;
  coachUserId: string;
}

const SECTIONS: { value: Enums<"exercise_section">; label: string }[] = [
  { value: "warmup", label: "Warm-up" },
  { value: "main", label: "Main Work" },
  { value: "accessory", label: "Accessory" },
  { value: "cooldown", label: "Cool-down" },
];

const INTENSITY_TYPES: { value: Enums<"intensity_type">; label: string }[] = [
  { value: "RIR", label: "RIR (Reps in Reserve)" },
  { value: "RPE", label: "RPE (Rate of Perceived Exertion)" },
  { value: "PERCENT_1RM", label: "% of 1RM" },
  { value: "TARGET_LOAD", label: "Target Load (kg)" },
  { value: "OTHER", label: "Other" },
];

export function ModuleExerciseEditor({ moduleId, coachUserId }: ModuleExerciseEditorProps) {
  const [exercises, setExercises] = useState<ModuleExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const { toast } = useToast();

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
      setExercises(data || []);
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
    loadExercises();
  }, [loadExercises]);

  const addExercise = async (exerciseId: string, section: Enums<"exercise_section">) => {
    try {
      // Get current max sort order for this section
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
          exercise_library(*),
          exercise_prescriptions(*)
        `)
        .single();

      if (exerciseError) throw exerciseError;

      // Create default prescription
      const { data: prescription, error: prescError } = await supabase
        .from("exercise_prescriptions")
        .insert({
          module_exercise_id: newExercise.id,
          set_count: 3,
          rep_range_min: 8,
          rep_range_max: 12,
          rest_seconds: 90,
          intensity_type: "RIR",
          intensity_value: 2,
        })
        .select()
        .single();

      if (prescError) throw prescError;

      setExercises([...exercises, { ...newExercise, exercise_prescriptions: [prescription] }]);
      setShowExercisePicker(false);
      setExpandedExercise(newExercise.id);

      toast({
        title: "Exercise added",
        description: "Exercise has been added to the module.",
      });
    } catch (error: any) {
      toast({
        title: "Error adding exercise",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateExercise = async (exerciseId: string, updates: Partial<ModuleExercise>) => {
    try {
      const { error } = await supabase
        .from("module_exercises")
        .update(updates)
        .eq("id", exerciseId);

      if (error) throw error;

      setExercises((prev) =>
        prev.map((ex) => (ex.id === exerciseId ? { ...ex, ...updates } : ex))
      );
    } catch (error: any) {
      toast({
        title: "Error updating exercise",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updatePrescription = async (
    prescriptionId: string,
    exerciseId: string,
    updates: Partial<Tables<"exercise_prescriptions">>
  ) => {
    try {
      const { error } = await supabase
        .from("exercise_prescriptions")
        .update(updates)
        .eq("id", prescriptionId);

      if (error) throw error;

      setExercises((prev) =>
        prev.map((ex) => {
          if (ex.id !== exerciseId) return ex;
          return {
            ...ex,
            exercise_prescriptions: (ex.exercise_prescriptions || []).map((p) =>
              p.id === prescriptionId ? { ...p, ...updates } : p
            ),
          };
        })
      );
    } catch (error: any) {
      toast({
        title: "Error updating prescription",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteExercise = async (exerciseId: string) => {
    try {
      const { error } = await supabase
        .from("module_exercises")
        .delete()
        .eq("id", exerciseId);

      if (error) throw error;

      setExercises((prev) => prev.filter((ex) => ex.id !== exerciseId));

      toast({
        title: "Exercise deleted",
        description: "Exercise has been removed from the module.",
      });
    } catch (error: any) {
      toast({
        title: "Error deleting exercise",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Group exercises by section
  const groupedExercises = SECTIONS.map((section) => ({
    ...section,
    exercises: exercises.filter((ex) => ex.section === section.value),
  }));

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-2">Loading exercises...</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowExercisePicker(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Exercise
        </Button>
      </div>

      {exercises.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm border rounded-md">
          No exercises yet. Click "Add Exercise" to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {groupedExercises
            .filter((group) => group.exercises.length > 0)
            .map((group) => (
              <div key={group.value} className="space-y-2">
                <h5 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </h5>
                <div className="space-y-1">
                  {group.exercises.map((exercise, index) => (
                    <div
                      key={exercise.id}
                      className="border rounded-md bg-card"
                    >
                      <div
                        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          setExpandedExercise(
                            expandedExercise === exercise.id ? null : exercise.id
                          )
                        }
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        {expandedExercise === exercise.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm">
                            {exercise.exercise_library?.name || "Unknown Exercise"}
                          </span>
                          {exercise.exercise_prescriptions?.[0] && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {exercise.exercise_prescriptions[0].set_count} sets ×{" "}
                              {exercise.exercise_prescriptions[0].rep_range_min}-
                              {exercise.exercise_prescriptions[0].rep_range_max} reps
                            </span>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs capitalize">
                          {exercise.exercise_library?.primary_muscle}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteExercise(exercise.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {expandedExercise === exercise.id && exercise.exercise_prescriptions?.[0] && (
                        <div className="p-3 pt-0 border-t bg-muted/30">
                          <PrescriptionEditor
                            prescription={exercise.exercise_prescriptions[0]}
                            exerciseId={exercise.id}
                            onUpdate={updatePrescription}
                          />
                          <div className="mt-3">
                            <Label className="text-xs">Instructions</Label>
                            <Textarea
                              value={exercise.instructions || ""}
                              onChange={(e) =>
                                updateExercise(exercise.id, {
                                  instructions: e.target.value,
                                })
                              }
                              placeholder="Add specific instructions for this exercise..."
                              rows={2}
                              className="text-sm mt-1"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      <ExercisePickerDialog
        open={showExercisePicker}
        onOpenChange={setShowExercisePicker}
        onSelectExercise={addExercise}
        coachUserId={coachUserId}
      />
    </div>
  );
}

interface PrescriptionEditorProps {
  prescription: Tables<"exercise_prescriptions">;
  exerciseId: string;
  onUpdate: (
    prescriptionId: string,
    exerciseId: string,
    updates: Partial<Tables<"exercise_prescriptions">>
  ) => void;
}

function PrescriptionEditor({ prescription, exerciseId, onUpdate }: PrescriptionEditorProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
      <div>
        <Label className="text-xs">Sets</Label>
        <Input
          type="number"
          min={1}
          value={prescription.set_count}
          onChange={(e) =>
            onUpdate(prescription.id, exerciseId, {
              set_count: parseInt(e.target.value) || 1,
            })
          }
          className="h-8 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs">Rep Range</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            value={prescription.rep_range_min || ""}
            onChange={(e) =>
              onUpdate(prescription.id, exerciseId, {
                rep_range_min: parseInt(e.target.value) || null,
              })
            }
            className="h-8 text-sm w-14"
            placeholder="Min"
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number"
            min={1}
            value={prescription.rep_range_max || ""}
            onChange={(e) =>
              onUpdate(prescription.id, exerciseId, {
                rep_range_max: parseInt(e.target.value) || null,
              })
            }
            className="h-8 text-sm w-14"
            placeholder="Max"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Tempo</Label>
        <Input
          value={prescription.tempo || ""}
          onChange={(e) =>
            onUpdate(prescription.id, exerciseId, {
              tempo: e.target.value || null,
            })
          }
          placeholder="3010"
          className="h-8 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs">Rest (sec)</Label>
        <Input
          type="number"
          min={0}
          value={prescription.rest_seconds || ""}
          onChange={(e) =>
            onUpdate(prescription.id, exerciseId, {
              rest_seconds: parseInt(e.target.value) || null,
            })
          }
          className="h-8 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs">Intensity Type</Label>
        <Select
          value={prescription.intensity_type || "RIR"}
          onValueChange={(value) =>
            onUpdate(prescription.id, exerciseId, {
              intensity_type: value as Enums<"intensity_type">,
            })
          }
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTENSITY_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Intensity Value</Label>
        <Input
          type="number"
          value={prescription.intensity_value || ""}
          onChange={(e) =>
            onUpdate(prescription.id, exerciseId, {
              intensity_value: parseFloat(e.target.value) || null,
            })
          }
          placeholder="2"
          className="h-8 text-sm"
        />
      </div>
      <div className="col-span-2">
        <Label className="text-xs">Progression Notes</Label>
        <Input
          value={prescription.progression_notes || ""}
          onChange={(e) =>
            onUpdate(prescription.id, exerciseId, {
              progression_notes: e.target.value || null,
            })
          }
          placeholder="Increase weight when hitting top of rep range"
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}
