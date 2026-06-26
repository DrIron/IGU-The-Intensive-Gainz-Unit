import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { shouldApplyAdjustment, recommendWeeklyAdjustment } from "@/utils/nutritionCalculations";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { NutritionAdjustmentWeekCard, type WeekSnapshot } from "./NutritionAdjustmentWeekCard";
import { NutritionDecisionCard } from "./NutritionDecisionCard";

/**
 * Weekly progress review for a coach -- drives the Adjustments tab.
 *
 * The per-week aggregation logic is the original (phase-scoped weight_logs
 * + adherence_logs + nutrition_adjustments, grouped by week_number). The UI
 * layer swapped Accordion-per-week for a grid of `NutritionAdjustmentWeekCard`
 * so the coach can see every week's status at a glance and act inline.
 */

interface CoachNutritionProgressProps {
  phase: {
    id: string;
    daily_calories: number;
    protein_grams: number;
    fat_grams: number;
    carb_grams: number;
    weekly_rate_percentage: number;
    goal_type: "fat_loss" | "muscle_gain" | "maintenance" | string;
  };
  /**
   * Past-phase guard. When true, the weekly read-out still renders so coaches
   * can review what happened, but the four mutation handlers (create /
   * approve / reject / delay) short-circuit with a toast. We can't hide the
   * per-row buttons without modifying NutritionAdjustmentWeekCard (out of
   * scope for this PR), so guarding at the handler boundary is the next-best
   * defense -- combined with the banner above the grid.
   */
  isReadOnly?: boolean;
  onAdjustmentMade: () => void;
  /**
   * "grid" (default) renders the full per-week adjustment grid -- unchanged.
   * "decision" renders only the current week's decision hero
   * (NutritionDecisionCard) for the top of the redesigned Nutrition tab (B2).
   * Both variants share this component's data load + handlers, so any action
   * triggers onAdjustmentMade -> parent re-resolves the phase -> both mounts
   * reload in lockstep (no drift between the hero and the grid).
   */
  variant?: "grid" | "decision";
}

