import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Dumbbell } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { interpretRepMaxTrend } from "@/lib/interpret";
import {
  useExerciseStrengthHistory,
  seriesForReps,
  type RepMaxAnalysis,
} from "@/hooks/useExerciseStrengthHistory";

const round1 = (n: number) => Math.round(n * 10) / 10;

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

/** All-time actual logged rep-maxes: `1:100 · 3:92.5 · 5:85 kg`. */
function RepMaxBreakdown({ bestLoadAtReps }: { bestLoadAtReps: RepMaxAnalysis["bestLoadAtReps"] }) {
  const entries = Array.from(bestLoadAtReps.entries()).sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      <span className="text-muted-foreground/70">Rep maxes -- </span>
      {entries.map(([reps, load]) => `${reps}:${round1(load)}`).join(" · ")} kg
    </p>
  );
}

/**
 * Exercise history — actual logged rep-max trend (HX1). Headline = the heaviest
 * load logged at a chosen rep count, trended across sessions, with a rep-bracket
 * selector + an all-time rep-max breakdown. Actual logged loads only, no
 * estimation. Canonical
 * reads via useExerciseStrengthHistory (plan_slot-keyed). This component is the
 * single UI source; the /client/workout/history page wraps it in page chrome.
 */
export function ExerciseHistoryPanel() {
  const {
    exercises,
    exercisesLoading,
    selectedExercise,
    setSelectedExercise,
    logs,
    logsLoading,
    analysis,
  } = useExerciseStrengthHistory();
  const [searchTerm, setSearchTerm] = useState("");
  const [headlineReps, setHeadlineReps] = useState<number | null>(null);

  // Reset the chosen rep bracket to the densest default whenever the exercise (analysis) changes.
  useEffect(() => {
    setHeadlineReps(analysis?.defaultHeadlineReps ?? null);
  }, [analysis]);

  const filteredExercises = exercises.filter((ex) => ex.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const series = seriesForReps(analysis, headlineReps);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Select exercise</CardTitle>
          <CardDescription>Choose an exercise to view your history</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search exercises..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
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

      {selectedExercise && analysis && (
        <div className="space-y-4">
          {series && headlineReps != null && (
            <MetricCard
              label={`Best load @ ${headlineReps} reps`}
              timeframe={`last ${series.sessionCount} ${series.sessionCount === 1 ? "session" : "sessions"}`}
              value={series.latest}
              unit="kg"
              delta={series.sessionCount >= 2 ? { value: series.delta, suffix: " kg" } : undefined}
              interpretation={interpretRepMaxTrend(series.delta, series.sessionCount, headlineReps)}
              spark={series.sessionCount >= 2 ? series.series : undefined}
            />
          )}

          {analysis.availableReps.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">Reps:</span>
              {analysis.availableReps.map((reps) => (
                <button
                  key={reps}
                  type="button"
                  onClick={() => setHeadlineReps(reps)}
                  className={cn(
                    "min-h-[32px] rounded-full border px-3 text-xs font-medium tabular-nums transition-colors touch-manipulation active:scale-[0.98]",
                    reps === headlineReps
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                  aria-pressed={reps === headlineReps}
                >
                  {reps}
                </button>
              ))}
            </div>
          )}

          <RepMaxBreakdown bestLoadAtReps={analysis.bestLoadAtReps} />

          <div className="grid grid-cols-2 gap-3">
            {analysis.prTopLoad && (
              <PrTile label="Heaviest set" value={`${round1(analysis.prTopLoad.value)} kg`} date={analysis.prTopLoad.date} />
            )}
            {analysis.prVolume && (
              <PrTile label="Best volume" value={`${Math.round(analysis.prVolume.value).toLocaleString()} kg`} date={analysis.prVolume.date} />
            )}
          </div>
        </div>
      )}

      {selectedExercise && (
        <Card>
          <CardHeader>
            <CardTitle>Performance history</CardTitle>
            <CardDescription>{exercises.find((e) => e.id === selectedExercise)?.name}</CardDescription>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
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
                      <TableRow key={log.key}>
                        <TableCell>{format(new Date(log.date), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-center">{log.set_index}</TableCell>
                        <TableCell className="text-center">{log.performed_reps ?? "-"}</TableCell>
                        <TableCell className="text-center font-medium">{log.performed_load ?? "-"}</TableCell>
                        <TableCell className="text-center">{log.performed_rir ?? "-"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-32 truncate">{log.notes || "-"}</TableCell>
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
  );
}
