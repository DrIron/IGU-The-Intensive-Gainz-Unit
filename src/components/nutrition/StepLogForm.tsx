import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, Plus, Trash2, Footprints, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { StepLog, StepSource } from "@/types/nutrition-phase22";

interface StepLogFormProps {
  userId?: string;
  onLogAdded?: () => void;
}

const SOURCE_OPTIONS: { value: StepSource; label: string }[] = [
  { value: 'manual', label: 'Manual Entry' },
  { value: 'apple_health', label: 'Apple Health' },
  { value: 'google_fit', label: 'Google Fit' },
  { value: 'fitbit', label: 'Fitbit' },
  { value: 'garmin', label: 'Garmin' },
  { value: 'samsung_health', label: 'Samsung Health' },
  { value: 'other', label: 'Other' },
];

export function StepLogForm({ userId, onLogAdded }: StepLogFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [recentLogs, setRecentLogs] = useState<StepLog[]>([]);

  // Form state
  const [logDate, setLogDate] = useState<Date>();
  const [steps, setSteps] = useState("");
  const [source, setSource] = useState<StepSource>('manual');
  const [notes, setNotes] = useState("");

  const hasFetched = useRef(false);

  const loadRecentLogs = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;
      if (!targetUserId) return;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('step_logs')
        .select('*')
        .eq('user_id', targetUserId)
        .gte('log_date', format(sevenDaysAgo, 'yyyy-MM-dd'))
        .order('log_date', { ascending: false })
        .limit(7);

      if (error) throw error;
      setRecentLogs((data as StepLog[]) || []);
    } catch (error: unknown) {
      console.error('Error loading step logs:', error);
    }
  }, [userId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadRecentLogs();
  }, [loadRecentLogs]);

  const handleSubmit = async () => {
    if (!logDate || !steps) {
      toast({
        title: "Missing Data",
        description: "Please select a date and enter steps",
        variant: "destructive",
      });
      return;
    }

    const stepsNum = parseInt(steps, 10);
    if (isNaN(stepsNum) || stepsNum < 0) {
      toast({
        title: "Invalid Steps",
        description: "Please enter a valid number of steps",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;
      if (!targetUserId) return;

      const { error } = await supabase.from('step_logs').insert({
        user_id: targetUserId,
        log_date: format(logDate, 'yyyy-MM-dd'),
        steps: stepsNum,
        source,
        notes: notes || null,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Step log added successfully",
      });

      // Reset form
      setLogDate(undefined);
      setSteps("");
      setNotes("");

      // Reload logs
      hasFetched.current = false;
      loadRecentLogs();
      onLogAdded?.();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('step_logs').delete().eq('id', id);
      if (error) throw error;
      toast({ title: "Success", description: "Step log deleted" });
      hasFetched.current = false;
      loadRecentLogs();
    } catch (error: unknown) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    }
  };

  // Calculate 7-day average
  const weeklyAverage = recentLogs.length > 0
    ? Math.round(recentLogs.reduce((sum, log) => sum + log.steps, 0) / recentLogs.length)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Footprints className="h-5 w-5" />
          Daily Steps
        </CardTitle>
        <CardDescription>Log your daily step count for tracking</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info alert about steps being observational */}
        <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-700 dark:text-blue-300 text-sm">
            Steps are tracked for activity insights only and do not affect your calorie calculations.
          </AlertDescription>
        </Alert>

        {/* Weekly average display */}
        {recentLogs.length > 0 && (
          <div className="p-3 rounded-lg bg-primary/10">
            <p className="text-sm text-muted-foreground">7-Day Average</p>
            <p className="text-2xl font-bold">{weeklyAverage.toLocaleString()} steps</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left", !logDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {logDate ? format(logDate, 'PPP') : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={logDate}
                  onSelect={setLogDate}
                  initialFocus
                  className="pointer-events-auto"
                  disabled={(date) => date > new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Steps</Label>
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder="10000"
            />
          </div>

          <div className="space-y-2">
            <Label>Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as StepSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>&nbsp;</Label>
            <Button onClick={handleSubmit} disabled={loading} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Entry
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about today's activity..."
            rows={2}
          />
        </div>

        {/* Recent logs */}
        {recentLogs.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <p className="text-sm font-medium">Recent Logs (Last 7 Days)</p>
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">
                    {format(new Date(log.log_date), 'MMM dd')}
                  </span>
                  <span className="text-sm">{log.steps.toLocaleString()} steps</span>
                  {log.source && log.source !== 'manual' && (
                    <span className="text-xs text-muted-foreground">
                      via {SOURCE_OPTIONS.find(o => o.value === log.source)?.label || log.source}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(log.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
