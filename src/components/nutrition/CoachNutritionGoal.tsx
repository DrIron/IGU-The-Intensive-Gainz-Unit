import { useState, useEffect, useCallback } from "react";
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
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface CoachNutritionGoalProps {
  clientUserId: string;
  phase: any;
  onPhaseUpdated: () => void;
}

interface ClientData {
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  body_fat_percentage: number | null;
}

export function CoachNutritionGoal({ clientUserId, phase, onPhaseUpdated }: CoachNutritionGoalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [clientData, setClientData] = useState<ClientData | null>(null);
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

  const loadClientData = useCallback(async () => {
    try {
      // SECURITY: Coaches can't read form_submissions directly (PHI). Age is low-sensitivity
      // at year granularity and needed by the macro calculator, so we expose it through a
      // SECURITY DEFINER RPC (get_client_age) that authorizes the caller server-side.
      const { data: ageData, error: ageError } = await supabase.rpc('get_client_age', {
        p_client_id: clientUserId,
      });
      if (ageError) {
        console.warn('get_client_age failed, coach will enter age manually:', ageError.message);
      }

      setClientData({
        age: typeof ageData === 'number' ? ageData : null,
        gender: null, // Gender still PHI — coach enters manually
        height_cm: null, // Height not stored centrally yet — manual entry
        body_fat_percentage: null,
      });
    } catch (error) {
      console.error('Error loading client data:', error);
    }
  }, [clientUserId]);

  useEffect(() => {
    loadClientData();
  }, [loadClientData]);

  useEffect(() => {
    if (phase) {
      setFormData(prev => ({
        phaseName: phase.phase_name || "",
        startDate: new Date(phase.start_date),
        goalType: phase.goal_type,
        startingWeight: phase.starting_weight_kg?.toString() || "",
        targetWeight: phase.target_weight_kg?.toString() || "",
        targetBodyFat: phase.target_body_fat_percentage?.toString() || "",
        currentBodyFat: "",
        height: prev.height,
        // Age is derived live from DOB via the RPC. Prefer fresh DOB-based value on
        // every open; only fall back to whatever the coach typed if the RPC
        // returned nothing (DOB not yet entered by client).
        age: clientData?.age != null ? clientData.age.toString() : prev.age,
        gender: prev.gender,
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
    } else if (clientData) {
      // Auto-populate for new phases
      setFormData(prev => ({
        ...prev,
        height: clientData.height_cm?.toString() || prev.height,
        age: clientData.age != null ? clientData.age.toString() : prev.age,
        gender: clientData.gender || prev.gender,
        currentBodyFat: clientData.body_fat_percentage?.toString() || prev.currentBodyFat,
      }));
    }
  }, [phase, clientData]);

  const calculateMacros = () => {
    const w = parseFloat(formData.startingWeight);
    const h = parseFloat(formData.height);
    const age = parseInt(formData.age);
    const bodyFatValue = formData.currentBodyFat ? parseFloat(formData.currentBodyFat) : null;

    if (!w) return null;

    // STEP 1 — Calculate BMR (following same logic as CalorieCalculator)
    let bmr: number;
    if (bodyFatValue !== null && bodyFatValue > 0) {
      // Use Katch-McArdle if body fat % is provided
      const leanMass = w * (1 - bodyFatValue / 100);
      bmr = 370 + 21.6 * leanMass;
    } else if (h && age && formData.gender) {
      // Use Mifflin-St Jeor if no body fat %
      if (formData.gender === "male") {
        bmr = 10 * w + 6.25 * h - 5 * age + 5;
      } else {
        bmr = 10 * w + 6.25 * h - 5 * age - 161;
      }
    } else {
      // Fallback to simplified calculation
      bmr = w * 24;
    }

    // STEP 2 — Calculate TDEE (using selected activity level)
    const activityMultiplier = parseFloat(formData.activityLevel);
    const tdee = bmr * activityMultiplier;
    
    // STEP 3 — Goal-Adjusted Calories
    let targetCalories: number;
    
    if (formData.goalType === 'maintenance') {
      targetCalories = tdee;
    } else if (formData.goalType === 'loss') {
      // Weekly rate: Each 1% weekly change requires ~7700 kcal × 1% of bodyweight
      const weeklyDeficit = (formData.weeklyRate[0] / 100) * w * 7700;
      targetCalories = tdee - (weeklyDeficit / 7);
    } else if (formData.goalType === 'gain') {
      // Monthly rate: Each 1% monthly change requires ~7700 kcal × 1% of bodyweight
      const monthlySurplus = (formData.weeklyRate[0] / 100) * w * 7700;
      targetCalories = tdee + (monthlySurplus / (4.33 * 7)); // 4.33 weeks per month * 7 days
    } else {
      targetCalories = tdee;
    }

    // STEP 4 — Calculate Macros
    // Protein (g) - based on FFM if enabled, otherwise total weight
    const proteinMultiplier = formData.proteinIntake[0];
    let proteinG: number;
    
    if (formData.proteinBasedOnFFM && bodyFatValue !== null && bodyFatValue > 0) {
      const fatFreeMass = w * (1 - bodyFatValue / 100);
      proteinG = fatFreeMass * proteinMultiplier;
    } else {
      proteinG = w * proteinMultiplier;
    }
    const proteinCal = proteinG * 4;

    // Fat (g)
    const fatCal = targetCalories * (formData.fatIntake[0] / 100);
    const fatG = fatCal / 9;
    
    // Carbs (g) - remainder after protein and fat
    const carbCal = targetCalories - (proteinCal + fatCal);
    const carbG = carbCal / 4;

    return {
      calories: Math.round(targetCalories),
      protein: Math.round(proteinG),
      fat: Math.round(fatG),
      carbs: Math.round(carbG),
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
        goal_type: formData.goalType,
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
              value={formData.age}
              onChange={(e) => setFormData({ ...formData, age: e.target.value })}
              placeholder="25"
            />
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Height (cm)</Label>
            <Input
              type="number"
              step="0.1"
              value={formData.height}
              onChange={(e) => setFormData({ ...formData, height: e.target.value })}
              placeholder="170"
            />
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
              value={formData.startingWeight}
              onChange={(e) => setFormData({ ...formData, startingWeight: e.target.value })}
            />
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
