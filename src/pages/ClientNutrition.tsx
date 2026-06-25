import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { ClientPageLayout } from "@/components/layouts/ClientPageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { ClientNutritionProgress } from "@/components/nutrition/ClientNutritionProgress";
import { WeightProgressGraph } from "@/components/nutrition/WeightProgressGraph";
import { BodyFatProgressGraph } from "@/components/nutrition/BodyFatProgressGraph";
import { PhaseSummaryReport } from "@/components/nutrition/PhaseSummaryReport";
import { generatePhaseSummary } from "@/utils/nutritionCalculations";
import { ErrorFallback } from "@/components/ui/error-fallback";
import { NutritionPhaseCard } from "@/components/nutrition/NutritionPhaseCard";
import { ClientWeeklyRibbon } from "@/components/nutrition/ClientWeeklyRibbon";
import { LogTodayCard } from "@/components/client/LogTodayCard";
import { differenceInCalendarWeeks, differenceInDays } from "date-fns";

/**
 * Client nutrition page -- redesigned Apr 21.
 *
 * Before: two tabs (Progress / Graphs) and a 5-section input form on Progress
 * with four separate date pickers. The coach could see adherence at a glance;
 * the client had to scroll.
 *
 * After:
 *   1. Weekly ribbon at the top answering "what's left this week?" (weigh-ins
 *      X/3, step days X/7, check-in done/due).
 *   2. NutritionPhaseCard hero -- the same component the coach sees, read-only.
 *      Macro ribbon + kcal hero + rate strip. Gives the client a visual of
 *      "what you're aiming for" before the input forms.
 *   3. One consolidated scroll, no tabs (NU redesign Phase 2):
 *      - "Message coach to adjust" link under the hero (1:1 goals are
 *        coach-set, so the page is read-only -- no Edit sheet).
 *      - Log Today inline right after the ribbon (same LogTodayCard used
 *        on /dashboard) -- the daily habit.
 *      - Trend: a range control (4W/12W/All) + Weight|Body-fat toggle
 *        above the chart, replacing the old Graphs tab.
 *      - This week -- the full tracking form (circumference, BF%, weekly
 *        check-in) wrapping the existing ClientNutritionProgress monolith.
 *      PhaseSummaryReport still renders at the top once the phase completes.
 *
 * No data model change. All queries still fire against nutrition_phases /
 * weight_logs / circumference_logs / adherence_logs / weekly_progress /
 * step_logs.
 */
