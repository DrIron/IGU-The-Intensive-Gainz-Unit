import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { shouldApplyAdjustment } from "@/utils/nutritionCalculations";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { NutritionAdjustmentWeekCard, type WeekSnapshot } from "./NutritionAdjustmentWeekCard";

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
    goal_type: "loss" | "gain" | "maintenance" | string;
  };
  onAdjustmentMade: () => void;
}

export function CoachNutritionProgress({ phase, onAdjustmentMade }: CoachNutritionProgressProps) {
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

  // Handle both the DB enum (fat_loss / muscle_gain) and the form short form
  // (loss / gain) -- see CoachNutritionGoal FORM_TO_DB_GOAL mapping.
  const isLossGoal = phase.goal_type === "fat_loss" || phase.goal_type === "loss";
  const isGainGoal = phase.goal_type === "muscle_gain" || phase.goal_type === "gain";
  const signedExpectedChange = isLossGoal
    ? -(phase.weekly_rate_percentage || 0)
    : isGainGoal
    ? phase.weekly_rate_percentage || 0
    : 0;

  const handleCreateAdjustment = async (
    weekNumber: number,
    input: { calories: number; notes?: string; isDietBreak: boolean },
  ) => {
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
