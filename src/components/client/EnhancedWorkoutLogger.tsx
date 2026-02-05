// src/components/client/EnhancedWorkoutLogger.tsx
// Mobile-optimized workout logging with previous values display

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dumbbell,
  ChevronDown,
  ChevronRight,
  Check,
  Clock,
  History,
  Pause,
  RotateCcw,
  Youtube,
  Award,
  Loader2,
  Save,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import {
  ColumnConfig,
  ExercisePrescription,
  SetLog,
} from "@/types/workout-builder";

interface EnhancedWorkoutLoggerProps {
  moduleId: string;
  userId: string;
  onComplete?: () => void;
}

interface ExerciseWithLogs {
  id: string;
  exercise_id: string;
  section: string;
  sort_order: number;
  instructions?: string;
  prescription: ExercisePrescription;
  column_config: ColumnConfig[];
  exercise: {
    name: string;
    primary_muscle: string;
    default_video_url?: string;
  };
  last_performance?: {
    date: string;
    sets: SetLog[];
  };
  personal_best?: {
    max_load: number;
    date: string;
  };
  current_logs: SetLog[];
  is_complete: boolean;
}

interface ModuleData {
  id: string;
  title: string;
  module_type: string;
  status: string;
  coach_name: string;
  exercises: ExerciseWithLogs[];
}

