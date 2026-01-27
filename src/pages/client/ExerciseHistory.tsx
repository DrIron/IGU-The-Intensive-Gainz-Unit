import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, History, Search, TrendingUp, Dumbbell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { format } from "date-fns";

interface ExerciseOption {
  id: string;
  name: string;
}

interface LogEntry {
  id: string;
  date: string;
  set_index: number;
  performed_reps: number | null;
  performed_load: number | null;
  performed_rir: number | null;
  performed_rpe: number | null;
  notes: string | null;
}

function ExerciseHistoryContent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [exercisesLoading, setExercisesLoading] = useState(true);
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [user, setUser] = useState<any>(null);

  useDocumentTitle({
    title: "Exercise History",
    description: "View your exercise performance history",
  });

  useEffect(() => {
    loadExercises();
  }, []);

  useEffect(() => {
    if (selectedExercise) {
      loadExerciseLogs();
    }
  }, [selectedExercise]);

  const loadExercises = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      setUser(currentUser);

      // Get unique exercises the user has logged
      const { data, error } = await supabase
        .from("exercise_set_logs")
        .select(`
          client_module_exercises!inner (
            exercise_id,
            exercise_library (
              id,
              name
            )
          )
        `)
        .eq("created_by_user_id", currentUser.id);

      if (error) throw error;

      // Extract unique exercises
      const uniqueExercises = new Map<string, string>();
      (data || []).forEach((log: any) => {
        const exercise = log.client_module_exercises?.exercise_library;
        if (exercise) {
          uniqueExercises.set(exercise.id, exercise.name);
        }
      });

      const exerciseList: ExerciseOption[] = Array.from(uniqueExercises.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setExercises(exerciseList);
    } catch (error: any) {
      console.error("Error loading exercises:", error);
      toast({
        title: "Error loading exercises",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setExercisesLoading(false);
    }
  };

  const loadExerciseLogs = async () => {
    if (!selectedExercise || !user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("exercise_set_logs")
        .select(`
          id,
          set_index,
          performed_reps,
          performed_load,
          performed_rir,
          performed_rpe,
          notes,
          created_at,
          client_module_exercises!inner (
            exercise_id,
            client_day_modules!inner (
              client_program_days!inner (
                date
              )
            )
          )
        `)
        .eq("created_by_user_id", user.id)
        .eq("client_module_exercises.exercise_id", selectedExercise)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formattedLogs: LogEntry[] = (data || []).map((log: any) => ({
        id: log.id,
        date: log.client_module_exercises?.client_day_modules?.client_program_days?.date || log.created_at,
        set_index: log.set_index,
        performed_reps: log.performed_reps,
        performed_load: log.performed_load,
        performed_rir: log.performed_rir,
        performed_rpe: log.performed_rpe,
        notes: log.notes,
      }));

      setLogs(formattedLogs);
    } catch (error: any) {
      console.error("Error loading logs:", error);
      toast({
        title: "Error loading history",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredExercises = exercises.filter(ex =>
    ex.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate progress metrics
  const getProgressMetrics = () => {
    if (logs.length < 2) return null;
    
    // Get first and last sessions
    const firstLog = logs[logs.length - 1];
    const lastLog = logs[0];
    
    if (!firstLog.performed_load || !lastLog.performed_load) return null;
    
    const loadChange = lastLog.performed_load - firstLog.performed_load;
    const percentChange = ((loadChange / firstLog.performed_load) * 100).toFixed(1);
    
    return {
      loadChange,
      percentChange,
      isPositive: loadChange >= 0,
    };
  };

  const metrics = getProgressMetrics();

  return (
    <>
      <Navigation user={user} userRole="client" />
      <div className="container max-w-4xl py-8 pt-24 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="h-6 w-6 text-primary" />
              Exercise History
            </h1>
            <p className="text-muted-foreground">Track your progress over time</p>
          </div>
        </div>

        {/* Exercise Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Select Exercise</CardTitle>
            <CardDescription>Choose an exercise to view your history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search exercises..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {exercisesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : exercises.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Dumbbell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No exercise history yet</p>
                <p className="text-sm mt-1">Start logging your workouts to see history</p>
              </div>
            ) : (
              <Select value={selectedExercise} onValueChange={setSelectedExercise}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an exercise" />
                </SelectTrigger>
                <SelectContent>
                  {filteredExercises.map((ex) => (
                    <SelectItem key={ex.id} value={ex.id}>
                      {ex.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Progress Summary */}
        {selectedExercise && metrics && (
          <Card className={metrics.isPositive ? "border-green-500/30" : "border-red-500/30"}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className={`h-5 w-5 ${metrics.isPositive ? 'text-green-500' : 'text-red-500 rotate-180'}`} />
                  <span className="font-medium">Progress</span>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-bold ${metrics.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    {metrics.isPositive ? '+' : ''}{metrics.loadChange}kg
                  </span>
                  <span className="text-sm text-muted-foreground ml-2">
                    ({metrics.percentChange}%)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* History Table */}
        {selectedExercise && (
          <Card>
            <CardHeader>
              <CardTitle>Performance History</CardTitle>
              <CardDescription>
                {exercises.find(e => e.id === selectedExercise)?.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <p>No logs found for this exercise</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-center">Set</TableHead>
                        <TableHead className="text-center">Reps</TableHead>
                        <TableHead className="text-center">Load (kg)</TableHead>
                        <TableHead className="text-center">RIR</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>{format(new Date(log.date), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="text-center">{log.set_index}</TableCell>
                          <TableCell className="text-center">{log.performed_reps ?? '-'}</TableCell>
                          <TableCell className="text-center font-medium">{log.performed_load ?? '-'}</TableCell>
                          <TableCell className="text-center">{log.performed_rir ?? '-'}</TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-32 truncate">
                            {log.notes || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

export default function ExerciseHistory() {
  return (
    <ProtectedRoute>
      <ExerciseHistoryContent />
    </ProtectedRoute>
  );
}
