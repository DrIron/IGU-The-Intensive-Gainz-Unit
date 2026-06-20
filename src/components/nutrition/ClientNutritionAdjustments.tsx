import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { interpretAdjustment, toneClasses } from "@/lib/interpret";
import { cn } from "@/lib/utils";
import { MacroDistributionRibbon } from "@/components/nutrition/MacroDistributionRibbon";

interface ClientNutritionAdjustmentsProps {
  phase: any;
}

export function ClientNutritionAdjustments({ phase }: ClientNutritionAdjustmentsProps) {
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAdjustments = useCallback(async () => {
    if (!phase) return;
    try {
      const { data, error } = await supabase
        .from('nutrition_adjustments')
        .select('*')
        .eq('phase_id', phase.id)
        .order('week_number', { ascending: false });

      if (error) throw error;
      setAdjustments(data || []);
    } catch (error: any) {
      console.error('Error loading adjustments:', error);
    } finally {
      setLoading(false);
    }
  }, [phase]);

  useEffect(() => {
    if (phase) {
      loadAdjustments();
    }
  }, [phase, loadAdjustments]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="default">Applied</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending Review</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Not Applied</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading adjustments...</p>
        </CardContent>
      </Card>
    );
  }

  if (adjustments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Adjustments Yet</CardTitle>
          <CardDescription>Your coach will review your progress and make adjustments as needed</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const latestApplied = adjustments.find((a) => a.status === "approved"); // 'approved' renders as "Applied"

  return (
    <div className="space-y-6">
      {latestApplied && (() => {
        const interp = interpretAdjustment({
          calorieDelta: latestApplied.approved_calorie_adjustment,
          newCalories: latestApplied.new_daily_calories,
          expectedPct: latestApplied.expected_weight_change_percentage,
          actualPct: latestApplied.actual_weight_change_percentage,
          isDietBreak: latestApplied.is_diet_break_week,
        });
        const tc = toneClasses(interp.tone);
        return (
          <Card className={cn("border-l-4", tc.rail, tc.soft)}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Your plan just updated</CardTitle>
                  <CardDescription>
                    Week {latestApplied.week_number} · {format(new Date(latestApplied.created_at), "MMM d, yyyy")}
                  </CardDescription>
                </div>
                <Badge variant="secondary">Applied</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {Math.round(latestApplied.new_daily_calories || 0).toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">kcal / day</span>
              </div>
              <MacroDistributionRibbon
                protein={latestApplied.new_protein_grams || 0}
                fat={latestApplied.new_fat_grams || 0}
                carbs={latestApplied.new_carb_grams || 0}
                showLabels
              />
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <span aria-hidden className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", tc.dot)} />
                {interp.sentence}
              </p>
              {latestApplied.coach_notes && (
                <div className="border-t pt-3">
                  <p className="text-xs font-medium mb-1">From your coach</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{latestApplied.coach_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardHeader>
          <CardTitle>Adjustment History</CardTitle>
          <CardDescription>Track changes to your nutrition plan over time</CardDescription>
        </CardHeader>
      </Card>

      {adjustments.map((adjustment) => (
        <Card key={adjustment.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Week {adjustment.week_number}</CardTitle>
                <CardDescription>{format(new Date(adjustment.created_at), 'MMM dd, yyyy')}</CardDescription>
              </div>
              {getStatusBadge(adjustment.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Weight Change Comparison */}
            <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm text-muted-foreground">Expected Change</p>
                <p className="text-lg font-semibold">{adjustment.expected_weight_change_percentage?.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Actual Change</p>
                <p className="text-lg font-semibold">{adjustment.actual_weight_change_percentage?.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Deviation</p>
                <p className={cn("text-lg font-semibold", Math.abs(adjustment.deviation_percentage || 0) > 30 && toneClasses("risk").text)}>
                  {adjustment.deviation_percentage?.toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Adjustment Details */}
            {adjustment.status === 'approved' && adjustment.approved_calorie_adjustment && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  {adjustment.approved_calorie_adjustment > 0 ? (
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-muted-foreground" />
                  )}
                  <p className="font-medium">
                    Calories {adjustment.approved_calorie_adjustment > 0 ? 'increased' : 'decreased'} by {Math.abs(adjustment.approved_calorie_adjustment)} kcal
                  </p>
                </div>

                <div className="grid grid-cols-4 gap-4 p-4 rounded-lg bg-primary/10">
                  <div>
                    <p className="text-xs text-muted-foreground">New Calories</p>
                    <p className="text-lg font-bold">{Math.round(adjustment.new_daily_calories || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Protein</p>
                    <p className="text-lg font-bold">{Math.round(adjustment.new_protein_grams || 0)}g</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fat</p>
                    <p className="text-lg font-bold">{Math.round(adjustment.new_fat_grams || 0)}g</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Carbs</p>
                    <p className="text-lg font-bold">{Math.round(adjustment.new_carb_grams || 0)}g</p>
                  </div>
                </div>
              </div>
            )}

            {/* Diet Break Indicator */}
            {adjustment.is_diet_break_week && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <p className="text-sm font-medium">Diet Break Week - Maintenance Calories</p>
              </div>
            )}

            {/* Coach Notes */}
            {adjustment.coach_notes && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Coach Notes:</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{adjustment.coach_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
