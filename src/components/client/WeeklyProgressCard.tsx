import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Circle, TrendingDown, TrendingUp, Minus, ChevronRight } from "lucide-react";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { interpretWeeklyHabit, toneClasses } from "@/lib/interpret";
import { useCanonicalWeeklyAdherence } from "@/hooks/useCanonicalWeeklyAdherence";
import { calculateRollingAverage } from "@/utils/nutritionCalculations";
import { cn } from "@/lib/utils";

interface WeeklyProgressCardProps {
  userId: string;
}

interface WeeklyStats {
  nutritionDaysLogged: number;
  weightTrend: "up" | "down" | "stable" | null;
  weightChange: number | null;
}

/** A weigh-in the client actually took. Zero and non-finite rows are data entry noise. */
function isRealWeighIn(kg: number): boolean {
  return Number.isFinite(kg) && kg > 0;
}

/**
 * FU4 — week-over-week weight movement, SMOOTHED.
 *
 * The old math was `weights[0] - weights[weights.length - 1]` over the last 14 log ROWS:
 * a single raw endpoint at each end. One stray weigh-in anywhere in that window moved the
 * headline directly and completely — a mis-typed `0` produced "+17.5 kg" on a client's
 * dashboard, and any normal day-to-day fluctuation (water, food, time of day) was reported
 * as if it were real trend.
 *
 * Instead: compare the mean of the last 7 days against the mean of the 7 before it, via the
 * same `calculateRollingAverage` the rest of the nutrition surfaces use. Averaging is what
 * makes a single bad reading survivable — it can shift the number, but it can no longer BE
 * the number. Zero/invalid weigh-ins are dropped before any averaging.
 *
 * Returns null when either week has no real weigh-in: we don't know, and saying nothing beats
 * inventing a trend from one datapoint.
 *
 * Exported for unit tests.
 */
export function computeSmoothedWeeklyTrend(
  logs: Array<{ log_date: string; weight_kg: number }>,
  today: Date,
): { weightTrend: WeeklyStats["weightTrend"]; weightChange: number | null } {
  const clean = logs.filter((l) => isRealWeighIn(l.weight_kg));

  const priorWeekEnd = new Date(today);
  priorWeekEnd.setDate(priorWeekEnd.getDate() - 7);

  // Two 7-day windows: [today-6 .. today] and [today-13 .. today-7]. No overlap.
  const thisWeekAvg = calculateRollingAverage(clean, format(today, "yyyy-MM-dd"));
  const priorWeekAvg = calculateRollingAverage(clean, format(priorWeekEnd, "yyyy-MM-dd"));

  if (thisWeekAvg == null || priorWeekAvg == null) {
    return { weightTrend: null, weightChange: null };
  }

  const weightChange = Number((thisWeekAvg - priorWeekAvg).toFixed(1));
  const weightTrend = Math.abs(weightChange) < 0.3 ? "stable" : weightChange > 0 ? "up" : "down";
  return { weightTrend, weightChange };
}

