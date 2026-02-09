import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Edit } from "lucide-react";
import { StepWizardGoalSetting } from "@/components/calculator/StepWizardGoalSetting";
import { calculateAge, formatDateForInput } from "@/lib/dateUtils";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

export function NutritionGoal() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeGoal, setActiveGoal] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form state (same as CalorieCalculator)
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [goal, setGoal] = useState("maintenance");
  const [rateOfChange, setRateOfChange] = useState([0.75]);
  const [proteinIntake, setProteinIntake] = useState([2.0]);
  const [fatIntake, setFatIntake] = useState([30]);
  const [targetGoalType, setTargetGoalType] = useState<"weight" | "bodyfat">("weight");
  const [targetGoal, setTargetGoal] = useState("");
  const [dietBreakEnabled, setDietBreakEnabled] = useState(false);
  const [dietBreakFrequency, setDietBreakFrequency] = useState("");
  const [dietBreakDuration, setDietBreakDuration] = useState("");
  const [stepsGoal, setStepsGoal] = useState("");
  const [result, setResult] = useState<any>(null);

  const loadActiveGoal = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('nutrition_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setActiveGoal(data);
        // Populate form with existing goal
        setDateOfBirth(formatDateForInput(data.date_of_birth) || "");
        setGender(data.sex);
        setHeight(data.height_cm.toString());
        setWeight(data.starting_weight_kg.toString());
        setBodyFat((data.body_fat_percentage || 15).toString());
        setActivityLevel(data.activity_level);
        setGoal(data.goal_type);
        setProteinIntake([data.protein_based_on_ffm ? -data.protein_intake_g_per_kg : data.protein_intake_g_per_kg]);
        setFatIntake([data.fat_intake_percentage]);
        setDietBreakEnabled(data.diet_breaks_enabled);
        setDietBreakFrequency((data.diet_break_frequency_weeks || 4).toString());
        setDietBreakDuration((data.diet_break_duration_weeks || 1).toString());
        if (data.target_type) {
          setTargetGoalType(data.target_type as "weight" | "bodyfat");
          setTargetGoal((data.target_type === 'weight' ? data.target_weight_kg : data.target_body_fat).toString());
        }

        // Set result to display summary
        setResult({
          calories: data.daily_calories,
          protein: data.protein_grams,
          fat: data.fat_grams,
          carbs: data.carb_grams,
          fiber: data.fiber_grams,
          weeks: data.estimated_duration_weeks,
          weeklyRate: data.weekly_rate_percentage
        });
      } else {
        setIsEditing(true);
      }
    } catch (error: any) {
      console.error('Error loading goal:', error);
      toast({
        title: "Error",
        description: "Failed to load nutrition goal",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadActiveGoal();
  }, [loadActiveGoal]);

  const calculateCalories = () => {
    const weightNum = parseFloat(weight);
    const heightNum = parseFloat(height);
    const ageNum = calculateAge(dateOfBirth);
    const bodyFatNum = parseFloat(bodyFat);
    const rateNum = rateOfChange[0];
    const proteinNum = Math.abs(proteinIntake[0]); // Use absolute value
    const isProteinBasedOnFFM = proteinIntake[0] < 0; // Negative = FFM based
    const fatNum = fatIntake[0];
    const targetNum = parseFloat(targetGoal);
    
    // Calculate BMR
    let bmr;
    if (bodyFatNum > 0) {
      const leanMass = weightNum * (1 - bodyFatNum / 100);
      bmr = 370 + 21.6 * leanMass;
    } else {
      bmr =
        gender === "male"
          ? 10 * weightNum + 6.25 * heightNum - 5 * ageNum + 5
          : 10 * weightNum + 6.25 * heightNum - 5 * ageNum - 161;
    }

    const tdee = bmr * parseFloat(activityLevel);

    let adjustedCalories;
    let weeklyRate;
    
    if (goal === "loss") {
      weeklyRate = rateNum;
      const weeklyDeficit = weightNum * (rateNum / 100);
      const dailyDeficit = (weeklyDeficit * 7700) / 7;
      adjustedCalories = tdee - dailyDeficit;
    } else if (goal === "gain") {
      weeklyRate = rateNum;
      const monthlySurplus = weightNum * (rateNum / 100);
      const dailySurplus = (monthlySurplus * 7700) / (4.33 * 7); // 4.33 weeks per month * 7 days
      adjustedCalories = tdee + dailySurplus;
    } else {
      weeklyRate = 0;
      adjustedCalories = tdee;
    }

    // Calculate protein based on FFM or total weight
    let proteinGrams;
    if (isProteinBasedOnFFM && bodyFatNum > 0) {
      const fatFreeMass = weightNum * (1 - bodyFatNum / 100);
      proteinGrams = fatFreeMass * proteinNum;
    } else {
      proteinGrams = weightNum * proteinNum;
    }
    
    const proteinCalories = proteinGrams * 4;
    const fatCalories = adjustedCalories * (fatNum / 100);
    const fatGrams = fatCalories / 9;
    const carbCalories = adjustedCalories - proteinCalories - fatCalories;
    const carbGrams = carbCalories / 4;
    const fiberGrams = Math.round(adjustedCalories / 1000) * 14;

    // 3.4 — Duration Estimator (same logic as public calculator)
    let estimatedWeeks = 0;
    if (targetNum > 0 && (goal === "loss" || goal === "gain")) {
      let targetWeight = 0;
      
      if (targetGoalType === "weight") {
        targetWeight = targetNum;
      } else if (targetGoalType === "bodyfat" && bodyFatNum && bodyFatNum > 0) {
        // Estimate lean mass
        const leanMass = weightNum * (1 - bodyFatNum / 100);
        // Target weight = Lean Mass ÷ (1 − goal BF%)
        targetWeight = leanMass / (1 - targetNum / 100);
      }

      if (targetWeight > 0) {
        const remainingWeight = Math.abs(weightNum - targetWeight);
        
        // Calculate weekly rate in kg (fixed, not recalculated each week)
        let weeklyRateKg: number;
        
        if (goal === "gain") {
          // For muscle gain, rate is monthly - convert to weekly
          const monthlyRateKg = (rateNum / 100) * weightNum;
          weeklyRateKg = monthlyRateKg / 4.33; // Average weeks per month
        } else {
          // For fat loss, rate is weekly as percentage of CURRENT weight
          weeklyRateKg = (rateNum / 100) * weightNum;
        }
        
        // Simple division: total kg to lose/gain ÷ kg per week = weeks needed
        estimatedWeeks = weeklyRateKg > 0 ? remainingWeight / weeklyRateKg : 0;

        // Add diet breaks if enabled
        if (dietBreakEnabled && parseFloat(dietBreakFrequency) > 0 && parseFloat(dietBreakDuration) > 0) {
          const breaksNeeded = Math.floor(estimatedWeeks / parseFloat(dietBreakFrequency));
          estimatedWeeks += breaksNeeded * parseFloat(dietBreakDuration);
        }
      }
    }
    
    if (!isFinite(estimatedWeeks) || estimatedWeeks < 0) {
      estimatedWeeks = 0;
    }

    setResult({
      calories: Math.round(adjustedCalories),
      protein: Math.round(proteinGrams),
      fat: Math.round(fatGrams),
      carbs: Math.round(carbGrams),
      fiber: fiberGrams,
      weeks: estimatedWeeks,
      weeklyRate: weeklyRate,
      projectedWeeks: estimatedWeeks > 0 ? Math.round(estimatedWeeks) : undefined,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      deficitPercent: parseFloat((((adjustedCalories - tdee) / tdee) * 100).toFixed(1)),
      fatPercent: parseFloat(((fatCalories / adjustedCalories) * 100).toFixed(1)),
    });
  };

  const calculateAndSave = async () => {
    // First calculate
    calculateCalories();
    
    // Wait a bit for state to update
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Then save
    await saveGoal();
  };

  const saveGoal = async () => {
    if (!result) {
      toast({
        title: "Calculate First",
        description: "Please calculate your calories before saving",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Calculate first if not already done
      if (!result) {
        calculateCalories();
        // Wait for state update
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      if (!result) {
        toast({
          title: "Calculation Error",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Deactivate previous goals
      if (activeGoal) {
        await supabase
          .from('nutrition_goals')
          .update({ is_active: false, end_date: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('is_active', true);
      }

      // Create phase name
      const goalNames = { loss: 'Fat Loss', gain: 'Muscle Gain', maintenance: 'Maintenance' };
      const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const phaseName = `${goalNames[goal as keyof typeof goalNames]} Phase – ${monthYear}`;

      const estimatedEndDate = result.weeks > 0 
        ? new Date(Date.now() + result.weeks * 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const calculatedAge = calculateAge(dateOfBirth);
      if (!calculatedAge) {
        throw new Error('Invalid date of birth');
      }

      const { error } = await supabase
        .from('nutrition_goals')
        .insert([{
          user_id: user.id,
          phase_name: phaseName,
          is_active: true,
          age: calculatedAge,
          date_of_birth: dateOfBirth || null,
          sex: gender,
          height_cm: parseFloat(height),
          starting_weight_kg: parseFloat(weight),
          body_fat_percentage: parseFloat(bodyFat) > 0 ? parseFloat(bodyFat) : null,
          activity_level: activityLevel,
          goal_type: goal,
          target_type: targetGoalType,
          target_weight_kg: targetGoalType === 'weight' ? parseFloat(targetGoal) : null,
          target_body_fat: targetGoalType === 'bodyfat' ? parseFloat(targetGoal) : null,
          protein_intake_g_per_kg: Math.abs(proteinIntake[0]),
          protein_based_on_ffm: proteinIntake[0] < 0,
          fat_intake_percentage: fatIntake[0],
          diet_breaks_enabled: dietBreakEnabled,
          diet_break_frequency_weeks: dietBreakEnabled ? parseInt(dietBreakFrequency) : null,
          diet_break_duration_weeks: dietBreakEnabled ? parseInt(dietBreakDuration) : null,
          steps_goal: stepsGoal ? parseInt(stepsGoal) : null,
          daily_calories: Math.round(result.calories),
          protein_grams: Math.round(result.protein),
          fat_grams: Math.round(result.fat),
          carb_grams: Math.round(result.carbs),
          fiber_grams: result.fiber,
          weekly_rate_percentage: result.weeklyRate,
          estimated_duration_weeks: result.weeks ? Math.round(result.weeks) : null,
          estimated_end_date: estimatedEndDate
        }]);

      if (error) throw error;

      toast({
        title: "Goal Saved",
        description: "Your nutrition goal has been saved successfully",
      });

      await loadActiveGoal();
      setIsEditing(false);
    } catch (error: any) {
      console.error('Error saving goal:', error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (activeGoal && !isEditing) {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{activeGoal.phase_name}</CardTitle>
              <CardDescription>
                Started {new Date(activeGoal.start_date).toLocaleDateString()}
                {activeGoal.estimated_end_date && ` • Est. end ${new Date(activeGoal.estimated_end_date).toLocaleDateString()}`}
              </CardDescription>
            </div>
            <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-2" />
              Change Goal
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-3">Current Targets</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Daily Calories:</span>
                  <span className="font-medium">{activeGoal.daily_calories} kcal</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Protein:</span>
                  <span className="font-medium">{activeGoal.protein_grams}g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fat:</span>
                  <span className="font-medium">{activeGoal.fat_grams}g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Carbs:</span>
                  <span className="font-medium">{activeGoal.carb_grams}g</span>
                </div>
                {activeGoal.fiber_grams && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fiber:</span>
                    <span className="font-medium">{activeGoal.fiber_grams}g</span>
                  </div>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Goal Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Goal Type:</span>
                  <span className="font-medium capitalize">{activeGoal.goal_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Weekly Rate:</span>
                  <span className="font-medium">{activeGoal.weekly_rate_percentage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Starting Weight:</span>
                  <span className="font-medium">{activeGoal.starting_weight_kg} kg</span>
                </div>
                {activeGoal.body_fat_percentage && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Starting Body Fat:</span>
                    <span className="font-medium">{activeGoal.body_fat_percentage}%</span>
                  </div>
                )}
                {activeGoal.target_weight_kg && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target Weight:</span>
                    <span className="font-medium">{activeGoal.target_weight_kg} kg</span>
                  </div>
                )}
                {activeGoal.target_body_fat && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target Body Fat:</span>
                    <span className="font-medium">{activeGoal.target_body_fat}%</span>
                  </div>
                )}
                {activeGoal.estimated_duration_weeks && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. Duration:</span>
                    <span className="font-medium">{activeGoal.estimated_duration_weeks} weeks</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <StepWizardGoalSetting
        weight={weight}
        setWeight={setWeight}
        height={height}
        setHeight={setHeight}
        dateOfBirth={dateOfBirth}
        setDateOfBirth={setDateOfBirth}
        gender={gender}
        setGender={setGender}
        bodyFat={bodyFat}
        setBodyFat={setBodyFat}
        activityLevel={activityLevel}
        setActivityLevel={setActivityLevel}
        goal={goal}
        setGoal={setGoal}
        rateOfChange={rateOfChange}
        setRateOfChange={setRateOfChange}
        proteinPreference={proteinIntake}
        setProteinPreference={setProteinIntake}
        fatIntake={fatIntake}
        setFatIntake={setFatIntake}
        targetGoalType={targetGoalType}
        setTargetGoalType={setTargetGoalType}
        targetValue={targetGoal}
        setTargetValue={setTargetGoal}
        dietBreaks={dietBreakEnabled}
        setDietBreaks={setDietBreakEnabled}
        dietBreakFrequency={dietBreakFrequency}
        setDietBreakFrequency={setDietBreakFrequency}
        dietBreakDuration={dietBreakDuration}
        setDietBreakDuration={setDietBreakDuration}
        result={result}
        onCalculate={calculateCalories}
        onSave={saveGoal}
        showSaveButton={true}
      />
    </div>
  );
}
