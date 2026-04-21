import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
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
 *   3. Three tabs instead of two:
 *      - Log Today -- the tiny inline weight + steps inputs (same
 *        LogTodayCard used on /dashboard). Lowest-friction path for the
 *        daily habit.
 *      - This Week -- the full tracking form (circumference, BF%,
 *        weekly check-in) wrapping the existing ClientNutritionProgress
 *        monolith. No refactor there -- that's a separate cleanup.
 *      - Graphs -- weight + body fat trend graphs, plus the
 *        PhaseSummaryReport once the phase is complete.
 *
 * No data model change. All queries still fire against nutrition_phases /
 * weight_logs / circumference_logs / adherence_logs / weekly_progress /
 * step_logs.
 */
export default function ClientNutrition() {
  const { toast } = useToast();
  const navigate = useNavigate();
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

  const loadActivePhase = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
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

  const loadUser = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/nutrition");
        return;
      }

      const [{ data: profilePublic }, { data: profilePrivate }, { data: subscription }] = await Promise.all([
        supabase.from("profiles_public").select("status").eq("id", user.id).maybeSingle(),
        supabase.from("profiles_private").select("gender").eq("profile_id", user.id).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("id, status, service_id, services!inner(type)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const isActiveClient = profilePublic?.status === "active" && subscription?.status === "active";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isOneToOne = (subscription as any)?.services?.type === "one_to_one";
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
      loadActivePhase();
    } catch (err) {
      console.error("Error loading user:", err);
      setError(true);
      setLoading(false);
    }
  }, [navigate, toast, loadActivePhase]);

  const hasFetched = useRef(false);
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadUser();
  }, [loadUser]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation user={null} />
        <main className="container mx-auto px-4 pt-24">
          <ErrorFallback onRetry={() => window.location.reload()} />
        </main>
      </div>
    );
  }

  // Current phase week (1-based) for the ribbon and for scoped queries.
  const currentWeekNumber = activePhase?.start_date
    ? Math.max(1, Math.floor(differenceInDays(new Date(), new Date(activePhase.start_date)) / 7) + 1)
    : 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation user={user} />

      <main className="container mx-auto px-4 pt-24 pb-24 md:pb-12 max-w-6xl">
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

            {/* Weekly status ribbon. Read-only; the inputs live in the tabs below. */}
            {user?.id && (
              <ClientWeeklyRibbon
                userId={user.id}
                phaseId={activePhase.id}
                weekNumber={currentWeekNumber}
              />
            )}

            <Tabs defaultValue="today" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="today">Log Today</TabsTrigger>
                <TabsTrigger value="week">This Week</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="today" className="mt-4">
                {user?.id && (
                  <LogTodayCard
                    userId={user.id}
                    phaseId={activePhase.id}
                    phaseStartDate={activePhase.start_date ?? null}
                  />
                )}
                <p className="text-[11px] text-muted-foreground mt-3">
                  Weight and steps are the daily habit. Body fat, circumference, and the weekly check-in live under &quot;This Week&quot;.
                </p>
              </TabsContent>

              <TabsContent value="week" className="mt-4">
                <ClientNutritionProgress
                  phase={activePhase}
                  userGender={userGender}
                  initialBodyFat={initialBodyFat}
                />
              </TabsContent>

              <TabsContent value="history" className="mt-4 space-y-6">
                {weightLogs.length > 0 ? (
                  <WeightProgressGraph phase={activePhase} weightLogs={weightLogs} />
                ) : (
                  <Card>
                    <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                      Log weight this week to see your trend graph here.
                    </CardContent>
                  </Card>
                )}
                <BodyFatProgressGraph weeklyProgress={weeklyProgress} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
}
