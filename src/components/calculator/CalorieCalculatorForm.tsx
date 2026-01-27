import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface CalorieCalculatorFormProps {
  weight: string;
  setWeight: (value: string) => void;
  height: string;
  setHeight: (value: string) => void;
  dateOfBirth: string;
  setDateOfBirth: (value: string) => void;
  gender: string;
  setGender: (value: string) => void;
  bodyFat: string;
  setBodyFat: (value: string) => void;
  activityLevel: string;
  setActivityLevel: (value: string) => void;
  goal: string;
  setGoal: (value: string) => void;
  rateOfChange: number[];
  setRateOfChange: (value: number[]) => void;
  proteinPreference: number[];
  setProteinPreference: (value: number[]) => void;
  fatIntake: number[];
  setFatIntake: (value: number[]) => void;
  targetGoalType: "weight" | "bodyfat";
  setTargetGoalType: (value: "weight" | "bodyfat") => void;
  targetValue: string;
  setTargetValue: (value: string) => void;
  dietBreaks: boolean;
  setDietBreaks: (value: boolean) => void;
  dietBreakFrequency: string;
  setDietBreakFrequency: (value: string) => void;
  dietBreakDuration: string;
  setDietBreakDuration: (value: string) => void;
  onCalculate?: () => void;
}