export function WeeklyProgressCard({ userId }: WeeklyProgressCardProps) {
  const navigate = useNavigate();
  // Workout completion is canonical (P5 A.2); nutrition + weight load below.
  const { weeklyCompleted, weeklyScheduled, loading: workoutsLoading } = useCanonicalWeeklyAdherence(userId);
  const [stats, setStats] = useState<WeeklyStats>({
    nutritionDaysLogged: 0,
    weightTrend: null,
    weightChange: null,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const hasFetched = useRef(false);

  const loadWeeklyStats = useCallback(async () => {
    try {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      // Get nutrition check-ins this week
      const { data: nutritionLogs } = await supabase
        .from("weight_logs")
        .select("log_date")
        .eq("user_id", userId)
        .gte("log_date", format(weekStart, "yyyy-MM-dd"))
        .lte("log_date", format(weekEnd, "yyyy-MM-dd"));

      const nutritionDays = new Set(nutritionLogs?.map(l => l.log_date)).size;

      // Weight trend — the last 14 DAYS, by date range. `.limit(14)` counted ROWS, which is
      // only 14 days if the client logs exactly once a day; weight_logs is unique per
      // (phase_id, log_date), so a client mid-phase-switch can have two rows on one day and
      // the window quietly shrank to a week.
      const trendStart = new Date(now);
      trendStart.setDate(trendStart.getDate() - 13);

      const { data: weights, error: weightErr } = await supabase
        .from("weight_logs")
        .select("weight_kg, log_date")
        .eq("user_id", userId)
        .gte("log_date", format(trendStart, "yyyy-MM-dd"))
        .lte("log_date", format(now, "yyyy-MM-dd"))
        .order("log_date", { ascending: false });
      if (weightErr) throw weightErr;

      const { weightTrend, weightChange } = computeSmoothedWeeklyTrend(
        (weights ?? []).map((w) => ({
          log_date: w.log_date as string,
          weight_kg: parseFloat(String(w.weight_kg)),
        })),
        now,
      );

      setStats({
        nutritionDaysLogged: nutritionDays,
        weightTrend,
        weightChange,
      });
    } catch (error) {
      console.error("Error loading weekly stats:", error);
    } finally {
      setStatsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || hasFetched.current) return;
    hasFetched.current = true;
    loadWeeklyStats();
  }, [userId, loadWeeklyStats]);

  // NEUTRAL by design. This used to be orange-up / green-down, which asserts that gaining is
  // bad and losing is good -- false for every client in a muscle-gain phase, i.e. exactly the
  // people the orange arrow would be scolding. The direction is already in the arrow and the
  // sign; the colour added nothing but a verdict. Same rule NU6 / PUB6 / CL5 / CO4 enforce.
  const getTrendIcon = () => {
    if (stats.weightTrend === "up") return <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    if (stats.weightTrend === "down") return <TrendingDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    if (stats.weightTrend === "stable") return <Minus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    return null;
  };

  const loading = statsLoading || workoutsLoading;

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">This Week</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-full" />
            <div className="h-2 bg-muted rounded w-full" />
            <div className="h-5 bg-muted rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <ClickableCard
      ariaLabel="View exercise history"
      onClick={() => navigate("/client/workout/history")}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">This Week</CardTitle>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Workouts */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Workouts</span>
            <span className="text-sm font-medium">
              {weeklyCompleted}/{weeklyScheduled}
            </span>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: Math.max(weeklyScheduled, 5) }).map((_, i) => (
              <div key={i} className="flex-1 flex justify-center">
                {i < weeklyCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
                ) : i < weeklyScheduled ? (
                  <Circle className="h-5 w-5 text-muted-foreground/30" aria-hidden="true" />
                ) : null}
              </div>
            ))}
          </div>
          {(() => {
            const habit = interpretWeeklyHabit(weeklyCompleted, weeklyScheduled, "sessions");
            return habit.sentence ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", toneClasses(habit.tone).dot)}
                />
                {habit.sentence}
              </p>
            ) : null;
          })()}
        </div>

        {/* Nutrition */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Nutrition Logged</span>
            <span className="text-sm font-medium">{stats.nutritionDaysLogged}/7 days</span>
          </div>
          <Progress value={(stats.nutritionDaysLogged / 7) * 100} className="h-2" />
        </div>

        {/* Weight Trend */}
        {stats.weightTrend && (
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">Weight Trend</span>
            <div className="flex items-center gap-1.5">
              {getTrendIcon()}
              <span className="text-sm font-medium">
                {stats.weightChange !== null && stats.weightChange !== 0 && (
                  <>{stats.weightChange > 0 ? "+" : ""}{stats.weightChange} kg</>
                )}
                {stats.weightTrend === "stable" && "Stable"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </ClickableCard>
  );
}
