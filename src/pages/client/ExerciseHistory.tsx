import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { ClientPageLayout } from "@/components/layouts/ClientPageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, History, Search, Dumbbell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { format } from "date-fns";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { epley1RM } from "@/lib/oneRepMax";
import { interpretE1rmTrend } from "@/lib/interpret";

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

function PrTile({ label, value, date }: { label: string; value: string; date: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center space-y-0.5">
        <p className="text-base font-semibold tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground/70">{format(new Date(date), "MMM d")}</p>
      </CardContent>
    </Card>
  );
}

function ExerciseHistoryContent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [exercisesLoading, setExercisesLoading] = useState(true);
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const user = sessionUser;

  useDocumentTitle({
    title: "Exercise History",
    description: "View your exercise performance history",
  });

  const loadExercises = useCallback(async (currentUser: SupabaseUser | null) => {
    try {
      if (!currentUser) return;

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
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setExercisesLoading(false);
    }
  }, [toast]);

  const loadExerciseLogs = useCallback(async () => {
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
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedExercise, user, toast]);

  // Keyed on session state so the effect retries once session resolves.
  const hasLoadedExercises = useRef<string | null>(null);
  useEffect(() => {
    const key = sessionUser?.id ?? (sessionLoading ? "__waiting__" : "__unauth__");
    if (hasLoadedExercises.current === key) return;
    hasLoadedExercises.current = key;
    if (sessionLoading) return;
    loadExercises(sessionUser ?? null);
  }, [sessionUser, sessionLoading, loadExercises]);

  useEffect(() => {
    if (selectedExercise) {
      loadExerciseLogs();
    }
  }, [selectedExercise, loadExerciseLogs]);

  const filteredExercises = exercises.filter(ex =>
    ex.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const analysis = useMemo(() => {
    if (logs.length === 0) return null;
    const byDate = new Map<string, { date: string; topLoad: number; bestE1rm: number; volume: number }>();
    for (const l of logs) {
      if (l.performed_load == null) continue;
      const cur = byDate.get(l.date) ?? { date: l.date, topLoad: 0, bestE1rm: 0, volume: 0 };
      const reps = l.performed_reps ?? 0;
      cur.topLoad = Math.max(cur.topLoad, l.performed_load);
      cur.bestE1rm = Math.max(cur.bestE1rm, epley1RM(l.performed_load, reps));
      if (reps > 0) cur.volume += l.performed_load * reps;
      byDate.set(l.date, cur);
    }
    const sessions = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    if (sessions.length === 0) return null;
    const e1rmSeries = sessions.map((s) => Math.round(s.bestE1rm));
    const e1rmDelta = Math.round((e1rmSeries[e1rmSeries.length - 1] - e1rmSeries[0]) * 10) / 10;
    const best = (key: "topLoad" | "bestE1rm" | "volume") =>
      sessions.reduce((m, s) => (s[key] > m[key] ? s : m), sessions[0]);
    return {
      sessionCount: sessions.length,
      e1rmSeries,
      latestE1rm: e1rmSeries[e1rmSeries.length - 1],
      e1rmDelta,
      prTopLoad: best("topLoad"),
      prE1rm: best("bestE1rm"),
      prVolume: best("volume"),
    };
  }, [logs]);

  return (
    <ClientPageLayout>
      <div className="container mx-auto max-w-4xl px-4 py-8 pb-24 md:pb-8 space-y-6">
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

        {/* Strength progress — e1RM trend + PRs */}
        {selectedExercise && analysis && (
          <div className="space-y-4">
            <MetricCard
              label="Estimated 1RM"
              timeframe={`last ${analysis.sessionCount} ${analysis.sessionCount === 1 ? "session" : "sessions"}`}
              value={analysis.latestE1rm}
              unit="kg"
              delta={analysis.sessionCount >= 2 ? { value: analysis.e1rmDelta, suffix: " kg" } : undefined}
              interpretation={interpretE1rmTrend(analysis.e1rmDelta, analysis.sessionCount)}
              spark={analysis.sessionCount >= 2 ? analysis.e1rmSeries : undefined}
            />
            <div className="grid grid-cols-3 gap-3">
              <PrTile label="Heaviest set" value={`${Math.round(analysis.prTopLoad.topLoad)} kg`} date={analysis.prTopLoad.date} />
              <PrTile label="Best est. 1RM" value={`${Math.round(analysis.prE1rm.bestE1rm)} kg`} date={analysis.prE1rm.date} />
              <PrTile label="Best volume" value={`${Math.round(analysis.prVolume.volume).toLocaleString()} kg`} date={analysis.prVolume.date} />
            </div>
          </div>
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
    </ClientPageLayout>
  );
}

export default function ExerciseHistory() {
  return <ExerciseHistoryContent />;
}
