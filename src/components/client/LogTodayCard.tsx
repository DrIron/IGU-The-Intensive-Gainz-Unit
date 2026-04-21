import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Check, Scale, Footprints } from "lucide-react";
import { format, differenceInDays, startOfWeek } from "date-fns";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

/**
 * Inline "log weight + steps for today" card on the client dashboard.
 *
 * Rationale: the dashboard used to alert "missing weight logs -- tap to
 * log now" which just routed to /nutrition-client. Moving one field here
 * cuts friction for the daily action the whole coaching model depends on.
 * Heavier tracking (BF%, circumference, weekly check-in) stays on the
 * nutrition page -- this is just the two numbers that matter daily.
 *
 * If the client already logged today, we show a muted "logged" state with
 * the values and skip the inputs. Prevents double entries and gives
 * positive feedback on the streak.
 */
interface LogTodayCardProps {
  userId: string;
  /** Phase id is needed so weight_logs can reference the active phase. */
  phaseId: string | null;
  /** Phase start date (ISO) to compute `weight_logs.week_number`. */
  phaseStartDate?: string | null;
  /**
   * Fired after a successful weight or step save. Parents that render their
   * own aggregations (e.g. the weekly ribbon on /nutrition-client) can use
   * this to bump a refresh key and re-fetch.
   */
  onLogged?: (kind: "weight" | "steps") => void;
}

interface TodayState {
  weightKg: number | null;
  stepsCount: number | null;
  weeklyWeightCount: number;
}

const today = () => format(new Date(), "yyyy-MM-dd");

