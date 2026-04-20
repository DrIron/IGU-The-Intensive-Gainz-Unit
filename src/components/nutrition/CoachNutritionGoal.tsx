import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { useClientDemographics } from "@/hooks/useClientDemographics";
import { calculateNutritionGoals } from "@/utils/nutritionCalculations";

interface CoachNutritionGoalProps {
  clientUserId: string;
  phase: any;
  onPhaseUpdated: () => void;
}

// The DB column goal_type has a CHECK constraint on
//   ('fat_loss' | 'maintenance' | 'muscle_gain')
// but the coach form has always worked in the shorter ('loss' | 'gain' |
// 'maintenance') vocabulary -- matches the Select labels and the enum in
// `calculateNutritionGoals`. We round-trip the two forms here so the DB
// keeps its legacy enum values while the form state stays compact.
const FORM_TO_DB_GOAL: Record<string, string> = {
  loss: "fat_loss",
  gain: "muscle_gain",
  maintenance: "maintenance",
};
const DB_TO_FORM_GOAL: Record<string, string> = {
  fat_loss: "loss",
  muscle_gain: "gain",
  maintenance: "maintenance",
};

export function CoachNutritionGoal({ clientUserId, phase, onPhaseUpdated }: CoachNutritionGoalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const demographics = useClientDemographics(clientUserId);
  // Track which auto-populated fields the coach has manually overridden so the
  // "from profile" hint dims once touched.
  const [overrides, setOverrides] = useState<{ age: boolean; gender: boolean; height: boolean; weight: boolean }>({
    age: false,
    gender: false,
    height: false,
    weight: false,
  });
  const [formData, setFormData] = useState({
    phaseName: "",
    startDate: new Date(),
    goalType: "loss",
    startingWeight: "",
    targetWeight: "",
    targetBodyFat: "",
    currentBodyFat: "",
    height: "",
    age: "",
    gender: "",
    activityLevel: "",
    weeklyRate: [0.75],
    proteinIntake: [2.0],
    fatIntake: [30],
    proteinBasedOnFFM: false,
    dietBreakEnabled: false,
    dietBreakFrequency: "",
    dietBreakDuration: "",
    coachNotes: "",
  });

  // Auto-populate from stored demographics (age/gender/height via SECURITY DEFINER
  // RPCs, latest weight via weight_logs). The coach can type to override; once a
  // field is touched, `overrides.X` flips and further demographic refreshes won't
  // clobber the coach's value. On editing an existing phase, we always show the
  // phase's own values first and let the coach pull in demographics if they want.
  useEffect(() => {
    if (phase) {
      setFormData(prev => ({
        phaseName: phase.phase_name || "",
        startDate: new Date(phase.start_date),
        goalType: DB_TO_FORM_GOAL[phase.goal_type] || phase.goal_type,
        startingWeight: phase.starting_weight_kg?.toString() || prev.startingWeight,
        targetWeight: phase.target_weight_kg?.toString() || "",
        targetBodyFat: phase.target_body_fat_percentage?.toString() || "",
        currentBodyFat: prev.currentBodyFat,
        height: overrides.height
          ? prev.height
          : (demographics.heightCm?.toString() || prev.height),
        age: overrides.age
          ? prev.age
          : (demographics.age != null ? demographics.age.toString() : prev.age),
        gender: overrides.gender ? prev.gender : (demographics.gender || prev.gender),
        activityLevel: prev.activityLevel,
        weeklyRate: [phase.weekly_rate_percentage],
        proteinIntake: [phase.protein_intake_g_per_kg],
        fatIntake: [phase.fat_intake_percentage],
        proteinBasedOnFFM: phase.protein_based_on_ffm,
        dietBreakEnabled: phase.diet_break_enabled,
        dietBreakFrequency: phase.diet_break_frequency_weeks?.toString() || "",
        dietBreakDuration: phase.diet_break_duration_weeks?.toString() || "",
        coachNotes: phase.coach_notes || "",
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        age: overrides.age
          ? prev.age
          : (demographics.age != null ? demographics.age.toString() : prev.age),
        gender: overrides.gender ? prev.gender : (demographics.gender || prev.gender),
        height: overrides.height
          ? prev.height
          : (demographics.heightCm?.toString() || prev.height),
        startingWeight: overrides.weight
          ? prev.startingWeight
          : (demographics.latestWeightKg != null ? demographics.latestWeightKg.toString() : prev.startingWeight),
      }));
    }
  }, [phase, demographics, overrides]);

  // Small helper: "from profile" or "last logged 2d ago"-style hint text under an auto-populated field.
  const demographicHint = (
    field: "age" | "gender" | "height" | "weight",
    hasValue: boolean,
  ): string | null => {
    if (overrides[field]) return null;
    if (!hasValue) return null;
    if (field === "weight" && demographics.latestWeightLoggedAt) {
      try {
        return `last logged ${formatDistanceToNow(new Date(demographics.latestWeightLoggedAt), { addSuffix: true })}`;
      } catch {
        return "from latest weight log";
      }
    }
    return "from profile";
  };

  // Macro math lives in one place -- `calculateNutritionGoals` also powers the
  // self-service calculator so coach + client see identical outputs. This
  // wrapper just parses form strings into the structured input and deals with
  // partial-data fallbacks (no height/age/gender -> a rough BMR estimate).
  const calculateMacros = () => {
    const w = parseFloat(formData.startingWeight);
    if (!w || !Number.isFinite(w)) return null;

    const activity = parseFloat(formData.activityLevel);
    if (!Number.isFinite(activity) || activity <= 0) return null;

    const goal =
      formData.goalType === "maintenance" || formData.goalType === "loss" || formData.goalType === "gain"
        ? formData.goalType
        : "maintenance";
    const rate = formData.weeklyRate[0] ?? 0;
    const proteinPerKg = formData.proteinIntake[0] ?? 0;
    const fatPercentage = formData.fatIntake[0] ?? 0;

    const h = parseFloat(formData.height);
    const age = parseInt(formData.age, 10);
    const bodyFatValue = formData.currentBodyFat ? parseFloat(formData.currentBodyFat) : null;
    const gender = formData.gender === "male" || formData.gender === "female" ? formData.gender : null;
    const haveMifflinInputs = Number.isFinite(h) && Number.isFinite(age) && !!gender;
    const haveBodyFat = bodyFatValue !== null && Number.isFinite(bodyFatValue) && bodyFatValue > 0;

    if (!haveMifflinInputs && !haveBodyFat) {
      // Rough fallback mirroring the pre-refactor behavior: BMR ~ weight * 24.
      // Emit a shape compatible with the shared result for downstream consumers.
      const bmr = w * 24;
      const tdee = bmr * activity;
      const calories =
        goal === "loss"
          ? tdee - ((rate / 100) * w * 7700) / 7
          : goal === "gain"
          ? tdee + ((rate / 100) * w * 7700) / (4.33 * 7)
          : tdee;
      const proteinG = w * proteinPerKg;
      const fatG = (calories * (fatPercentage / 100)) / 9;
      const carbG = (calories - proteinG * 4 - fatG * 9) / 4;
      return {
        calories: Math.round(calories),
        protein: Math.round(proteinG),
        fat: Math.round(fatG),
        carbs: Math.round(carbG),
      };
    }

    const result = calculateNutritionGoals({
      weight: w,
      height: haveMifflinInputs ? h : 0,
      age: haveMifflinInputs ? age : 0,
      gender: haveMifflinInputs ? (gender as "male" | "female") : "male",
      bodyFat: haveBodyFat ? bodyFatValue! : null,
      activityLevel: activity,
      goal,
      rateOfChange: rate,
      proteinPerKg,
      useFFM: formData.proteinBasedOnFFM,
      fatPercentage,
    });

    return {
      calories: result.calories,
      protein: result.protein,
      fat: result.fat,
      carbs: result.carbs,
    };
  };

  const handleSave = async () => {
    // Up-front field validation so we don't propagate NaN into the macro math
    // and then hit a Postgres NOT NULL rejection with an opaque error.
    const missing: string[] = [];
    if (!formData.phaseName) missing.push("phase name");
    if (!formData.startingWeight) missing.push("starting weight");
    if (!formData.activityLevel) missing.push("activity level");
    if (missing.length > 0) {
      toast({
        title: "Missing required fields",
        description: `Please fill in: ${missing.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const macros = calculateMacros();

      // calculateMacros returns null when the starting weight is empty.
      // We already guarded for that above, but the runtime result could
      // still be NaN if some input is malformed (e.g. a non-numeric height).
      if (
        !macros ||
        !Number.isFinite(macros.calories) ||
        !Number.isFinite(macros.protein) ||
        !Number.isFinite(macros.fat) ||
        !Number.isFinite(macros.carbs)
      ) {
        toast({
          title: "Couldn't calculate macros",
          description:
            "Check that starting weight and activity level are set. Age, height and gender improve accuracy but aren't required.",
          variant: "destructive",
        });
        return;
      }

      const phaseData = {
        user_id: clientUserId,
        coach_id: user.id,
        phase_name: formData.phaseName,
        start_date: formData.startDate.toISOString(),
        goal_type: FORM_TO_DB_GOAL[formData.goalType] || formData.goalType,
        starting_weight_kg: parseFloat(formData.startingWeight),
        target_weight_kg: formData.targetWeight ? parseFloat(formData.targetWeight) : null,
        target_body_fat_percentage: formData.targetBodyFat ? parseFloat(formData.targetBodyFat) : null,
        weekly_rate_percentage: formData.weeklyRate[0],
        protein_intake_g_per_kg: formData.proteinIntake[0],
        protein_based_on_ffm: formData.proteinBasedOnFFM,
        fat_intake_percentage: formData.fatIntake[0],
        diet_break_enabled: formData.dietBreakEnabled,
        diet_break_frequency_weeks: formData.dietBreakEnabled && formData.dietBreakFrequency ? parseInt(formData.dietBreakFrequency) : null,
        diet_break_duration_weeks: formData.dietBreakEnabled && formData.dietBreakDuration ? parseInt(formData.dietBreakDuration) : null,
        daily_calories: macros.calories,
        protein_grams: macros.protein,
        fat_grams: macros.fat,
        carb_grams: macros.carbs,
        coach_notes: formData.coachNotes,
        is_active: true,
      };

      let result;
      if (phase) {
        result = await supabase
          .from('nutrition_phases')
          .update(phaseData)
          .eq('id', phase.id);
      } else {
        // Deactivate old phases -- without the { error } destructure, an RLS
        // denial here returns 0 rows with no exception, the insert proceeds,
        // and the coach sees a success toast for a save that never happened.
        const { error: deactivateError } = await supabase
          .from('nutrition_phases')
          .update({ is_active: false })
          .eq('user_id', clientUserId)
          .eq('is_active', true);

        if (deactivateError) throw deactivateError;

        result = await supabase
          .from('nutrition_phases')
          .insert([phaseData]);
      }

      if (result.error) throw result.error;

      toast({
        title: "Success",
        description: phase ? "Phase updated successfully" : "New phase created successfully",
      });

      onPhaseUpdated();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const macros = formData.startingWeight ? calculateMacros() : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{phase ? 'Edit' : 'Create'} Nutrition Phase</CardTitle>
        <CardDescription>Set nutrition goals and macros for your client</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Phase Name *</Label>
            <Input
              value={formData.phaseName}
              onChange={(e) => setFormData({ ...formData, phaseName: e.target.value })}
              placeholder="Fat Loss Oct 2025"
            />
          </div>
          <div className="space-y-2">
            <Label>Start Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left", !formData.startDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.startDate ? format(formData.startDate, 'PPP') : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={formData.startDate} onSelect={(date) => date && setFormData({ ...formData, startDate: date })} initialFocus className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Client Demographics & Activity */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="space-y-2">
            <Label>Age</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={formData.age}
              onChange={(e) => {
                setOverrides((o) => ({ ...o, age: true }));
                setFormData({ ...formData, age: e.target.value });
              }}
              placeholder="25"
            />
            {demographicHint("age", demographics.age != null) && (
              <p className="text-[10px] text-muted-foreground leading-none">
                {demographicHint("age", demographics.age != null)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select
              value={formData.gender}
              onValueChange={(value) => {
                setOverrides((o) => ({ ...o, gender: true }));
                setFormData({ ...formData, gender: value });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
            {demographicHint("gender", demographics.gender != null) && (
              <p className="text-[10px] text-muted-foreground leading-none">
                {demographicHint("gender", demographics.gender != null)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Height (cm)</Label>
            <Input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={formData.height}
              onChange={(e) => {
                setOverrides((o) => ({ ...o, height: true }));
                setFormData({ ...formData, height: e.target.value });
              }}
              placeholder="170"
            />
            {demographicHint("height", demographics.heightCm != null) && (
              <p className="text-[10px] text-muted-foreground leading-none">
                {demographicHint("height", demographics.heightCm != null)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Current BF%</Label>
            <Input
              type="number"
              step="0.1"
              value={formData.currentBodyFat}
              onChange={(e) => setFormData({ ...formData, currentBodyFat: e.target.value })}
              placeholder="20"
            />
          </div>
          <div className="space-y-2">
            <Label>Activity Level</Label>
            <Select value={formData.activityLevel} onValueChange={(value) => setFormData({ ...formData, activityLevel: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1.2">Sedentary</SelectItem>
                <SelectItem value="1.375">Light (1–3x/week)</SelectItem>
                <SelectItem value="1.55">Moderate (3–5x/week)</SelectItem>
                <SelectItem value="1.725">Very Active (6–7x/week)</SelectItem>
                <SelectItem value="1.9">Extremely Active (2x/day)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Goal Settings */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Goal Type *</Label>
            <Select value={formData.goalType} onValueChange={(value) => setFormData({ ...formData, goalType: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="loss">Fat Loss</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="gain">Muscle Gain</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Starting Weight (kg) *</Label>
            <Input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={formData.startingWeight}
              onChange={(e) => {
                setOverrides((o) => ({ ...o, weight: true }));
                setFormData({ ...formData, startingWeight: e.target.value });
              }}
            />
            {demographicHint("weight", demographics.latestWeightKg != null) && (
              <p className="text-[10px] text-muted-foreground leading-none">
                {demographicHint("weight", demographics.latestWeightKg != null)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Target Weight (kg)</Label>
            <Input
              type="number"
              step="0.1"
              value={formData.targetWeight}
              onChange={(e) => setFormData({ ...formData, targetWeight: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Goal BF%</Label>
            <Input
              type="number"
              step="0.1"
              value={formData.targetBodyFat}
              onChange={(e) => setFormData({ ...formData, targetBodyFat: e.target.value })}
              placeholder="15"
            />
          </div>
        </div>

        {/* Rate of Change Slider */}
        <div className="space-y-2">
          <Label>Rate of Change ({formData.weeklyRate[0].toFixed(2)}% {formData.goalType === 'gain' ? 'per month' : 'per week'})</Label>
          <Slider
            value={formData.weeklyRate}
            onValueChange={(value) => setFormData({ ...formData, weeklyRate: value })}
            min={0.25}
            max={1.5}
            step={0.05}
          />
        </div>

        {/* Protein Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Protein Intake ({formData.proteinIntake[0].toFixed(1)} g/kg)</Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.proteinBasedOnFFM}
                onCheckedChange={(checked) => setFormData({ ...formData, proteinBasedOnFFM: checked })}
              />
              <span className="text-sm text-muted-foreground">Based on FFM</span>
            </div>
          </div>
          <Slider
            value={formData.proteinIntake}
            onValueChange={(value) => setFormData({ ...formData, proteinIntake: value })}
            min={1.6}
            max={3.0}
            step={0.1}
          />
        </div>

        {/* Fat Slider */}
        <div className="space-y-2">
          <Label>Fat Intake ({formData.fatIntake[0]}% of calories)</Label>
          <Slider
            value={formData.fatIntake}
            onValueChange={(value) => setFormData({ ...formData, fatIntake: value })}
            min={20}
            max={40}
            step={1}
          />
        </div>

        {/* Diet Breaks */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable Diet Breaks</Label>
            <Switch
              checked={formData.dietBreakEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, dietBreakEnabled: checked })}
            />
          </div>
          {formData.dietBreakEnabled && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frequency (weeks)</Label>
                <Input
                  type="number"
                  value={formData.dietBreakFrequency}
                  onChange={(e) => setFormData({ ...formData, dietBreakFrequency: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (weeks)</Label>
                <Input
                  type="number"
                  value={formData.dietBreakDuration}
                  onChange={(e) => setFormData({ ...formData, dietBreakDuration: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        {/* Coach Notes */}
        <div className="space-y-2">
          <Label>Coach Notes</Label>
          <Textarea
            value={formData.coachNotes}
            onChange={(e) => setFormData({ ...formData, coachNotes: e.target.value })}
            placeholder="Add any notes or instructions for the client..."
            rows={4}
          />
        </div>

        {/* Calculated Macros Preview */}
        {macros && (
          <div className="p-6 rounded-lg bg-primary/10 space-y-2">
            <p className="font-medium text-lg mb-4">Calculated Daily Macros:</p>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Calories</p>
                <p className="text-2xl font-bold">{macros.calories}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Protein</p>
                <p className="text-2xl font-bold">{macros.protein}g</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fat</p>
                <p className="text-2xl font-bold">{macros.fat}g</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Carbs</p>
                <p className="text-2xl font-bold">{macros.carbs}g</p>
              </div>
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={loading} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {phase ? 'Update Phase' : 'Create Phase'}
        </Button>
      </CardContent>
    </Card>
  );
}
