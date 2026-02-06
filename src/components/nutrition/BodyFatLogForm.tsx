import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, Plus, Trash2, Percent, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  type BodyFatLog,
  type BodyFatMethod,
  BODY_FAT_METHOD_LABELS,
  calculateFatFreeMass,
} from "@/types/nutrition-phase22";

interface BodyFatLogFormProps {
  userId?: string;
  currentWeight?: number; // For FFM calculation
  onLogAdded?: () => void;
}

export function BodyFatLogForm({ userId, currentWeight, onLogAdded }: BodyFatLogFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [recentLogs, setRecentLogs] = useState<BodyFatLog[]>([]);

  // Form state
  const [logDate, setLogDate] = useState<Date>();
  const [bodyFat, setBodyFat] = useState("");
  const [method, setMethod] = useState<BodyFatMethod>('bioelectrical');
  const [notes, setNotes] = useState("");

  const hasFetched = useRef(false);

  const loadRecentLogs = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;
      if (!targetUserId) return;

      const { data, error } = await supabase
        .from('body_fat_logs')
        .select('*')
        .eq('user_id', targetUserId)
        .order('log_date', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentLogs((data as BodyFatLog[]) || []);
    } catch (error: unknown) {
      console.error('Error loading body fat logs:', error);
    }
  }, [userId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadRecentLogs();
  }, [loadRecentLogs]);

  // Calculate FFM preview
  const calculatedFFM = bodyFat && currentWeight
    ? calculateFatFreeMass(currentWeight, parseFloat(bodyFat))
    : null;

  const handleSubmit = async () => {
    if (!logDate || !bodyFat) {
      toast({
        title: "Missing Data",
        description: "Please select a date and enter body fat percentage",
        variant: "destructive",
      });
      return;
    }

    const bodyFatNum = parseFloat(bodyFat);
    if (isNaN(bodyFatNum) || bodyFatNum < 1 || bodyFatNum > 60) {
      toast({
        title: "Invalid Body Fat",
        description: "Please enter a valid body fat percentage (1-60%)",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;
      if (!targetUserId) return;

      const ffm = currentWeight ? calculateFatFreeMass(currentWeight, bodyFatNum) : null;

      const { error } = await supabase.from('body_fat_logs').insert({
        user_id: targetUserId,
        log_date: format(logDate, 'yyyy-MM-dd'),
        body_fat_percentage: bodyFatNum,
        method,
        fat_free_mass_kg: ffm,
        notes: notes || null,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Body fat log added successfully",
      });

      // Reset form
      setLogDate(undefined);
      setBodyFat("");
      setNotes("");

      // Reload logs
      hasFetched.current = false;
      loadRecentLogs();
      onLogAdded?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('body_fat_logs').delete().eq('id', id);
      if (error) throw error;
      toast({ title: "Success", description: "Body fat log deleted" });
      hasFetched.current = false;
      loadRecentLogs();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const getAccuracyBadge = (accuracy: 'high' | 'medium' | 'low') => {
    const colors = {
      high: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      low: 'bg-orange-100 text-orange-700',
    };
    return <Badge className={colors[accuracy]}>{accuracy}</Badge>;
  };

  const selectedMethodInfo = BODY_FAT_METHOD_LABELS[method];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-5 w-5" />
          Body Fat Percentage
        </CardTitle>
        <CardDescription>Track body composition changes over time</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <Label>Body Fat %</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="1"
              max="60"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              placeholder="e.g. 15.5"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Measurement Method</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as BodyFatMethod)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BODY_FAT_METHOD_LABELS).map(([key, info]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <span>{info.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Method description */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-3 w-3" />
            <span>{selectedMethodInfo.description}</span>
            {getAccuracyBadge(selectedMethodInfo.accuracy)}
          </div>
        </div>

        {/* FFM Preview */}
        {calculatedFFM !== null && (
          <div className="p-3 rounded-lg bg-primary/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Calculated Fat-Free Mass</p>
                <p className="text-xl font-bold">{calculatedFFM} kg</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Based on {currentWeight} kg weight</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about the measurement conditions..."
            rows={2}
          />
        </div>

        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add Entry
        </Button>

        {/* Recent logs */}
        {recentLogs.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <p className="text-sm font-medium">Previous Readings</p>
            {recentLogs.map((log) => {
              const methodInfo = BODY_FAT_METHOD_LABELS[log.method as BodyFatMethod];
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">
                      {format(new Date(log.log_date), 'MMM dd, yyyy')}
                    </span>
                    <span className="text-lg font-bold">{log.body_fat_percentage}%</span>
                    {log.fat_free_mass_kg && (
                      <span className="text-sm text-muted-foreground">
                        FFM: {log.fat_free_mass_kg} kg
                      </span>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {methodInfo?.label || log.method}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(log.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