export function LogTodayCard({ userId, phaseId, phaseStartDate, onLogged }: LogTodayCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingWeight, setSavingWeight] = useState(false);
  const [savingSteps, setSavingSteps] = useState(false);
  const [state, setState] = useState<TodayState>({
    weightKg: null,
    stepsCount: null,
    weeklyWeightCount: 0,
  });
  const [weightInput, setWeightInput] = useState("");
  const [stepsInput, setStepsInput] = useState("");
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");
      const weightTodayQuery = phaseId
        ? supabase
            .from("weight_logs")
            .select("weight_kg")
            .eq("phase_id", phaseId)
            .eq("log_date", today())
            .maybeSingle()
        : Promise.resolve({ data: null });
      const weekWeightsQuery = phaseId
        ? supabase
            .from("weight_logs")
            .select("id")
            .eq("phase_id", phaseId)
            .gte("log_date", weekStart)
        : Promise.resolve({ data: [] });

      const [weightRes, stepsRes, weekRes] = await Promise.all([
        weightTodayQuery,
        supabase
          .from("step_logs")
          .select("steps")
          .eq("user_id", userId)
          .eq("log_date", today())
          .maybeSingle(),
        weekWeightsQuery,
      ]);

      const todayWeight = (weightRes as { data: { weight_kg: number } | null }).data;
      const todaySteps = stepsRes.data;
      const weekWeights = (weekRes as { data: { id: string }[] | null }).data ?? [];

      setState({
        weightKg: todayWeight?.weight_kg ?? null,
        stepsCount: todaySteps?.steps ?? null,
        weeklyWeightCount: weekWeights.length,
      });
    } catch (err) {
      console.error("[LogTodayCard] load:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, phaseId]);

  useEffect(() => {
    if (hasFetched.current === userId) return;
    hasFetched.current = userId;
    load();
  }, [userId, load]);

  const saveWeight = async () => {
    const w = parseFloat(weightInput);
    if (!Number.isFinite(w) || w < 20 || w > 300) {
      toast({ title: "Enter a weight between 20 and 300 kg", variant: "destructive" });
      return;
    }
    setSavingWeight(true);
    try {
      // weight_logs requires phase_id -- we don't try to create a fake phase.
      // If a phase isn't assigned yet, the card just hides the weight input.
      if (!phaseId) throw new Error("No active nutrition phase");
      // week_number is days-since-phase-start / 7, floored and +1.
      // Matches how CoachNutritionProgress aggregates weeks for the adjustment view.
      const weekNum = phaseStartDate
        ? Math.max(1, Math.floor(differenceInDays(new Date(), new Date(phaseStartDate)) / 7) + 1)
        : 1;
      const { error } = await supabase
        .from("weight_logs")
        .upsert(
          {
            user_id: userId,
            phase_id: phaseId,
            log_date: today(),
            weight_kg: w,
            week_number: weekNum,
          },
          { onConflict: "phase_id,log_date" },
        );
      if (error) throw error;
      toast({ title: "Weight logged" });
      setWeightInput("");
      await load();
      onLogged?.("weight");
    } catch (err: unknown) {
      toast({ title: "Couldn't save weight", description: sanitizeErrorForUser(err), variant: "destructive" });
    } finally {
      setSavingWeight(false);
    }
  };

  const saveSteps = async () => {
    const s = parseInt(stepsInput, 10);
    if (!Number.isFinite(s) || s < 0 || s > 100000) {
      toast({ title: "Enter a step count between 0 and 100,000", variant: "destructive" });
      return;
    }
    setSavingSteps(true);
    try {
      const { error } = await supabase
        .from("step_logs")
        .upsert(
          {
            user_id: userId,
            log_date: today(),
            steps: s,
            source: "manual",
          },
          { onConflict: "user_id,log_date" },
        );
      if (error) throw error;
      toast({ title: "Steps logged" });
      setStepsInput("");
      await load();
      onLogged?.("steps");
    } catch (err: unknown) {
      toast({ title: "Couldn't save steps", description: sanitizeErrorForUser(err), variant: "destructive" });
    } finally {
      setSavingSteps(false);
    }
  };

  const weightDone = state.weightKg != null;
  const stepsDone = state.stepsCount != null;
  const weeklyRemaining = Math.max(0, 3 - state.weeklyWeightCount);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Log Today</CardTitle>
          <span className="font-mono text-[11px] text-muted-foreground">
            {weeklyRemaining === 0
              ? "Weekly weigh-in goal hit"
              : `${weeklyRemaining} more weigh-in${weeklyRemaining === 1 ? "" : "s"} this week`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Weight row */}
        <div className="flex items-center gap-3">
          <Scale className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          {weightDone ? (
            <div className="flex items-center gap-2 flex-1 text-sm text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
              <span>
                Logged <span className="font-mono text-foreground">{state.weightKg?.toFixed(1)} kg</span> today
              </span>
            </div>
          ) : !phaseId ? (
            <p className="text-sm text-muted-foreground flex-1">
              No active nutrition phase -- ask your coach to start one.
            </p>
          ) : (
            <div className="flex items-center gap-2 flex-1">
              <Label htmlFor="log-weight" className="sr-only">Weight (kg)</Label>
              <Input
                id="log-weight"
                type="number"
                inputMode="decimal"
                step={0.1}
                min={20}
                max={300}
                placeholder="Weight (kg)"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="h-10 text-base md:text-sm"
                disabled={loading}
              />
              <Button size="sm" onClick={saveWeight} disabled={loading || savingWeight || !weightInput}>
                Log
              </Button>
            </div>
          )}
        </div>

        {/* Steps row */}
        <div className="flex items-center gap-3">
          <Footprints className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          {stepsDone ? (
            <div className="flex items-center gap-2 flex-1 text-sm text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
              <span>
                Logged <span className="font-mono text-foreground">{state.stepsCount?.toLocaleString()}</span> steps today
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1">
              <Label htmlFor="log-steps" className="sr-only">Steps</Label>
              <Input
                id="log-steps"
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                placeholder="Steps"
                value={stepsInput}
                onChange={(e) => setStepsInput(e.target.value)}
                className="h-10 text-base md:text-sm"
                disabled={loading}
              />
              <Button size="sm" onClick={saveSteps} disabled={loading || savingSteps || !stepsInput}>
                Log
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
