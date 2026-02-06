// Phase 22 Nutrition System Types
// Interfaces for step tracking, body fat, diet breaks, refeeds, and care team messaging

// =============================================================================
// Step Tracking
// =============================================================================

export interface StepLog {
  id: string;
  user_id: string;
  log_date: string;
  steps: number;
  source: StepSource | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type StepSource =
  | 'manual'
  | 'apple_health'
  | 'google_fit'
  | 'fitbit'
  | 'garmin'
  | 'samsung_health'
  | 'other';

export interface StepRecommendation {
  id: string;
  user_id: string;
  recommended_by: string;
  target_steps: number;
  min_steps: number | null;
  max_steps: number | null;
  effective_date: string;
  end_date: string | null;
  is_active: boolean;
  reason: string | null;
  context: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Body Fat Tracking
// =============================================================================

export interface BodyFatLog {
  id: string;
  user_id: string;
  log_date: string;
  body_fat_percentage: number;
  method: BodyFatMethod;
  fat_free_mass_kg: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type BodyFatMethod =
  | 'dexa'
  | 'bod_pod'
  | 'hydrostatic'
  | 'bioelectrical'
  | 'skinfold'
  | 'navy_method'
  | 'visual'
  | 'other';

export const BODY_FAT_METHOD_LABELS: Record<BodyFatMethod, { label: string; description: string; accuracy: 'high' | 'medium' | 'low' }> = {
  dexa: {
    label: 'DEXA Scan',
    description: 'Dual-energy X-ray absorptiometry - clinical gold standard',
    accuracy: 'high'
  },
  bod_pod: {
    label: 'Bod Pod',
    description: 'Air displacement plethysmography',
    accuracy: 'high'
  },
  hydrostatic: {
    label: 'Hydrostatic Weighing',
    description: 'Underwater weighing',
    accuracy: 'high'
  },
  bioelectrical: {
    label: 'Bioelectrical Impedance',
    description: 'Smart scale or handheld device',
    accuracy: 'medium'
  },
  skinfold: {
    label: 'Skinfold Calipers',
    description: 'Multiple-site caliper measurements',
    accuracy: 'medium'
  },
  navy_method: {
    label: 'Navy Method',
    description: 'Circumference-based calculation',
    accuracy: 'low'
  },
  visual: {
    label: 'Visual Estimate',
    description: 'Comparison to reference photos',
    accuracy: 'low'
  },
  other: {
    label: 'Other Method',
    description: 'Alternative measurement method',
    accuracy: 'low'
  },
};

// =============================================================================
// Diet Breaks
// =============================================================================

export interface DietBreak {
  id: string;
  phase_id: string;
  scheduled_start_date: string;
  scheduled_end_date: string;
  actual_start_date: string | null;
  actual_end_date: string | null;
  status: DietBreakStatus;
  maintenance_calories: number | null;
  maintenance_protein_g: number | null;
  maintenance_fat_g: number | null;
  maintenance_carb_g: number | null;
  pre_break_weight_kg: number | null;
  post_break_weight_kg: number | null;
  weight_change_during_break_kg: number | null;
  pre_break_avg_intake: number | null;
  pre_break_weight_change_rate: number | null;
  reason: string | null;
  coach_notes: string | null;
  client_feedback: string | null;
  initiated_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DietBreakStatus =
  | 'scheduled'
  | 'active'
  | 'completed'
  | 'skipped'
  | 'cancelled';

// =============================================================================
// Refeed Days
// =============================================================================

export interface RefeedDay {
  id: string;
  phase_id: string;
  scheduled_date: string;
  refeed_type: RefeedType;
  status: RefeedStatus;
  target_calories: number | null;
  target_protein_g: number | null;
  target_fat_g: number | null;
  target_carb_g: number | null;
  actual_calories: number | null;
  actual_protein_g: number | null;
  actual_fat_g: number | null;
  actual_carb_g: number | null;
  pre_refeed_weight_kg: number | null;
  post_refeed_weight_kg: number | null;
  coach_notes: string | null;
  client_notes: string | null;
  training_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type RefeedType =
  | 'moderate'     // +20-30% calories, mostly carbs
  | 'full'         // Maintenance calories
  | 'high_carb'    // High carb focus, reduced fat
  | 'free_meal';   // Untracked single meal

export type RefeedStatus =
  | 'scheduled'
  | 'completed'
  | 'skipped'
  | 'cancelled';

export const REFEED_TYPE_CONFIG: Record<RefeedType, {
  label: string;
  description: string;
  calorieMultiplier: number;
  carbIncrease: number; // percentage increase
  fatReduction: number; // percentage reduction
}> = {
  moderate: {
    label: 'Moderate Refeed',
    description: '+20-30% calories, primarily from carbs',
    calorieMultiplier: 1.25,
    carbIncrease: 50,
    fatReduction: 20,
  },
  full: {
    label: 'Full Refeed',
    description: 'Maintenance calories for the day',
    calorieMultiplier: 1.0, // Will be calculated to maintenance
    carbIncrease: 75,
    fatReduction: 30,
  },
  high_carb: {
    label: 'High Carb Day',
    description: 'Maximum carb focus, minimum fat',
    calorieMultiplier: 1.15,
    carbIncrease: 100,
    fatReduction: 50,
  },
  free_meal: {
    label: 'Free Meal',
    description: 'Single untracked meal (not full day)',
    calorieMultiplier: 1.0,
    carbIncrease: 0,
    fatReduction: 0,
  },
};

// =============================================================================
// Care Team Messages
// =============================================================================

export interface CareTeamMessage {
  id: string;
  client_id: string;
  sender_id: string;
  message: string;
  message_type: CareTeamMessageType;
  priority: CareTeamMessagePriority;
  related_phase_id: string | null;
  related_program_id: string | null;
  mentions: string[] | null;
  read_by: string[] | null;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CareTeamMessageType =
  | 'general'
  | 'nutrition'
  | 'training'
  | 'progress'
  | 'concern'
  | 'handoff'
  | 'follow_up';

export type CareTeamMessagePriority =
  | 'low'
  | 'normal'
  | 'high'
  | 'urgent';

export const MESSAGE_TYPE_CONFIG: Record<CareTeamMessageType, { label: string; color: string }> = {
  general: { label: 'General', color: 'bg-gray-100 text-gray-700' },
  nutrition: { label: 'Nutrition', color: 'bg-green-100 text-green-700' },
  training: { label: 'Training', color: 'bg-blue-100 text-blue-700' },
  progress: { label: 'Progress', color: 'bg-purple-100 text-purple-700' },
  concern: { label: 'Concern', color: 'bg-amber-100 text-amber-700' },
  handoff: { label: 'Handoff', color: 'bg-indigo-100 text-indigo-700' },
  follow_up: { label: 'Follow Up', color: 'bg-cyan-100 text-cyan-700' },
};

export const MESSAGE_PRIORITY_CONFIG: Record<CareTeamMessagePriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-slate-100 text-slate-600' },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700' },
};

// =============================================================================
// Nutrition Permissions
// =============================================================================

export interface NutritionPermissions {
  canEdit: boolean;
  isLoading: boolean;
  clientHasDietitian: boolean;
  currentUserRole: NutritionRole;
}

export type NutritionRole =
  | 'dietitian'
  | 'coach'
  | 'self'
  | 'none';

// =============================================================================
// Nutrition Phase (Extended)
// =============================================================================

export interface NutritionPhase {
  id: string;
  user_id: string;
  coach_id: string | null;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  goal_type: 'fat_loss' | 'muscle_gain' | 'maintenance' | 'recomp';
  daily_calories: number;
  protein_grams: number;
  fat_grams: number;
  carb_grams: number;
  fiber_grams: number | null;
  steps_target: number | null;
  diet_breaks_enabled: boolean;
  diet_break_frequency_weeks: number | null;
  diet_break_duration_weeks: number | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate maintenance calories for diet break from actual data.
 * Formula: avg_intake + (weekly_weight_change × 7700 / 7)
 * Example: 1800 kcal + losing 0.5kg/week = 2350 kcal
 */
export function calculateMaintenanceCalories(
  avgIntake: number,
  weeklyWeightChangeKg: number
): number {
  // 7700 kcal per kg of body weight change
  const calorieAdjustment = (weeklyWeightChangeKg * 7700) / 7;
  return Math.round(avgIntake + calorieAdjustment);
}

/**
 * Calculate fat-free mass from body weight and body fat percentage.
 */
export function calculateFatFreeMass(
  weightKg: number,
  bodyFatPercentage: number
): number {
  const fatMassKg = weightKg * (bodyFatPercentage / 100);
  return Math.round((weightKg - fatMassKg) * 10) / 10;
}

/**
 * Calculate 7-day step average from step logs.
 */
export function calculateStepAverage(stepLogs: StepLog[], days: number = 7): number {
  if (stepLogs.length === 0) return 0;

  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const recentLogs = stepLogs.filter(log => new Date(log.log_date) >= cutoff);
  if (recentLogs.length === 0) return 0;

  const total = recentLogs.reduce((sum, log) => sum + log.steps, 0);
  return Math.round(total / recentLogs.length);
}

/**
 * Calculate step trend (positive = increasing, negative = decreasing).
 */
export function calculateStepTrend(stepLogs: StepLog[]): 'up' | 'down' | 'stable' {
  if (stepLogs.length < 4) return 'stable';

  const sorted = [...stepLogs].sort((a, b) =>
    new Date(a.log_date).getTime() - new Date(b.log_date).getTime()
  );

  const recent = sorted.slice(-3);
  const older = sorted.slice(-7, -3);

  if (older.length === 0) return 'stable';

  const recentAvg = recent.reduce((sum, l) => sum + l.steps, 0) / recent.length;
  const olderAvg = older.reduce((sum, l) => sum + l.steps, 0) / older.length;

  const percentChange = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (percentChange > 5) return 'up';
  if (percentChange < -5) return 'down';
  return 'stable';
}

/**
 * Calculate refeed day target macros based on phase and refeed type.
 */
export function calculateRefeedTargets(
  phase: NutritionPhase,
  refeedType: RefeedType,
  maintenanceCalories?: number
): { calories: number; protein: number; fat: number; carbs: number } {
  const config = REFEED_TYPE_CONFIG[refeedType];

  let targetCalories: number;
  if (refeedType === 'full' && maintenanceCalories) {
    targetCalories = maintenanceCalories;
  } else {
    targetCalories = Math.round(phase.daily_calories * config.calorieMultiplier);
  }

  // Keep protein constant
  const protein = phase.protein_grams;
  const proteinCalories = protein * 4;

  // Reduce fat
  const originalFatCalories = phase.fat_grams * 9;
  const newFatCalories = originalFatCalories * (1 - config.fatReduction / 100);
  const fat = Math.round(newFatCalories / 9);

  // Fill remaining with carbs
  const remainingCalories = targetCalories - proteinCalories - (fat * 9);
  const carbs = Math.round(remainingCalories / 4);

  return {
    calories: targetCalories,
    protein,
    fat,
    carbs: Math.max(0, carbs),
  };
}
