import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Apple, ChevronRight } from "lucide-react";

interface NutritionTargetsCardProps {
  userId: string;
}

interface NutritionTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  goalType: string;
}

export function NutritionTargetsCard({ userId }: NutritionTargetsCardProps) {
  const navigate = useNavigate();
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) loadNutritionTargets();
  }, [userId]);

  const loadNutritionTargets = async () => {
    try {
      // First try nutrition_phases (for 1:1 clients with coach-managed phases)
      const { data: phase } = await supabase
        .from("nutrition_phases")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (phase) {
        setTargets({
          calories: Math.round(phase.daily_calories || 0),
          protein: Math.round(phase.protein_grams || 0),
          carbs: Math.round(phase.carb_grams || 0),
          fat: Math.round(phase.fat_grams || 0),
          goalType: phase.goal_type || "maintenance",
        });
      } else {
        // Fallback to nutrition_goals (for team plan self-service)
        const { data: goal } = await supabase
          .from("nutrition_goals")
          .select("*")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();

        if (goal) {
          setTargets({
            calories: Math.round(goal.daily_calories || 0),
            protein: Math.round(goal.protein_grams || 0),
            carbs: Math.round(goal.carb_grams || 0),
            fat: Math.round(goal.fat_grams || 0),
            goalType: goal.goal_type || "maintenance",
          });
        }
      }
    } catch (error) {
      console.error("Error loading nutrition targets:", error);
    } finally {
      setLoading(false);
    }
  };

  const getGoalLabel = (goal: string) => {
    switch (goal) {
      case "fat_loss": return "Fat Loss";
      case "muscle_gain": return "Muscle Gain";
      case "maintenance": return "Maintenance";
      case "recomp": return "Recomposition";
      default: return goal.replace(/_/g, " ");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-24" />
            <div className="h-8 bg-muted rounded w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!targets) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <Apple className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground mb-3">No nutrition plan set</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/nutrition")}>
            Set Up Nutrition
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Apple className="h-4 w-4 text-primary" />
            Daily Targets
          </CardTitle>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            {getGoalLabel(targets.goalType)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Calories - Prominent */}
        <div className="text-center py-2 bg-primary/5 rounded-lg">
          <p className="text-3xl font-bold text-primary">{targets.calories}</p>
          <p className="text-xs text-muted-foreground">calories</p>
        </div>

        {/* Macros - Grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-lg font-semibold">{targets.protein}g</p>
            <p className="text-xs text-muted-foreground">Protein</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-lg font-semibold">{targets.carbs}g</p>
            <p className="text-xs text-muted-foreground">Carbs</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-lg font-semibold">{targets.fat}g</p>
            <p className="text-xs text-muted-foreground">Fat</p>
          </div>
        </div>

        <Button
          variant="ghost"
          className="w-full justify-between"
          onClick={() => navigate("/nutrition")}
        >
          Weekly Check-in
          <ChevronRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