export default function ClientNutrition() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activePhase, setActivePhase] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [userGender, setUserGender] = useState<string | null>(null);
  const [initialBodyFat, setInitialBodyFat] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [phaseSummary, setPhaseSummary] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [weeklyProgress, setWeeklyProgress] = useState<any[]>([]);
  const [latestAverageWeight, setLatestAverageWeight] = useState<number | null>(null);
  const [latestActualChangePercent, setLatestActualChangePercent] = useState<number | null>(null);
  const [error, setError] = useState(false);
  // Bumped when LogTodayCard finishes a save so the ribbon re-fetches without
  // reloading the page. Any integer change forces the ribbon's useEffect to fire.
  const [ribbonRefreshKey, setRibbonRefreshKey] = useState(0);
  // Trend controls (replace the old Graphs tab).
  const [range, setRange] = useState<"4w" | "12w" | "all">("all");
  const [metric, setMetric] = useState<"weight" | "bodyfat">("weight");

  const loadActivePhase = useCallback(async (user: SupabaseUser | null) => {
    try {
      if (!user) return;

      const { data: phase, error: phaseError } = await supabase
        .from("nutrition_phases")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .maybeSingle();

      if (phaseError) throw phaseError;
      setActivePhase(phase);

      if (phase) {
        const [weightsRes, adherenceRes, adjustmentsRes, weeklyProgressRes] = await Promise.all([
          supabase.from("weight_logs").select("*").eq("phase_id", phase.id).order("log_date", { ascending: true }),
          supabase.from("adherence_logs").select("*").eq("phase_id", phase.id),
          supabase.from("nutrition_adjustments").select("*").eq("phase_id", phase.id),
          supabase.from("weekly_progress").select("week_number, body_fat_percentage").eq("goal_id", phase.id).order("week_number", { ascending: true }),
        ]);

        if (weightsRes.error) console.warn("[ClientNutrition] weight_logs:", weightsRes.error.message);
        if (adherenceRes.error) console.warn("[ClientNutrition] adherence_logs:", adherenceRes.error.message);
        if (adjustmentsRes.error) console.warn("[ClientNutrition] nutrition_adjustments:", adjustmentsRes.error.message);
        if (weeklyProgressRes.error) console.warn("[ClientNutrition] weekly_progress:", weeklyProgressRes.error.message);

        const weights = weightsRes.data || [];
        setWeightLogs(weights);
        setWeeklyProgress(weeklyProgressRes.data || []);

        // Compute latest week avg weight + actual change % so the hero card
        // can render the same On Track / Ahead / Behind badge the coach sees.
        if (weights.length > 0) {
          // Group by week_number.
          const byWeek = new Map<number, number[]>();
          for (const w of weights) {
            const arr = byWeek.get(w.week_number) ?? [];
            arr.push(parseFloat(w.weight_kg));
            byWeek.set(w.week_number, arr);
          }
          const sortedWeeks = [...byWeek.keys()].sort((a, b) => a - b);
          const lastWeek = sortedWeeks[sortedWeeks.length - 1];
          const prevWeek = sortedWeeks[sortedWeeks.length - 2];
          const avg = (n: number) => {
            const arr = byWeek.get(n)!;
            return arr.reduce((s, v) => s + v, 0) / arr.length;
          };
          const lastAvg = avg(lastWeek);
          setLatestAverageWeight(lastAvg);
          if (prevWeek != null) {
            const prevAvg = avg(prevWeek);
            setLatestActualChangePercent(((lastAvg - prevAvg) / prevAvg) * 100);
          }

          const { data: weekOneBf } = await supabase
            .from("weekly_progress")
            .select("body_fat_percentage")
            .eq("goal_id", phase.id)
            .eq("week_number", 1)
            .maybeSingle();
          setInitialBodyFat(weekOneBf?.body_fat_percentage || null);
        }

        // Generate phase summary if phase is complete.
        const weeksSinceStart = differenceInCalendarWeeks(new Date(), new Date(phase.start_date)) + 1;
        const estimatedWeeks = phase.estimated_end_date
          ? differenceInCalendarWeeks(new Date(phase.estimated_end_date), new Date(phase.start_date))
          : null;
        if (estimatedWeeks && weeksSinceStart >= estimatedWeeks) {
          const summary = generatePhaseSummary(
            phase,
            weights,
            adherenceRes.data || [],
            adjustmentsRes.data || [],
          );
          setPhaseSummary(summary);
        }
      }
    } catch (err: unknown) {
      console.error("Error loading nutrition phase:", err);
      toast({
        title: "Error",
        description: "Failed to load nutrition data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadUser = useCallback(async (user: SupabaseUser | null) => {
    try {
      if (!user) {
        navigate("/nutrition");
        return;
      }

      const [{ data: profilePublic }, { data: profilePrivate }, { data: subscription }] = await Promise.all([
        supabase.from("profiles_public").select("status").eq("id", user.id).maybeSingle(),
        supabase.from("profiles_private").select("gender").eq("profile_id", user.id).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("id, status, service_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // Resolve service type via a separate query -- CLAUDE.md bans nested
      // PostgREST FK joins on subscriptions.
      let serviceType: string | null = null;
      if (subscription?.service_id) {
        const { data: service } = await supabase
          .from("services")
          .select("type")
          .eq("id", subscription.service_id)
          .maybeSingle();
        serviceType = service?.type ?? null;
      }

      const isActiveClient = profilePublic?.status === "active" && subscription?.status === "active";
      const isOneToOne = serviceType === "one_to_one";
      if (!isActiveClient || !isOneToOne) {
        toast({
          title: "Access Restricted",
          description: "This page is for 1:1 coaching clients only.",
          variant: "destructive",
        });
        navigate("/nutrition");
        return;
      }

      setUser(user);
      setUserGender(profilePrivate?.gender || null);
      loadActivePhase(user);
    } catch (err) {
      console.error("Error loading user:", err);
      setError(true);
      setLoading(false);
    }
  }, [navigate, toast, loadActivePhase]);

  const hasFetched = useRef<string | null>(null);
  useEffect(() => {
    const key = sessionUser?.id ?? (sessionLoading ? "__waiting__" : "__unauth__");
    if (hasFetched.current === key) return;
    hasFetched.current = key;
    if (sessionLoading) return;
    loadUser(sessionUser ?? null);
  }, [sessionUser, sessionLoading, loadUser]);

  if (error) {
    return (
      <ClientPageLayout>
        <div className="container mx-auto px-4 pt-6 md:pt-8">
          <ErrorFallback onRetry={() => window.location.reload()} />
        </div>
      </ClientPageLayout>
    );
  }

  // Current phase week (1-based) for the ribbon and for scoped queries.
  const currentWeekNumber = activePhase?.start_date
    ? Math.max(1, Math.floor(differenceInDays(new Date(), new Date(activePhase.start_date)) / 7) + 1)
    : 1;

  // Trend range filter (1:1 = dated weight_logs): keep logs within the window;
  // skip the filter for "all". Filtered upstream so the graph stays untouched.
  const trendWeightLogs = range === "all"
    ? weightLogs
    : weightLogs.filter(
        (w) => differenceInDays(new Date(), new Date(w.log_date)) <= (range === "4w" ? 28 : 84),
      );

  return (
    <ClientPageLayout>
      <div className="container mx-auto px-4 pt-6 md:pt-8 pb-24 md:pb-12 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold mb-1">Nutrition</h1>
          <p className="text-muted-foreground">Track your nutrition goals and progress.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !activePhase ? (
          <Card>
            <CardHeader>
              <CardTitle>No Active Nutrition Phase</CardTitle>
              <CardDescription>
                Your coach hasn't set up a nutrition phase yet. Contact them to get started.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-6">
            {phaseSummary && <PhaseSummaryReport phase={activePhase} summary={phaseSummary} />}

            {/* Hero phase card -- same component coaches see, read-only from the
                client's side (no onEditPhase / onScrollToAdjustments props). */}
            <NutritionPhaseCard
              phase={activePhase}
              weeksElapsed={currentWeekNumber}
              latestAverageWeight={latestAverageWeight}
              latestActualChangePercent={latestActualChangePercent}
            />

            {/* 1:1 goals are coach-set -- no self-edit; nudge to message instead. */}
            <button
              type="button"
              onClick={() => navigate("/messages")}
              className="text-sm text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Message coach to adjust
            </button>

            {/* Weekly status ribbon. */}
            {user?.id && (
              <ClientWeeklyRibbon
                userId={user.id}
                phaseId={activePhase.id}
                weekNumber={currentWeekNumber}
                refreshKey={ribbonRefreshKey}
              />
            )}

            {/* Log Today -- the daily habit, promoted inline right after the ribbon. */}
            {user?.id && (
              <LogTodayCard
                userId={user.id}
                phaseId={activePhase.id}
                phaseStartDate={activePhase.start_date ?? null}
                onLogged={() => setRibbonRefreshKey((k) => k + 1)}
              />
            )}

            {/* Trend -- range control + Weight|Body-fat toggle above the chart. */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg border p-0.5">
                  {(["4w", "12w", "all"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRange(r)}
                      className={cn(
                        "px-3 py-1 text-sm rounded-md transition-colors",
                        range === r
                          ? "bg-secondary border border-secondary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r === "4w" ? "4W" : r === "12w" ? "12W" : "All"}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-lg border p-0.5">
                  {(["weight", "bodyfat"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetric(m)}
                      className={cn(
                        "px-3 py-1 text-sm rounded-md transition-colors",
                        metric === m
                          ? "bg-secondary border border-secondary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m === "weight" ? "Weight" : "Body fat"}
                    </button>
                  ))}
                </div>
              </div>
              {metric === "weight" ? (
                trendWeightLogs.length > 0 ? (
                  <WeightProgressGraph
                    phase={activePhase}
                    weightLogs={trendWeightLogs}
                    latestActualChangePercent={latestActualChangePercent}
                  />
                ) : (
                  <Card>
                    <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                      {weightLogs.length > 0
                        ? "No weight logs in this range."
                        : "Log weight this week to see your trend graph here."}
                    </CardContent>
                  </Card>
                )
              ) : (
                <BodyFatProgressGraph weeklyProgress={weeklyProgress} />
              )}
            </div>

            {/* This week -- the full tracking form (circumference, BF%, check-in). */}
            <div className="space-y-3">
              <h2 className="text-xl font-bold">This week</h2>
              <ClientNutritionProgress
                phase={activePhase}
                userGender={userGender}
                initialBodyFat={initialBodyFat}
              />
            </div>
          </div>
        )}
      </div>
    </ClientPageLayout>
  );
}
