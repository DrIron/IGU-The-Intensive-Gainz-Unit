import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Circle, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { startOfWeek, endOfWeek, format } from "date-fns";

interface WeeklyProgressCardProps {
  userId: string;
}

interface WeeklyStats {
  workoutsCompleted: number;
  workoutsTotal: number;
  nutritionDaysLogged: number;
  weightTrend: "up" | "down" | "stable" | null;
  weightChange: number | null;
}

export function WeeklyProgressCard({ userId }: WeeklyProgressCardProps) {
  const [stats, setStats] = useState<WeeklyStats>({
    workoutsCompleted: 0,
    workoutsTotal: 0,
    nutritionDaysLogged: 0,
    weightTrend: null,
    weightChange: null,
  });
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const loadWeeklyStats = useCallback(async () => {
    try {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      // Get this week's workout modules
      const { data: program } = await supabase
        .from("client_programs")
        .select(`
          client_program_days (
            date,
            client_day_modules (
              id,
              status,
              completed_at
            )
          )
        `)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      let completed = 0;
      let total = 0;

      if (program?.client_program_days) {
        for (const day of program.client_program_days) {
          const dayDate = new Date(day.date);
          if (dayDate >= weekStart && dayDate <= weekEnd) {
            for (const mod of day.client_day_modules || []) {
              total++;
              if (mod.status === "completed" || mod.completed_at) {
                completed++;
              }
            }
          }
        }
      }

      // Get nutrition check-ins this week
      const { data: nutritionLogs } = await supabase
        .from("weight_logs")
        .select("log_date")
        .eq("user_id", userId)
        .gte("log_date", format(weekStart, "yyyy-MM-dd"))
        .lte("log_date", format(weekEnd, "yyyy-MM-dd"));

      const nutritionDays = new Set(nutritionLogs?.map(l => l.log_date)).size;

      // Get weight trend (last 2 weeks)
      const { data: weights } = await supabase
        .from("weight_logs")
        .select("weight_kg, log_date")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .limit(14);

      let weightTrend: "up" | "down" | "stable" | null = null;
      let weightChange: number | null = null;

      if (weights && weights.length >= 2) {
        const recent = weights[0].weight_kg;
        const older = weights[weights.length - 1].weight_kg;
        weightChange = Number((recent - older).toFixed(1));

        if (Math.abs(weightChange) < 0.3) {
          weightTrend = "stable";
        } else if (weightChange > 0) {
          weightTrend = "up";
        } else {
          weightTrend = "down";
        }
      }

      setStats({
        workoutsCompleted: completed,
        workoutsTotal: total,
        nutritionDaysLogged: nutritionDays,
        weightTrend,
        weightChange,
      });
    } catch (error) {
      console.error("Error loading weekly stats:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || hasFetched.current) return;
    hasFetched.current = true;
    loadWeeklyStats();
  }, [userId, loadWeeklyStats]);

  const getTrendIcon = () => {
    if (stats.weightTrend === "up") return <TrendingUp className="h-4 w-4 text-orange-500" />;
    if (stats.weightTrend === "down") return <TrendingDown className="h-4 w-4 text-green-500" />;
    if (stats.weightTrend === "stable") return <Minus className="h-4 w-4 text-blue-500" />;
    return null;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">This Week</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-full" />
            <div className="h-2 bg-muted rounded w-full" />
            <div className="h-5 bg-muted rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">This Week</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Workouts */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Workouts</span>
            <span className="text-sm font-medium">
              {stats.workoutsCompleted}/{stats.workoutsTotal}
            </span>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: Math.max(stats.workoutsTotal, 5) }).map((_, i) => (
              <div key={i} className="flex-1 flex justify-center">
                {i < stats.workoutsCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : i < stats.workoutsTotal ? (
                  <Circle className="h-5 w-5 text-muted-foreground/30" />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Nutrition */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Nutrition Logged</span>
            <span className="text-sm font-medium">{stats.nutritionDaysLogged}/7 days</span>
          </div>
          <Progress value={(stats.nutritionDaysLogged / 7) * 100} className="h-2" />
        </div>

        {/* Weight Trend */}
        {stats.weightTrend && (
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">Weight Trend</span>
            <div className="flex items-center gap-1.5">
              {getTrendIcon()}
              <span className="text-sm font-medium">
                {stats.weightChange !== null && stats.weightChange !== 0 && (
                  <>{stats.weightChange > 0 ? "+" : ""}{stats.weightChange} kg</>
                )}
                {stats.weightTrend === "stable" && "Stable"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
