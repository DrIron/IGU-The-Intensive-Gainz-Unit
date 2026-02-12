import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calculator, TrendingUp } from "lucide-react";
import { StepWizardGoalSetting } from "@/components/calculator/StepWizardGoalSetting";
import { AdjustmentCalculator } from "@/components/calculator/AdjustmentCalculator";
import { calculateAge } from "@/lib/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import { calculateNutritionGoals } from "@/utils/nutritionCalculations";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SEOHead } from "@/components/SEOHead";

export default function CalorieCalculator() {
  const navigate = useNavigate();
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [goal, setGoal] = useState("maintenance");
  const [rateOfChange, setRateOfChange] = useState([0.75]);
  const [proteinPreference, setProteinPreference] = useState([2.0]);
  const [fatIntake, setFatIntake] = useState([30]);
  const [targetGoalType, setTargetGoalType] = useState<"weight" | "bodyfat">("weight");
  const [targetValue, setTargetValue] = useState("");
  const [dietBreaks, setDietBreaks] = useState(false);
  const [dietBreakFrequency, setDietBreakFrequency] = useState("");
  const [dietBreakDuration, setDietBreakDuration] = useState("");
  const [result, setResult] = useState<{
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
    tdee: number;
    bmr: number;
    deficitPercent?: number;
    projectedWeeks?: number;
    fatPercent?: number;
  } | null>(null);

  // CMS content
  const { data: cmsContent } = useSiteContent("calorie-calculator");

  // Load user data on mount if logged in
  useEffect(() => {
    const loadUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Use profiles_private for own user PII (date_of_birth, gender)
        const { data: profile } = await supabase
          .from("profiles_private")
          .select("date_of_birth, gender")
          .eq("profile_id", user.id)
          .single();
        
        if (profile) {
          if (profile.date_of_birth) setDateOfBirth(profile.date_of_birth);
          if (profile.gender) setGender(profile.gender);
        }
      }
    };
    
    loadUserData();
  }, []);

  const calculateCalories = () => {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const a = calculateAge(dateOfBirth);
    const bodyFatValue = bodyFat ? parseFloat(bodyFat) : null;

    if (!w || !h || !a || !gender || !activityLevel || !goal) return;

    const proteinMultiplier = Math.abs(proteinPreference[0]);
    const isProteinBasedOnFFM = proteinPreference[0] < 0;

    const result = calculateNutritionGoals({
      weight: w,
      height: h,
      age: a,
      gender: gender as 'male' | 'female',
      bodyFat: bodyFatValue,
      activityLevel: parseFloat(activityLevel),
      goal: goal as 'maintenance' | 'loss' | 'gain',
      rateOfChange: rateOfChange[0],
      proteinPerKg: proteinMultiplier,
      useFFM: isProteinBasedOnFFM,
      fatPercentage: fatIntake[0],
      targetGoalType,
      targetValue: parseFloat(targetValue),
      dietBreakFrequency: parseFloat(dietBreakFrequency),
      dietBreakDuration: parseFloat(dietBreakDuration),
    });

    setResult({
      ...result,
      fatPercent: fatIntake[0],
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        page="calorie-calculator"
        title="Calorie Calculator | Intensive Gainz Unit"
        description="Calculate your daily calorie needs and macros. Free evidence-based nutrition tool by IGU."
      />
      <main className="container mx-auto px-4 pt-24 pb-12 max-w-4xl">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10 border border-primary/20">
              <Calculator className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="font-display text-5xl md:text-6xl tracking-tight mb-4">
            {cmsContent?.hero?.title || "Calorie Calculator"}
          </h1>
          <p className="text-xl text-muted-foreground">
            {cmsContent?.hero?.subtitle || "Estimate your daily calorie needs based on your goals"}
          </p>
        </div>

        <Tabs defaultValue="initial" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="initial" className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Initial Calculator
            </TabsTrigger>
            <TabsTrigger value="adjustment" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Adjustment Calculator
            </TabsTrigger>
          </TabsList>

          <TabsContent value="initial">
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
              proteinPreference={proteinPreference}
              setProteinPreference={setProteinPreference}
              fatIntake={fatIntake}
              setFatIntake={setFatIntake}
              targetGoalType={targetGoalType}
              setTargetGoalType={setTargetGoalType}
              targetValue={targetValue}
              setTargetValue={setTargetValue}
              dietBreaks={dietBreaks}
              setDietBreaks={setDietBreaks}
              dietBreakFrequency={dietBreakFrequency}
              setDietBreakFrequency={setDietBreakFrequency}
              dietBreakDuration={dietBreakDuration}
              setDietBreakDuration={setDietBreakDuration}
              result={result}
              onCalculate={calculateCalories}
              showSaveButton={false}
            />
          </TabsContent>

          <TabsContent value="adjustment">
            <AdjustmentCalculator showSteps={false} />
          </TabsContent>
        </Tabs>

        {/* CTA Section */}
        <div className="mt-16 text-center p-8 rounded-2xl bg-card border border-border">
          <h2 className="font-display text-3xl md:text-4xl tracking-tight mb-4">
            {cmsContent?.cta?.title || "Want Personalized Guidance?"}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            {cmsContent?.cta?.subtitle || "Our coaches can help you dial in your nutrition with weekly adjustments based on real progress."}
          </p>
          <Button size="lg" onClick={() => navigate("/services")}>
            {cmsContent?.cta?.button_text || "View Coaching Programs"}
          </Button>
        </div>
      </main>
    </div>
  );
}

