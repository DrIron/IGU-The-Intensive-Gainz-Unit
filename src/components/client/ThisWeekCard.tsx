import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, TrendingDown, TrendingUp, Minus, CalendarX } from "lucide-react";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { calculateRollingAverage } from "@/utils/nutritionCalculations";
import { useCanonicalWeeklyAdherence } from "@/hooks/useCanonicalWeeklyAdherence";
import { useWeeklyConsistency } from "@/hooks/useWeeklyConsistency";
import { cn } from "@/lib/utils";

/**
 * ThisWeekCard (1B) — the single "how's this week going" card, merging what used to be three
 * dashboard cards: AdherenceSummaryCard (the headline %), WeeklyProgressCard (workouts /
 * nutrition-days / weight trend), and the CL5 WeekConsistencyDots strip.
 *
 * It COMPOSES the existing hooks — `useCanonicalWeeklyAdherence` (canonical weekly completion),
 * `useWeeklyConsistency` (per-day trained dots) — plus a small weight/nutrition read lifted
 * verbatim from WeeklyProgressCard. No new queries beyond that lift.
 *
 * ── Honesty guards (carried from the retired cards — DO NOT regress) ─────────
 *  - No 0% ring when nothing is scheduled: `weeklyCompletionPct` is null exactly when the week
 *    has 0 scheduled sessions, and we show the empty copy instead of a punishing "0%".
 *  - The consistency dots render ONLY on a successful, settled read — never while loading and
 *    never on a read error (that would fabricate an empty week the client didn't have).
 *  - The weight-trend stat appears only when a real 14-day trend exists (both 7-day windows
 *    have a genuine weigh-in); otherwise it is silent, not "0 kg".
 */

// ── Weight trend (FU4) — smoothed, moved here from WeeklyProgressCard ────────────────────────
type WeightTrend = "up" | "down" | "stable" | null;

/** A weigh-in the client actually took. Zero and non-finite rows are data entry noise. */
function isRealWeighIn(kg: number): boolean {
  return Number.isFinite(kg) && kg > 0;
}

/**
 * Week-over-week weight movement, SMOOTHED (FU4). Compares the mean of the last 7 days against
 * the mean of the 7 before it (same `calculateRollingAverage` the rest of nutrition uses), so a
 * single stray reading can shift the number but can no longer BE it. Zero/invalid weigh-ins are
 * dropped first. Returns null when either week has no real weigh-in — saying nothing beats
 * inventing a trend from one datapoint. Exported for unit tests.
 */
export function computeSmoothedWeeklyTrend(
  logs: Array<{ log_date: string; weight_kg: number }>,
  today: Date,
): { weightTrend: WeightTrend; weightChange: number | null } {
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

// ── Adherence colour thresholds (kept from AdherenceSummaryCard) ─────────────────────────────
function adherencePctColor(percent: number): string {
  if (percent >= 80) return "text-green-500";
  if (percent >= 50) return "text-yellow-500";
  return "text-red-500";
}

// ── CL5 consistency dots (Mon → Sun). Duplicate letters (T/T, S/S) are fine — glanceable. ────
const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

interface WeeklyBodyStats {
  nutritionDaysLogged: number;
  weightTrend: WeightTrend;
  weightChange: number | null;
  loading: boolean;
}

/** Weight trend + nutrition-days-this-week, lifted from WeeklyProgressCard (Mon–Sun window). */
function useWeeklyBodyStats(userId: string): WeeklyBodyStats {
  const [stats, setStats] = useState<WeeklyBodyStats>({
    nutritionDaysLogged: 0,
    weightTrend: null,
    weightChange: null,
    loading: true,
  });
  const hasFetched = useRef(false);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      // Nutrition check-ins this week (distinct log dates).
      const { data: nutritionLogs, error: nutritionErr } = await supabase
        .from("weight_logs")
        .select("log_date")
        .eq("user_id", userId)
        .gte("log_date", format(weekStart, "yyyy-MM-dd"))
        .lte("log_date", format(weekEnd, "yyyy-MM-dd"));
      if (nutritionErr) throw nutritionErr;
      const nutritionDays = new Set(nutritionLogs?.map((l) => l.log_date)).size;

      // Weight trend — the last 14 DAYS by date range (not row count; weight_logs is unique per
      // (phase_id, log_date), so a phase switch can double up a day and shrink a row-limit window).
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

      setStats({ nutritionDaysLogged: nutritionDays, weightTrend, weightChange, loading: false });
    } catch (err) {
      // A failed read must not fabricate a trend — leave weightTrend null (hidden) and stop the
      // spinner. nutritionDaysLogged stays 0, matching the retired card's behaviour.
      captureException(err, { source: "ThisWeekCard.useWeeklyBodyStats" });
      setStats((s) => ({ ...s, loading: false }));
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || hasFetched.current) return;
    hasFetched.current = true;
    void load();
  }, [userId, load]);

  return stats;
}