export function CoachNutritionProgress({ phase, isReadOnly = false, onAdjustmentMade, variant = "grid" }: CoachNutritionProgressProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [weeklyData, setWeeklyData] = useState<WeekSnapshot[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const loadAllData = useCallback(async () => {
    try {
      setLoadingInitial(true);
      const [weightsRes, adherenceRes, adjustmentsRes] = await Promise.all([
        supabase.from("weight_logs").select("*").eq("phase_id", phase.id).order("log_date", { ascending: true }),
        supabase.from("adherence_logs").select("*").eq("phase_id", phase.id),
        supabase.from("nutrition_adjustments").select("*").eq("phase_id", phase.id),
      ]);

      if (weightsRes.error) throw weightsRes.error;
      if (adherenceRes.error) throw adherenceRes.error;
      if (adjustmentsRes.error) throw adjustmentsRes.error;

      const weights = weightsRes.data || [];
      const adjustments = adjustmentsRes.data || [];

      const weekMap = new Map<number, { weightLogs: any[]; adjustment: any | null }>();
      weights.forEach((log: any) => {
        const week = log.week_number;
        if (!weekMap.has(week)) weekMap.set(week, { weightLogs: [], adjustment: null });
        weekMap.get(week)!.weightLogs.push(log);
      });
      adjustments.forEach((adj: any) => {
        if (weekMap.has(adj.week_number)) {
          weekMap.get(adj.week_number)!.adjustment = adj;
        } else {
          // Delay/diet-break adjustments may exist without weigh-ins -- seed the bucket.
          weekMap.set(adj.week_number, { weightLogs: [], adjustment: adj });
        }
      });

      const sortedWeeks = Array.from(weekMap.keys()).sort((a, b) => a - b);
      const weeks: WeekSnapshot[] = [];
      let prevAvg: number | null = null;
      sortedWeeks.forEach((weekNum) => {
        const data = weekMap.get(weekNum)!;
        const avg = data.weightLogs.length
          ? data.weightLogs.reduce((sum, log) => sum + parseFloat(log.weight_kg), 0) / data.weightLogs.length
          : prevAvg ?? 0;
        const actualChange = prevAvg ? ((avg - prevAvg) / prevAvg) * 100 : null;
        weeks.push({
          weekNumber: weekNum,
          averageWeight: avg,
          weighInCount: data.weightLogs.length,
          actualChange,
          expectedChange: phase.weekly_rate_percentage || 0,
          adjustment: data.adjustment,
        });
        if (data.weightLogs.length) prevAvg = avg;
      });

      setWeeklyData(weeks.reverse());
    } catch (error: any) {
      console.error("Error loading progress data:", error);
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoadingInitial(false);
    }
  }, [phase.id, phase.weekly_rate_percentage, toast]);

  useEffect(() => {
    if (phase) loadAllData();
  }, [phase, loadAllData]);

  const isLossGoal = phase.goal_type === "fat_loss";
  const isGainGoal = phase.goal_type === "muscle_gain";
  const signedExpectedChange = isLossGoal
    ? -(phase.weekly_rate_percentage || 0)
    : isGainGoal
    ? phase.weekly_rate_percentage || 0
    : 0;

  // Single guard called from every mutation handler. We can't hide the per-week
  // action buttons without editing NutritionAdjustmentWeekCard (out of scope),
  // so this is the failsafe: if a coach clicks a button on a past phase, the
  // toast explains why nothing happened.
  const blockIfReadOnly = (): boolean => {
    if (!isReadOnly) return false;
    toast({
      title: "Phase ended",
      description: "Adjustments on past phases are read-only.",
      variant: "destructive",
    });
    return true;
  };

  const handleCreateAdjustment = async (
    weekNumber: number,
    input: { calories: number; notes?: string; isDietBreak: boolean },
  ) => {
    if (blockIfReadOnly()) return;
    const week = weeklyData.find((w) => w.weekNumber === weekNumber);
    if (!week) return;

    if (!input.isDietBreak && !shouldApplyAdjustment(input.calories)) {
      toast({
        title: "Adjustment too small",
        description: "Changes under ±50 kcal aren't applied.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newCalories = input.isDietBreak ? phase.daily_calories : phase.daily_calories + input.calories;

      const proteinCals = phase.protein_grams * 4;
      const fatCals = phase.fat_grams * 9;
      const carbCals = phase.carb_grams * 4;
      const totalCals = proteinCals + fatCals + carbCals || 1;

      const proteinRatio = proteinCals / totalCals;
      const fatRatio = fatCals / totalCals;
      const carbRatio = carbCals / totalCals;

      const newProtein = (newCalories * proteinRatio) / 4;
      const newFat = (newCalories * fatRatio) / 9;
      const newCarbs = (newCalories * carbRatio) / 4;

      const deviation =
        week.actualChange != null && signedExpectedChange !== 0
          ? ((week.actualChange - signedExpectedChange) / Math.abs(signedExpectedChange)) * 100
          : null;

      const { error } = await supabase.from("nutrition_adjustments").insert({
        phase_id: phase.id,
        week_number: weekNumber,
        actual_weight_change_percentage: week.actualChange,
        expected_weight_change_percentage: signedExpectedChange,
        deviation_percentage: deviation,
        suggested_calorie_adjustment: input.calories,
        approved_calorie_adjustment: input.calories,
        new_daily_calories: newCalories,
        new_protein_grams: newProtein,
        new_fat_grams: newFat,
        new_carb_grams: newCarbs,
        is_diet_break_week: input.isDietBreak || false,
        status: "pending",
        coach_notes: input.notes || null,
        approved_by: user.id,
      });

      if (error) throw error;

      toast({
        title: input.isDietBreak ? "Diet break scheduled" : "Adjustment created",
        description: "Pending approval -- review and apply when ready.",
      });
      await loadAllData();
      onAdjustmentMade();
    } catch (error: any) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAdjustment = async (weekNumber: number) => {
    if (blockIfReadOnly()) return;
    const week = weeklyData.find((w) => w.weekNumber === weekNumber);
    if (!week?.adjustment) return;
    try {
      setLoading(true);
      const { error: adjError } = await supabase
        .from("nutrition_adjustments")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", week.adjustment.id);
      if (adjError) throw adjError;

      const { error: phaseError } = await supabase
        .from("nutrition_phases")
        .update({
          daily_calories: week.adjustment.new_daily_calories,
          protein_grams: week.adjustment.new_protein_grams,
          fat_grams: week.adjustment.new_fat_grams,
          carb_grams: week.adjustment.new_carb_grams,
          updated_at: new Date().toISOString(),
        })
        .eq("id", phase.id);
      if (phaseError) throw phaseError;

      toast({ title: "Approved", description: "Macros updated for the phase." });
      await loadAllData();
      onAdjustmentMade();
    } catch (error: any) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectAdjustment = async (weekNumber: number) => {
    if (blockIfReadOnly()) return;
    const week = weeklyData.find((w) => w.weekNumber === weekNumber);
    if (!week?.adjustment) return;
    try {
      const { error } = await supabase
        .from("nutrition_adjustments")
        .update({ status: "rejected" })
        .eq("id", week.adjustment.id);
      if (error) throw error;
      toast({ title: "Rejected" });
      await loadAllData();
    } catch (error: any) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    }
  };

  const handleDelayWeek = async (weekNumber: number) => {
    if (blockIfReadOnly()) return;
    try {
      setLoading(true);
      const { error } = await supabase.from("nutrition_adjustments").insert({
        phase_id: phase.id,
        week_number: weekNumber,
        is_delayed: true,
        delayed_reason: "Weight spike or hormonal fluctuation",
        status: "approved",
        suggested_calorie_adjustment: 0,
        approved_calorie_adjustment: 0,
        new_daily_calories: phase.daily_calories,
        new_protein_grams: phase.protein_grams,
        new_fat_grams: phase.fat_grams,
        new_carb_grams: phase.carb_grams,
      });
      if (error) throw error;
      toast({ title: "Delayed", description: "Week marked as delayed." });
      await loadAllData();
    } catch (error: any) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  /**
   * One-click apply for the decision hero (B2): create the adjustment already
   * approved AND push the new macros to the phase in a single coach action.
   * Combines handleCreateAdjustment's insert (status 'approved') with
   * handleApprove's phase update -- same field math, no new write semantics.
   */
  const handleApplyRecommendation = async (
    weekNumber: number,
    amount: number,
    notes?: string,
  ) => {
    if (blockIfReadOnly()) return;
    const week = weeklyData.find((w) => w.weekNumber === weekNumber);
    if (!week) return;
    if (!shouldApplyAdjustment(amount)) {
      toast({
        title: "Adjustment too small",
        description: "Changes under ±50 kcal aren't applied.",
        variant: "destructive",
      });
      return;
    }
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newCalories = phase.daily_calories + amount;
      const proteinCals = phase.protein_grams * 4;
      const fatCals = phase.fat_grams * 9;
      const carbCals = phase.carb_grams * 4;
      const totalCals = proteinCals + fatCals + carbCals || 1;
      const newProtein = (newCalories * (proteinCals / totalCals)) / 4;
      const newFat = (newCalories * (fatCals / totalCals)) / 9;
      const newCarbs = (newCalories * (carbCals / totalCals)) / 4;

      const deviation =
        week.actualChange != null && signedExpectedChange !== 0
          ? ((week.actualChange - signedExpectedChange) / Math.abs(signedExpectedChange)) * 100
          : null;

      const { error: insertError } = await supabase.from("nutrition_adjustments").insert({
        phase_id: phase.id,
        week_number: weekNumber,
        actual_weight_change_percentage: week.actualChange,
        expected_weight_change_percentage: signedExpectedChange,
        deviation_percentage: deviation,
        suggested_calorie_adjustment: amount,
        approved_calorie_adjustment: amount,
        new_daily_calories: newCalories,
        new_protein_grams: newProtein,
        new_fat_grams: newFat,
        new_carb_grams: newCarbs,
        is_diet_break_week: false,
        status: "approved",
        approved_at: new Date().toISOString(),
        coach_notes: notes || null,
        approved_by: user.id,
      });
      if (insertError) throw insertError;

      const { error: phaseError } = await supabase
        .from("nutrition_phases")
        .update({
          daily_calories: newCalories,
          protein_grams: newProtein,
          fat_grams: newFat,
          carb_grams: newCarbs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", phase.id);
      if (phaseError) throw phaseError;

      toast({ title: "Applied", description: "Macros updated for the phase." });
      await loadAllData();
      onAdjustmentMade();
    } catch (error: any) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // --- Decision-hero variant (B2): just the current week's decision card. ---
  if (variant === "decision") {
    if (loadingInitial && weeklyData.length === 0) return null;
    const current = weeklyData[0];
    if (!current) return null;
    const recommendation = recommendWeeklyAdjustment({
      actualChangePct: current.actualChange,
      signedExpectedChangePct: signedExpectedChange,
      averageWeightKg: current.averageWeight,
      weighInCount: current.weighInCount,
      hasExistingAdjustment: !!current.adjustment,
      current: {
        calories: phase.daily_calories,
        protein: phase.protein_grams,
        fat: phase.fat_grams,
        carbs: phase.carb_grams,
      },
    });
    return (
      <NutritionDecisionCard
        weekNumber={current.weekNumber}
        recommendation={recommendation}
        existingAdjustment={current.adjustment}
        averageWeight={current.averageWeight}
        weighInCount={current.weighInCount}
        actualChange={current.actualChange}
        signedExpectedChange={signedExpectedChange}
        currentCalories={phase.daily_calories}
        loading={loading}
        isReadOnly={isReadOnly}
        onApply={handleApplyRecommendation}
        onDietBreak={(weekNumber) =>
          handleCreateAdjustment(weekNumber, { calories: 0, isDietBreak: true })
        }
        onApprove={handleApproveAdjustment}
        onReject={handleRejectAdjustment}
      />
    );
  }

  if (loadingInitial && weeklyData.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading progress data...</p>
        </CardContent>
      </Card>
    );
  }

  if (weeklyData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No progress data yet</CardTitle>
          <CardDescription>
            Weigh-ins during your coaching window will show up here grouped by week.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isReadOnly && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            This phase has ended. The weekly read-out is shown for reference; new adjustments
            cannot be created or approved on past phases.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {weeklyData.map((week) => (
          <NutritionAdjustmentWeekCard
            key={week.weekNumber}
            week={week}
            signedExpectedChange={signedExpectedChange}
            loading={loading}
            onCreateAdjustment={handleCreateAdjustment}
            onApproveAdjustment={handleApproveAdjustment}
            onRejectAdjustment={handleRejectAdjustment}
            onDelayWeek={handleDelayWeek}
          />
        ))}
      </div>
    </div>
  );
}
