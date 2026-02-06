import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Target, Info, Plus, TrendingUp, TrendingDown, Minus, Loader2, History } from "lucide-react";
import { format, subDays } from "date-fns";
import {
  type StepLog,
  type StepRecommendation,
  calculateStepAverage,
  calculateStepTrend,
} from "@/types/nutrition-phase22";

interface StepRecommendationCardProps {
  clientUserId: string;
  canEdit: boolean;
  onRecommendationUpdated?: () => void;
}

export function StepRecommendationCard({
  clientUserId,
  canEdit,
  onRecommendationUpdated,
}: StepRecommendationCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stepLogs, setStepLogs] = useState<StepLog[]>([]);
  const [currentRec, setCurrentRec] = useState<StepRecommendation | null>(null);
  const [recHistory, setRecHistory] = useState<StepRecommendation[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Form state for new recommendation
  const [showForm, setShowForm] = useState(false);
  const [targetSteps, setTargetSteps] = useState("");
  const [minSteps, setMinSteps] = useState("");
  const [maxSteps, setMaxSteps] = useState("");
  const [reason, setReason] = useState("");
  const [context, setContext] = useState("");

  const hasFetched = useRef(false);

  const loadData = useCallback(async () => {
    if (!clientUserId) return;

    try {
      setLoading(true);

      // Get step logs for last 14 days
      const fourteenDaysAgo = format(subDays(new Date(), 14), 'yyyy-MM-dd');

      const [logsResult, recResult, historyResult] = await Promise.all([
        supabase
          .from('step_logs')
          .select('*')
          .eq('user_id', clientUserId)
          .gte('log_date', fourteenDaysAgo)
          .order('log_date', { ascending: false }),
        supabase
          .from('step_recommendations')
          .select('*')
          .eq('user_id', clientUserId)
          .eq('is_active', true)
          .order('effective_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('step_recommendations')
          .select('*')
          .eq('user_id', clientUserId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      if (logsResult.error) throw logsResult.error;
      setStepLogs((logsResult.data as StepLog[]) || []);

      if (!recResult.error && recResult.data) {
        setCurrentRec(recResult.data as StepRecommendation);
      }

      if (!historyResult.error) {
        setRecHistory((historyResult.data as StepRecommendation[]) || []);
      }
    } catch (error) {
      console.error('Error loading step recommendation data:', error);
    } finally {
      setLoading(false);
    }
  }, [clientUserId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadData();
  }, [loadData]);

  const weeklyAverage = calculateStepAverage(stepLogs, 7);
  const trend = calculateStepTrend(stepLogs);

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const handleSubmit = async () => {
    if (!targetSteps) {
      toast({
        title: "Missing Data",
        description: "Please enter a target step count",
        variant: "destructive",
      });
      return;
    }

    const targetNum = parseInt(targetSteps, 10);
    if (isNaN(targetNum) || targetNum < 1000) {
      toast({
        title: "Invalid Target",
        description: "Please enter a valid target (minimum 1000 steps)",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Deactivate current recommendation if exists
      if (currentRec) {
        await supabase
          .from('step_recommendations')
          .update({
            is_active: false,
            end_date: format(new Date(), 'yyyy-MM-dd'),
          })
          .eq('id', currentRec.id);
      }

      // Create new recommendation
      const { error } = await supabase.from('step_recommendations').insert({
        user_id: clientUserId,
        recommended_by: user.id,
        target_steps: targetNum,
        min_steps: minSteps ? parseInt(minSteps, 10) : null,
        max_steps: maxSteps ? parseInt(maxSteps, 10) : null,
        reason: reason || null,
        context: context || null,
        effective_date: format(new Date(), 'yyyy-MM-dd'),
        is_active: true,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Step recommendation updated",
      });

      // Reset form
      setShowForm(false);
      setTargetSteps("");
      setMinSteps("");
      setMaxSteps("");
      setReason("");
      setContext("");

      // Reload data
      hasFetched.current = false;
      loadData();
      onRecommendationUpdated?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Step Recommendations
            </CardTitle>
            <CardDescription>Set daily step targets for the client</CardDescription>
          </div>
          <div className="flex gap-2">
            {recHistory.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="h-4 w-4 mr-1" />
                History
              </Button>
            )}
            {canEdit && !showForm && (
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" />
                New Target
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info alert about steps being observational */}
        <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-700 dark:text-blue-300 text-sm">
            Step targets are for activity coaching only. Steps do NOT affect calorie calculations.
            Use this to guide clients to increase NEAT before reducing calories.
          </AlertDescription>
        </Alert>

        {/* Client's current stats */}
        <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
          <div>
            <p className="text-sm text-muted-foreground">Client's 7-Day Average</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{weeklyAverage.toLocaleString()}</p>
              {getTrendIcon()}
            </div>
          </div>
          {currentRec && (
            <div>
              <p className="text-sm text-muted-foreground">Current Target</p>
              <p className="text-2xl font-bold">{currentRec.target_steps.toLocaleString()}</p>
              {currentRec.min_steps && currentRec.max_steps && (
                <p className="text-xs text-muted-foreground">
                  Range: {currentRec.min_steps.toLocaleString()} - {currentRec.max_steps.toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Current recommendation details */}
        {currentRec && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Active Since</span>
              <Badge variant="outline">
                {format(new Date(currentRec.effective_date), 'MMM dd, yyyy')}
              </Badge>
            </div>
            {currentRec.reason && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <span className="font-medium">Reason: </span>
                {currentRec.reason}
              </div>
            )}
            {currentRec.context && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <span className="font-medium">Context: </span>
                {currentRec.context}
              </div>
            )}
          </div>
        )}

        {!currentRec && !showForm && (
          <div className="text-center py-4 text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No step recommendation set</p>
            {canEdit && (
              <p className="text-xs mt-1">Click "New Target" to set one</p>
            )}
          </div>
        )}

        {/* History */}
        {showHistory && recHistory.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <p className="text-sm font-medium">Recommendation History</p>
            {recHistory.map((rec) => (
              <div
                key={rec.id}
                className={`p-2 rounded-lg text-sm ${
                  rec.is_active ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{rec.target_steps.toLocaleString()} steps/day</span>
                  <div className="flex items-center gap-2">
                    {rec.is_active && <Badge>Active</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(rec.effective_date), 'MMM dd')}
                      {rec.end_date && ` - ${format(new Date(rec.end_date), 'MMM dd')}`}
                    </span>
                  </div>
                </div>
                {rec.reason && (
                  <p className="text-xs text-muted-foreground mt-1">{rec.reason}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* New recommendation form */}
        {showForm && canEdit && (
          <div className="space-y-4 pt-4 border-t">
            <p className="text-sm font-medium">Set New Target</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Target Steps *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="1000"
                  value={targetSteps}
                  onChange={(e) => setTargetSteps(e.target.value)}
                  placeholder="e.g. 10000"
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum (optional)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={minSteps}
                  onChange={(e) => setMinSteps(e.target.value)}
                  placeholder="e.g. 8000"
                />
              </div>
              <div className="space-y-2">
                <Label>Maximum (optional)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(e.target.value)}
                  placeholder="e.g. 12000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Increase NEAT before cutting calories further"
              />
            </div>

            <div className="space-y-2">
              <Label>Context / Notes (optional)</Label>
              <Textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Any additional context for this recommendation..."
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Recommendation'
                )}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