export function ThisWeekCard({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const {
    weeklyCompleted,
    weeklyScheduled,
    weeklyCompletionPct,
    loading: adherenceLoading,
  } = useCanonicalWeeklyAdherence(userId);
  const {
    loading: dotsLoading,
    loadError: dotsError,
    weekDates,
    activeDates,
    activeCount,
  } = useWeeklyConsistency(userId);
  const body = useWeeklyBodyStats(userId);

  // NEUTRAL by design — direction lives in the arrow + sign; colour would add a verdict, and
  // gaining is the GOAL in a muscle-gain phase. Same rule NU6 / PUB6 / CL5 / CO4 enforce.
  const getTrendIcon = () => {
    if (body.weightTrend === "up") return <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
    if (body.weightTrend === "down") return <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
    if (body.weightTrend === "stable") return <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
    return null;
  };

  const loading = adherenceLoading || body.loading;

  if (loading) {
    return (
      <ClickableCard ariaLabel="View exercise history" onClick={() => navigate("/client/workout/history")}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">This week</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-28 w-full" />
        </CardContent>
      </ClickableCard>
    );
  }

  const hasSchedule = weeklyCompletionPct != null; // null ⇔ 0 scheduled this week
  const weightLabel =
    body.weightTrend === "stable"
      ? "Stable"
      : body.weightChange != null
        ? `${body.weightChange > 0 ? "+" : ""}${body.weightChange} kg`
        : "";
  // Dots only on a settled, successful read — never loading, never on error (no fake week).
  const showDots = !dotsLoading && !dotsError && weekDates.length === 7;

  return (
    <ClickableCard ariaLabel="View exercise history" onClick={() => navigate("/client/workout/history")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">This week</CardTitle>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Headline — the completion %, or the empty copy when nothing is scheduled (no 0% ring). */}
        {hasSchedule ? (
          <div className="flex items-baseline gap-2">
            <span className={cn("font-display text-4xl leading-none", adherencePctColor(weeklyCompletionPct!))}>
              {weeklyCompletionPct}%
            </span>
            <span className="text-sm text-muted-foreground">adherence</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-4 text-muted-foreground">
            <CalendarX className="h-5 w-5 shrink-0 opacity-40" aria-hidden="true" />
            <p className="text-sm">No workouts scheduled this week yet</p>
          </div>
        )}

        {/* CL5 consistency dots — PRESENCE, not a streak. Filled crimson = trained; neutral
            outline = not (never red / warning). The caption counts what happened, never what
            didn't. Rendered only when the read settled successfully. */}
        {showDots && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3" role="list" aria-label="This week's activity">
              {weekDates.map((iso, i) => {
                const active = activeDates.has(iso);
                return (
                  <div key={iso} className="flex flex-col items-center gap-1.5" role="listitem">
                    <span
                      aria-hidden
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        active ? "bg-primary" : "border border-border bg-transparent",
                      )}
                    />
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {DAY_INITIALS[i]}
                    </span>
                    <span className="sr-only">{active ? "Active" : "No workout logged"}</span>
                  </div>
                );
              })}
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {activeCount} {activeCount === 1 ? "active day" : "active days"} this week
            </p>
          </div>
        )}

        {/* Stat row — Workouts · Nutrition · Weight. Workouts is folded into the empty copy when
            nothing is scheduled, so it's dropped there. Weight only when a real trend exists. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-sm">
          {hasSchedule && (
            <span>
              <span className="text-muted-foreground">Workouts</span>{" "}
              <span className="font-medium">{weeklyCompleted}/{weeklyScheduled}</span>
            </span>
          )}
          <span>
            <span className="text-muted-foreground">Nutrition</span>{" "}
            <span className="font-medium">{body.nutritionDaysLogged}/7</span>
          </span>
          {body.weightTrend && (
            <span className="inline-flex items-center gap-1">
              <span className="text-muted-foreground">Weight</span>
              {getTrendIcon()}
              <span className="font-medium">{weightLabel}</span>
            </span>
          )}
        </div>
      </CardContent>
    </ClickableCard>
  );
}