export function EnhancedWorkoutLogger({
  moduleId,
  userId,
  onComplete,
}: EnhancedWorkoutLoggerProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [module, setModule] = useState<ModuleData | null>(null);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [restTimerActive, setRestTimerActive] = useState(false);
  const [restTimeRemaining, setRestTimeRemaining] = useState(0);
  const hasFetched = useRef(false);
  const { toast } = useToast();

  // Load module and exercises
  const loadModule = useCallback(async () => {
    try {
      // Get module data
      const { data: moduleData, error: moduleError } = await supabase
        .from("client_day_modules")
        .select(`
          *,
          coaches:module_owner_coach_id(first_name)
        `)
        .eq("id", moduleId)
        .single();

      if (moduleError) throw moduleError;

      // Get exercises
      const { data: exercisesData, error: exercisesError } = await supabase
        .from("client_module_exercises")
        .select(`
          *,
          exercise_library(name, primary_muscle, default_video_url)
        `)
        .eq("client_day_module_id", moduleId)
        .order("section")
        .order("sort_order");

      if (exercisesError) throw exercisesError;

      // Get existing logs
      const exerciseIds = exercisesData?.map((e) => e.id) || [];
      const { data: logsData } = await supabase
        .from("exercise_set_logs")
        .select("*")
        .in("client_module_exercise_id", exerciseIds);

      // Get last performance for each exercise
      const exercisesWithLogs: ExerciseWithLogs[] = await Promise.all(
        (exercisesData || []).map(async (ex) => {
          const prescription = (ex.prescription_snapshot_json as any) || {};
          const setCount = prescription.set_count || 3;

          // Get existing logs for this exercise
          const existingLogs = logsData?.filter(
            (l) => l.client_module_exercise_id === ex.id
          ) || [];

          // Initialize current logs
          const currentLogs: SetLog[] = Array.from({ length: setCount }, (_, i) => {
            const existing = existingLogs.find((l) => l.set_index === i + 1);
            return {
              set_index: i + 1,
              performed_reps: existing?.performed_reps || null,
              performed_load: existing?.performed_load || null,
              performed_rir: existing?.performed_rir || null,
              performed_rpe: existing?.performed_rpe || null,
              performed_time: existing?.performed_time || null,
              performed_distance: existing?.performed_distance || null,
              notes: existing?.notes || "",
            };
          });

          // Get last performance (from previous sessions)
          const { data: lastPerf } = await supabase
            .from("exercise_set_logs")
            .select(`
              *,
              client_module_exercises!inner(
                exercise_id,
                client_day_modules!inner(
                  client_program_days!inner(date)
                )
              )
            `)
            .eq("client_module_exercises.exercise_id", ex.exercise_id)
            .eq("created_by_user_id", userId)
            .neq("client_module_exercise_id", ex.id)
            .order("created_at", { ascending: false })
            .limit(setCount);

          // Get personal best
          const { data: pbData } = await supabase
            .from("exercise_set_logs")
            .select("performed_load, created_at")
            .eq("created_by_user_id", userId)
            .not("performed_load", "is", null)
            .order("performed_load", { ascending: false })
            .limit(1);

          const isComplete = currentLogs.every(
            (log) => log.performed_reps !== null || log.performed_load !== null
          );

          return {
            id: ex.id,
            exercise_id: ex.exercise_id,
            section: ex.section,
            sort_order: ex.sort_order,
            instructions: ex.instructions,
            prescription: {
              set_count: prescription.set_count || 3,
              rep_range_min: prescription.rep_range_min,
              rep_range_max: prescription.rep_range_max,
              tempo: prescription.tempo,
              rest_seconds: prescription.rest_seconds,
              rir: prescription.intensity_type === "RIR" ? prescription.intensity_value : undefined,
              rpe: prescription.intensity_type === "RPE" ? prescription.intensity_value : undefined,
            },
            column_config: prescription.column_config || [],
            exercise: {
              name: ex.exercise_library?.name || "Unknown",
              primary_muscle: ex.exercise_library?.primary_muscle || "",
              default_video_url: ex.exercise_library?.default_video_url,
            },
            last_performance: lastPerf && lastPerf.length > 0
              ? {
                  date: (lastPerf[0] as any).client_module_exercises?.client_day_modules?.client_program_days?.date,
                  sets: lastPerf.map((l) => ({
                    set_index: l.set_index,
                    performed_reps: l.performed_reps,
                    performed_load: l.performed_load,
                    performed_rir: l.performed_rir,
                    performed_rpe: l.performed_rpe,
                    performed_time: null,
                    performed_distance: null,
                    notes: l.notes || "",
                  })),
                }
              : undefined,
            personal_best: pbData && pbData.length > 0
              ? {
                  max_load: pbData[0].performed_load!,
                  date: pbData[0].created_at,
                }
              : undefined,
            current_logs: currentLogs,
            is_complete: isComplete,
          };
        })
      );

      setModule({
        id: moduleData.id,
        title: moduleData.title,
        module_type: moduleData.module_type,
        status: moduleData.status,
        coach_name: (moduleData.coaches as any)?.first_name || "Coach",
        exercises: exercisesWithLogs,
      });

      // Auto-expand first incomplete exercise
      const firstIncomplete = exercisesWithLogs.find((e) => !e.is_complete);
      if (firstIncomplete) {
        setExpandedExercise(firstIncomplete.id);
      }
    } catch (error: any) {
      toast({
        title: "Error loading workout",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [moduleId, userId, toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadModule();
  }, [loadModule]);

  // Rest timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (restTimerActive && restTimeRemaining > 0) {
      interval = setInterval(() => {
        setRestTimeRemaining((prev) => {
          if (prev <= 1) {
            setRestTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [restTimerActive, restTimeRemaining]);

  // Update set log
  const updateSetLog = (exerciseId: string, setIndex: number, field: keyof SetLog, value: any) => {
    setModule((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((ex) => {
          if (ex.id !== exerciseId) return ex;
          const updatedLogs = ex.current_logs.map((log) =>
            log.set_index === setIndex ? { ...log, [field]: value } : log
          );
          const isComplete = updatedLogs.every(
            (log) => log.performed_reps !== null || log.performed_load !== null
          );
          return { ...ex, current_logs: updatedLogs, is_complete: isComplete };
        }),
      };
    });
  };

  // Save all logs
  const saveLogs = async () => {
    if (!module) return;

    setSaving(true);
    try {
      for (const exercise of module.exercises) {
        for (const log of exercise.current_logs) {
          if (log.performed_reps !== null || log.performed_load !== null) {
            await supabase.from("exercise_set_logs").upsert(
              {
                client_module_exercise_id: exercise.id,
                set_index: log.set_index,
                prescribed: exercise.prescription,
                performed_reps: log.performed_reps,
                performed_load: log.performed_load,
                performed_rir: log.performed_rir,
                performed_rpe: log.performed_rpe,
                notes: log.notes || null,
                created_by_user_id: userId,
              },
              { onConflict: "client_module_exercise_id,set_index" }
            );
          }
        }
      }

      toast({ title: "Progress saved" });
    } catch (error: any) {
      toast({
        title: "Error saving",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Complete workout
  const completeWorkout = async () => {
    await saveLogs();

    try {
      await supabase
        .from("client_day_modules")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", moduleId);

      toast({
        title: "Workout completed!",
        description: "Great job finishing your workout!",
      });

      onComplete?.();
    } catch (error: any) {
      toast({
        title: "Error completing workout",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Start rest timer
  const startRestTimer = (seconds: number) => {
    setRestTimeRemaining(seconds);
    setRestTimerActive(true);
  };

  // Calculate progress
  const completedExercises = module?.exercises.filter((e) => e.is_complete).length || 0;
  const totalExercises = module?.exercises.length || 0;
  const progressPercent = totalExercises > 0 ? (completedExercises / totalExercises) * 100 : 0;

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!module) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Workout not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-primary" />
              {module.title}
            </h1>
            <p className="text-sm text-muted-foreground">by {module.coach_name}</p>
          </div>
          <Button onClick={saveLogs} disabled={saving} variant="outline" size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </Button>
        </div>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {completedExercises}/{totalExercises} exercises
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Rest Timer (when active) */}
        {restTimerActive && (
          <div className="mt-3 p-3 bg-primary/10 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <span className="font-mono text-lg font-bold">
                {Math.floor(restTimeRemaining / 60)}:{(restTimeRemaining % 60).toString().padStart(2, "0")}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRestTimerActive(false)}
              >
                <Pause className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRestTimerActive(false);
                  setRestTimeRemaining(0);
                }}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Exercises */}
      <div className="space-y-3">
        {module.exercises.map((exercise) => (
          <Card key={exercise.id} className={exercise.is_complete ? "border-green-500/30" : ""}>
            <Collapsible
              open={expandedExercise === exercise.id}
              onOpenChange={(open) => setExpandedExercise(open ? exercise.id : null)}
            >
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer py-3">
                  <div className="flex items-center gap-3">
                    {exercise.is_complete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{exercise.exercise.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {exercise.prescription.set_count} sets x{" "}
                        {exercise.prescription.rep_range_min}-{exercise.prescription.rep_range_max} reps
                        {exercise.prescription.rir !== undefined && ` @ RIR ${exercise.prescription.rir}`}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {exercise.exercise.default_video_url && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={exercise.exercise.default_video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-muted-foreground hover:text-primary"
                              >
                                <Youtube className="h-4 w-4" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>Watch demo</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {expandedExercise === exercise.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4">
                  {/* Last Performance */}
                  {exercise.last_performance && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <History className="h-4 w-4" />
                        <span>
                          Last: {exercise.last_performance.date
                            ? format(new Date(exercise.last_performance.date), "MMM d")
                            : "Previous session"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {exercise.last_performance.sets.map((set) => (
                          <Badge key={set.set_index} variant="secondary" className="text-xs">
                            {set.performed_reps}x{set.performed_load}kg
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Personal Best */}
                  {exercise.personal_best && (
                    <div className="flex items-center gap-2 text-sm">
                      <Award className="h-4 w-4 text-yellow-500" />
                      <span className="text-muted-foreground">PR:</span>
                      <span className="font-medium">{exercise.personal_best.max_load}kg</span>
                    </div>
                  )}

                  {/* Instructions */}
                  {exercise.instructions && (
                    <p className="text-sm text-muted-foreground italic">{exercise.instructions}</p>
                  )}

                  {/* Set Logging */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground px-1">
                      <span>Set</span>
                      <span>Reps</span>
                      <span>Weight</span>
                      <span>RIR</span>
                      <span></span>
                    </div>

                    {exercise.current_logs.map((log) => (
                      <div key={log.set_index} className="grid grid-cols-5 gap-2 items-center">
                        <span className="text-center font-medium">{log.set_index}</span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          placeholder={exercise.last_performance?.sets[log.set_index - 1]?.performed_reps?.toString() || "-"}
                          value={log.performed_reps ?? ""}
                          onChange={(e) =>
                            updateSetLog(
                              exercise.id,
                              log.set_index,
                              "performed_reps",
                              e.target.value ? parseInt(e.target.value) : null
                            )
                          }
                          className="h-10 text-center"
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder={exercise.last_performance?.sets[log.set_index - 1]?.performed_load?.toString() || "-"}
                          value={log.performed_load ?? ""}
                          onChange={(e) =>
                            updateSetLog(
                              exercise.id,
                              log.set_index,
                              "performed_load",
                              e.target.value ? parseFloat(e.target.value) : null
                            )
                          }
                          className="h-10 text-center"
                        />
                        <Input
                          type="number"
                          inputMode="numeric"
                          placeholder={exercise.prescription.rir?.toString() || "-"}
                          value={log.performed_rir ?? ""}
                          onChange={(e) =>
                            updateSetLog(
                              exercise.id,
                              log.set_index,
                              "performed_rir",
                              e.target.value ? parseInt(e.target.value) : null
                            )
                          }
                          className="h-10 text-center"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-10"
                          onClick={() =>
                            exercise.prescription.rest_seconds &&
                            startRestTimer(exercise.prescription.rest_seconds)
                          }
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  <div>
                    <Textarea
                      placeholder="Add notes for this exercise..."
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>

      {/* Complete Workout Button - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
        <Button
          className="w-full h-12 text-base"
          onClick={completeWorkout}
          disabled={completedExercises < totalExercises}
        >
          <Check className="h-5 w-5 mr-2" />
          {completedExercises < totalExercises
            ? `Complete ${totalExercises - completedExercises} more exercise${totalExercises - completedExercises > 1 ? "s" : ""}`
            : "Complete Workout"}
        </Button>
      </div>
    </div>
  );
}

export default EnhancedWorkoutLogger;
