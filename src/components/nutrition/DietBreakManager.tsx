import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Coffee, CalendarIcon, Play, CheckCircle, XCircle, Plus, Loader2, Info, Calculator,
} from "lucide-react";
import { format, addDays, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import {
  type DietBreak,
  type DietBreakStatus,
  type NutritionPhase,
  calculateMaintenanceCalories,
} from "@/types/nutrition-phase22";

interface DietBreakManagerProps {
  phase: NutritionPhase;
  clientUserId: string;
  canEdit: boolean;
  onBreakUpdated?: () => void;
}

export function DietBreakManager({
  phase,
  clientUserId,
  canEdit,
  onBreakUpdated,
}: DietBreakManagerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dietBreaks, setDietBreaks] = useState<DietBreak[]>([]);
  const [showDialog, setShowDialog] = useState(false);

  // Form state
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [reason, setReason] = useState("");
  const [coachNotes, setCoachNotes] = useState("");

  // Calculated maintenance data
  const [avgIntake, setAvgIntake] = useState<number | null>(null);
  const [weeklyWeightChange, setWeeklyWeightChange] = useState<number | null>(null);
  const [calculatedMaintenance, setCalculatedMaintenance] = useState<number | null>(null);

  const hasFetched = useRef(false);

  const loadData = useCallback(async () => {
    if (!phase?.id) return;

    try {
      setLoading(true);

      // Get diet breaks for this phase
      const { data, error } = await supabase
        .from('diet_breaks')
        .select('*')
        .eq('phase_id', phase.id)
        .order('scheduled_start_date', { ascending: false });

      if (error) throw error;
      setDietBreaks((data as DietBreak[]) || []);

      // Calculate average intake and weight change for maintenance calculation
      if (clientUserId) {
        try {
          const fourWeeksAgo = format(addDays(new Date(), -28), 'yyyy-MM-dd');

          const { data: weightLogs } = await supabase
            .from('weight_logs')
            .select('weight_kg, log_date')
            .eq('phase_id', phase.id)
            .gte('log_date', fourWeeksAgo)
            .order('log_date', { ascending: true });

          if (weightLogs && weightLogs.length >= 2) {
            const firstWeight = weightLogs[0].weight_kg;
            const lastWeight = weightLogs[weightLogs.length - 1].weight_kg;
            const days = differenceInDays(
              new Date(weightLogs[weightLogs.length - 1].log_date),
              new Date(weightLogs[0].log_date)
            );
            const weeks = days / 7;
            const weeklyChange = weeks > 0 ? (lastWeight - firstWeight) / weeks : 0;
            setWeeklyWeightChange(Math.round(weeklyChange * 100) / 100);
          }

          // Use phase daily calories as average intake (simplified)
          setAvgIntake(phase.daily_calories);
        } catch (calcError) {
          console.error('Error calculating maintenance data:', calcError);
        }
      }
    } catch (error) {
      console.error('Error loading diet breaks:', error);
    } finally {
      setLoading(false);
    }
  }, [phase?.id, clientUserId, phase?.daily_calories]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadData();
  }, [loadData]);

  // Recalculate maintenance when weekly weight change updates
  useEffect(() => {
    if (avgIntake !== null && weeklyWeightChange !== null) {
      const maintenance = calculateMaintenanceCalories(avgIntake, weeklyWeightChange);
      setCalculatedMaintenance(maintenance);
    }
  }, [avgIntake, weeklyWeightChange]);

  const handleScheduleBreak = async () => {
    if (!startDate || !endDate) {
      toast({
        title: "Missing Dates",
        description: "Please select start and end dates",
        variant: "destructive",
      });
      return;
    }

    if (endDate <= startDate) {
      toast({
        title: "Invalid Dates",
        description: "End date must be after start date",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Calculate maintenance macros
      const maintenanceCals = calculatedMaintenance || phase.daily_calories + 500;
      const proteinCals = phase.protein_grams * 4;
      const fatCals = phase.fat_grams * 9;
      const remainingCals = maintenanceCals - proteinCals - fatCals;
      const maintenanceCarbs = Math.max(0, Math.round(remainingCals / 4));

      const { error } = await supabase.from('diet_breaks').insert({
        phase_id: phase.id,
        scheduled_start_date: format(startDate, 'yyyy-MM-dd'),
        scheduled_end_date: format(endDate, 'yyyy-MM-dd'),
        status: 'scheduled',
        maintenance_calories: maintenanceCals,
        maintenance_protein_g: phase.protein_grams,
        maintenance_fat_g: phase.fat_grams,
        maintenance_carb_g: maintenanceCarbs,
        pre_break_avg_intake: avgIntake,
        pre_break_weight_change_rate: weeklyWeightChange,
        reason: reason || null,
        coach_notes: coachNotes || null,
        initiated_by: user.id,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Diet break scheduled",
      });

      // Reset form
      setShowDialog(false);
      setStartDate(undefined);
      setEndDate(undefined);
      setReason("");
      setCoachNotes("");

      // Reload data
      hasFetched.current = false;
      loadData();
      onBreakUpdated?.();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (breakId: string, newStatus: DietBreakStatus) => {
    try {
      const updates: Partial<DietBreak> = { status: newStatus };

      if (newStatus === 'active') {
        updates.actual_start_date = format(new Date(), 'yyyy-MM-dd');
      } else if (newStatus === 'completed') {
        updates.actual_end_date = format(new Date(), 'yyyy-MM-dd');
      }

      const { error } = await supabase
        .from('diet_breaks')
        .update(updates)
        .eq('id', breakId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Diet break ${newStatus === 'active' ? 'started' : newStatus === 'completed' ? 'completed' : 'updated'}`,
      });

      hasFetched.current = false;
      loadData();
      onBreakUpdated?.();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: DietBreakStatus) => {
    const config: Record<DietBreakStatus, { label: string; className: string }> = {
      scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700' },
      active: { label: 'Active', className: 'bg-green-100 text-green-700' },
      completed: { label: 'Completed', className: 'bg-gray-100 text-gray-700' },
      skipped: { label: 'Skipped', className: 'bg-yellow-100 text-yellow-700' },
      cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
    };
    const c = config[status];
    return <Badge className={c.className}>{c.label}</Badge>;
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

  const activeBreak = dietBreaks.find(b => b.status === 'active');
  const scheduledBreaks = dietBreaks.filter(b => b.status === 'scheduled');
  const pastBreaks = dietBreaks.filter(b => ['completed', 'skipped', 'cancelled'].includes(b.status));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5" />
              Diet Breaks
            </CardTitle>
            <CardDescription>Schedule and manage diet break periods</CardDescription>
          </div>
          {canEdit && (
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Schedule Break
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Schedule Diet Break</DialogTitle>
                  <DialogDescription>
                    Plan a diet break period with maintenance calories
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {/* Maintenance calculation info */}
                  <Alert className="bg-blue-50 border-blue-200">
                    <Calculator className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-700 text-sm">
                      <p className="font-medium">Calculated Maintenance</p>
                      {avgIntake !== null && weeklyWeightChange !== null ? (
                        <p>
                          {avgIntake} kcal + ({weeklyWeightChange > 0 ? '+' : ''}{weeklyWeightChange} kg/week × 7700 / 7)
                          = <strong>{calculatedMaintenance} kcal</strong>
                        </p>
                      ) : (
                        <p>Insufficient data for calculation. Using estimate.</p>
                      )}
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn("w-full justify-start text-left", !startDate && "text-muted-foreground")}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {startDate ? format(startDate, 'PPP') : "Pick date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={startDate}
                            onSelect={setStartDate}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn("w-full justify-start text-left", !endDate && "text-muted-foreground")}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {endDate ? format(endDate, 'PPP') : "Pick date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={endDate}
                            onSelect={setEndDate}
                            initialFocus
                            className="pointer-events-auto"
                            disabled={(date) => startDate ? date <= startDate : false}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Reason (optional)</Label>
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Scheduled maintenance, fatigue recovery"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Coach Notes (optional)</Label>
                    <Textarea
                      value={coachNotes}
                      onChange={(e) => setCoachNotes(e.target.value)}
                      placeholder="Any notes about this diet break..."
                      rows={2}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleScheduleBreak} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Schedule Break'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active break alert */}
        {activeBreak && (
          <Alert className="bg-green-50 border-green-200">
            <Coffee className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Diet Break Active</p>
                  <p className="text-sm">
                    {activeBreak.maintenance_calories} kcal maintenance until{' '}
                    {format(new Date(activeBreak.scheduled_end_date), 'MMM dd')}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateStatus(activeBreak.id, 'completed')}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Complete
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Scheduled breaks */}
        {scheduledBreaks.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Upcoming Breaks</p>
            {scheduledBreaks.map((dietBreak) => (
              <div
                key={dietBreak.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(dietBreak.status as DietBreakStatus)}
                    <span className="font-medium">
                      {format(new Date(dietBreak.scheduled_start_date), 'MMM dd')} -{' '}
                      {format(new Date(dietBreak.scheduled_end_date), 'MMM dd')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {dietBreak.maintenance_calories} kcal/day
                    {dietBreak.reason && ` - ${dietBreak.reason}`}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUpdateStatus(dietBreak.id, 'active')}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleUpdateStatus(dietBreak.id, 'skipped')}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Past breaks */}
        {pastBreaks.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <p className="text-sm font-medium">Past Breaks</p>
            {pastBreaks.slice(0, 3).map((dietBreak) => (
              <div
                key={dietBreak.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm"
              >
                <div className="flex items-center gap-2">
                  {getStatusBadge(dietBreak.status as DietBreakStatus)}
                  <span>
                    {format(new Date(dietBreak.scheduled_start_date), 'MMM dd')} -{' '}
                    {format(new Date(dietBreak.scheduled_end_date), 'MMM dd')}
                  </span>
                </div>
                {dietBreak.weight_change_during_break_kg !== null && (
                  <span className="text-muted-foreground">
                    {dietBreak.weight_change_during_break_kg > 0 ? '+' : ''}
                    {dietBreak.weight_change_during_break_kg} kg
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {dietBreaks.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <Coffee className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No diet breaks scheduled</p>
            {canEdit && phase.diet_breaks_enabled && (
              <p className="text-xs mt-1">Click "Schedule Break" to plan one</p>
            )}
          </div>
        )}

        {/* Info about diet breaks */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Diet breaks use actual data to calculate maintenance: average intake + (weekly weight change × 7700 kcal/kg ÷ 7 days).
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
