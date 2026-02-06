import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { UtensilsCrossed, CalendarIcon, Plus, Loader2, CheckCircle, XCircle } from "lucide-react";
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import {
  type RefeedDay,
  type RefeedType,
  type RefeedStatus,
  type NutritionPhase,
  REFEED_TYPE_CONFIG,
  calculateRefeedTargets,
} from "@/types/nutrition-phase22";

interface RefeedDaySchedulerProps {
  phase: NutritionPhase;
  clientUserId: string;
  canEdit: boolean;
  maintenanceCalories?: number;
  onRefeedUpdated?: () => void;
}

export function RefeedDayScheduler({
  phase,
  clientUserId,
  canEdit,
  maintenanceCalories,
  onRefeedUpdated,
}: RefeedDaySchedulerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refeedDays, setRefeedDays] = useState<RefeedDay[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [selectedRefeed, setSelectedRefeed] = useState<RefeedDay | null>(null);

  // Schedule form state
  const [scheduleDate, setScheduleDate] = useState<Date>();
  const [refeedType, setRefeedType] = useState<RefeedType>('moderate');
  const [coachNotes, setCoachNotes] = useState("");

  // Log form state
  const [actualCalories, setActualCalories] = useState("");
  const [actualProtein, setActualProtein] = useState("");
  const [actualFat, setActualFat] = useState("");
  const [actualCarbs, setActualCarbs] = useState("");
  const [clientNotes, setClientNotes] = useState("");

  const hasFetched = useRef(false);

  const loadData = useCallback(async () => {
    if (!phase?.id) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('refeed_days')
        .select('*')
        .eq('phase_id', phase.id)
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      setRefeedDays((data as RefeedDay[]) || []);
    } catch (error) {
      console.error('Error loading refeed days:', error);
    } finally {
      setLoading(false);
    }
  }, [phase?.id]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadData();
  }, [loadData]);

  // Calculate target macros preview
  const targetMacros = calculateRefeedTargets(phase, refeedType, maintenanceCalories);

  const handleScheduleRefeed = async () => {
    if (!scheduleDate) {
      toast({
        title: "Missing Date",
        description: "Please select a date for the refeed",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);

      const targets = calculateRefeedTargets(phase, refeedType, maintenanceCalories);

      const { error } = await supabase.from('refeed_days').insert({
        phase_id: phase.id,
        scheduled_date: format(scheduleDate, 'yyyy-MM-dd'),
        refeed_type: refeedType,
        status: 'scheduled',
        target_calories: targets.calories,
        target_protein_g: targets.protein,
        target_fat_g: targets.fat,
        target_carb_g: targets.carbs,
        coach_notes: coachNotes || null,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Refeed day scheduled",
      });

      setShowScheduleDialog(false);
      setScheduleDate(undefined);
      setRefeedType('moderate');
      setCoachNotes("");

      hasFetched.current = false;
      loadData();
      onRefeedUpdated?.();
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

  const handleLogActuals = async () => {
    if (!selectedRefeed) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('refeed_days')
        .update({
          status: 'completed',
          actual_calories: actualCalories ? parseInt(actualCalories, 10) : null,
          actual_protein_g: actualProtein ? parseInt(actualProtein, 10) : null,
          actual_fat_g: actualFat ? parseInt(actualFat, 10) : null,
          actual_carb_g: actualCarbs ? parseInt(actualCarbs, 10) : null,
          client_notes: clientNotes || null,
        })
        .eq('id', selectedRefeed.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Refeed day logged",
      });

      setShowLogDialog(false);
      setSelectedRefeed(null);
      setActualCalories("");
      setActualProtein("");
      setActualFat("");
      setActualCarbs("");
      setClientNotes("");

      hasFetched.current = false;
      loadData();
      onRefeedUpdated?.();
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

  const handleUpdateStatus = async (refeedId: string, newStatus: RefeedStatus) => {
    try {
      const { error } = await supabase
        .from('refeed_days')
        .update({ status: newStatus })
        .eq('id', refeedId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Refeed ${newStatus}`,
      });

      hasFetched.current = false;
      loadData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: RefeedStatus) => {
    const config: Record<RefeedStatus, { label: string; className: string }> = {
      scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700' },
      completed: { label: 'Completed', className: 'bg-green-100 text-green-700' },
      skipped: { label: 'Skipped', className: 'bg-yellow-100 text-yellow-700' },
      cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
    };
    const c = config[status];
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const getTypeBadge = (type: RefeedType) => {
    const config = REFEED_TYPE_CONFIG[type];
    return <Badge variant="outline">{config.label}</Badge>;
  };

  // Get refeeds for calendar display
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getRefeedForDay = (date: Date): RefeedDay | undefined => {
    return refeedDays.find(r =>
      isSameDay(new Date(r.scheduled_date), date)
    );
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

  const upcomingRefeeds = refeedDays.filter(r =>
    r.status === 'scheduled' && new Date(r.scheduled_date) >= new Date()
  );
  const pastRefeeds = refeedDays.filter(r =>
    r.status !== 'scheduled' || new Date(r.scheduled_date) < new Date()
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5" />
              Refeed Days
            </CardTitle>
            <CardDescription>Schedule high-carb refeed days</CardDescription>
          </div>
          {canEdit && (
            <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Schedule Refeed
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Schedule Refeed Day</DialogTitle>
                  <DialogDescription>
                    Plan a higher calorie, high-carb day
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-start text-left", !scheduleDate && "text-muted-foreground")}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {scheduleDate ? format(scheduleDate, 'PPP') : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={scheduleDate}
                          onSelect={setScheduleDate}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Refeed Type</Label>
                    <Select value={refeedType} onValueChange={(v) => setRefeedType(v as RefeedType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(REFEED_TYPE_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <div>
                              <span className="font-medium">{config.label}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {config.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Target preview */}
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm font-medium mb-2">Target Macros</p>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Calories</p>
                        <p className="font-bold">{targetMacros.calories}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Protein</p>
                        <p className="font-bold">{targetMacros.protein}g</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Fat</p>
                        <p className="font-bold">{targetMacros.fat}g</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Carbs</p>
                        <p className="font-bold">{targetMacros.carbs}g</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Coach Notes (optional)</Label>
                    <Textarea
                      value={coachNotes}
                      onChange={(e) => setCoachNotes(e.target.value)}
                      placeholder="Any specific instructions..."
                      rows={2}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleScheduleRefeed} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Schedule'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mini calendar view */}
        <div className="border rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            >
              ←
            </Button>
            <span className="font-medium">{format(currentMonth, 'MMMM yyyy')}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            >
              →
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <div key={day} className="text-muted-foreground py-1">{day}</div>
            ))}
            {daysInMonth.map(day => {
              const refeed = getRefeedForDay(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "py-1 rounded text-sm relative",
                    !isCurrentMonth && "text-muted-foreground/50",
                    isToday(day) && "bg-primary/10 font-bold",
                    refeed && refeed.status === 'scheduled' && "bg-blue-100 dark:bg-blue-900/30",
                    refeed && refeed.status === 'completed' && "bg-green-100 dark:bg-green-900/30"
                  )}
                >
                  {format(day, 'd')}
                  {refeed && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming refeeds */}
        {upcomingRefeeds.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Upcoming Refeeds</p>
            {upcomingRefeeds.map((refeed) => (
              <div
                key={refeed.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {format(new Date(refeed.scheduled_date), 'EEEE, MMM dd')}
                    </span>
                    {getTypeBadge(refeed.refeed_type as RefeedType)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {refeed.target_calories} kcal | P: {refeed.target_protein_g}g F: {refeed.target_fat_g}g C: {refeed.target_carb_g}g
                  </p>
                </div>
                {canEdit && isPast(new Date(refeed.scheduled_date)) && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedRefeed(refeed);
                        setShowLogDialog(true);
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Log
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleUpdateStatus(refeed.id, 'skipped')}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Past refeeds */}
        {pastRefeeds.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <p className="text-sm font-medium">Past Refeeds</p>
            {pastRefeeds.slice(0, 5).map((refeed) => (
              <div
                key={refeed.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm"
              >
                <div className="flex items-center gap-2">
                  {getStatusBadge(refeed.status as RefeedStatus)}
                  <span>{format(new Date(refeed.scheduled_date), 'MMM dd')}</span>
                  {getTypeBadge(refeed.refeed_type as RefeedType)}
                </div>
                {refeed.actual_calories && (
                  <span className="text-muted-foreground">
                    {refeed.actual_calories} kcal actual
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {refeedDays.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <UtensilsCrossed className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No refeed days scheduled</p>
          </div>
        )}

        {/* Log actuals dialog */}
        <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Refeed Day</DialogTitle>
              <DialogDescription>
                Record actual intake for this refeed day
              </DialogDescription>
            </DialogHeader>

            {selectedRefeed && (
              <div className="space-y-4 py-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium mb-2">Targets</p>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Calories</p>
                      <p className="font-bold">{selectedRefeed.target_calories}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Protein</p>
                      <p className="font-bold">{selectedRefeed.target_protein_g}g</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Fat</p>
                      <p className="font-bold">{selectedRefeed.target_fat_g}g</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Carbs</p>
                      <p className="font-bold">{selectedRefeed.target_carb_g}g</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Actual Calories</Label>
                    <Input
                      type="number"
                      value={actualCalories}
                      onChange={(e) => setActualCalories(e.target.value)}
                      placeholder={selectedRefeed.target_calories?.toString()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Actual Protein (g)</Label>
                    <Input
                      type="number"
                      value={actualProtein}
                      onChange={(e) => setActualProtein(e.target.value)}
                      placeholder={selectedRefeed.target_protein_g?.toString()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Actual Fat (g)</Label>
                    <Input
                      type="number"
                      value={actualFat}
                      onChange={(e) => setActualFat(e.target.value)}
                      placeholder={selectedRefeed.target_fat_g?.toString()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Actual Carbs (g)</Label>
                    <Input
                      type="number"
                      value={actualCarbs}
                      onChange={(e) => setActualCarbs(e.target.value)}
                      placeholder={selectedRefeed.target_carb_g?.toString()}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={clientNotes}
                    onChange={(e) => setClientNotes(e.target.value)}
                    placeholder="How did you feel? Any notes..."
                    rows={2}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLogDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleLogActuals} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
