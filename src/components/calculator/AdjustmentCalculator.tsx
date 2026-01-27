import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, TrendingDown, TrendingUp, Scale, Target, Calendar } from "lucide-react";

export function AdjustmentCalculator({ showSteps = true }: { showSteps?: boolean }) {
  const [lastWeekWeight, setLastWeekWeight] = useState("");
  const [currentWeekWeight, setCurrentWeekWeight] = useState("");
  const [caloriesConsumed, setCaloriesConsumed] = useState("");
  const [goalType, setGoalType] = useState("");
  const [expectedRate, setExpectedRate] = useState([0.75]);
  const [startingWeight, setStartingWeight] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [startingBodyFat, setStartingBodyFat] = useState("");
  const [goalBodyFat, setGoalBodyFat] = useState("");
  const [includeDietBreaks, setIncludeDietBreaks] = useState(false);
  const [breakFrequency, setBreakFrequency] = useState("");
  const [breakDuration, setBreakDuration] = useState("");
  const [useGoalBodyFat, setUseGoalBodyFat] = useState(false);
  const [lastWeekSteps, setLastWeekSteps] = useState("");
  const [stepsGoal, setStepsGoal] = useState("");

  const [result, setResult] = useState<{
    lastWeekAvg: number;
    currentWeekAvg: number;
    goalTypeLabel: string;
    expectedChange: number;
    actualChange: number;
    discrepancy: number;
    calorieAdjustment: number;
    newTargetCalories: number;
    directionMatch: boolean;
    directionMessage: string;
    adjustmentMessage: string;
    weeksToGoal?: number;
    totalDuration?: number;
    dietBreaksCount?: number;
    projectedWeight?: number;
    warnings: string[];
    stepAdjustmentOption?: {
      recommended: boolean;
      currentSteps: number;
      suggestedSteps: number;
      message: string;
    };
  } | null>(null);

  const calculateAdjustment = () => {
    const lastWeek = parseFloat(lastWeekWeight);
    const currentWeek = parseFloat(currentWeekWeight);
    const calories = parseFloat(caloriesConsumed);
    const startWeight = parseFloat(startingWeight);

    if (!lastWeek || !currentWeek || !calories || !goalType || !startWeight) {
      return;
    }

    const warnings: string[] = [];

    // Step 1 — Actual Weight Change
    const actualChange = currentWeek - lastWeek;

    // Step 2 — Check Goal Alignment
    let directionMatch = false;
    let directionMessage = "";

    if (goalType === "loss") {
      directionMatch = actualChange < 0;
      directionMessage = directionMatch
        ? "✓ Change consistent with goal (weight loss)"
        : "⚠ Your weight change is inconsistent with your selected goal (expected loss, observed gain/maintenance)";
    } else if (goalType === "gain") {
      directionMatch = actualChange > 0;
      directionMessage = directionMatch
        ? "✓ Change consistent with goal (weight gain)"
        : "⚠ Your weight change is inconsistent with your selected goal (expected gain, observed loss/maintenance)";
    } else {
      directionMatch = Math.abs(actualChange) < 0.1;
      directionMessage = directionMatch
        ? "✓ Change consistent with goal (maintenance)"
        : "⚠ Your weight changed during maintenance phase";
    }

    // Step 3 — Expected Weight Change
    let expectedChange: number;
    if (goalType === "loss" || goalType === "maintenance") {
      // Weekly rate
      expectedChange = goalType === "loss" ? -(expectedRate[0] / 100) * lastWeek : 0;
    } else {
      // Muscle gain: monthly rate, convert to weekly
      const expectedMonthlyGain = (expectedRate[0] / 100) * lastWeek;
      expectedChange = expectedMonthlyGain / 4.33;
    }

    // Step 4 — Compute Discrepancy
    const deltaKg = expectedChange - actualChange;

    // Step 4.5 — Check if change is within 15% tolerance and direction matches
    const tolerance = Math.abs(expectedChange) * 0.15;
    const withinTolerance = Math.abs(deltaKg) <= tolerance;
    const isNoChangeRecommended = withinTolerance && directionMatch;

    // Step 4.6 — Steps adjustment logic
    let stepAdjustmentOption: {
      recommended: boolean;
      currentSteps: number;
      suggestedSteps: number;
      message: string;
    } | undefined;

    const currentSteps = parseFloat(lastWeekSteps);
    const targetSteps = parseFloat(stepsGoal);

    if (currentSteps && targetSteps) {
      if (goalType === "loss") {
        // For fat loss: if losing but slower than desired and in the right direction
        if (directionMatch && actualChange < 0 && Math.abs(actualChange) < Math.abs(expectedChange)) {
          // Calculate how many extra steps might help (rough estimate: 2000 steps ≈ 100 kcal)
          const calorieDeficitNeeded = Math.abs(deltaKg) * 7700 / 7; // Daily deficit needed
          const extraStepsNeeded = Math.round((calorieDeficitNeeded / 100) * 2000);
          const suggestedSteps = Math.min(targetSteps + extraStepsNeeded, targetSteps + 5000); // Cap at +5000 steps
          
          stepAdjustmentOption = {
            recommended: true,
            currentSteps,
            suggestedSteps,
            message: `Consider increasing steps to ${suggestedSteps.toLocaleString()} per day instead of reducing calories. This gentler approach may help you reach your goal while maintaining energy levels.`
          };
        } else if (!directionMatch) {
          stepAdjustmentOption = {
            recommended: false,
            currentSteps,
            suggestedSteps: targetSteps,
            message: "Focus on improving adherence to your calorie target before adjusting step count."
          };
        }
      } else if (goalType === "gain") {
        // For muscle gain: warn if steps are dropping significantly
        const stepsDrop = currentSteps < (targetSteps * 0.85);
        if (stepsDrop) {
          stepAdjustmentOption = {
            recommended: false,
            currentSteps,
            suggestedSteps: targetSteps,
            message: `Your step count (${currentSteps.toLocaleString()}) has dropped below your goal (${targetSteps.toLocaleString()}). Maintaining activity is important during a muscle gain phase. Try to keep steps consistent.`
          };
        }
      } else if (goalType === "maintenance") {
        // For maintenance: suggest mild step increases if gaining weight and steps are low
        const stepsDrop = currentSteps < (targetSteps * 0.9);
        if (!directionMatch && actualChange > 0 && stepsDrop && actualChange <= 0.3) {
          const suggestedSteps = Math.min(targetSteps, currentSteps + 2000);
          stepAdjustmentOption = {
            recommended: true,
            currentSteps,
            suggestedSteps,
            message: `You're gaining slightly during maintenance and steps are below goal. Consider increasing to ${suggestedSteps.toLocaleString()} steps per day to help maintain weight.`
          };
        }
      }
    }

    // Step 5 — Interpret the Discrepancy
    let adjustmentMessage = "";
    if (isNoChangeRecommended) {
      adjustmentMessage = "✅ You're on track within 15% of expected change. No calorie adjustment needed.";
    } else if (Math.abs(deltaKg) < 0.05) {
      adjustmentMessage = "✅ You're exactly on track. No calorie adjustment needed.";
    } else {
      if (goalType === "loss") {
        if (deltaKg < 0) {
          adjustmentMessage = "You lost more than expected. Consider increasing calories slightly to protect lean mass.";
        } else {
          adjustmentMessage = "You lost less than expected. Decrease calories to reach target rate.";
        }
      } else if (goalType === "gain") {
        if (deltaKg > 0) {
          adjustmentMessage = "You gained less than expected. Increase calories to reach target rate.";
        } else {
          adjustmentMessage = "You gained more than expected. Decrease calories slightly to limit fat gain.";
        }
      } else {
        adjustmentMessage = "Adjust calories to restore weight stability.";
      }
    }

    // Add warning for direction mismatch
    if (!directionMatch) {
      if (goalType === "loss" && actualChange > 0) {
        warnings.push("⚠️ Your weight increased during a fat loss phase. Check adherence or accuracy of logging before adjusting calories.");
      } else if (goalType === "gain" && actualChange < 0) {
        warnings.push("⚠️ Your weight decreased during a muscle gain phase. Check calorie intake and training consistency.");
      }
    }

    // Step 6 — Translate to Calories (only if adjustment is needed)
    const calorieDeltaTotal = deltaKg * 7700;
    let dailyAdjustment = isNoChangeRecommended ? 0 : calorieDeltaTotal / 7;

    // Step 7 — Apply Safety Constraints
    const maxAdjustment = 400;
    if (Math.abs(dailyAdjustment) > maxAdjustment) {
      warnings.push(`⚠️ Recommended adjustment exceeds ${maxAdjustment} kcal/day. Capping for safety.`);
      dailyAdjustment = Math.sign(dailyAdjustment) * maxAdjustment;
    }

    const newTargetCalories = calories + dailyAdjustment;

    // Don't reduce below BMR × 1.2 (rough estimate: 1500 kcal minimum for most)
    const minCalories = 1500;
    if (newTargetCalories < minCalories) {
      warnings.push(`⚠️ New target would be below safe minimum (${minCalories} kcal). Adjustment limited.`);
    }

    // Flag aggressive rates
    const weeklyRatePercent = Math.abs(actualChange / lastWeek) * 100;
    if (goalType === "loss" && weeklyRatePercent > 1.5) {
      warnings.push("⚠️ Weight loss exceeds 1.5%/week. Risk of excessive lean mass loss.");
    } else if (goalType === "gain" && weeklyRatePercent > 0.25) {
      const monthlyRate = weeklyRatePercent * 4.33;
      if (monthlyRate > 1.0) {
        warnings.push("⚠️ Weight gain exceeds 1%/month. Risk of excessive fat gain.");
      }
    }

    // Step 8 — Goal Duration Calculation
    let weeksToGoal: number | undefined;
    let totalDuration: number | undefined;
    let dietBreaksCount: number | undefined;
    let projectedWeight: number | undefined;

    if (useGoalBodyFat && startingBodyFat && goalBodyFat) {
      const startBF = parseFloat(startingBodyFat);
      const goalBF = parseFloat(goalBodyFat);
      
      if (startBF && goalBF) {
        const leanMass = startWeight * (1 - startBF / 100);
        const targetWeight = leanMass / (1 - goalBF / 100);
        projectedWeight = targetWeight;
        
        const totalWeightDiff = Math.abs(startWeight - targetWeight);
        const weeklyRate = Math.abs(expectedChange);
        weeksToGoal = weeklyRate > 0 ? totalWeightDiff / weeklyRate : undefined;
      }
    } else if (goalWeight) {
      const goal = parseFloat(goalWeight);
      if (goal) {
        const totalWeightDiff = Math.abs(startWeight - goal);
        const weeklyRate = Math.abs(expectedChange);
        weeksToGoal = weeklyRate > 0 ? totalWeightDiff / weeklyRate : undefined;
        projectedWeight = goal;
      }
    }

    if (weeksToGoal && includeDietBreaks && breakFrequency && breakDuration) {
      const freq = parseFloat(breakFrequency);
      const dur = parseFloat(breakDuration);
      if (freq && dur) {
        dietBreaksCount = Math.floor(weeksToGoal / freq);
        totalDuration = weeksToGoal + (dietBreaksCount * dur);
      }
    }

    setResult({
      lastWeekAvg: lastWeek,
      currentWeekAvg: currentWeek,
      goalTypeLabel: goalType === "loss" ? "Fat Loss" : goalType === "gain" ? "Muscle Gain" : "Maintenance",
      expectedChange,
      actualChange,
      discrepancy: deltaKg,
      calorieAdjustment: dailyAdjustment,
      newTargetCalories: Math.round(Math.max(newTargetCalories, minCalories)),
      directionMatch,
      directionMessage,
      adjustmentMessage,
      weeksToGoal: weeksToGoal ? Math.round(weeksToGoal) : undefined,
      totalDuration: totalDuration ? Math.round(totalDuration) : undefined,
      dietBreaksCount,
      projectedWeight,
      warnings,
      stepAdjustmentOption,
    });
  };

  return (
    <div className="space-y-6">
      {/* Input Fields */}
      <Card className="border-border/50">
        <CardContent className="pt-6 space-y-6">
          {/* Basic Tracking */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Weekly Progress Data</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lastWeekWeight">Last Week's Avg Weight (kg)</Label>
                <Input
                  id="lastWeekWeight"
                  type="number"
                  step="0.1"
                  placeholder="80.0"
                  value={lastWeekWeight}
                  onChange={(e) => setLastWeekWeight(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currentWeekWeight">Current Week's Avg Weight (kg)</Label>
                <Input
                  id="currentWeekWeight"
                  type="number"
                  step="0.1"
                  placeholder="79.5"
                  value={currentWeekWeight}
                  onChange={(e) => setCurrentWeekWeight(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="caloriesConsumed">Calories/Day (last week)</Label>
                <Input
                  id="caloriesConsumed"
                  type="number"
                  placeholder="2000"
                  value={caloriesConsumed}
                  onChange={(e) => setCaloriesConsumed(e.target.value)}
                />
              </div>
            </div>
            {showSteps && (
              <div className="grid md:grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="lastWeekSteps">Last Week's Avg Steps per Day</Label>
                  <Input
                    id="lastWeekSteps"
                    type="number"
                    placeholder="8500"
                    value={lastWeekSteps}
                    onChange={(e) => setLastWeekSteps(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stepsGoal">Steps Goal per Day</Label>
                  <Input
                    id="stepsGoal"
                    type="number"
                    placeholder="10000"
                    value={stepsGoal}
                    onChange={(e) => setStepsGoal(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Goal Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Goal Settings</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="goalType">Goal Type</Label>
                <Select value={goalType} onValueChange={setGoalType}>
                  <SelectTrigger id="goalType">
                    <SelectValue placeholder="Select your goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loss">Fat Loss</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="gain">Muscle Gain</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {goalType !== "maintenance" && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="expectedRate">
                      Expected Rate of Change (% per {goalType === "gain" ? "month" : "week"})
                    </Label>
                    <span className="text-sm font-medium">{expectedRate[0]}%</span>
                  </div>
                  <Slider
                    id="expectedRate"
                    min={0.25}
                    max={goalType === "gain" ? 1.0 : 1.5}
                    step={0.05}
                    value={expectedRate}
                    onValueChange={setExpectedRate}
                  />
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <span className="text-primary">ℹ️</span>
                    {goalType === "gain"
                      ? "For muscle gain, rate is % per month and converted to weekly change automatically."
                      : "For fat loss, rate is % per week."}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Goal Projection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Goal Projection (Optional)</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startingWeight">Starting Weight (kg)</Label>
                <Input
                  id="startingWeight"
                  type="number"
                  step="0.1"
                  placeholder="80.0"
                  value={startingWeight}
                  onChange={(e) => setStartingWeight(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm">Goal</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Weight</span>
                    <Switch
                      checked={useGoalBodyFat}
                      onCheckedChange={setUseGoalBodyFat}
                    />
                    <span className="text-xs text-muted-foreground">Body Fat %</span>
                  </div>
                </div>
                {!useGoalBodyFat ? (
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="75.0"
                    value={goalWeight}
                    onChange={(e) => setGoalWeight(e.target.value)}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Start BF%"
                      value={startingBodyFat}
                      onChange={(e) => setStartingBodyFat(e.target.value)}
                    />
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Goal BF%"
                      value={goalBodyFat}
                      onChange={(e) => setGoalBodyFat(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Diet Breaks */}
          <div className="space-y-4 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dietBreaks" className="text-base">Include Diet Breaks?</Label>
                <p className="text-sm text-muted-foreground">
                  {includeDietBreaks ? "Enabled" : "Disabled"}
                </p>
              </div>
              <Switch
                id="dietBreaks"
                checked={includeDietBreaks}
                onCheckedChange={setIncludeDietBreaks}
              />
            </div>
            {includeDietBreaks && (
              <div className="grid md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="breakFrequency">Break Frequency (Every X weeks)</Label>
                  <Input
                    id="breakFrequency"
                    type="number"
                    placeholder="6"
                    value={breakFrequency}
                    onChange={(e) => setBreakFrequency(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="breakDuration">Break Duration (weeks)</Label>
                  <Input
                    id="breakDuration"
                    type="number"
                    placeholder="1"
                    value={breakDuration}
                    onChange={(e) => setBreakDuration(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <Button
            variant="gradient"
            className="w-full"
            onClick={calculateAdjustment}
            size="lg"
          >
            Calculate Adjustment
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Direction Check */}
          <Alert variant={result.directionMatch ? "default" : "destructive"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{result.directionMessage}</AlertDescription>
          </Alert>

          {/* Warnings */}
          {result.warnings.map((warning, idx) => (
            <Alert key={idx} variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          ))}

          {/* Step Adjustment Option */}
          {result.stepAdjustmentOption && (
            <Alert variant={result.stepAdjustmentOption.recommended ? "default" : "destructive"}>
              <Scale className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">Steps Analysis</p>
                  <p>{result.stepAdjustmentOption.message}</p>
                  {result.stepAdjustmentOption.recommended && (
                    <div className="text-sm pt-2 border-t mt-2">
                      <p>Current: {result.stepAdjustmentOption.currentSteps.toLocaleString()} steps/day</p>
                      <p>Suggested: {result.stepAdjustmentOption.suggestedSteps.toLocaleString()} steps/day</p>
                      <p className="text-muted-foreground mt-1">
                        Increasing steps can be a more sustainable alternative to further calorie restriction.
                      </p>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Summary Card */}
          <Card className="border-border/50">
            <CardContent className="pt-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Average weight last week</p>
                  <p className="text-2xl font-bold">{result.lastWeekAvg.toFixed(1)} kg</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Average weight this week</p>
                  <p className="text-2xl font-bold">{result.currentWeekAvg.toFixed(1)} kg</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Goal</p>
                  <p className="text-lg font-semibold">
                    {result.goalTypeLabel}{" "}
                    {goalType !== "maintenance" && `(${expectedRate[0]}% per ${goalType === "gain" ? "month" : "week"})`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Change Analysis */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-border/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-accent" />
                  <p className="text-sm font-medium">Expected Weekly Change</p>
                </div>
                <p className="text-3xl font-bold text-accent">
                  {result.expectedChange > 0 ? "+" : ""}{result.expectedChange.toFixed(2)} kg
                </p>
                {goalType === "gain" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    (converted from {expectedRate[0]}% monthly rate)
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Actual Weekly Change</p>
                </div>
                <p className="text-3xl font-bold text-primary">
                  {result.actualChange > 0 ? "+" : ""}{result.actualChange.toFixed(2)} kg
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Discrepancy: {Math.abs(result.discrepancy).toFixed(2)} kg
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Adjustment Recommendation */}
          <Card className="border-primary/20 bg-gradient-to-r from-primary/10 to-accent/10">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                <h3 className="text-xl font-bold">Calorie Adjustment</h3>
              </div>
              
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{result.adjustmentMessage}</AlertDescription>
              </Alert>

              {Math.abs(result.calorieAdjustment) > 5 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Adjustment: <span className={result.calorieAdjustment < 0 ? "text-primary font-semibold" : "text-accent font-semibold"}>
                      {result.calorieAdjustment > 0 ? "+" : ""}{Math.round(result.calorieAdjustment)} kcal/day
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Based on {Math.abs(result.discrepancy).toFixed(2)} kg discrepancy × 7700 kcal/kg ÷ 7 days
                  </p>
                </div>
              )}

              <div className="p-4 bg-card rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">New Target Calories</p>
                <p className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  {result.newTargetCalories} kcal/day
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Duration Projection */}
          {result.weeksToGoal && (
            <Card className="border-border/50">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-bold">Goal Duration Estimate</h3>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Estimated Diet Duration</p>
                    <p className="text-3xl font-bold text-primary">{result.weeksToGoal} weeks</p>
                    {result.projectedWeight && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Target: {result.projectedWeight.toFixed(1)} kg
                      </p>
                    )}
                  </div>

                  {result.totalDuration && result.dietBreaksCount !== undefined && (
                    <div className="p-4 bg-accent/5 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Total Duration (with breaks)</p>
                      <p className="text-3xl font-bold text-accent">{result.totalDuration} weeks</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Including: {result.dietBreaksCount} × {breakDuration}-week diet breaks
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
