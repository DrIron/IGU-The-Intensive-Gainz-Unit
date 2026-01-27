/**
 * CORE NUTRITION CALCULATIONS
 * Shared across all calculator tiers (Public, Team Plan, 1:1 Client)
 */

/**
 * Calculate BMR using Mifflin-St Jeor equation
 */
export function calculateBMRMifflinStJeor(
  weight: number, // kg
  height: number, // cm
  age: number,
  gender: 'male' | 'female'
): number {
  if (gender === 'male') {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
}

/**
 * Calculate BMR using Katch-McArdle equation (more accurate when body fat % is known)
 */
export function calculateBMRKatchMcArdle(
  weight: number, // kg
  bodyFatPercentage: number
): number {
  const leanMass = weight * (1 - bodyFatPercentage / 100);
  return 370 + 21.6 * leanMass;
}

/**
 * Calculate BMR (auto-selects equation based on available data)
 */
export function calculateBMR(
  weight: number,
  height: number,
  age: number,
  gender: 'male' | 'female',
  bodyFatPercentage?: number | null
): number {
  if (bodyFatPercentage !== null && bodyFatPercentage !== undefined) {
    return calculateBMRKatchMcArdle(weight, bodyFatPercentage);
  }
  return calculateBMRMifflinStJeor(weight, height, age, gender);
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 */
export function calculateTDEE(bmr: number, activityMultiplier: number): number {
  return bmr * activityMultiplier;
}

/**
 * Calculate goal-adjusted calories
 */
export function calculateGoalCalories(
  tdee: number,
  weight: number,
  goal: 'maintenance' | 'loss' | 'gain',
  rateOfChange: number // percentage (e.g., 0.75 for 0.75%)
): { calories: number; deficitPercent: number } {
  if (goal === 'maintenance') {
    return { calories: tdee, deficitPercent: 0 };
  }

  let dailyCalChange: number;
  
  if (goal === 'loss') {
    // Weekly rate: Each 1% weekly change requires ~7700 kcal × 1% of bodyweight
    const weeklyCalChange = (rateOfChange / 100) * weight * 7700;
    dailyCalChange = weeklyCalChange / 7;
    const calories = tdee - dailyCalChange;
    const deficitPercent = ((calories - tdee) / tdee) * 100;
    return { calories, deficitPercent };
  } else {
    // Monthly rate: Each 1% monthly change requires ~7700 kcal × 1% of bodyweight
    const monthlyCalChange = (rateOfChange / 100) * weight * 7700;
    dailyCalChange = monthlyCalChange / (4.33 * 7); // 4.33 weeks per month
    const calories = tdee + dailyCalChange;
    const deficitPercent = ((calories - tdee) / tdee) * 100;
    return { calories, deficitPercent };
  }
}

/**
 * Calculate protein requirements
 */
export function calculateProtein(
  weight: number,
  proteinPerKg: number,
  bodyFatPercentage?: number | null,
  useFFM: boolean = false
): number {
  if (useFFM && bodyFatPercentage !== null && bodyFatPercentage !== undefined) {
    const fatFreeMass = weight * (1 - bodyFatPercentage / 100);
    return fatFreeMass * proteinPerKg;
  }
  return weight * proteinPerKg;
}

/**
 * Calculate macronutrient distribution
 */
export function calculateMacros(
  targetCalories: number,
  proteinGrams: number,
  fatPercentage: number // percentage of total calories (e.g., 30 for 30%)
): { protein: number; fat: number; carbs: number; fiber: number } {
  const proteinCalories = proteinGrams * 4;
  const fatCalories = targetCalories * (fatPercentage / 100);
  const fatGrams = fatCalories / 9;
  const carbCalories = targetCalories - (proteinCalories + fatCalories);
  const carbGrams = carbCalories / 4;
  const fiberGrams = (targetCalories / 1000) * 14;

  return {
    protein: Math.round(proteinGrams),
    fat: Math.round(fatGrams),
    carbs: Math.round(carbGrams),
    fiber: Math.round(fiberGrams),
  };
}

/**
 * Calculate target weight from body fat percentage goal
 */
export function calculateTargetWeightFromBF(
  currentWeight: number,
  currentBodyFat: number,
  targetBodyFat: number
): number {
  const leanMass = currentWeight * (1 - currentBodyFat / 100);
  return leanMass / (1 - targetBodyFat / 100);
}

/**
 * Calculate projected duration to reach goal
 */
export function calculateProjectedDuration(
  currentWeight: number,
  targetWeight: number,
  rateOfChange: number, // percentage
  goal: 'loss' | 'gain',
  dietBreakFrequency?: number, // weeks
  dietBreakDuration?: number // weeks
): number {
  const remainingWeight = Math.abs(currentWeight - targetWeight);
  
  let weeklyRateKg: number;
  
  if (goal === 'gain') {
    // For muscle gain, rate is monthly - convert to weekly
    const monthlyRateKg = (rateOfChange / 100) * currentWeight;
    weeklyRateKg = monthlyRateKg / 4.33;
  } else {
    // For fat loss, rate is weekly
    weeklyRateKg = (rateOfChange / 100) * currentWeight;
  }
  
  if (weeklyRateKg === 0) return 0;
  
  let projectedWeeks = remainingWeight / weeklyRateKg;

  // Add diet breaks if enabled
  if (dietBreakFrequency && dietBreakDuration && dietBreakFrequency > 0 && dietBreakDuration > 0) {
    const breaksNeeded = Math.floor(projectedWeeks / dietBreakFrequency);
    projectedWeeks += breaksNeeded * dietBreakDuration;
  }

  return Math.round(projectedWeeks);
}

/**
 * Complete calculation for nutrition goals
 */
export interface NutritionCalculationInput {
  weight: number;
  height: number;
  age: number;
  gender: 'male' | 'female';
  bodyFat?: number | null;
  activityLevel: number;
  goal: 'maintenance' | 'loss' | 'gain';
  rateOfChange: number;
  proteinPerKg: number;
  useFFM?: boolean;
  fatPercentage: number;
  targetGoalType?: 'weight' | 'bodyfat';
  targetValue?: number;
  dietBreakFrequency?: number;
  dietBreakDuration?: number;
}

export interface NutritionCalculationResult {
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  deficitPercent: number;
  projectedWeeks?: number;
}

export function calculateNutritionGoals(
  input: NutritionCalculationInput
): NutritionCalculationResult {
  // Step 1: Calculate BMR
  const bmr = calculateBMR(
    input.weight,
    input.height,
    input.age,
    input.gender,
    input.bodyFat
  );

  // Step 2: Calculate TDEE
  const tdee = calculateTDEE(bmr, input.activityLevel);

  // Step 3: Calculate goal-adjusted calories
  const { calories, deficitPercent } = calculateGoalCalories(
    tdee,
    input.weight,
    input.goal,
    input.rateOfChange
  );

  // Step 4: Calculate protein
  const proteinGrams = calculateProtein(
    input.weight,
    input.proteinPerKg,
    input.bodyFat,
    input.useFFM
  );

  // Step 5: Calculate macros
  const macros = calculateMacros(calories, proteinGrams, input.fatPercentage);

  // Step 6: Calculate duration if target provided
  let projectedWeeks: number | undefined;
  
  if (input.targetValue && input.targetValue > 0 && (input.goal === 'loss' || input.goal === 'gain')) {
    let targetWeight = 0;
    
    if (input.targetGoalType === 'weight') {
      targetWeight = input.targetValue;
    } else if (input.targetGoalType === 'bodyfat' && input.bodyFat && input.bodyFat > 0) {
      targetWeight = calculateTargetWeightFromBF(
        input.weight,
        input.bodyFat,
        input.targetValue
      );
    }

    if (targetWeight > 0) {
      projectedWeeks = calculateProjectedDuration(
        input.weight,
        targetWeight,
        input.rateOfChange,
        input.goal,
        input.dietBreakFrequency,
        input.dietBreakDuration
      );
    }
  }

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories: Math.round(calories),
    ...macros,
    deficitPercent: Math.round(deficitPercent * 10) / 10,
    projectedWeeks,
  };
}

/**
 * Calculate actual TDEE using reverse dieting formula
 * Real TDEE = (Average Calories Consumed ± (Weight Change × 7700 ÷ Total Days))
 */
export function calculateReverseTDEE(
  avgCalories: number,
  weightChange: number, // in kg (negative for loss, positive for gain)
  totalDays: number
): number {
  const energyBalance = (weightChange * 7700) / totalDays;
  return avgCalories - energyBalance;
}

/**
 * Calculate 7-day rolling average for weight
 */
export function calculateRollingAverage(
  logs: Array<{ log_date: string; weight_kg: number }>,
  targetDate: string
): number | null {
  const target = new Date(targetDate);
  const sevenDaysAgo = new Date(target);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // Include target date

  const relevantLogs = logs.filter(log => {
    const logDate = new Date(log.log_date);
    return logDate >= sevenDaysAgo && logDate <= target;
  });

  if (relevantLogs.length === 0) return null;

  const sum = relevantLogs.reduce((acc, log) => acc + log.weight_kg, 0);
  return sum / relevantLogs.length;
}

/**
 * Check if adjustment should be applied (minimum threshold)
 */
export function shouldApplyAdjustment(calorieChange: number): boolean {
  return Math.abs(calorieChange) >= 50;
}

/**
 * Calculate calorie adjustment with cap
 */
export function calculateCappedAdjustment(
  suggestedChange: number,
  maxChange: number = 300
): number {
  if (Math.abs(suggestedChange) <= 50) return 0;
  
  const sign = suggestedChange > 0 ? 1 : -1;
  const capped = Math.min(Math.abs(suggestedChange), maxChange);
  return sign * capped;
}

/**
 * Generate phase summary from logs and adjustments
 */
export function generatePhaseSummary(
  phase: any,
  weightLogs: any[],
  adherenceLogs: any[],
  adjustments: any[]
) {
  if (weightLogs.length === 0) {
    return null;
  }

  const sortedLogs = [...weightLogs].sort((a, b) => 
    new Date(a.log_date).getTime() - new Date(b.log_date).getTime()
  );

  const startWeight = sortedLogs[0].weight_kg;
  const endWeight = sortedLogs[sortedLogs.length - 1].weight_kg;
  const totalChange = endWeight - startWeight;
  
  const targetChange = phase.target_weight_kg 
    ? phase.target_weight_kg - phase.starting_weight_kg 
    : 0;
  
  const percentOfTarget = targetChange !== 0 
    ? (totalChange / targetChange) * 100 
    : 0;

  // Calculate average adherence
  const adherentWeeks = adherenceLogs.filter(log => 
    log.followed_calories && log.tracked_accurately
  ).length;
  const averageAdherence = adherenceLogs.length > 0 
    ? (adherentWeeks / adherenceLogs.length) * 100 
    : 0;

  // Count diet breaks
  const dietBreaksTaken = adjustments.filter(adj => 
    adj.is_diet_break_week
  ).length;

  // Calculate average macros from adjustments
  const approvedAdjustments = adjustments.filter(adj => adj.status === 'approved');
  let avgDailyCalories = phase.daily_calories;
  let avgProtein = phase.protein_grams;
  let avgFat = phase.fat_grams;
  let avgCarbs = phase.carb_grams;

  if (approvedAdjustments.length > 0) {
    avgDailyCalories = approvedAdjustments.reduce((sum, adj) => 
      sum + adj.new_daily_calories, 0
    ) / approvedAdjustments.length;
    
    avgProtein = approvedAdjustments.reduce((sum, adj) => 
      sum + adj.new_protein_grams, 0
    ) / approvedAdjustments.length;
    
    avgFat = approvedAdjustments.reduce((sum, adj) => 
      sum + adj.new_fat_grams, 0
    ) / approvedAdjustments.length;
    
    avgCarbs = approvedAdjustments.reduce((sum, adj) => 
      sum + adj.new_carb_grams, 0
    ) / approvedAdjustments.length;
  }

  return {
    startWeight,
    endWeight,
    totalChange,
    targetChange,
    percentOfTarget,
    averageAdherence,
    dietBreaksTaken,
    avgDailyCalories,
    avgProtein,
    avgFat,
    avgCarbs
  };
}
