import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Footprints, TrendingUp, TrendingDown, Minus, Target, Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";
import {
  type StepLog,
  type StepRecommendation,
  calculateStepAverage,
  calculateStepTrend,
} from "@/types/nutrition-phase22";

interface StepProgressDisplayProps {
  userId: string;
  compact?: boolean;
}

export function StepProgressDisplay({ userId, compact = false }: StepProgressDisplayProps) {
  const [loading, setLoading] = useState(true);
  const [stepLogs, setStepLogs] = useState<StepLog[]>([]);
  const [recommendation, setRecommendation] = useState<StepRecommendation | null>(null);

  const hasFetched = useRef(false);

  const loadData = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);

      // Get step logs for last 14 days (for trend calculation)
      const fourteenDaysAgo = format(subDays(new Date(), 14), 'yyyy-MM-dd');

      const [logsResult, recResult] = await Promise.all([
        supabase
          .from('step_logs')
          .select('*')
          .eq('user_id', userId)
          .gte('log_date', fourteenDaysAgo)
          .order('log_date', { ascending: false }),
        supabase
          .from('step_recommendations')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('effective_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (logsResult.error) throw logsResult.error;
      setStepLogs((logsResult.data as StepLog[]) || []);

      if (!recResult.error && recResult.data) {
        setRecommendation(recResult.data as StepRecommendation);
      }
    } catch (error) {
      console.error('Error loading step data:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const weeklyAverage = calculateStepAverage(stepLogs, 7);
  const trend = calculateStepTrend(stepLogs);

  // Calculate progress percentage against recommendation
  const progressPercent = recommendation
    ? Math.min(100, Math.round((weeklyAverage / recommendation.target_steps) * 100))
    : 0;

  // Get trend icon and color
  const getTrendDisplay = () => {
    switch (trend) {
      case 'up':
        return {
          icon: <TrendingUp className="h-4 w-4" />,
          label: 'Increasing',
          color: 'text-green-600',
        };
      case 'down':
        return {
          icon: <TrendingDown className="h-4 w-4" />,
          label: 'Decreasing',
          color: 'text-red-600',
        };
      default:
        return {
          icon: <Minus className="h-4 w-4" />,
          label: 'Stable',
          color: 'text-muted-foreground',
        };
    }
  };

  const trendDisplay = getTrendDisplay();

  // Determine status for recommendation comparison
  const getStatusBadge = () => {
    if (!recommendation) return null;

    if (weeklyAverage >= recommendation.target_steps) {
      return <Badge className="bg-green-100 text-green-700">On Target</Badge>;
    }
    if (recommendation.min_steps && weeklyAverage >= recommendation.min_steps) {
      return <Badge className="bg-yellow-100 text-yellow-700">Within Range</Badge>;
    }
    return <Badge className="bg-red-100 text-red-700">Below Target</Badge>;
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3">
          <Footprints className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{weeklyAverage.toLocaleString()} avg/day</p>
            {recommendation && (
              <p className="text-xs text-muted-foreground">
                Target: {recommendation.target_steps.toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-sm ${trendDisplay.color}`}>
            {trendDisplay.icon}
          </span>
          {getStatusBadge()}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Footprints className="h-5 w-5" />
          Step Progress
        </CardTitle>
        <CardDescription>Activity tracking and recommendations</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-primary/10">
            <p className="text-sm text-muted-foreground">7-Day Average</p>
            <p className="text-3xl font-bold">{weeklyAverage.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">steps/day</p>
          </div>

          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground">Trend</p>
            <div className={`flex items-center gap-2 text-xl font-bold ${trendDisplay.color}`}>
              {trendDisplay.icon}
              {trendDisplay.label}
            </div>
            <p className="text-sm text-muted-foreground">vs previous week</p>
          </div>
        </div>

        {/* Recommendation progress */}
        {recommendation && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Target Progress</span>
              </div>
              {getStatusBadge()}
            </div>

            <Progress value={progressPercent} className="h-3" />

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{weeklyAverage.toLocaleString()} / {recommendation.target_steps.toLocaleString()}</span>
              <span>{progressPercent}%</span>
            </div>

            {recommendation.min_steps && recommendation.max_steps && (
              <p className="text-xs text-muted-foreground">
                Recommended range: {recommendation.min_steps.toLocaleString()} - {recommendation.max_steps.toLocaleString()} steps
              </p>
            )}

            {recommendation.reason && (
              <div className="p-2 rounded bg-muted/50 text-sm text-muted-foreground">
                <span className="font-medium">Note: </span>
                {recommendation.reason}
              </div>
            )}
          </div>
        )}

        {/* Daily breakdown for last 7 days */}
        {stepLogs.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <p className="text-sm font-medium">Daily Log</p>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, i) => {
                const date = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
                const dayLog = stepLogs.find(l => l.log_date === date);
                const daySteps = dayLog?.steps || 0;
                const dayPercent = recommendation
                  ? Math.min(100, (daySteps / recommendation.target_steps) * 100)
                  : 50;

                return (
                  <div key={date} className="text-center">
                    <p className="text-xs text-muted-foreground">
                      {format(subDays(new Date(), 6 - i), 'EEE')}
                    </p>
                    <div
                      className={`h-16 rounded-t flex items-end justify-center ${
                        daySteps > 0 ? 'bg-primary/20' : 'bg-muted'
                      }`}
                    >
                      <div
                        className="w-full rounded-t bg-primary transition-all"
                        style={{ height: `${dayPercent}%` }}
                      />
                    </div>
                    <p className="text-xs font-medium mt-1">
                      {daySteps > 0 ? (daySteps / 1000).toFixed(1) + 'k' : '-'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {stepLogs.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <Footprints className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No step data recorded yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
