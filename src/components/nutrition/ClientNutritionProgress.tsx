import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { StepLogForm } from "./StepLogForm";
import { BodyFatLogForm } from "./BodyFatLogForm";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface ClientNutritionProgressProps {
  phase: any;
  userGender?: string;
  initialBodyFat?: number;
}

export function ClientNutritionProgress({ phase, userGender = 'male', initialBodyFat }: ClientNutritionProgressProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [circumferenceLogs, setCircumferenceLogs] = useState<any[]>([]);
  const [adherenceLogs, setAdherenceLogs] = useState<any[]>([]);
  const [bodyFatLogs, setBodyFatLogs] = useState<any[]>([]);
  
  // Weight log form
  const [newWeightDate, setNewWeightDate] = useState<Date>();
  const [newWeight, setNewWeight] = useState("");
  
  // Circumference form
  const [circumDate, setCircumDate] = useState<Date>();
  const [waist, setWaist] = useState("");
  const [chest, setChest] = useState("");
  const [hips, setHips] = useState("");
  const [thighs, setThighs] = useState("");
  
  // Body fat form
  const [bodyFat, setBodyFat] = useState("");
  
  // Adherence & notes form
  const [currentWeek, setCurrentWeek] = useState(1);
  const [followedCalories, setFollowedCalories] = useState<string>("");
  const [trackedAccurately, setTrackedAccurately] = useState<string>("");
  const [physicalChanges, setPhysicalChanges] = useState<string>("");
  const [notes, setNotes] = useState("");

  const calculateCurrentWeek = useCallback(() => {
    if (!phase) return;
    const weeksSinceStart = Math.floor(
      (new Date().getTime() - new Date(phase.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)
    ) + 1;
    setCurrentWeek(weeksSinceStart);
  }, [phase]);

  const loadProgressData = useCallback(async () => {
    if (!phase) return;
    try {
      const [weights, circumferences, adherence, weeklyProgress] = await Promise.all([
        supabase.from('weight_logs').select('*').eq('phase_id', phase.id).order('log_date', { ascending: false }),
        supabase.from('circumference_logs').select('*').eq('phase_id', phase.id).order('week_number', { ascending: false }),
        supabase.from('adherence_logs').select('*').eq('phase_id', phase.id).order('week_number', { ascending: false }),
        supabase.from('weekly_progress').select('body_fat_percentage, week_number, notes').eq('goal_id', phase.id).order('week_number', { ascending: false })
      ]);

      setWeightLogs(weights.data || []);
      setCircumferenceLogs(circumferences.data || []);
      setAdherenceLogs(adherence.data || []);
      setBodyFatLogs(weeklyProgress.data || []);

      // Load current week's notes
      const thisWeekProgress = weeklyProgress.data?.find((p: any) => p.week_number === currentWeek);
      if (thisWeekProgress?.notes) {
        setNotes(thisWeekProgress.notes);
      }
    } catch (error: any) {
      console.error('Error loading progress data:', error);
    }
  }, [phase, currentWeek]);

  useEffect(() => {
    if (phase) {
      loadProgressData();
      calculateCurrentWeek();
    }
  }, [phase, loadProgressData, calculateCurrentWeek]);
  
  // Helper function to check if circumference measurements should be shown this week
  const shouldShowCircumMeasurements = () => {
    return currentWeek === 1 || currentWeek === 3 || (currentWeek > 3 && currentWeek % 2 === 1);
  };
  
  // Helper function to check if body fat should be shown this week
  const shouldShowBodyFat = () => {
    return initialBodyFat && currentWeek % 4 === 0;
  };

  const addWeightLog = async () => {
    if (!newWeightDate || !newWeight) {
      toast({
        title: "Missing Data",
        description: "Please select a date and enter weight",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('weight_logs').insert({
        phase_id: phase.id,
        user_id: user.id,
        log_date: format(newWeightDate, 'yyyy-MM-dd'),
        weight_kg: parseFloat(newWeight),
        week_number: currentWeek
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Weight log added successfully",
      });

      setNewWeightDate(undefined);
      setNewWeight("");
      loadProgressData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteWeightLog = async (id: string) => {
    try {
      const { error } = await supabase.from('weight_logs').delete().eq('id', id);
      if (error) throw error;
      toast({ title: "Success", description: "Weight log deleted" });
      loadProgressData();
    } catch (error: any) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    }
  };

  const addCircumferenceLog = async () => {
    if (!circumDate) {
      toast({ title: "Missing Data", description: "Please select a date", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('circumference_logs').insert({
        phase_id: phase.id,
        user_id: user.id,
        log_date: format(circumDate, 'yyyy-MM-dd'),
        week_number: currentWeek,
        waist_cm: waist ? parseFloat(waist) : null,
        chest_cm: chest ? parseFloat(chest) : null,
        hips_cm: hips ? parseFloat(hips) : null,
        thighs_cm: thighs ? parseFloat(thighs) : null,
      });

      if (error) throw error;

      toast({ title: "Success", description: "Measurements saved" });
      setCircumDate(undefined);
      setWaist("");
      setChest("");
      setHips("");
      setThighs("");
      loadProgressData();
    } catch (error: any) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const saveBodyFat = async () => {
    if (!bodyFat) {
      toast({ title: "Missing Data", description: "Please enter body fat percentage", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update or insert into weekly_progress
      const { error } = await supabase.from('weekly_progress').upsert({
        user_id: user.id,
        goal_id: phase.id,
        week_number: currentWeek,
        week_start_date: new Date(new Date(phase.start_date).getTime() + (currentWeek - 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
        body_fat_percentage: parseFloat(bodyFat),
      }, {
        onConflict: 'user_id,goal_id,week_number'
      });

      if (error) throw error;

      toast({ title: "Success", description: "Body fat percentage saved" });
      setBodyFat("");
      loadProgressData();
    } catch (error: any) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const saveAdherenceAndNotes = async () => {
    if (!followedCalories || !trackedAccurately || !physicalChanges) {
      toast({ title: "Missing Data", description: "Please answer all check-in questions", variant: "destructive" });
      return;
    }

    // Validate minimum weight logs for current week
    const currentWeekLogs = weightLogs.filter(log => {
      const logDate = new Date(log.log_date);
      const weekStartDate = new Date(new Date(phase.start_date).getTime() + (currentWeek - 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      return logDate >= weekStartDate && logDate < weekEndDate;
    });

    if (currentWeekLogs.length < 3) {
      toast({ 
        title: "Insufficient Weight Logs", 
        description: `You need at least 3 weight entries for this week. You currently have ${currentWeekLogs.length}.`, 
        variant: "destructive" 
      });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Save adherence
      const { error: adherenceError } = await supabase.from('adherence_logs').upsert({
        phase_id: phase.id,
        user_id: user.id,
        week_number: currentWeek,
        followed_calories: followedCalories === 'yes',
        tracked_accurately: trackedAccurately === 'yes',
      });

      if (adherenceError) throw adherenceError;

      // Save notes if provided
      const notesText = [
        notes,
        physicalChanges !== 'none' ? `Physical changes: ${physicalChanges.replace(/_/g, ' ')}` : null
      ].filter(Boolean).join('\n\n');

      if (notesText) {
        const { error: notesError } = await supabase.from('weekly_progress').upsert({
          user_id: user.id,
          goal_id: phase.id,
          week_number: currentWeek,
          week_start_date: new Date(new Date(phase.start_date).getTime() + (currentWeek - 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
          notes: notesText,
        }, {
          onConflict: 'user_id,goal_id,week_number'
        });

        if (notesError) throw notesError;
      }

      toast({ title: "Success", description: "Progress logged successfully" });
      setFollowedCalories("");
      setTrackedAccurately("");
      setPhysicalChanges("");
      setNotes("");
      loadProgressData();
    } catch (error: any) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const thisWeekLogs = weightLogs.filter(log => log.week_number === currentWeek);
  const thisWeekAdherence = adherenceLogs.find(log => log.week_number === currentWeek);

  return (
    <div className="space-y-6">
      {/* Summary Card with Add Inputs Button */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Week {currentWeek} Progress</CardTitle>
              <CardDescription>Current macros: {Math.round(phase.daily_calories)} kcal - P: {Math.round(phase.protein_grams)}g F: {Math.round(phase.fat_grams)}g C: {Math.round(phase.carb_grams)}g</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {thisWeekLogs.length}/3 weigh-ins
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={() => {}} className="w-full" size="lg">
            Add Inputs
          </Button>
        </CardContent>
      </Card>

      {/* Weight Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Weight Logs</CardTitle>
          <CardDescription>Log at least 3 weights per week for more accurate adjustments.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left", !newWeightDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newWeightDate ? format(newWeightDate, 'PPP') : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={newWeightDate} onSelect={setNewWeightDate} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Weight (kg)</Label>
              <Input type="number" step="0.1" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} placeholder="75.5" />
            </div>
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button onClick={addWeightLog} disabled={loading} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Entry
              </Button>
            </div>
          </div>

          {weightLogs.length > 0 && (
            <div className="space-y-2 pt-4 border-t">
              <p className="text-sm font-medium">Recent Logs</p>
              {weightLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <span className="text-sm">{format(new Date(log.log_date), 'MMM dd, yyyy')} - {log.weight_kg} kg</span>
                  <Button variant="ghost" size="sm" onClick={() => deleteWeightLog(log.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Circumference Measurements - Gender-specific and timeline-based */}
      {shouldShowCircumMeasurements() && (
        <Card>
          <CardHeader>
            <CardTitle>Circumference Measurements</CardTitle>
            <CardDescription>
              {currentWeek === 1 ? "Baseline measurements - Week 1" : 
               currentWeek === 3 ? "Follow-up measurements - Week 3" :
               `Progress check - Week ${currentWeek} (every 2 weeks)`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left", !circumDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {circumDate ? format(circumDate, 'PPP') : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={circumDate} onSelect={setCircumDate} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Waist (cm)</Label>
                <Input type="number" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)} />
              </div>
              {userGender === 'male' && (
                <div className="space-y-2">
                  <Label>Chest (cm)</Label>
                  <Input type="number" step="0.1" value={chest} onChange={(e) => setChest(e.target.value)} />
                </div>
              )}
              {userGender === 'female' && (
                <div className="space-y-2">
                  <Label>Hips (cm)</Label>
                  <Input type="number" step="0.1" value={hips} onChange={(e) => setHips(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Thighs (cm)</Label>
                <Input type="number" step="0.1" value={thighs} onChange={(e) => setThighs(e.target.value)} />
              </div>
            </div>
            <Button onClick={addCircumferenceLog} disabled={loading}>Save Measurements</Button>
            
            {circumferenceLogs.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <p className="text-sm font-medium">Previous Measurements</p>
                {circumferenceLogs.slice(0, 3).map((log) => (
                  <div key={log.id} className="p-2 rounded-lg bg-muted/50 text-sm">
                    <p className="font-medium">Week {log.week_number} - {format(new Date(log.log_date), 'MMM dd, yyyy')}</p>
                    <div className="grid grid-cols-2 gap-2 mt-1 text-xs text-muted-foreground">
                      {log.waist_cm && <span>Waist: {log.waist_cm}cm</span>}
                      {log.chest_cm && <span>Chest: {log.chest_cm}cm</span>}
                      {log.hips_cm && <span>Hips: {log.hips_cm}cm</span>}
                      {log.thighs_cm && <span>Thighs: {log.thighs_cm}cm</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step Tracking - Phase 22 */}
      <StepLogForm onLogAdded={loadProgressData} />

      {/* Body Fat Logging - Phase 22 */}
      <BodyFatLogForm
        currentWeight={weightLogs.length > 0 ? weightLogs[0].weight_kg : undefined}
        onLogAdded={loadProgressData}
      />

      {/* Body Fat Percentage - Every 4 weeks if initially provided */}
      {shouldShowBodyFat() && (
        <Card>
          <CardHeader>
            <CardTitle>Body Fat Percentage</CardTitle>
            <CardDescription>Optional tracking - Week {currentWeek}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Body Fat %</Label>
                <Input 
                  type="number" 
                  step="0.1" 
                  value={bodyFat} 
                  onChange={(e) => setBodyFat(e.target.value)} 
                  placeholder="e.g. 15.5"
                />
              </div>
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <Button onClick={saveBodyFat} disabled={loading} className="w-full">
                  Save Body Fat %
                </Button>
              </div>
            </div>
            
            {bodyFatLogs.length > 0 && bodyFatLogs.some((log: any) => log.body_fat_percentage) && (
              <div className="space-y-2 pt-4 border-t">
                <p className="text-sm font-medium">Previous Readings</p>
                {bodyFatLogs.filter((log: any) => log.body_fat_percentage).slice(0, 3).map((log: any) => (
                  <div key={log.week_number} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <span className="text-sm">Week {log.week_number}</span>
                    <span className="text-sm font-medium">{log.body_fat_percentage}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Adherence & Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Check-in</CardTitle>
          <CardDescription>Week {currentWeek} adherence and notes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Were you adherent to calories?</Label>
              <Select value={followedCalories} onValueChange={setFollowedCalories}>
                <SelectTrigger>
                  <SelectValue placeholder="Select answer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Noticeable Physical Changes? *</Label>
              <Select value={physicalChanges} onValueChange={setPhysicalChanges}>
                <SelectTrigger>
                  <SelectValue placeholder="Select one" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clothes_looser">Clothes fitting looser</SelectItem>
                  <SelectItem value="clothes_tighter">Clothes fitting tighter/fuller</SelectItem>
                  <SelectItem value="visual_changes">Visual changes in mirror/photos</SelectItem>
                  <SelectItem value="strength_gains">Noticeable strength gains</SelectItem>
                  <SelectItem value="none">No noticeable changes yet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2"
>
              <Label>Was food tracked precisely (no guessing)?</Label>
              <Select value={trackedAccurately} onValueChange={setTrackedAccurately}>
                <SelectTrigger>
                  <SelectValue placeholder="Select answer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes about this week (energy levels, challenges, etc.)"
                rows={3}
              />
            </div>
          </div>

          {thisWeekAdherence && (
            <div className="p-4 rounded-lg bg-primary/10 space-y-1">
              <p className="text-sm font-medium">Week {currentWeek} Status:</p>
              <p className="text-sm">Followed Calories: {thisWeekAdherence.followed_calories ? 'Yes' : 'No'}</p>
              <p className="text-sm">Tracked Accurately: {thisWeekAdherence.tracked_accurately ? 'Yes' : 'No'}</p>
              {bodyFatLogs.find((log: any) => log.week_number === currentWeek && log.notes) && (
                <p className="text-sm pt-2 border-t mt-2">Notes: {bodyFatLogs.find((log: any) => log.week_number === currentWeek)?.notes}</p>
              )}
            </div>
          )}

          <Button onClick={saveAdherenceAndNotes} disabled={loading} className="w-full">
            Save Week {currentWeek} Progress
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
