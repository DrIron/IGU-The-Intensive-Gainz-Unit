import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus, ArrowUp } from "lucide-react";
import { format } from "date-fns";
import type { SuggestionType } from "@/types/workout-builder";

interface ProgressionLogProps {
  clientUserId: string;
}

interface SuggestionRow {
  id: string;
  session_date: string;
  set_number: number;
  suggestion_type: SuggestionType;
  suggestion_text: string;
  suggested_increment: number | null;
  client_response: "accepted" | "dismissed" | "ignored" | null;
  performed_weight: number | null;
  performed_reps: number | null;
  performed_rir: number | null;
  exercise_library_id: string;
  exercise_name?: string;
}

const SUGGESTION_BADGE: Record<
  Exclude<SuggestionType, "none">,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof TrendingUp }
> = {
  increase_load: { label: "Increase Load", variant: "default", icon: TrendingUp },
  increase_reps: { label: "Increase Reps", variant: "default", icon: ArrowUp },
  hold_steady: { label: "Hold Steady", variant: "secondary", icon: Minus },
  reduce_load: { label: "Reduce Load", variant: "destructive", icon: TrendingDown },
};

const RESPONSE_BADGE: Record<string, { label: string; color: string }> = {
  accepted: { label: "Accepted", color: "bg-emerald-500/20 text-emerald-400" },
  dismissed: { label: "Dismissed", color: "bg-zinc-500/20 text-zinc-400" },
  ignored: { label: "Ignored", color: "bg-amber-500/20 text-amber-400" },
};

export function ProgressionLog({ clientUserId }: ProgressionLogProps) {
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [exercises, setExercises] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterExercise, setFilterExercise] = useState<string>("all");
  const hasFetched = useRef(false);

  const loadData = useCallback(async () => {
    try {
      // Fetch suggestions
      const { data, error } = await supabase
        .from("progression_suggestions")
        .select("*")
        .eq("client_id", clientUserId)
        .order("session_date", { ascending: false })
        .order("set_number", { ascending: true })
        .limit(100);

      if (error) throw error;
      if (!data || data.length === 0) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      // Get unique exercise IDs and fetch names
      const exerciseIds = [...new Set(data.map((d: any) => d.exercise_library_id))];
      const { data: exerciseData } = await supabase
        .from("exercise_library")
        .select("id, name")
        .in("id", exerciseIds);

      const exerciseMap = new Map(
        (exerciseData || []).map((e: any) => [e.id, e.name])
      );

      setExercises(
        (exerciseData || []).map((e: any) => ({ id: e.id, name: e.name }))
      );

      setSuggestions(
        data.map((row: any) => ({
          ...row,
          exercise_name: exerciseMap.get(row.exercise_library_id) || "Unknown",
        }))
      );
    } catch (err) {
      console.error("Failed to load progression suggestions:", err);
    } finally {
      setLoading(false);
    }
  }, [clientUserId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadData();
  }, [loadData]);

  const filtered =
    filterExercise === "all"
      ? suggestions
      : suggestions.filter((s) => s.exercise_library_id === filterExercise);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progression Suggestions</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return null; // Don't show anything if there are no suggestions yet
  }

  // Compute summary stats
  const totalSuggestions = filtered.length;
  const acceptedCount = filtered.filter((s) => s.client_response === "accepted").length;
  const acceptRate = totalSuggestions > 0 ? Math.round((acceptedCount / totalSuggestions) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Progression Suggestions
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {acceptRate}% accepted
            </Badge>
            <Select value={filterExercise} onValueChange={setFilterExercise}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="All exercises" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All exercises</SelectItem>
                {exercises.map((ex) => (
                  <SelectItem key={ex.id} value={ex.id}>
                    {ex.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Exercise</TableHead>
                <TableHead className="text-xs">Set</TableHead>
                <TableHead className="text-xs">Performance</TableHead>
                <TableHead className="text-xs">Suggestion</TableHead>
                <TableHead className="text-xs">Response</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 50).map((row) => {
                const badge = row.suggestion_type !== "none"
                  ? SUGGESTION_BADGE[row.suggestion_type as Exclude<SuggestionType, "none">]
                  : null;
                const responseBadge = row.client_response
                  ? RESPONSE_BADGE[row.client_response]
                  : null;
                const Icon = badge?.icon;

                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(row.session_date), "MMM d")}
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">
                      {row.exercise_name}
                    </TableCell>
                    <TableCell className="text-xs">{row.set_number}</TableCell>
                    <TableCell className="text-xs font-mono whitespace-nowrap">
                      {row.performed_weight}kg × {row.performed_reps}
                      {row.performed_rir !== null && ` @RIR${row.performed_rir}`}
                    </TableCell>
                    <TableCell>
                      {badge && Icon && (
                        <Badge variant={badge.variant} className="text-xs gap-1">
                          <Icon className="h-3 w-3" />
                          {badge.label}
                          {row.suggested_increment !== null && (
                            <span className="font-mono">
                              {row.suggestion_type === "reduce_load" ? "-" : "+"}
                              {row.suggested_increment}
                            </span>
                          )}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {responseBadge ? (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-md ${responseBadge.color}`}
                        >
                          {responseBadge.label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 50 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            Showing 50 of {filtered.length} suggestions
          </p>
        )}
      </CardContent>
    </Card>
  );
}