export function CalorieCalculatorForm({
  weight,
  setWeight,
  height,
  setHeight,
  dateOfBirth,
  setDateOfBirth,
  gender,
  setGender,
  bodyFat,
  setBodyFat,
  activityLevel,
  setActivityLevel,
  goal,
  setGoal,
  rateOfChange,
  setRateOfChange,
  proteinPreference,
  setProteinPreference,
  fatIntake,
  setFatIntake,
  targetGoalType,
  setTargetGoalType,
  targetValue,
  setTargetValue,
  dietBreaks,
  setDietBreaks,
  dietBreakFrequency,
  setDietBreakFrequency,
  dietBreakDuration,
  setDietBreakDuration,
  onCalculate,
}: CalorieCalculatorFormProps) {
  const [mode, setMode] = useState<"basic" | "advanced">("basic");

  return (
    <div className="space-y-8">
      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Basic Information</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="gender">
                <SelectValue placeholder="Select your gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Date of Birth</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="height">Height (cm)</Label>
            <Input
              id="height"
              type="number"
              placeholder="175"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight">Weight (kg)</Label>
            <Input
              id="weight"
              type="number"
              placeholder="70"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bodyFat">Body Fat % (Optional)</Label>
            <Input
              id="bodyFat"
              type="number"
              placeholder="15"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-lg bg-muted p-1 gap-1">
          <Button
            type="button"
            variant={mode === "basic" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("basic")}
            className="rounded-md px-6 transition-all"
          >
            Basic
          </Button>
          <Button
            type="button"
            variant={mode === "advanced" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("advanced")}
            className="rounded-md px-6 transition-all"
          >
            Advanced
          </Button>
        </div>
      </div>

      {/* Activity & Goals */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Activity & Goals</h3>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="activity">Activity Level</Label>
            <Select value={activityLevel} onValueChange={setActivityLevel}>
              <SelectTrigger id="activity">
                <SelectValue placeholder="Select activity level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1.2">Sedentary</SelectItem>
                <SelectItem value="1.375">Light (1–3x/week)</SelectItem>
                <SelectItem value="1.55">Moderate (3–5x/week)</SelectItem>
                <SelectItem value="1.725">Very Active (6–7x/week)</SelectItem>
                <SelectItem value="1.9">Extremely Active (2x/day or labor)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <Select value={goal} onValueChange={setGoal}>
              <SelectTrigger id="goal">
                <SelectValue placeholder="Select your goal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="loss">Fat Loss</SelectItem>
                <SelectItem value="gain">Muscle Gain</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Basic Mode - Preset Buttons */}
      {mode === "basic" && (
        <div className="space-y-6">
        {goal !== "maintenance" && (
          <div className="space-y-3">
            <Label>Rate of {goal === "loss" ? "Loss" : "Gain"}</Label>
            <div className="grid grid-cols-3 gap-3">
              <Button
                type="button"
                variant={rateOfChange[0] === 0.5 ? "default" : "outline"}
                className={`h-auto py-4 px-3 flex flex-col items-center justify-center gap-1 transition-all ${
                  rateOfChange[0] === 0.5 ? 'shadow-md' : 'hover:border-primary/50'
                }`}
                onClick={() => setRateOfChange([0.5])}
              >
                <span className="font-bold text-base">Steady</span>
                <span className="text-xs opacity-70">0.5%</span>
              </Button>
              <Button
                type="button"
                variant={rateOfChange[0] === 0.75 ? "default" : "outline"}
                className={`h-auto py-4 px-3 flex flex-col items-center justify-center gap-1 transition-all ${
                  rateOfChange[0] === 0.75 ? 'shadow-md' : 'hover:border-primary/50'
                }`}
                onClick={() => setRateOfChange([0.75])}
              >
                <span className="font-bold text-base">Balanced</span>
                <span className="text-xs opacity-70">0.75%</span>
              </Button>
              <Button
                type="button"
                variant={rateOfChange[0] === 1.0 ? "default" : "outline"}
                className={`h-auto py-4 px-3 flex flex-col items-center justify-center gap-1 transition-all ${
                  rateOfChange[0] === 1.0 ? 'shadow-md' : 'hover:border-primary/50'
                }`}
                onClick={() => setRateOfChange([1.0])}
              >
                <span className="font-bold text-base">Aggressive</span>
                <span className="text-xs opacity-70">1.0%</span>
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Label>Protein Intake</Label>
          {parseFloat(bodyFat) > 0 && (
            <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
              <Switch
                id="protein-ffm"
                checked={proteinPreference[0] < 0}
                onCheckedChange={(checked) => {
                  if (checked) {
                    // Convert to FFM-based (negative value as flag)
                    setProteinPreference([-Math.abs(proteinPreference[0])]);
                  } else {
                    // Convert to body weight-based (positive value)
                    setProteinPreference([Math.abs(proteinPreference[0])]);
                  }
                }}
              />
              <Label htmlFor="protein-ffm" className="font-normal cursor-pointer">
                Calculate per kg of Fat-Free Mass (FFM)
              </Label>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Button
              type="button"
              variant={Math.abs(proteinPreference[0]) === 1.6 ? "default" : "outline"}
              className={`h-auto py-4 px-3 flex flex-col items-center justify-center gap-1 transition-all ${
                Math.abs(proteinPreference[0]) === 1.6 ? 'shadow-md' : 'hover:border-primary/50'
              }`}
              onClick={() => setProteinPreference([proteinPreference[0] < 0 ? -1.6 : 1.6])}
            >
              <span className="font-bold text-base">Moderate</span>
              <span className="text-xs opacity-70">1.6 g/kg</span>
            </Button>
            <Button
              type="button"
              variant={Math.abs(proteinPreference[0]) === 1.8 ? "default" : "outline"}
              className={`h-auto py-4 px-3 flex flex-col items-center justify-center gap-1 transition-all ${
                Math.abs(proteinPreference[0]) === 1.8 ? 'shadow-md' : 'hover:border-primary/50'
              }`}
              onClick={() => setProteinPreference([proteinPreference[0] < 0 ? -1.8 : 1.8])}
            >
              <span className="font-bold text-base">Balanced</span>
              <span className="text-xs opacity-70">1.8 g/kg</span>
            </Button>
            <Button
              type="button"
              variant={Math.abs(proteinPreference[0]) === 2.0 ? "default" : "outline"}
              className={`h-auto py-4 px-3 flex flex-col items-center justify-center gap-1 transition-all ${
                Math.abs(proteinPreference[0]) === 2.0 ? 'shadow-md' : 'hover:border-primary/50'
              }`}
              onClick={() => setProteinPreference([proteinPreference[0] < 0 ? -2.0 : 2.0])}
            >
              <span className="font-bold text-base">High</span>
              <span className="text-xs opacity-70">2.0 g/kg</span>
            </Button>
          </div>
        </div>
        </div>
      )}

      {/* Advanced Mode - Sliders */}
      {mode === "advanced" && (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
          {goal !== "maintenance" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label htmlFor="rateOfChange">Fine-tune rate of {goal === "loss" ? "loss" : "gain"}</Label>
                <span className="text-sm font-medium">
                  {rateOfChange[0]}% per {goal === "gain" ? "month" : "week"}
                </span>
              </div>
              <Slider
                id="rateOfChange"
                min={goal === "gain" ? 0.25 : 0.25}
                max={goal === "gain" ? 1.0 : 1.5}
                step={0.05}
                value={rateOfChange}
                onValueChange={setRateOfChange}
              />
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <span className="text-primary">ℹ️</span>
                {goal === "gain" 
                  ? "For weight gain, rate is % per month and converted to weekly change automatically." 
                  : "For weight loss, rate is % per week."}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label htmlFor="proteinPreference">Fine-tune protein (g/kg)</Label>
              <span className="text-sm font-medium">{Math.abs(proteinPreference[0])} g/kg</span>
            </div>
            {parseFloat(bodyFat) > 0 && (
              <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                <Switch
                  id="protein-ffm-advanced"
                  checked={proteinPreference[0] < 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      // Convert to FFM-based (negative value as flag)
                      setProteinPreference([-Math.abs(proteinPreference[0])]);
                    } else {
                      // Convert to body weight-based (positive value)
                      setProteinPreference([Math.abs(proteinPreference[0])]);
                    }
                  }}
                />
                <Label htmlFor="protein-ffm-advanced" className="font-normal cursor-pointer">
                  Calculate per kg of Fat-Free Mass (FFM)
                </Label>
              </div>
            )}
            <Slider
              id="proteinPreference"
              min={1.6}
              max={3.1}
              step={0.1}
              value={[Math.abs(proteinPreference[0])]}
              onValueChange={(val) => setProteinPreference(proteinPreference[0] < 0 ? [-val[0]] : val)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label htmlFor="fatIntake">How much of your calories should come from fat?</Label>
              <span className="text-sm font-medium">{fatIntake[0]}%</span>
            </div>
            <Slider
              id="fatIntake"
              min={15}
              max={65}
              step={1}
              value={fatIntake}
              onValueChange={setFatIntake}
            />
          </div>

          <div className="space-y-4 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="targetGoalType" className="text-base">Choose goal style</Label>
                <p className="text-sm text-muted-foreground">
                  {targetGoalType === "weight" ? "Target Weight" : "Target Body Fat %"}
                </p>
              </div>
              <Switch
                id="targetGoalType"
                checked={targetGoalType === "bodyfat"}
                onCheckedChange={(checked) => setTargetGoalType(checked ? "bodyfat" : "weight")}
              />
            </div>
            {targetGoalType === "weight" ? (
              <div className="space-y-2">
                <Label htmlFor="targetWeight">Target Weight (kg)</Label>
                <Input
                  id="targetWeight"
                  type="number"
                  placeholder="65"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="targetBodyFat">Target Body Fat (%)</Label>
                <Input
                  id="targetBodyFat"
                  type="number"
                  placeholder="12"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-4 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="dietBreaks" className="text-base">Include diet breaks?</Label>
                <p className="text-sm text-muted-foreground">
                  {dietBreaks ? "Enabled" : "Disabled"}
                </p>
              </div>
              <Switch
                id="dietBreaks"
                checked={dietBreaks}
                onCheckedChange={setDietBreaks}
              />
            </div>
            {dietBreaks && (
              <div className="grid md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="dietBreakFrequency">Break Frequency (Every X weeks)</Label>
                  <Input
                    id="dietBreakFrequency"
                    type="number"
                    placeholder="6"
                    value={dietBreakFrequency}
                    onChange={(e) => setDietBreakFrequency(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dietBreakDuration">Break Duration (weeks)</Label>
                  <Input
                    id="dietBreakDuration"
                    type="number"
                    placeholder="1"
                    value={dietBreakDuration}
                    onChange={(e) => setDietBreakDuration(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {onCalculate && (
        <Button 
          variant="gradient" 
          className="w-full" 
          onClick={onCalculate}
          size="lg"
        >
          Calculate My Calories
        </Button>
      )}
    </div>
  );
}
