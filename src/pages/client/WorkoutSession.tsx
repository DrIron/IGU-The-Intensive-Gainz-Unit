import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  ArrowLeft, 
  CheckCircle2, 
  MessageSquare, 
  Upload, 
  ChevronDown, 
  ChevronUp,
  Play,
  User,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Exercise {
  id: string;
  exercise_id: string;
  section: string;
  sort_order: number;
  instructions: string | null;
  prescription_snapshot_json: {
    set_count?: number;
    rep_range_min?: number;
    rep_range_max?: number;
    tempo?: string;
    rest_seconds?: number;
    intensity_type?: string;
    intensity_value?: number;
    warmup_sets_json?: any;
    allow_client_extra_sets?: boolean;
  };
  exercise: {
    name: string;
    default_video_url: string | null;
    primary_muscle: string;
  };
  last_performance?: {
    performed_reps: number;
    performed_load: number;
    performed_rir: number;
  };
}

interface SetLog {
  set_index: number;
  performed_reps: number | null;
  performed_load: number | null;
  performed_rir: number | null;
  notes: string;
}

interface Module {
  id: string;
  title: string;
  module_type: string;
  status: string;
  completed_at: string | null;
  module_owner_coach_id: string;
  coach_name: string;
  exercises: Exercise[];
}

