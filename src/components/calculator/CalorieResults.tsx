import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface CalorieResultsProps {
  result: {
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
  };
  goal?: string;
  rateOfChange?: number;
}

export function CalorieResults({ result, goal, rateOfChange }: CalorieResultsProps) {
  const showDeficitWarning = result.deficitPercent && result.deficitPercent > 25;

  return (
    <div className="mt-8 space-y-4">
      {goal === "gain" && rateOfChange && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            📊 Because your selected goal is muscle gain, expected weight change is calculated on a monthly basis ({rateOfChange}% per month) and converted to a weekly equivalent (~{(rateOfChange / 4.33).toFixed(2)}% per week) for weekly tracking.
          </AlertDescription>
        </Alert>
      )}
      
      {showDeficitWarning && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Warning: Your calorie deficit exceeds 25% of TDEE ({result.deficitPercent}%). 
            This may be too aggressive and could lead to excessive muscle loss.
          </AlertDescription>
        </Alert>
      )}

      <div className="p-6 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg border border-primary/20">
        <h3 className="text-2xl font-bold mb-2">Your Daily Calorie Target</h3>
        <p className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          {result.calories} calories
        </p>
        <div className="mt-4 space-y-1 text-sm text-muted-foreground">
          <p>BMR: {result.bmr} calories</p>
          <p>TDEE: {result.tdee} calories</p>
          {goal !== "maintenance" && result.deficitPercent && (
            <p>Deficit/Surplus: {result.deficitPercent > 0 ? '+' : ''}{result.deficitPercent.toFixed(1)}%</p>
          )}
        </div>
      </div>

      <div className="p-6 bg-card rounded-lg border border-border/50">
        <h3 className="text-xl font-bold mb-4">Macronutrient Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 rounded-lg bg-primary/5">
            <p className="text-sm text-muted-foreground mb-1">Protein</p>
            <p className="text-2xl font-bold text-primary">{result.protein}g</p>
            <p className="text-xs text-muted-foreground mt-1">{((result.protein * 4 / result.calories) * 100).toFixed(0)}% of calories</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-accent/5">
            <p className="text-sm text-muted-foreground mb-1">Fat</p>
            <p className="text-2xl font-bold text-accent">{result.fat}g</p>
            <p className="text-xs text-muted-foreground mt-1">
              {result.fatPercent ? `${result.fatPercent.toFixed(0)}%` : `${((result.fat * 9 / result.calories) * 100).toFixed(0)}%`} of calories
            </p>
          </div>
          <div className="text-center p-4 rounded-lg bg-primary/5">
            <p className="text-sm text-muted-foreground mb-1">Carbs</p>
            <p className="text-2xl font-bold text-primary">{result.carbs}g</p>
            <p className="text-xs text-muted-foreground mt-1">{((result.carbs * 4 / result.calories) * 100).toFixed(0)}% of calories</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-accent/5">
            <p className="text-sm text-muted-foreground mb-1">Fiber</p>
            <p className="text-2xl font-bold text-accent">{result.fiber}g</p>
            <p className="text-xs text-muted-foreground mt-1">14g per 1000 kcal</p>
          </div>
        </div>
      </div>

      {goal !== "maintenance" && result.projectedWeeks && result.projectedWeeks > 0 && (
        <div className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 rounded-lg border border-primary/20">
          <h3 className="text-lg font-semibold mb-2">Projected Duration</h3>
          <p className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {result.projectedWeeks} weeks
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Estimated time to reach your goal based on current settings
          </p>
        </div>
      )}

      <p className="text-sm text-muted-foreground text-center">
        These estimates are based on your inputs and typical responses. Adjust based on your real-world progress and discuss changes with your coach if needed.
      </p>
    </div>
  );
}
