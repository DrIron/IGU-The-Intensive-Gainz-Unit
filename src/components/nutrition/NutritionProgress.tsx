import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, ChevronDown, ChevronUp, AlertCircle, TrendingDown, TrendingUp, Calendar as CalendarIcon, Save } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays, startOfWeek } from "date-fns";
import { BodyFatProgressGraph } from "./BodyFatProgressGraph";
import { TeamWeightProgressGraph } from "./TeamWeightProgressGraph";

export function NutritionProgress() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeGoal, setActiveGoal] = useState<any>(null);
  const [weeklyProgress, setWeeklyProgress] = useState<any[]>([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([1]));

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load active goal
      const { data: goal, error: goalError } = await supabase
        .from('nutrition_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (goalError) throw goalError;
      
      if (!goal) {
        toast({
          title: "No Active Goal",
          description: "Please set a nutrition goal first",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      setActiveGoal(goal);

      // Load weekly progress
      const { data: progress, error: progressError } = await supabase
        .from('weekly_progress')
        .select('*')
        .eq('goal_id', goal.id)
        .order('week_number', { ascending: true });

      if (progressError) throw progressError;

      setWeeklyProgress(progress || []);
      
      // Calculate current week based on start date
      const weeksSinceStart = Math.ceil(
        (Date.now() - new Date(goal.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)
      );
      setCurrentWeek(Math.max(1, weeksSinceStart));
      setExpandedWeeks(new Set([weeksSinceStart]));
    } catch (error: any) {
      console.error('Error loading progress:', error);
      toast({
        title: "Error",
        description: "Failed to load progress data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleWeek = (week: number) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(week)) {
      newExpanded.delete(week);
    } else {
      newExpanded.add(week);
    }
    setExpandedWeeks(newExpanded);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!activeGoal) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Active Goal</CardTitle>
          <CardDescription>Please set a nutrition goal first in the Goal tab</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Get current calories (from most recent adjustment or original goal)
  const latestProgress = weeklyProgress[weeklyProgress.length - 1];
  const currentCalories = latestProgress?.new_daily_calories || activeGoal.daily_calories;
  
  // Recalculate macros based on current calories
  // Calculate protein based on FFM if enabled, otherwise use total weight
  let currentProteinGrams;
  if (activeGoal.protein_based_on_ffm && activeGoal.body_fat_percentage) {
    const fatFreeMass = activeGoal.starting_weight_kg * (1 - activeGoal.body_fat_percentage / 100);
    currentProteinGrams = Math.round(fatFreeMass * activeGoal.protein_intake_g_per_kg);
  } else {
    currentProteinGrams = Math.round(activeGoal.starting_weight_kg * activeGoal.protein_intake_g_per_kg);
  }
  
  const currentFatGrams = Math.round((currentCalories * (activeGoal.fat_intake_percentage / 100)) / 9);
  const currentCarbGrams = Math.round((currentCalories - (currentProteinGrams * 4) - (currentFatGrams * 9)) / 4);

  // Calculate weight progress - only based on completed weeks with full data
  const completedWeeksWithData = weeklyProgress.filter(p => 
    p.average_weight_kg && p.followed_calories !== null && p.tracked_accurately !== null
  );
  
  const currentWeight = completedWeeksWithData.length > 0 
    ? completedWeeksWithData[completedWeeksWithData.length - 1].average_weight_kg 
    : activeGoal.starting_weight_kg;
    
  const targetWeight = activeGoal.target_weight_kg || activeGoal.starting_weight_kg;
  const totalWeightChange = Math.abs(targetWeight - activeGoal.starting_weight_kg);
  const achievedWeightChange = Math.abs(currentWeight - activeGoal.starting_weight_kg);
  
  // Only show progress if there are completed weeks
  const weightProgressPercentage = completedWeeksWithData.length > 0 && totalWeightChange > 0 
    ? Math.min(100, (achievedWeightChange / totalWeightChange) * 100)
    : 0;

  // Recalculate estimated duration based on adjustments
  let estimatedTotalWeeks = activeGoal.estimated_duration_weeks || 0;
  if (latestProgress && activeGoal.goal_type !== 'maintenance' && targetWeight !== activeGoal.starting_weight_kg) {
    const remainingWeight = Math.abs(currentWeight - targetWeight);
    const adjustedCalories = currentCalories;
    const originalCalories = activeGoal.daily_calories;
    
    // Estimate new weekly rate based on calorie adjustment
    const calorieChange = Math.abs(adjustedCalories - originalCalories);
    const weeklyWeightChange = (calorieChange * 7) / 7700; // 7700 cal per kg
    const baseWeeklyRate = (activeGoal.weekly_rate_percentage / 100) * activeGoal.starting_weight_kg;
    const adjustedWeeklyRate = activeGoal.goal_type === 'loss' 
      ? baseWeeklyRate + (adjustedCalories < originalCalories ? weeklyWeightChange : -weeklyWeightChange)
      : baseWeeklyRate + (adjustedCalories > originalCalories ? weeklyWeightChange : -weeklyWeightChange);
    
    if (adjustedWeeklyRate > 0) {
      const remainingWeeks = Math.ceil(remainingWeight / adjustedWeeklyRate);
      estimatedTotalWeeks = currentWeek + remainingWeeks;
      
      // Add remaining diet breaks if enabled
      if (activeGoal.diet_breaks_enabled && activeGoal.diet_break_frequency_weeks) {
        const futureBreaks = Math.floor(remainingWeeks / activeGoal.diet_break_frequency_weeks);
        estimatedTotalWeeks += futureBreaks * (activeGoal.diet_break_duration_weeks || 0);
      }
    }
  }

  const loggedWeeksCount = completedWeeksWithData.length;
  const timeProgressPercentage = estimatedTotalWeeks > 0 && loggedWeeksCount > 0
    ? Math.min(100, (loggedWeeksCount / estimatedTotalWeeks) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Active Goal Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{activeGoal.phase_name}</CardTitle>
              <CardDescription>
                Week {currentWeek} of {estimatedTotalWeeks} (estimated)
                {latestProgress && estimatedTotalWeeks !== activeGoal.estimated_duration_weeks && 
                  ` • Adjusted from ${activeGoal.estimated_duration_weeks} weeks`}
              </CardDescription>
            </div>
            <Button onClick={() => navigate('/nutrition')} variant="outline" size="sm">
              Change Goal
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Calories</p>
              <p className="text-2xl font-bold">{currentCalories}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Protein</p>
              <p className="text-2xl font-bold">{currentProteinGrams}g</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fat</p>
              <p className="text-2xl font-bold">{currentFatGrams}g</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Carbs</p>
              <p className="text-2xl font-bold">{currentCarbGrams}g</p>
            </div>
          </div>

          {/* Progress Bars */}
          <div className="mt-6 space-y-4">
            {activeGoal.target_weight_kg && activeGoal.target_weight_kg !== activeGoal.starting_weight_kg && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Weight Progress</span>
                  <span className="text-sm text-muted-foreground">{Math.round(weightProgressPercentage)}%</span>
                </div>
                <Progress value={weightProgressPercentage} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{activeGoal.starting_weight_kg} kg</span>
                  <span className="font-semibold text-foreground">{currentWeight.toFixed(1)} kg</span>
                  <span>{targetWeight} kg</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Time Progress</span>
                <span className="text-sm text-muted-foreground">{Math.round(timeProgressPercentage)}%</span>
              </div>
              <Progress value={timeProgressPercentage} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Progress vs Graphs */}
      <Tabs defaultValue="progress" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="graphs">Graphs</TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="space-y-3">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Weekly Logs</h2>
            <Button onClick={() => {}} variant="outline" size="sm">
              Add Inputs
            </Button>
          </div>

          {Array.from({ length: currentWeek }, (_, i) => currentWeek - i).map((week) => (
            <WeekCard
              key={week}
              week={week}
              goalId={activeGoal.id}
              goalType={activeGoal.goal_type}
              sex={activeGoal.sex}
              weeklyRate={activeGoal.weekly_rate_percentage}
              currentCalories={currentCalories}
              startingWeight={activeGoal.starting_weight_kg}
              goalStartDate={activeGoal.start_date}
              isDietBreakWeek={
                activeGoal.diet_breaks_enabled &&
                activeGoal.diet_break_frequency_weeks &&
                week % activeGoal.diet_break_frequency_weeks === 0
              }
              isExpanded={expandedWeeks.has(week)}
              onToggle={() => toggleWeek(week)}
              existingProgress={weeklyProgress.find(p => p.week_number === week)}
              previousWeekProgress={weeklyProgress.find(p => p.week_number === week - 1)}
              onSaved={loadData}
            />
          ))}
        </TabsContent>

        <TabsContent value="graphs" className="space-y-6">
          <TeamWeightProgressGraph goal={activeGoal} weeklyProgress={weeklyProgress} />
          <BodyFatProgressGraph weeklyProgress={weeklyProgress} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface WeekCardProps {
  week: number;
  goalId: string;
  goalType: string;
  sex: string;
  weeklyRate: number;
  currentCalories: number;
  startingWeight: number;
  goalStartDate: string;
  isDietBreakWeek: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  existingProgress: any;
  previousWeekProgress: any;
  onSaved: () => void;
}

function WeekCard({
  week,
  goalId,
  goalType,
  sex,
  weeklyRate,
  currentCalories,
  startingWeight,
  goalStartDate,
  isDietBreakWeek,
  isExpanded,
  onToggle,
  existingProgress,
  previousWeekProgress,
  onSaved
}: WeekCardProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [savingLogIndex, setSavingLogIndex] = useState<number | null>(null);
  
  // Calculate week dates (Sunday to Saturday)
  const weekStartDate = startOfWeek(addDays(new Date(goalStartDate), (week - 1) * 7), { weekStartsOn: 0 });
  
  const [weightLogs, setWeightLogs] = useState<Array<{ date: string; weight: string }>>(
    existingProgress?.weight_logs || [
      { date: '', weight: '' }, 
      { date: '', weight: '' }, 
      { date: '', weight: '' }
    ]
  );
  
  const [measurements, setMeasurements] = useState({
    waist: existingProgress?.waist_cm?.toString() || '',
    chest: existingProgress?.chest_cm?.toString() || '',
    arms: existingProgress?.arms_cm?.toString() || '',
    glutes: existingProgress?.glutes_cm?.toString() || '',
    thigh: existingProgress?.thigh_cm?.toString() || '',
    calfs: existingProgress?.calfs_cm?.toString() || '',
    bodyFat: existingProgress?.body_fat_percentage?.toString() || '',
    dailySteps: existingProgress?.daily_steps_avg?.toString() || ''
  });
  const [followedCalories, setFollowedCalories] = useState<string>(
    existingProgress?.followed_calories !== undefined ? (existingProgress.followed_calories ? 'yes' : 'no') : ''
  );
  const [trackedAccurately, setTrackedAccurately] = useState<string>(
    existingProgress?.tracked_accurately !== undefined ? (existingProgress.tracked_accurately ? 'yes' : 'no') : ''
  );
  const [notes, setNotes] = useState(existingProgress?.notes || '');

  const addWeightLog = () => {
    setWeightLogs([...weightLogs, { date: '', weight: '' }]);
  };

  const updateWeightLog = (index: number, field: 'date' | 'weight', value: string) => {
    const updated = [...weightLogs];
    updated[index][field] = value;
    setWeightLogs(updated);
  };

  const removeWeightLog = (index: number) => {
    if (weightLogs.length > 3) {
      setWeightLogs(weightLogs.filter((_, i) => i !== index));
    }
  };

  const saveIndividualLog = async (index: number) => {
    const log = weightLogs[index];
    
    if (!log.date || !log.weight || parseFloat(log.weight) <= 0) {
      toast({
        title: "Invalid Data",
        description: "Please enter both date and weight",
        variant: "destructive",
      });
      return;
    }

    setSavingLogIndex(index);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get all valid logs including the current one
      const validLogs = weightLogs.filter(l => l.date && l.weight && parseFloat(l.weight) > 0);
      
      // Calculate average if we have at least 3 logs
      let avgWeight = null;
      if (validLogs.length >= 3) {
        avgWeight = validLogs.reduce((sum, l) => sum + parseFloat(l.weight), 0) / validLogs.length;
      }

      // Upsert the weekly progress
      const { error } = await supabase
        .from('weekly_progress')
        .upsert({
          user_id: user.id,
          goal_id: goalId,
          week_number: week,
          week_start_date: weekStartDate.toISOString(),
          weight_logs: validLogs,
          average_weight_kg: avgWeight,
          // Preserve existing data
          waist_cm: measurements.waist ? parseFloat(measurements.waist) : null,
          chest_cm: measurements.chest ? parseFloat(measurements.chest) : null,
          arms_cm: measurements.arms ? parseFloat(measurements.arms) : null,
          hips_cm: null,
          glutes_cm: measurements.glutes ? parseFloat(measurements.glutes) : null,
          thigh_cm: measurements.thigh ? parseFloat(measurements.thigh) : null,
          calfs_cm: measurements.calfs ? parseFloat(measurements.calfs) : null,
          body_fat_percentage: measurements.bodyFat ? parseFloat(measurements.bodyFat) : null,
          daily_steps_avg: measurements.dailySteps ? parseInt(measurements.dailySteps) : null,
          followed_calories: followedCalories === 'yes' ? true : followedCalories === 'no' ? false : null,
          tracked_accurately: trackedAccurately === 'yes' ? true : trackedAccurately === 'no' ? false : null,
          notes: notes || null,
        }, {
          onConflict: 'user_id,goal_id,week_number'
        });

      if (error) throw error;

      toast({
        title: "Saved",
        description: `Weight log for ${format(new Date(log.date), 'MMM dd')} saved successfully`,
      });

      onSaved();
    } catch (error: any) {
      console.error('Error saving log:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save weight log",
        variant: "destructive",
      });
    } finally {
      setSavingLogIndex(null);
    }
  };

  const saveWeekData = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Filter valid weight logs
      const validLogs = weightLogs.filter(log => log.date && log.weight && parseFloat(log.weight) > 0);
      if (validLogs.length < 3) {
        toast({
          title: "Insufficient Data",
          description: "Please log at least 3 weights for the week",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Calculate average weight
      const avgWeight = validLogs.reduce((sum, log) => sum + parseFloat(log.weight), 0) / validLogs.length;

      // Initialize adjustment variables
      let weightChange = null;
      let weightChangePercentage = null;
      let expectedChange = null;
      let calorieAdjustment = 0;
      let newCalories = currentCalories;
      let adjustmentReason = '';

      // Week 1 logic: Only check direction
      if (week === 1) {
        weightChange = avgWeight - startingWeight;
        weightChangePercentage = (weightChange / startingWeight) * 100;
        expectedChange = goalType === 'loss' ? -(startingWeight * (weeklyRate / 100)) : 
                        goalType === 'gain' ? startingWeight * (weeklyRate / 100) : 0;

        // Check if weight changed in wrong direction
        const wrongDirection = (goalType === 'loss' && weightChange > 0) || 
                               (goalType === 'gain' && weightChange < 0);

        if (wrongDirection && followedCalories === 'yes' && trackedAccurately === 'yes' && !isDietBreakWeek) {
          // Apply adjustment - weight moved opposite to goal
          const deltaKg = expectedChange - weightChange;
          calorieAdjustment = Math.round((deltaKg * 7700) / 7);
          const maxAdjustment = 400;
          calorieAdjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, calorieAdjustment));
          newCalories = currentCalories + calorieAdjustment;
          adjustmentReason = 'Week 1: Weight changed in wrong direction';
        }
      }
      // Week 2+ logic: Compare to previous week
      else if (previousWeekProgress?.average_weight_kg) {
        const prevAvg = previousWeekProgress.average_weight_kg;
        weightChange = avgWeight - prevAvg;
        weightChangePercentage = (weightChange / prevAvg) * 100;

        // Calculate expected change for this week
        if (isDietBreakWeek) {
          expectedChange = 0; // Maintenance during diet break
        } else if (goalType === 'loss') {
          expectedChange = -(prevAvg * (weeklyRate / 100));
        } else if (goalType === 'gain') {
          expectedChange = prevAvg * (weeklyRate / 100);
        } else {
          expectedChange = 0;
        }

        // Diet break special handling
        if (isDietBreakWeek) {
          if (Math.abs(weightChangePercentage) > 0.15) {
            adjustmentReason = 'Diet break week: Weight change exceeded ±0.15% threshold';
          }
        }
        // Regular week adjustment logic
        else if (followedCalories === 'yes' && trackedAccurately === 'yes') {
          // Calculate actual vs expected
          const actualAbsChange = Math.abs(weightChange);
          const expectedAbsChange = Math.abs(expectedChange);
          
          // Check if 30% off target
          const tolerance = expectedAbsChange * 0.30;
          const difference = Math.abs(actualAbsChange - expectedAbsChange);
          
          // Check direction match
          const directionMatch = (goalType === 'loss' && weightChange <= 0) || 
                                 (goalType === 'gain' && weightChange >= 0) || 
                                 (goalType === 'maintenance');

          if (!directionMatch || difference > tolerance) {
            // Calculate adjustment using 7700 kcal per kg rule
            const deltaKg = expectedChange - weightChange;
            calorieAdjustment = Math.round((deltaKg * 7700) / 7);
            
            // Apply safety constraints (max ±400 kcal adjustment per week)
            const maxAdjustment = 400;
            calorieAdjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, calorieAdjustment));
            newCalories = currentCalories + calorieAdjustment;
            
            if (!directionMatch) {
              adjustmentReason = `Week ${week}: Weight moved in wrong direction`;
            } else {
              adjustmentReason = `Week ${week}: Weight change was ${Math.round((difference / expectedAbsChange) * 100)}% off target`;
            }
          }
        } else if (followedCalories === 'no' || trackedAccurately === 'no') {
          adjustmentReason = 'No adjustment: Poor adherence or tracking';
        }
      }

      const progressData = {
        user_id: user.id,
        goal_id: goalId,
        week_number: week,
        week_start_date: weekStartDate.toISOString(),
        weight_logs: validLogs,
        average_weight_kg: avgWeight,
        waist_cm: measurements.waist ? parseFloat(measurements.waist) : null,
        chest_cm: measurements.chest ? parseFloat(measurements.chest) : null,
        arms_cm: measurements.arms ? parseFloat(measurements.arms) : null,
        hips_cm: null,
        glutes_cm: measurements.glutes ? parseFloat(measurements.glutes) : null,
        thigh_cm: measurements.thigh ? parseFloat(measurements.thigh) : null,
        calfs_cm: measurements.calfs ? parseFloat(measurements.calfs) : null,
        body_fat_percentage: measurements.bodyFat ? parseFloat(measurements.bodyFat) : null,
        daily_steps_avg: measurements.dailySteps ? parseInt(measurements.dailySteps) : null,
        followed_calories: followedCalories === 'yes',
        tracked_accurately: trackedAccurately === 'yes',
        weight_change_kg: weightChange,
        weight_change_percentage: weightChangePercentage,
        expected_change_kg: expectedChange,
        calorie_adjustment: calorieAdjustment,
        new_daily_calories: newCalories,
        is_diet_break_week: isDietBreakWeek,
        notes: notes || null
      };

      if (existingProgress) {
        const { error } = await supabase
          .from('weekly_progress')
          .update(progressData)
          .eq('id', existingProgress.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('weekly_progress')
          .insert(progressData);
        if (error) throw error;
      }

      // Update goal calories if adjusted
      if (calorieAdjustment !== 0) {
        await supabase
          .from('nutrition_goals')
          .update({ daily_calories: newCalories })
          .eq('id', goalId);
      }

      toast({
        title: "Week Saved",
        description: calorieAdjustment !== 0 
          ? `Calories adjusted by ${calorieAdjustment > 0 ? '+' : ''}${calorieAdjustment} kcal to ${newCalories} kcal/day`
          : "Progress logged successfully",
      });

      onSaved();
    } catch (error: any) {
      console.error('Error saving week:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save progress",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Calculate if week is complete
  const validWeightLogs = weightLogs.filter(log => log.weight && parseFloat(log.weight) > 0);
  const isWeekComplete = validWeightLogs.length >= 3 && 
                        followedCalories !== '' && 
                        trackedAccurately !== '';

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="border-l-4" style={{
        borderLeftColor: isDietBreakWeek 
          ? 'hsl(var(--warning))' 
          : existingProgress 
            ? 'hsl(var(--success))' 
            : 'hsl(var(--muted))'
      }}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-4">
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <CardTitle className="text-lg font-semibold">
                    Week {week}
                  </CardTitle>
                  {isDietBreakWeek && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-warning/20 text-warning rounded-full">
                      Diet Break
                    </span>
                  )}
                  {existingProgress && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-success/20 text-success rounded-full">
                      Logged
                    </span>
                  )}
                </div>
                {existingProgress && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {existingProgress.average_weight_kg?.toFixed(1)} kg avg
                    </span>
                    {existingProgress.weight_change_kg && (
                      <span className={existingProgress.weight_change_kg < 0 ? "text-success font-medium" : "text-warning font-medium"}>
                        {existingProgress.weight_change_kg > 0 ? '+' : ''}{existingProgress.weight_change_kg.toFixed(2)} kg
                      </span>
                    )}
                    {existingProgress.calorie_adjustment !== 0 && (
                      <span className={existingProgress.calorie_adjustment > 0 ? "text-success font-semibold" : "text-warning font-semibold"}>
                        {existingProgress.calorie_adjustment > 0 ? '+' : ''}{existingProgress.calorie_adjustment} kcal
                      </span>
                    )}
                  </div>
                )}
              </div>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            {isDietBreakWeek && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This is a diet break week. Expected weight change: ±0.15% (maintenance).
                  No calorie adjustments unless weight change exceeds this threshold.
                </AlertDescription>
              </Alert>
            )}

            {/* Weight Logs */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <Label className="text-sm font-semibold">Weight Logs (minimum 3 required)</Label>
                <Button 
                  onClick={addWeightLog} 
                  size="sm" 
                  variant="outline"
                  disabled={weightLogs.length >= 7}
                  className="h-8 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Log ({validWeightLogs.length}/7)
                </Button>
              </div>
              <div className="space-y-2">
                {weightLogs.map((log, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 px-3 justify-start text-xs flex-1 min-w-0"
                        >
                          <CalendarIcon className="mr-2 h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {log.date ? format(new Date(log.date), "MMM dd") : "Date"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={log.date ? new Date(log.date) : undefined}
                          onSelect={(date) => updateWeightLog(index, 'date', date ? format(date, 'yyyy-MM-dd') : '')}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="kg"
                      value={log.weight}
                      onChange={(e) => updateWeightLog(index, 'weight', e.target.value)}
                      className="h-9 text-xs w-20 px-2"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => saveIndividualLog(index)}
                      disabled={!log.date || !log.weight || parseFloat(log.weight) <= 0 || savingLogIndex === index}
                      className="h-9 px-3"
                    >
                      {savingLogIndex === index ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                    </Button>
                    {weightLogs.length > 3 && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeWeightLog(index)}
                        className="h-9 w-9 p-0 shrink-0"
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {weightLogs.length < 7 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Add more logs for better accuracy
                </p>
              )}
            </div>

            {/* Measurements - Show on week 1, 3, then every 2 weeks */}
            {(week === 1 || week === 3 || (week > 3 && (week - 3) % 2 === 0)) && (
              <div>
                <Label className="mb-3 block">Circumference Measurements (optional)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sex === 'male' && (
                    <div>
                      <Label htmlFor={`chest-${week}`} className="text-sm">Chest (cm)</Label>
                      <Input
                        id={`chest-${week}`}
                        type="number"
                        step="0.1"
                        value={measurements.chest}
                        onChange={(e) => setMeasurements({...measurements, chest: e.target.value})}
                        className="text-sm"
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor={`arms-${week}`} className="text-sm">Arms (cm)</Label>
                    <Input
                      id={`arms-${week}`}
                      type="number"
                      step="0.1"
                      value={measurements.arms}
                      onChange={(e) => setMeasurements({...measurements, arms: e.target.value})}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`waist-${week}`} className="text-sm">Waist (cm)</Label>
                    <Input
                      id={`waist-${week}`}
                      type="number"
                      step="0.1"
                      value={measurements.waist}
                      onChange={(e) => setMeasurements({...measurements, waist: e.target.value})}
                      className="text-sm"
                    />
                  </div>
                  {sex === 'female' && (
                    <div>
                      <Label htmlFor={`glutes-${week}`} className="text-sm">Glutes (cm)</Label>
                      <Input
                        id={`glutes-${week}`}
                        type="number"
                        step="0.1"
                        value={measurements.glutes}
                        onChange={(e) => setMeasurements({...measurements, glutes: e.target.value})}
                        className="text-sm"
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor={`thigh-${week}`} className="text-sm">Thigh (cm)</Label>
                    <Input
                      id={`thigh-${week}`}
                      type="number"
                      step="0.1"
                      value={measurements.thigh}
                      onChange={(e) => setMeasurements({...measurements, thigh: e.target.value})}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`calfs-${week}`} className="text-sm">Calfs (cm)</Label>
                    <Input
                      id={`calfs-${week}`}
                      type="number"
                      step="0.1"
                      value={measurements.calfs}
                      onChange={(e) => setMeasurements({...measurements, calfs: e.target.value})}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`bodyFat-${week}`} className="text-sm">Body Fat % (optional)</Label>
                    <Input
                      id={`bodyFat-${week}`}
                      type="number"
                      step="0.1"
                      value={measurements.bodyFat}
                      onChange={(e) => setMeasurements({...measurements, bodyFat: e.target.value})}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`steps-${week}`} className="text-sm">Avg Daily Steps</Label>
                    <Input
                      id={`steps-${week}`}
                      type="number"
                      placeholder="10000"
                      value={measurements.dailySteps}
                      onChange={(e) => setMeasurements({...measurements, dailySteps: e.target.value})}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Adherence Check */}
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Were you adherent to your calorie target?</Label>
                <RadioGroup value={followedCalories} onValueChange={setFollowedCalories}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id={`followed-yes-${week}`} />
                    <Label htmlFor={`followed-yes-${week}`}>Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id={`followed-no-${week}`} />
                    <Label htmlFor={`followed-no-${week}`}>No</Label>
                  </div>
                </RadioGroup>
              </div>

              {followedCalories === 'yes' && (
                <div>
                  <Label className="mb-2 block">Did you eat mostly home-cooked and fully tracked meals?</Label>
                  <RadioGroup value={trackedAccurately} onValueChange={setTrackedAccurately}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id={`tracked-yes-${week}`} />
                      <Label htmlFor={`tracked-yes-${week}`}>Yes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id={`tracked-no-${week}`} />
                      <Label htmlFor={`tracked-no-${week}`}>No</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor={`notes-${week}`}>Notes (optional)</Label>
              <Textarea
                id={`notes-${week}`}
                placeholder="Any notes about this week..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Adjustment Display */}
            {existingProgress && typeof existingProgress.calorie_adjustment === 'number' && existingProgress.calorie_adjustment !== 0 && (
              <Alert className={existingProgress.calorie_adjustment > 0 ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-semibold mb-1">
                    Calorie Adjustment Applied: {existingProgress.calorie_adjustment > 0 ? '+' : ''}
                    {existingProgress.calorie_adjustment} kcal
                  </p>
                  <p className="text-sm">
                    New daily target: {existingProgress.new_daily_calories} kcal/day
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {followedCalories === 'no' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No calorie adjustment will be made due to non-adherence. Focus on consistency this week.
                </AlertDescription>
              </Alert>
            )}

            {followedCalories === 'yes' && trackedAccurately === 'no' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No calorie adjustment will be made due to inaccurate tracking. Track more carefully next week.
                </AlertDescription>
              </Alert>
            )}

            <Button onClick={saveWeekData} disabled={saving || !isWeekComplete} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculating...
                </>
              ) : (
                `Calculate Week ${week} Summary & Adjustments`
              )}
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
