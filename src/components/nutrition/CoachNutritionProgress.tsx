import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertCircle, Check, X, Pause, Coffee } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { shouldApplyAdjustment } from "@/utils/nutritionCalculations";

interface CoachNutritionProgressProps {
  phase: any;
  onAdjustmentMade: () => void;
}

interface WeekData {
  weekNumber: number;
  weightLogs: any[];
  averageWeight: number;
  adherence: any | null;
  adjustment: any | null;
  previousWeekAvg: number | null;
  actualChange: number | null;
  expectedChange: number;
}

export function CoachNutritionProgress({ phase, onAdjustmentMade }: CoachNutritionProgressProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [weeklyData, setWeeklyData] = useState<WeekData[]>([]);
  const [adjustmentInputs, setAdjustmentInputs] = useState<{ [key: number]: { calories: string; notes: string; isDietBreak: boolean } }>({});

  useEffect(() => {
    if (phase) {
      loadAllData();
    }
  }, [phase]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      
      // Fetch all data in parallel
      const [weightsRes, adherenceRes, adjustmentsRes] = await Promise.all([
        supabase.from('weight_logs').select('*').eq('phase_id', phase.id).order('log_date', { ascending: true }),
        supabase.from('adherence_logs').select('*').eq('phase_id', phase.id),
        supabase.from('nutrition_adjustments').select('*').eq('phase_id', phase.id)
      ]);

      const weights = weightsRes.data || [];
      const adherence = adherenceRes.data || [];
      const adjustments = adjustmentsRes.data || [];

      // Group data by week
      const weekMap = new Map<number, any>();
      
      weights.forEach(log => {
        const week = log.week_number;
        if (!weekMap.has(week)) {
          weekMap.set(week, { weightLogs: [], adherence: null, adjustment: null });
        }
        weekMap.get(week).weightLogs.push(log);
      });

      adherence.forEach(log => {
        if (weekMap.has(log.week_number)) {
          weekMap.get(log.week_number).adherence = log;
        }
      });

      adjustments.forEach(adj => {
        if (weekMap.has(adj.week_number)) {
          weekMap.get(adj.week_number).adjustment = adj;
        }
      });

      // Calculate weekly averages and changes
      const weeks: WeekData[] = [];
      const sortedWeeks = Array.from(weekMap.keys()).sort((a, b) => a - b);

      sortedWeeks.forEach((weekNum, index) => {
        const data = weekMap.get(weekNum);
        const avgWeight = data.weightLogs.reduce((sum: number, log: any) => sum + parseFloat(log.weight_kg), 0) / data.weightLogs.length;
        
        const previousWeekAvg = index > 0 ? weeks[index - 1].averageWeight : null;
        const actualChange = previousWeekAvg ? ((avgWeight - previousWeekAvg) / previousWeekAvg) * 100 : null;
        const expectedChange = phase.weekly_rate_percentage || 0;

        weeks.push({
          weekNumber: weekNum,
          weightLogs: data.weightLogs,
          averageWeight: avgWeight,
          adherence: data.adherence,
          adjustment: data.adjustment,
          previousWeekAvg,
          actualChange,
          expectedChange
        });
      });

      setWeeklyData(weeks.reverse()); // Show most recent first
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({ title: "Error", description: "Failed to load progress data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdjustment = async (weekData: WeekData) => {
    const input = adjustmentInputs[weekData.weekNumber];
    if (!input?.calories && !input?.isDietBreak) {
      toast({ title: "Missing Data", description: "Please enter calorie adjustment or enable diet break", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const calorieAdjustment = input.isDietBreak ? 0 : parseInt(input.calories);
      
      // Apply minimum threshold check
      if (!input.isDietBreak && !shouldApplyAdjustment(calorieAdjustment)) {
        toast({ 
          title: "Adjustment Too Small", 
          description: "Adjustments under ±50 kcal are not applied to avoid insignificant changes",
          variant: "destructive"
        });
        return;
      }

      const newCalories = input.isDietBreak ? phase.daily_calories : phase.daily_calories + calorieAdjustment;
      
      // Maintain same macro percentages
      const proteinCals = phase.protein_grams * 4;
      const fatCals = phase.fat_grams * 9;
      const carbCals = phase.carb_grams * 4;
      const totalCals = proteinCals + fatCals + carbCals;
      
      const proteinRatio = proteinCals / totalCals;
      const fatRatio = fatCals / totalCals;
      const carbRatio = carbCals / totalCals;
      
      const newProtein = (newCalories * proteinRatio) / 4;
      const newFat = (newCalories * fatRatio) / 9;
      const newCarbs = (newCalories * carbRatio) / 4;

      const deviation = weekData.actualChange && weekData.expectedChange 
        ? ((weekData.actualChange - weekData.expectedChange) / weekData.expectedChange) * 100 
        : null;

      const { error } = await supabase.from('nutrition_adjustments').insert({
        phase_id: phase.id,
        week_number: weekData.weekNumber,
        actual_weight_change_percentage: weekData.actualChange,
        expected_weight_change_percentage: weekData.expectedChange,
        deviation_percentage: deviation,
        suggested_calorie_adjustment: calorieAdjustment,
        approved_calorie_adjustment: calorieAdjustment,
        new_daily_calories: newCalories,
        new_protein_grams: newProtein,
        new_fat_grams: newFat,
        new_carb_grams: newCarbs,
        is_diet_break_week: input.isDietBreak || false,
        status: 'pending',
        coach_notes: input.notes || null,
        approved_by: user.id
      });

      if (error) throw error;

      toast({ 
        title: "Success", 
        description: input.isDietBreak ? "Diet break week added" : "Adjustment created successfully"
      });
      setAdjustmentInputs(prev => ({ ...prev, [weekData.weekNumber]: { calories: '', notes: '', isDietBreak: false } }));
      loadAllData();
      onAdjustmentMade();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAdjustment = async (adjustment: any) => {
    try {
      setLoading(true);
      
      // Update adjustment status
      const { error: adjError } = await supabase
        .from('nutrition_adjustments')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', adjustment.id);

      if (adjError) throw adjError;

      // Update phase with new macros
      const { error: phaseError } = await supabase
        .from('nutrition_phases')
        .update({
          daily_calories: adjustment.new_daily_calories,
          protein_grams: adjustment.new_protein_grams,
          fat_grams: adjustment.new_fat_grams,
          carb_grams: adjustment.new_carb_grams,
          updated_at: new Date().toISOString()
        })
        .eq('id', phase.id);

      if (phaseError) throw phaseError;

      toast({ title: "Success", description: "Adjustment approved and applied" });
      loadAllData();
      onAdjustmentMade();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectAdjustment = async (adjustmentId: string) => {
    try {
      const { error } = await supabase
        .from('nutrition_adjustments')
        .update({ status: 'rejected' })
        .eq('id', adjustmentId);

      if (error) throw error;
      
      toast({ title: "Success", description: "Adjustment rejected" });
      loadAllData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDelayAdjustment = async (weekNumber: number) => {
    try {
      setLoading(true);
      
      const { error } = await supabase.from('nutrition_adjustments').insert({
        phase_id: phase.id,
        week_number: weekNumber,
        is_delayed: true,
        delayed_reason: 'Weight spike or hormonal fluctuation',
        status: 'approved',
        suggested_calorie_adjustment: 0,
        approved_calorie_adjustment: 0,
        new_daily_calories: phase.daily_calories,
        new_protein_grams: phase.protein_grams,
        new_fat_grams: phase.fat_grams,
        new_carb_grams: phase.carb_grams
      });

      if (error) throw error;
      
      toast({ title: "Success", description: "Adjustment delayed for this week" });
      loadAllData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getDeviationColor = (deviation: number | null) => {
    if (!deviation) return "";
    const abs = Math.abs(deviation);
    if (abs > 50) return "text-destructive";
    if (abs > 30) return "text-yellow-500";
    return "text-green-500";
  };

  if (loading && weeklyData.length === 0) {
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
          <CardTitle>No Progress Data Yet</CardTitle>
          <CardDescription>
            No measurements available for your coaching period. Client data from before your assignment is not visible.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Weekly Progress Review</CardTitle>
          <CardDescription>
            Current macros: {Math.round(phase.daily_calories)} kcal - P: {Math.round(phase.protein_grams)}g F: {Math.round(phase.fat_grams)}g C: {Math.round(phase.carb_grams)}g
          </CardDescription>
        </CardHeader>
      </Card>

      <Accordion type="single" collapsible className="space-y-4">
        {weeklyData.map((week) => (
          <AccordionItem key={week.weekNumber} value={`week-${week.weekNumber}`} className="border rounded-lg">
            <Card>
              <AccordionTrigger className="px-6 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="font-semibold">Week {week.weekNumber}</h3>
                      <p className="text-sm text-muted-foreground">{week.weightLogs.length} weigh-ins • Avg: {week.averageWeight.toFixed(1)} kg</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {week.actualChange !== null && (
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {week.actualChange > 0 ? '+' : ''}{week.actualChange.toFixed(2)}%
                        </p>
                        <p className="text-xs text-muted-foreground">vs {week.expectedChange.toFixed(2)}% expected</p>
                      </div>
                    )}
                    
                    {week.adjustment && (
                      <Badge variant={
                        week.adjustment.status === 'approved' ? 'default' : 
                        week.adjustment.status === 'rejected' ? 'destructive' : 
                        'secondary'
                      }>
                        {week.adjustment.status}
                      </Badge>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              
              <AccordionContent>
                <CardContent className="space-y-4 pt-4">
                  {/* Weight Logs */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {week.weightLogs.map((log: any) => (
                      <div key={log.id} className="p-3 rounded-lg bg-muted/50 text-sm">
                        <p className="font-medium">{parseFloat(log.weight_kg).toFixed(1)} kg</p>
                        <p className="text-xs text-muted-foreground">{new Date(log.log_date).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>

                  {/* Adherence */}
                  {week.adherence && (
                    <div className="p-4 rounded-lg bg-primary/10 space-y-1">
                      <p className="text-sm font-medium">Adherence</p>
                      <div className="flex gap-4 text-sm">
                        <span>Calories: {week.adherence.followed_calories ? '✓ Yes' : '✗ No'}</span>
                        <span>Tracking: {week.adherence.tracked_accurately ? '✓ Accurate' : '✗ Not Accurate'}</span>
                      </div>
                    </div>
                  )}

                  {/* Weight Change Analysis */}
                  {week.actualChange !== null && (
                    <div className="p-4 rounded-lg border space-y-3">
                      <p className="text-sm font-medium">Weight Change Analysis</p>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Expected</p>
                          <p className="font-semibold">{week.expectedChange.toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Actual</p>
                          <p className="font-semibold">{week.actualChange.toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Deviation</p>
                          <p className={`font-semibold ${getDeviationColor(((week.actualChange - week.expectedChange) / week.expectedChange) * 100)}`}>
                            {(((week.actualChange - week.expectedChange) / week.expectedChange) * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Existing Adjustment */}
                  {week.adjustment && (
                    <div className="p-4 rounded-lg border-2 border-primary/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Adjustment</p>
                        {week.adjustment.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApproveAdjustment(week.adjustment)} disabled={loading}>
                              <Check className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleRejectAdjustment(week.adjustment.id)} disabled={loading}>
                              <X className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {week.adjustment.approved_calorie_adjustment > 0 ? (
                          <TrendingUp className="h-5 w-5 text-green-500" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-red-500" />
                        )}
                        <p className="text-sm">
                          {Math.abs(week.adjustment.approved_calorie_adjustment)} kcal {week.adjustment.approved_calorie_adjustment > 0 ? 'increase' : 'decrease'}
                        </p>
                      </div>

                      <div className="grid grid-cols-4 gap-3 p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="text-xs text-muted-foreground">Calories</p>
                          <p className="font-bold">{Math.round(week.adjustment.new_daily_calories)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Protein</p>
                          <p className="font-bold">{Math.round(week.adjustment.new_protein_grams)}g</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Fat</p>
                          <p className="font-bold">{Math.round(week.adjustment.new_fat_grams)}g</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Carbs</p>
                          <p className="font-bold">{Math.round(week.adjustment.new_carb_grams)}g</p>
                        </div>
                      </div>

                      {week.adjustment.coach_notes && (
                        <div className="text-sm">
                          <p className="font-medium mb-1">Notes:</p>
                          <p className="text-muted-foreground whitespace-pre-wrap">{week.adjustment.coach_notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Create New Adjustment */}
                  {!week.adjustment && week.weightLogs.length >= 3 && (
                    <div className="p-4 rounded-lg border-2 border-dashed space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Create Adjustment for Week {week.weekNumber}</p>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleDelayAdjustment(week.weekNumber)}
                            disabled={loading}
                          >
                            <Pause className="h-4 w-4 mr-1" />
                            Delay 1 Week
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                          <input
                            type="checkbox"
                            id={`diet-break-${week.weekNumber}`}
                            checked={adjustmentInputs[week.weekNumber]?.isDietBreak || false}
                            onChange={(e) => setAdjustmentInputs(prev => ({
                              ...prev,
                              [week.weekNumber]: { 
                                ...prev[week.weekNumber], 
                                isDietBreak: e.target.checked,
                                calories: e.target.checked ? '0' : prev[week.weekNumber]?.calories || ''
                              }
                            }))}
                            className="h-4 w-4"
                          />
                          <label htmlFor={`diet-break-${week.weekNumber}`} className="text-sm font-medium flex items-center gap-2">
                            <Coffee className="h-4 w-4" />
                            Add Diet Break Week
                          </label>
                        </div>

                        {!adjustmentInputs[week.weekNumber]?.isDietBreak && (
                          <>
                            <div className="space-y-2">
                              <Label>Calorie Adjustment</Label>
                              <Input
                                type="number"
                                placeholder="e.g., -100 or +200"
                                value={adjustmentInputs[week.weekNumber]?.calories || ''}
                                onChange={(e) => setAdjustmentInputs(prev => ({
                                  ...prev,
                                  [week.weekNumber]: { ...prev[week.weekNumber], calories: e.target.value }
                                }))}
                              />
                              <p className="text-xs text-muted-foreground">Enter negative for decrease, positive for increase (minimum ±50 kcal)</p>
                            </div>
                          </>
                        )}

                        <div className="space-y-2">
                          <Label>Notes (Optional)</Label>
                          <Textarea
                            placeholder="Add any notes about this adjustment..."
                            value={adjustmentInputs[week.weekNumber]?.notes || ''}
                            onChange={(e) => setAdjustmentInputs(prev => ({
                              ...prev,
                              [week.weekNumber]: { ...prev[week.weekNumber], notes: e.target.value }
                            }))}
                            rows={3}
                          />
                        </div>

                        <Button onClick={() => handleCreateAdjustment(week)} disabled={loading} className="w-full">
                          {adjustmentInputs[week.weekNumber]?.isDietBreak ? 'Add Diet Break' : 'Create Adjustment'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {!week.adjustment && week.weightLogs.length < 3 && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                      <p className="text-sm">Minimum 3 weigh-ins required to create adjustment</p>
                    </div>
                  )}
                </CardContent>
              </AccordionContent>
            </Card>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
