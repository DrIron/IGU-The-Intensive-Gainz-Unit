import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar, Target, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { format } from "date-fns";
import { PhaseCompletionBanner } from "./PhaseCompletionBanner";

interface ClientNutritionGoalProps {
  phase: any;
}

export function ClientNutritionGoal({ phase }: ClientNutritionGoalProps) {
  const getGoalIcon = () => {
    switch (phase.goal_type) {
      case 'fat_loss':
        return <TrendingDown className="h-5 w-5" />;
      case 'muscle_gain':
        return <TrendingUp className="h-5 w-5" />;
      default:
        return <Minus className="h-5 w-5" />;
    }
  };

  const getGoalLabel = () => {
    switch (phase.goal_type) {
      case 'fat_loss':
      case 'loss':
        return 'Fat Loss';
      case 'muscle_gain':
      case 'gain':
        return 'Muscle Gain';
      default:
        return 'Maintenance';
    }
  };

  const getGoalColor = () => {
    switch (phase.goal_type) {
      case 'fat_loss':
      case 'loss':
        return 'destructive';
      case 'muscle_gain':
      case 'gain':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const weeksSinceStart = Math.floor(
    (new Date().getTime() - new Date(phase.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)
  ) + 1;

  const estimatedWeeks = phase.estimated_end_date 
    ? Math.floor((new Date(phase.estimated_end_date).getTime() - new Date(phase.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000))
    : null;

  const progress = estimatedWeeks ? Math.min((weeksSinceStart / estimatedWeeks) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      <PhaseCompletionBanner phase={phase} />
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Nutrition Phase</CardTitle>
              <CardDescription>{phase.phase_name}</CardDescription>
            </div>
            <Badge variant={getGoalColor()} className="flex items-center gap-2">
              {getGoalIcon()}
              {getGoalLabel()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Phase Progress */}
          {estimatedWeeks && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Phase Progress</span>
                <span className="font-medium">Week {weeksSinceStart} of {estimatedWeeks}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Start Date</p>
                <p className="font-medium">{format(new Date(phase.start_date), 'MMM dd, yyyy')}</p>
              </div>
            </div>
            {phase.estimated_end_date && (
              <div className="flex items-center gap-3">
                <Target className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Estimated End</p>
                  <p className="font-medium">{format(new Date(phase.estimated_end_date), 'MMM dd, yyyy')}</p>
                </div>
              </div>
            )}
          </div>

          {/* Goals */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Starting Weight</p>
              <p className="text-2xl font-bold">{phase.starting_weight_kg} kg</p>
            </div>
            {phase.target_weight_kg && (
              <div>
                <p className="text-sm text-muted-foreground">Target Weight</p>
                <p className="text-2xl font-bold">{phase.target_weight_kg} kg</p>
              </div>
            )}
            {phase.target_body_fat_percentage && (
              <div>
                <p className="text-sm text-muted-foreground">Target Body Fat</p>
                <p className="text-2xl font-bold">{phase.target_body_fat_percentage}%</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Rate of Change</p>
              <p className="text-2xl font-bold">{phase.weekly_rate_percentage}% {phase.goal_type === 'muscle_gain' ? '/month' : '/week'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Macros Card */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Macros</CardTitle>
          <CardDescription>Your assigned calorie and macro targets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Calories</p>
              <p className="text-3xl font-bold text-primary">{Math.round(phase.daily_calories)}</p>
              <p className="text-xs text-muted-foreground">kcal</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Protein</p>
              <p className="text-3xl font-bold text-blue-500">{Math.round(phase.protein_grams)}</p>
              <p className="text-xs text-muted-foreground">g</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Fat</p>
              <p className="text-3xl font-bold text-yellow-500">{Math.round(phase.fat_grams)}</p>
              <p className="text-xs text-muted-foreground">g</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Carbs</p>
              <p className="text-3xl font-bold text-green-500">{Math.round(phase.carb_grams)}</p>
              <p className="text-xs text-muted-foreground">g</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diet Breaks */}
      {phase.diet_break_enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Diet Break Schedule</CardTitle>
            <CardDescription>Planned maintenance weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Frequency</span>
                <span className="font-medium">Every {phase.diet_break_frequency_weeks} weeks</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Duration</span>
                <span className="font-medium">{phase.diet_break_duration_weeks} week(s)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coach Notes */}
      {phase.coach_notes && (
        <Card>
          <CardHeader>
            <CardTitle>Coach Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{phase.coach_notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
