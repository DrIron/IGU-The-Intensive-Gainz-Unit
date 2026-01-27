import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { CalorieResults } from "./CalorieResults";
import { ChevronLeft, ChevronRight, Settings, Info } from "lucide-react";

interface StepWizardGoalSettingProps {
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
  result: any;
  onCalculate: () => void;
  onSave?: () => void;
  showSaveButton?: boolean;
}

export function StepWizardGoalSetting({
  weight, setWeight, height, setHeight, dateOfBirth, setDateOfBirth,
  gender, setGender, bodyFat, setBodyFat, activityLevel, setActivityLevel,
  goal, setGoal, rateOfChange, setRateOfChange, proteinPreference, setProteinPreference,
  fatIntake, setFatIntake, targetGoalType, setTargetGoalType, targetValue, setTargetValue,
  dietBreaks, setDietBreaks, dietBreakFrequency, setDietBreakFrequency,
  dietBreakDuration, setDietBreakDuration, result, onCalculate, onSave, showSaveButton
}: StepWizardGoalSettingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [proteinBasedOnFFM, setProteinBasedOnFFM] = useState(false);

  const steps = ["Basic Info", "Activity & Goals", "Preferences", "Review"];

  const canProgress = () => {
    switch (currentStep) {
      case 0:
        return weight && height && dateOfBirth && gender;
      case 1:
        return activityLevel && goal;
      case 2:
        return true; // Advanced is optional
      case 3:
        return result !== null;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep === 2) {
      // Calculate when moving from advanced to review
      onCalculate();
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div>
      <StepIndicator currentStep={currentStep} totalSteps={steps.length} steps={steps} />
      
      <Card>
        <CardHeader>
          <CardTitle>{steps[currentStep]}</CardTitle>
          <CardDescription>
            {currentStep === 0 && "Enter your personal information"}
            {currentStep === 1 && "Select your activity level and fitness goal"}
            {currentStep === 2 && "Fine-tune your nutrition preferences"}
            {currentStep === 3 && "Review your personalized plan"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 0: Basic Info */}
          {currentStep === 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="75"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Height (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="175"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="bodyFat">Body Fat % (optional)</Label>
                <Input
                  id="bodyFat"
                  type="number"
                  value={bodyFat}
                  onChange={(e) => setBodyFat(e.target.value)}
                  placeholder="15"
                />
              </div>
            </div>
          )}

          {/* Step 1: Activity & Goals */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="activity">Activity Level</Label>
                <Select value={activityLevel} onValueChange={setActivityLevel}>
                  <SelectTrigger id="activity">
                    <SelectValue placeholder="Select activity level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1.2">Sedentary (little/no exercise)</SelectItem>
                    <SelectItem value="1.375">Light (1-3 days/week)</SelectItem>
                    <SelectItem value="1.55">Moderate (3-5 days/week)</SelectItem>
                    <SelectItem value="1.725">Active (6-7 days/week)</SelectItem>
                    <SelectItem value="1.9">Very Active (hard exercise daily)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal">Fitness Goal</Label>
                <Select value={goal} onValueChange={setGoal}>
                  <SelectTrigger id="goal">
                    <SelectValue placeholder="Select goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loss">Fat Loss</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="gain">Muscle Gain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {goal !== "maintenance" && (
                <>
                  <div className="space-y-2">
                    <Label>Target Type</Label>
                    <Select value={targetGoalType} onValueChange={(v) => setTargetGoalType(v as "weight" | "bodyfat")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weight">Target Weight</SelectItem>
                        <SelectItem value="bodyfat">Target Body Fat %</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{targetGoalType === "weight" ? "Target Weight (kg)" : "Target Body Fat %"}</Label>
                    <Input
                      type="number"
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      placeholder={targetGoalType === "weight" ? "70" : "12"}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2: Advanced Options */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* For maintenance goal, show simplified options */}
              {goal === "maintenance" ? (
                <div className="space-y-6">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Since you've selected <span className="font-medium text-foreground">Maintenance</span>, 
                      your calories will be set to your Total Daily Energy Expenditure (TDEE) with no deficit or surplus.
                    </p>
                  </div>

                  {/* Protein and Fat options still apply for maintenance */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Label>Protein Level</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[250px]">
                            <p>Higher protein supports muscle retention and satiety. Most lifters do well between 1.8–2.6 g/kg.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <RadioGroup 
                      value={Math.abs(proteinPreference[0]).toString()} 
                      onValueChange={(v) => setProteinPreference([parseFloat(v)])}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="1.8" id="protein-low-m" />
                        <Label htmlFor="protein-low-m" className="font-normal cursor-pointer">
                          Moderate (1.8 g/kg)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="2.2" id="protein-high-m" />
                        <Label htmlFor="protein-high-m" className="font-normal cursor-pointer">
                          High (2.2 g/kg) - Recommended
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="2.6" id="protein-very-high-m" />
                        <Label htmlFor="protein-very-high-m" className="font-normal cursor-pointer">
                          Very High (2.6 g/kg)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Label>Fat Intake</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[250px]">
                            <p>Fat provides essential hormones and energy. Remaining calories are automatically allocated to carbs.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <RadioGroup 
                      value={fatIntake[0].toString()} 
                      onValueChange={(v) => setFatIntake([parseInt(v)])}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="25" id="fat-low-m" />
                        <Label htmlFor="fat-low-m" className="font-normal cursor-pointer">
                          Lower (25% of calories)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="30" id="fat-moderate-m" />
                        <Label htmlFor="fat-moderate-m" className="font-normal cursor-pointer">
                          Moderate (30% of calories) - Recommended
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="35" id="fat-high-m" />
                        <Label htmlFor="fat-high-m" className="font-normal cursor-pointer">
                          Higher (35% of calories)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              ) : (
                /* Loss/Gain goals - show full options */
                <>
                  {/* Basic/Advanced Mode Toggle */}
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Advanced Settings</span>
                    </div>
                    <Switch
                      checked={advancedMode}
                      onCheckedChange={setAdvancedMode}
                    />
                  </div>

                  {!advancedMode ? (
                    /* Basic Mode - Preset Options */
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Label>Weight Change Rate</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[250px]">
                                <p>Higher weekly weight change is faster but can reduce adherence and increase risk of muscle loss.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <RadioGroup 
                          value={rateOfChange[0].toString()} 
                          onValueChange={(v) => setRateOfChange([parseFloat(v)])}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="0.5" id="slow" />
                            <Label htmlFor="slow" className="font-normal cursor-pointer">
                              Slow & Steady (0.5% per week)
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="0.75" id="moderate" />
                            <Label htmlFor="moderate" className="font-normal cursor-pointer">
                              Moderate (0.75% per week) - Recommended
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="1" id="fast" />
                            <Label htmlFor="fast" className="font-normal cursor-pointer">
                              Aggressive (1% per week)
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Label>Protein Level</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[250px]">
                                <p>Higher protein supports muscle retention and satiety. Most lifters do well between 1.8–2.6 g/kg.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <RadioGroup 
                          value={Math.abs(proteinPreference[0]).toString()} 
                          onValueChange={(v) => setProteinPreference([parseFloat(v)])}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="1.8" id="protein-low" />
                            <Label htmlFor="protein-low" className="font-normal cursor-pointer">
                              Moderate (1.8 g/kg)
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="2.2" id="protein-high" />
                            <Label htmlFor="protein-high" className="font-normal cursor-pointer">
                              High (2.2 g/kg) - Recommended
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="2.6" id="protein-very-high" />
                            <Label htmlFor="protein-very-high" className="font-normal cursor-pointer">
                              Very High (2.6 g/kg)
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Label>Fat Intake</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[250px]">
                                <p>Fat provides essential hormones and energy. Remaining calories are automatically allocated to carbs.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <RadioGroup 
                          value={fatIntake[0].toString()} 
                          onValueChange={(v) => setFatIntake([parseInt(v)])}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="25" id="fat-low" />
                            <Label htmlFor="fat-low" className="font-normal cursor-pointer">
                              Lower (25% of calories)
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="30" id="fat-moderate" />
                            <Label htmlFor="fat-moderate" className="font-normal cursor-pointer">
                              Moderate (30% of calories) - Recommended
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="35" id="fat-high" />
                            <Label htmlFor="fat-high" className="font-normal cursor-pointer">
                              Higher (35% of calories)
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  ) : (
                    /* Advanced Mode - Sliders & Custom Options */
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <Label>Rate of Change: {rateOfChange[0].toFixed(2)}% per week</Label>
                        <Slider
                          value={rateOfChange}
                          onValueChange={setRateOfChange}
                          min={0.25}
                          max={1.5}
                          step={0.05}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          Adjust weekly weight change percentage (0.25% - 1.5%)
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Protein Based on Fat-Free Mass</Label>
                          <Switch
                            checked={proteinBasedOnFFM}
                            onCheckedChange={(checked) => {
                              setProteinBasedOnFFM(checked);
                              const currentValue = Math.abs(proteinPreference[0]);
                              setProteinPreference([checked ? -currentValue : currentValue]);
                            }}
                          />
                        </div>
                        <Label>Protein Intake: {Math.abs(proteinPreference[0])}g/kg {proteinBasedOnFFM ? "(FFM)" : "(Total Body Weight)"}</Label>
                        <Slider
                          value={[Math.abs(proteinPreference[0])]}
                          onValueChange={(v) => setProteinPreference([proteinBasedOnFFM ? -v[0] : v[0]])}
                          min={1.6}
                          max={3.0}
                          step={0.1}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          {proteinBasedOnFFM 
                            ? "Protein per kg of fat-free mass (more accurate for leaner individuals)"
                            : "Protein per kg of total body weight"}
                        </p>
                      </div>

                      <div className="space-y-3">
                        <Label>Fat Intake: {fatIntake[0]}% of total calories</Label>
                        <Slider
                          value={fatIntake}
                          onValueChange={setFatIntake}
                          min={20}
                          max={50}
                          step={1}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          Dietary fat percentage (20% - 50%). Remaining calories allocated to carbs.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Diet Breaks - Only for loss/gain goals */}
                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="diet-breaks">Include Diet Breaks</Label>
                        <p className="text-xs text-muted-foreground">Scheduled maintenance periods to help with adherence</p>
                      </div>
                      <Switch
                        id="diet-breaks"
                        checked={dietBreaks}
                        onCheckedChange={setDietBreaks}
                      />
                    </div>
                    {dietBreaks && (
                      <div className="grid gap-4 md:grid-cols-2 animate-fade-in">
                        <div className="space-y-2">
                          <Label>Break Frequency (weeks)</Label>
                          <Input
                            type="number"
                            value={dietBreakFrequency}
                            onChange={(e) => setDietBreakFrequency(e.target.value)}
                            placeholder="4"
                            min="1"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Break Duration (weeks)</Label>
                          <Input
                            type="number"
                            value={dietBreakDuration}
                            onChange={(e) => setDietBreakDuration(e.target.value)}
                            placeholder="1"
                            min="1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && result && (
            <div>
              <CalorieResults result={result} goal={goal} rateOfChange={rateOfChange[0]} />
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-6 border-t">
            <Button
              onClick={handleBack}
              variant="outline"
              disabled={currentStep === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            
            {currentStep < steps.length - 1 ? (
              <Button
                onClick={handleNext}
                disabled={!canProgress()}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              showSaveButton && onSave && (
                <Button onClick={onSave}>
                  Save Goal
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