function WorkoutSessionContent() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [setLogs, setSetLogs] = useState<Record<string, SetLog[]>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    warmup: true,
    main: true,
    accessory: true,
    cooldown: true,
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);

  useDocumentTitle({
    title: module ? `${module.title} | Workout` : "Workout Session",
    description: "Complete your workout session",
  });

  const loadSession = useCallback(async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      setUser(currentUser);

      // Load module with exercises
      const { data: moduleData, error: moduleError } = await supabase
        .from("client_day_modules")
        .select(`
          id,
          title,
          module_type,
          status,
          completed_at,
          module_owner_coach_id
        `)
        .eq("id", moduleId)
        .single();

      if (moduleError) throw moduleError;

      // Load coach info from safe view (no contact info exposed)
      const { data: coachData } = await supabase
        .from("coaches_client_safe")
        .select("first_name")
        .eq("user_id", moduleData.module_owner_coach_id)
        .maybeSingle();

      // Load exercises
      const { data: exercisesData, error: exercisesError } = await supabase
        .from("client_module_exercises")
        .select(`
          id,
          exercise_id,
          section,
          sort_order,
          instructions,
          prescription_snapshot_json,
          exercise_library (
            name,
            default_video_url,
            primary_muscle
          )
        `)
        .eq("client_day_module_id", moduleId)
        .order("section")
        .order("sort_order");

      if (exercisesError) throw exercisesError;

      // Load existing set logs
      const exerciseIds = exercisesData?.map(e => e.id) || [];
      const { data: logsData } = await supabase
        .from("exercise_set_logs")
        .select("*")
        .in("client_module_exercise_id", exerciseIds);

      // Initialize set logs state
      const initialLogs: Record<string, SetLog[]> = {};
      exercisesData?.forEach(ex => {
        const prescription = ex.prescription_snapshot_json as any;
        const setCount = prescription?.set_count || 3;
        const existingLogs = logsData?.filter(l => l.client_module_exercise_id === ex.id) || [];
        
        initialLogs[ex.id] = Array.from({ length: setCount }, (_, i) => {
          const existing = existingLogs.find(l => l.set_index === i + 1);
          return {
            set_index: i + 1,
            performed_reps: existing?.performed_reps || null,
            performed_load: existing?.performed_load || null,
            performed_rir: existing?.performed_rir || null,
            notes: existing?.notes || '',
          };
        });
      });
      setSetLogs(initialLogs);

      // Format exercises with last performance lookup
      const formattedExercises: Exercise[] = await Promise.all(
        (exercisesData || []).map(async (ex: any) => {
          // Get last performance for this exercise
          const { data: lastPerf } = await supabase
            .from("exercise_set_logs")
            .select("performed_reps, performed_load, performed_rir")
            .eq("client_module_exercise_id", ex.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            id: ex.id,
            exercise_id: ex.exercise_id,
            section: ex.section,
            sort_order: ex.sort_order,
            instructions: ex.instructions,
            prescription_snapshot_json: ex.prescription_snapshot_json || {},
            exercise: {
              name: ex.exercise_library?.name || 'Unknown Exercise',
              default_video_url: ex.exercise_library?.default_video_url,
              primary_muscle: ex.exercise_library?.primary_muscle || '',
            },
            last_performance: lastPerf || undefined,
          };
        })
      );

      setModule({
        id: moduleData.id,
        title: moduleData.title,
        module_type: moduleData.module_type,
        status: moduleData.status,
        completed_at: moduleData.completed_at,
        module_owner_coach_id: moduleData.module_owner_coach_id,
        coach_name: coachData?.first_name || 'Coach',
        exercises: formattedExercises,
      });
    } catch (error: any) {
      console.error("Error loading session:", error);
      toast({
        title: "Error loading workout",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [moduleId, toast]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const updateSetLog = (exerciseId: string, setIndex: number, field: keyof SetLog, value: any) => {
    setSetLogs(prev => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map(log =>
        log.set_index === setIndex ? { ...log, [field]: value } : log
      ),
    }));
  };

  const saveSetLogs = async () => {
    if (!user || !module) return;
    
    setSubmitting(true);
    try {
      // Prepare all logs for upsert
      const allLogs: any[] = [];
      
      Object.entries(setLogs).forEach(([exerciseId, logs]) => {
        const exercise = module.exercises.find(e => e.id === exerciseId);
        if (!exercise) return;
        
        logs.forEach(log => {
          if (log.performed_reps !== null || log.performed_load !== null) {
            allLogs.push({
              client_module_exercise_id: exerciseId,
              set_index: log.set_index,
              prescribed: exercise.prescription_snapshot_json,
              performed_reps: log.performed_reps,
              performed_load: log.performed_load,
              performed_rir: log.performed_rir,
              notes: log.notes || null,
              created_by_user_id: user.id,
            });
          }
        });
      });

      // Delete existing logs and insert new ones
      for (const log of allLogs) {
        await supabase
          .from("exercise_set_logs")
          .upsert(log, { onConflict: 'client_module_exercise_id,set_index' });
      }

      toast({
        title: "Progress saved",
        description: "Your workout data has been saved",
      });
    } catch (error: any) {
      toast({
        title: "Error saving",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const markModuleComplete = async () => {
    if (!module) return;
    
    setSubmitting(true);
    try {
      await saveSetLogs();
      
      await supabase
        .from("client_day_modules")
        .update({ 
          status: 'completed', 
          completed_at: new Date().toISOString() 
        })
        .eq("id", module.id);

      toast({
        title: "Workout completed! 💪",
        description: "Great job finishing your session",
      });
      
      navigate(-1);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const groupedExercises = module?.exercises.reduce((acc, ex) => {
    if (!acc[ex.section]) acc[ex.section] = [];
    acc[ex.section].push(ex);
    return acc;
  }, {} as Record<string, Exercise[]>) || {};

  const sectionOrder = ['warmup', 'main', 'accessory', 'cooldown'];

  if (loading) {
    return (
      <>
        <Navigation user={user} userRole="client" />
        <div className="container max-w-4xl py-8 pt-24">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (!module) {
    return (
      <>
        <Navigation user={user} userRole="client" />
        <div className="container max-w-4xl py-8 pt-24">
          <Alert>
            <AlertDescription>Workout session not found</AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation user={user} userRole="client" />
      <div className="container max-w-4xl py-8 pt-24 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{module.title}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{module.module_type.replace(/_/g, ' ')}</Badge>
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {module.coach_name}
              </span>
              {module.completed_at && (
                <span className="flex items-center gap-1 text-green-500">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed {format(new Date(module.completed_at), 'MMM d')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Exercises by Section */}
        {sectionOrder.map(section => {
          const exercises = groupedExercises[section];
          if (!exercises || exercises.length === 0) return null;

          return (
            <Collapsible
              key={section}
              open={expandedSections[section]}
              onOpenChange={(open) => setExpandedSections(prev => ({ ...prev, [section]: open }))}
            >
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <CardTitle className="capitalize">{section}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{exercises.length} exercises</Badge>
                        {expandedSections[section] ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-6">
                    {exercises.map((exercise, idx) => (
                      <div key={exercise.id} className="space-y-4">
                        {idx > 0 && <Separator />}
                        
                        {/* Exercise Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold">{exercise.exercise.name}</h3>
                            <p className="text-sm text-muted-foreground">{exercise.exercise.primary_muscle}</p>
                          </div>
                          {exercise.exercise.default_video_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(exercise.exercise.default_video_url!, '_blank')}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Demo
                            </Button>
                          )}
                        </div>

                        {/* Prescription */}
                        <div className="flex flex-wrap gap-2 text-sm">
                          <Badge variant="outline">
                            {exercise.prescription_snapshot_json.set_count || 3} sets
                          </Badge>
                          {exercise.prescription_snapshot_json.rep_range_min && (
                            <Badge variant="outline">
                              {exercise.prescription_snapshot_json.rep_range_min}
                              {exercise.prescription_snapshot_json.rep_range_max !== exercise.prescription_snapshot_json.rep_range_min && 
                                `-${exercise.prescription_snapshot_json.rep_range_max}`} reps
                            </Badge>
                          )}
                          {exercise.prescription_snapshot_json.tempo && (
                            <Badge variant="outline">Tempo: {exercise.prescription_snapshot_json.tempo}</Badge>
                          )}
                          {exercise.prescription_snapshot_json.rest_seconds && (
                            <Badge variant="outline">
                              <Clock className="h-3 w-3 mr-1" />
                              {exercise.prescription_snapshot_json.rest_seconds}s rest
                            </Badge>
                          )}
                          {exercise.prescription_snapshot_json.intensity_type && (
                            <Badge variant="outline">
                              {exercise.prescription_snapshot_json.intensity_type}: {exercise.prescription_snapshot_json.intensity_value}
                            </Badge>
                          )}
                        </div>

                        {/* Last Performance */}
                        {exercise.last_performance && (
                          <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                            Last: {exercise.last_performance.performed_reps} reps @ {exercise.last_performance.performed_load}kg
                            {exercise.last_performance.performed_rir !== null && ` (RIR ${exercise.last_performance.performed_rir})`}
                          </div>
                        )}

                        {/* Instructions */}
                        {exercise.instructions && (
                          <p className="text-sm text-muted-foreground italic">{exercise.instructions}</p>
                        )}

                        {/* Set Logging */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground px-2">
                            <span>Set</span>
                            <span>Reps</span>
                            <span>Load (kg)</span>
                            <span>RIR</span>
                            <span></span>
                          </div>
                          {setLogs[exercise.id]?.map((log) => (
                            <div key={log.set_index} className="grid grid-cols-5 gap-2 items-center">
                              <span className="text-sm font-medium text-center">{log.set_index}</span>
                              <Input
                                type="number"
                                placeholder="Reps"
                                value={log.performed_reps ?? ''}
                                onChange={(e) => updateSetLog(exercise.id, log.set_index, 'performed_reps', e.target.value ? parseInt(e.target.value) : null)}
                                className="h-9"
                              />
                              <Input
                                type="number"
                                placeholder="kg"
                                value={log.performed_load ?? ''}
                                onChange={(e) => updateSetLog(exercise.id, log.set_index, 'performed_load', e.target.value ? parseFloat(e.target.value) : null)}
                                className="h-9"
                              />
                              <Input
                                type="number"
                                placeholder="RIR"
                                value={log.performed_rir ?? ''}
                                onChange={(e) => updateSetLog(exercise.id, log.set_index, 'performed_rir', e.target.value ? parseFloat(e.target.value) : null)}
                                className="h-9"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => {
                                  const newNotes = { ...notes };
                                  newNotes[`${exercise.id}-${log.set_index}`] = log.notes;
                                  setNotes(newNotes);
                                }}
                              >
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}

        {/* Module Thread */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Comments
            </CardTitle>
            <CardDescription>
              Chat with {module.coach_name} about this workout
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea 
              placeholder="Add a comment or question for your coach..."
              className="mb-3"
            />
            <Button variant="outline" size="sm">Send</Button>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3 sticky bottom-4 bg-background/95 backdrop-blur p-4 rounded-lg border shadow-lg">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={saveSetLogs}
            disabled={submitting}
          >
            Save Progress
          </Button>
          <Button 
            className="flex-1"
            onClick={markModuleComplete}
            disabled={submitting || module.status === 'completed'}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {module.status === 'completed' ? 'Completed' : 'Complete Workout'}
          </Button>
        </div>
      </div>
    </>
  );
}

export default function WorkoutSession() {
  return <WorkoutSessionContent />;
}
