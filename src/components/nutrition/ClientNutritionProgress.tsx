import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/withTimeout";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, CalendarIcon, AlertCircle, Scale, Ruler, Droplet, Stethoscope, Check } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { startOfIguWeek } from "@/lib/weekUtils";
import { StepLogForm } from "./StepLogForm";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { calculateFatFreeMass } from "@/types/nutrition-phase22";

interface ClientNutritionProgressProps {
  phase: any;
  userGender?: string;
  initialBodyFat?: number;
}

type CalorieAdherence = "on_point" | "mostly" | "off_track";
type TrackingAccuracy = "weighed" | "estimated" | "guessed";

const CALORIE_OPTS: { value: CalorieAdherence; label: string }[] = [
  { value: "on_point", label: "On point" },
  { value: "mostly", label: "Mostly" },
  { value: "off_track", label: "Off track" },
];
const TRACKING_OPTS: { value: TrackingAccuracy; label: string }[] = [
  { value: "weighed", label: "Weighed everything" },
  { value: "estimated", label: "Estimated" },
  { value: "guessed", label: "Guessed" },
];
const CHANGE_OPTS: { value: string; label: string }[] = [
  { value: "clothes_looser", label: "Clothes looser" },
  { value: "clothes_tighter", label: "Clothes tighter" },
  { value: "visual_changes", label: "Visual changes" },
  { value: "strength_gains", label: "Stronger" },
  { value: "none", label: "No change" },
];
const CALORIE_LABEL: Record<string, string> = {
  on_point: "On point",
  mostly: "Mostly",
  off_track: "Off track",
};
const TRACKING_LABEL: Record<string, string> = {
  weighed: "Weighed everything",
  estimated: "Estimated",
  guessed: "Guessed",
};

// Lenient compatibility map: the middle rung still counts as "adherent" so the
// derived booleans (which feed get_coach_roster_stats + the adherence-rate math
// in nutritionCalculations) stay continuous with the pre-scale behavior.
const followedFromScale = (v: CalorieAdherence) => v !== "off_track";
const trackedFromScale = (v: TrackingAccuracy) => v !== "guessed";

export function ClientNutritionProgress({ phase, userGender = "male", initialBodyFat }: ClientNutritionProgressProps) {
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

  // Adherence & notes form (3-level scale)
  const [currentWeek, setCurrentWeek] = useState(1);
  const [calorieAdherence, setCalorieAdherence] = useState<CalorieAdherence | "">("");
  const [trackingAccuracy, setTrackingAccuracy] = useState<TrackingAccuracy | "">("");
  const [physicalChanges, setPhysicalChanges] = useState<string>("");
  const [notes, setNotes] = useState("");

  const calculateCurrentWeek = useCallback(() => {
    if (!phase) return;
    const weeksSinceStart =
      Math.floor((new Date().getTime() - new Date(phase.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    setCurrentWeek(weeksSinceStart);
  }, [phase]);

  const loadProgressData = useCallback(async () => {
    if (!phase) return;
    try {
      const [weights, circumferences, adherence, weeklyProgress] = await Promise.all([
        supabase.from("weight_logs").select("*").eq("phase_id", phase.id).order("log_date", { ascending: false }),
        supabase.from("circumference_logs").select("*").eq("phase_id", phase.id).order("week_number", { ascending: false }),
        supabase.from("adherence_logs").select("*").eq("phase_id", phase.id).order("week_number", { ascending: false }),
        supabase
          .from("weekly_progress")
          .select("body_fat_percentage, week_number, notes")
          .eq("goal_id", phase.id)
          .order("week_number", { ascending: false }),
      ]);

      setWeightLogs(weights.data || []);
      setCircumferenceLogs(circumferences.data || []);
      setAdherenceLogs(adherence.data || []);
      setBodyFatLogs(weeklyProgress.data || []);

      // Pre-fill this week's answers so a returning client sees what they saved.
      const thisWeekRow = adherence.data?.find((a: any) => a.week_number === currentWeek);
      if (thisWeekRow) {
        const cal = (thisWeekRow.calorie_adherence ?? (thisWeekRow.followed_calories ? "on_point" : "off_track")) as CalorieAdherence;
        const trk = (thisWeekRow.tracking_accuracy ?? (thisWeekRow.tracked_accurately ? "weighed" : "guessed")) as TrackingAccuracy;
        setCalorieAdherence(cal);
        setTrackingAccuracy(trk);
      }

      const thisWeekProgress = weeklyProgress.data?.find((p: any) => p.week_number === currentWeek);
      if (thisWeekProgress?.notes) {
        setNotes(thisWeekProgress.notes);
      }
    } catch (error: any) {
      console.error("Error loading progress data:", error);
    }
  }, [phase, currentWeek]);

  useEffect(() => {
    if (phase) {
      loadProgressData();
      calculateCurrentWeek();
    }
  }, [phase, loadProgressData, calculateCurrentWeek]);

  // Cadence gates -- circumference on weeks 1, 3, then every odd week; body fat
  // every 4th week (only when a baseline was captured at phase start).
  const shouldShowCircumMeasurements = () => currentWeek === 1 || currentWeek === 3 || (currentWeek > 3 && currentWeek % 2 === 1);
  const shouldShowBodyFat = () => !!initialBodyFat && currentWeek % 4 === 0;
  const nextBodyFatWeek = Math.ceil(Math.max(currentWeek, 1) / 4) * 4 || 4;

  const addWeightLog = async () => {
    if (!newWeightDate || !newWeight) {
      toast({ title: "Missing Data", description: "Please select a date and enter weight", variant: "destructive" });
      return;
    }

    // Same 30-250 kg clamp used by LogTodayCard -- catches common typos
    // (e.g. "250" typed as "25.0" kg).
    const w = parseFloat(newWeight);
    if (!Number.isFinite(w) || w < 30 || w > 250) {
      toast({ title: "Invalid weight", description: "Enter a weight between 30 and 250 kg", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await withTimeout(supabase.auth.getUser(), 8000);
      if (!user) return;

      const { error } = await supabase.from("weight_logs").insert({
        phase_id: phase.id,
        user_id: user.id,
        log_date: format(newWeightDate, "yyyy-MM-dd"),
        weight_kg: w,
        week_number: currentWeek,
      });

      if (error) throw error;

      toast({ title: "Success", description: "Weight log added successfully" });
      setNewWeightDate(undefined);
      setNewWeight("");
      loadProgressData();
    } catch (error: any) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const deleteWeightLog = async (id: string) => {
    if (!window.confirm("Delete this weight log? This can't be undone.")) return;
    try {
      const { error } = await supabase.from("weight_logs").delete().eq("id", id);
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

    // Require at least one measurement -- without this guard, the form would
    // insert a row with all four columns NULL. Silent data loss.
    if (!waist && !chest && !hips && !thighs) {
      toast({ title: "Nothing to save", description: "Enter at least one measurement (waist, chest/hips, or thighs).", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await withTimeout(supabase.auth.getUser(), 8000);
      if (!user) return;

      const { error } = await supabase.from("circumference_logs").insert({
        phase_id: phase.id,
        user_id: user.id,
        log_date: format(circumDate, "yyyy-MM-dd"),
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

    const bfNum = parseFloat(bodyFat);
    // Same 3-55% clamp as BodyFatLogForm -- catches "1.5" / "5.5" typos.
    if (!Number.isFinite(bfNum) || bfNum < 3 || bfNum > 55) {
      toast({ title: "Invalid body fat", description: "Please enter a valid body fat percentage (3-55%)", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await withTimeout(supabase.auth.getUser(), 8000);
      if (!user) return;

      // Dual-write: the detailed history table feeds coach graphs + the
      // demographics hook's "last logged" pre-fill on the coach form; the
      // weekly_progress row is what the weekly check-in aggregation reads.
      const latestWeightKg = weightLogs[0]?.weight_kg;
      const ffm = typeof latestWeightKg === "number" ? calculateFatFreeMass(latestWeightKg, bfNum) : null;

      const { error: logError } = await supabase.from("body_fat_logs").upsert(
        {
          user_id: user.id,
          log_date: format(new Date(), "yyyy-MM-dd"),
          body_fat_percentage: bfNum,
          method: "bioelectrical",
          fat_free_mass_kg: ffm,
        },
        { onConflict: "user_id,log_date,method" },
      );
      if (logError) throw logError;

      const { error } = await supabase.from("weekly_progress").upsert(
        {
          user_id: user.id,
          goal_id: phase.id,
          week_number: currentWeek,
          week_start_date: new Date(new Date(phase.start_date).getTime() + (currentWeek - 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
          body_fat_percentage: bfNum,
        },
        // weekly_progress has TWO unique constraints: (goal_id, week_number) and
        // (user_id, goal_id, week_number). Conflict on the NARROWER (goal_id,
        // week_number) -- targeting the wider one 409s when a row already exists.
        { onConflict: "goal_id,week_number" },
      );

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
    if (!calorieAdherence || !trackingAccuracy || !physicalChanges) {
      toast({ title: "Missing Data", description: "Please answer all check-in questions", variant: "destructive" });
      return;
    }

    // Validate minimum weight logs for the current IGU week (Mon-Sun) -- the
    // canonical "this week" used by ClientWeeklyRibbon + the dashboard, so this
    // gate matches the count the user sees in the ribbon and the anchor card.
    const iguWeekStart = format(startOfIguWeek(), "yyyy-MM-dd");
    const currentWeekLogs = weightLogs.filter((log) => String(log.log_date).slice(0, 10) >= iguWeekStart);

    if (currentWeekLogs.length < 3) {
      toast({
        title: "Insufficient Weight Logs",
        description: `You need at least 3 weight entries for this week. You currently have ${currentWeekLogs.length}.`,
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await withTimeout(supabase.auth.getUser(), 8000);
      if (!user) return;

      // Dual-write the 3-level scale AND the derived booleans (compatibility
      // shadow). onConflict is required -- adherence_logs has a UNIQUE
      // (phase_id, week_number); without it the upsert would always try to
      // INSERT and hit that constraint on a second submit for the same week.
      const { error: adherenceError } = await supabase.from("adherence_logs").upsert(
        {
          phase_id: phase.id,
          user_id: user.id,
          week_number: currentWeek,
          calorie_adherence: calorieAdherence,
          tracking_accuracy: trackingAccuracy,
          followed_calories: followedFromScale(calorieAdherence),
          tracked_accurately: trackedFromScale(trackingAccuracy),
        },
        { onConflict: "phase_id,week_number" },
      );

      if (adherenceError) throw adherenceError;

      const notesText = [notes, physicalChanges !== "none" ? `Physical changes: ${physicalChanges.replace(/_/g, " ")}` : null]
        .filter(Boolean)
        .join("\n\n");

      if (notesText) {
        const { error: notesError } = await supabase.from("weekly_progress").upsert(
          {
            user_id: user.id,
            goal_id: phase.id,
            week_number: currentWeek,
            week_start_date: new Date(new Date(phase.start_date).getTime() + (currentWeek - 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
            notes: notesText,
          },
          // Conflict on the narrower (goal_id, week_number) unique constraint --
          // see saveBodyFat note. Targeting (user_id, goal_id, week_number) 409s
          // when a weekly_progress row already exists for the goal+week.
          { onConflict: "goal_id,week_number" },
        );

        if (notesError) throw notesError;
      }

      toast({ title: "Success", description: "Check-in saved" });
      setPhysicalChanges("");
      loadProgressData();
    } catch (error: any) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const thisWeekAdherence = adherenceLogs.find((log) => log.week_number === currentWeek);
  // Weigh-ins logged in the current IGU calendar week (Mon-Sun) -- the canonical
  // "this week" across the client app (ClientWeeklyRibbon + dashboard).
  const iguWeekStartStr = format(startOfIguWeek(), "yyyy-MM-dd");
  const weighInsThisWeek = weightLogs.filter((log) => String(log.log_date).slice(0, 10) >= iguWeekStartStr).length;
  const circumDoneThisWeek = circumferenceLogs.some((log) => log.week_number === currentWeek);
  const bodyFatDoneThisWeek = bodyFatLogs.some((log: any) => log.week_number === currentWeek && log.body_fat_percentage);

  // Completion tasks drive the header progress bar + chips.
  const tasks: { label: string; done: boolean }[] = [
    { label: `Weigh-ins ${weighInsThisWeek}/3`, done: weighInsThisWeek >= 3 },
    { label: thisWeekAdherence ? "Check-in done" : "Check-in", done: !!thisWeekAdherence },
  ];
  if (shouldShowCircumMeasurements()) tasks.push({ label: "Measurements", done: circumDoneThisWeek });
  if (shouldShowBodyFat()) tasks.push({ label: "Body fat", done: bodyFatDoneThisWeek });
  const doneCount = tasks.filter((t) => t.done).length;
  const progressPct = Math.round((doneCount / tasks.length) * 100);

  const canSaveCheckIn = !!calorieAdherence && !!trackingAccuracy && !!physicalChanges && weighInsThisWeek >= 3;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Header: week + macros + progress */}
          <div className="border-b p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Weekly check-in</h2>
                <p className="text-sm text-muted-foreground">
                  Week {currentWeek}
                  {phase.phase_name ? ` · ${phase.phase_name}` : ""}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {Math.round(phase.daily_calories)} kcal -- P {Math.round(phase.protein_grams)}g F {Math.round(phase.fat_grams)}g C{" "}
                  {Math.round(phase.carb_grams)}g
                </p>
              </div>
              <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                {doneCount} of {tasks.length} done
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {tasks.map((t) => (
                <CompletionChip key={t.label} done={t.done} label={t.label} />
              ))}
            </div>
          </div>

          {/* Section: Adherence */}
          <Section rail="emerald" title="Adherence" subtitle="How the week actually went.">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Did you hit your calorie target?</Label>
                <Segmented options={CALORIE_OPTS} value={calorieAdherence} onChange={(v) => setCalorieAdherence(v as CalorieAdherence)} />
              </div>
              <div className="space-y-2">
                <Label>How accurately did you track?</Label>
                <Segmented options={TRACKING_OPTS} value={trackingAccuracy} onChange={(v) => setTrackingAccuracy(v as TrackingAccuracy)} />
              </div>
            </div>
          </Section>

          {/* Section: How you're feeling */}
          <Section rail="emerald" title="How you're feeling" subtitle="Noticeable changes and anything to flag.">
            <div className="space-y-4">
              <Segmented options={CHANGE_OPTS} value={physicalChanges} onChange={setPhysicalChanges} />
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything to flag for your coach? (energy, challenges, etc.) -- optional"
                rows={3}
              />
            </div>
          </Section>

          {/* Section: Measurements due this week */}
          <Section rail="amber" title="Measurements due this week" subtitle="Only what's on cadence -- nothing extra to chase.">
            <div className="space-y-4">
              {/* Weight (always) */}
              <div className="rounded-lg border p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Scale className="h-4 w-4 text-emerald-500" aria-hidden />
                  <span className="text-sm font-medium">Weight</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{weighInsThisWeek}/3 this week</span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left", !newWeightDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {newWeightDate ? format(newWeightDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={newWeightDate} onSelect={setNewWeightDate} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Weight (kg)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={30}
                      max={250}
                      value={newWeight}
                      onChange={(e) => setNewWeight(e.target.value)}
                      placeholder="75.5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">&nbsp;</Label>
                    <Button onClick={addWeightLog} disabled={loading} className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
                {weightLogs.length > 0 && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    {weightLogs.slice(0, 3).map((log) => (
                      <div key={log.id} className="flex items-center justify-between rounded-lg bg-muted/50 p-2">
                        <span className="font-mono text-xs">
                          {format(new Date(log.log_date), "MMM dd")} · {log.weight_kg} kg
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => deleteWeightLog(log.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Circumference (cadence-gated) */}
              {shouldShowCircumMeasurements() && (
                <div className="rounded-lg border border-amber-500/30 p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-amber-500" aria-hidden />
                    <span className="text-sm font-medium">Waist &amp; circumference</span>
                    <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">
                      {circumDoneThisWeek ? "Logged" : "Due this week"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left md:w-64", !circumDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {circumDate ? format(circumDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={circumDate} onSelect={setCircumDate} initialFocus className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Waist (cm)</Label>
                        <Input type="number" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)} />
                      </div>
                      {userGender === "male" && (
                        <div className="space-y-2">
                          <Label className="text-xs">Chest (cm)</Label>
                          <Input type="number" step="0.1" value={chest} onChange={(e) => setChest(e.target.value)} />
                        </div>
                      )}
                      {userGender === "female" && (
                        <div className="space-y-2">
                          <Label className="text-xs">Hips (cm)</Label>
                          <Input type="number" step="0.1" value={hips} onChange={(e) => setHips(e.target.value)} />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label className="text-xs">Thighs (cm)</Label>
                        <Input type="number" step="0.1" value={thighs} onChange={(e) => setThighs(e.target.value)} />
                      </div>
                    </div>
                    <Button onClick={addCircumferenceLog} disabled={loading} variant="outline">
                      Save measurements
                    </Button>
                  </div>
                </div>
              )}

              {/* Body fat (cadence-gated; consolidated single entry) */}
              {initialBodyFat ? (
                shouldShowBodyFat() ? (
                  <div className="rounded-lg border p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <Droplet className="h-4 w-4 text-emerald-500" aria-hidden />
                      <span className="text-sm font-medium">Body fat</span>
                      <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">
                        {bodyFatDoneThisWeek ? "Logged" : "Due this week"}
                      </span>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1 space-y-2">
                        <Label className="text-xs">Body fat %</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min={3}
                          max={55}
                          value={bodyFat}
                          onChange={(e) => setBodyFat(e.target.value)}
                          placeholder="e.g. 15.5"
                        />
                      </div>
                      <Button onClick={saveBodyFat} disabled={loading} variant="outline">
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 opacity-60">
                    <Droplet className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span className="text-sm">Body fat</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">Next due week {nextBodyFatWeek}</span>
                  </div>
                )
              ) : null}
            </div>
          </Section>

          {/* Section: Advanced (dietitian seam) */}
          <Section rail="muted" title="Advanced" subtitle="" badge="From your dietitian">
            <p className="text-xs text-muted-foreground">
              When you're on a plan with a dietitian, extra questions appear here -- energy, sleep, digestion, stress.
            </p>
          </Section>

          {/* Submit */}
          <div className="space-y-3 p-4 md:p-6">
            {weighInsThisWeek < 3 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                <p>
                  You need <span className="font-mono font-semibold">{3 - weighInsThisWeek}</span> more weigh-in
                  {3 - weighInsThisWeek === 1 ? "" : "s"} this week before you can submit the check-in.
                </p>
              </div>
            )}
            <Button onClick={saveAdherenceAndNotes} disabled={loading || !canSaveCheckIn} className="w-full">
              {thisWeekAdherence ? "Update check-in" : "Submit check-in"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Steps -- its own surface for now (folds into the entries hub later). */}
      <StepLogForm onLogAdded={loadProgressData} />
    </div>
  );
}

function Section({
  rail,
  title,
  subtitle,
  badge,
  children,
}: {
  rail: "emerald" | "amber" | "muted";
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  const railClass = rail === "emerald" ? "bg-emerald-500" : rail === "amber" ? "bg-amber-500" : "bg-muted-foreground/30";
  return (
    <div className="flex gap-3 border-b p-4 last:border-b-0 md:p-6">
      <div aria-hidden className={cn("w-0.5 shrink-0 rounded-none", railClass)} />
      <div className={cn("flex-1", rail === "muted" && "opacity-70")}>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {badge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-600 dark:text-sky-400">
              <Stethoscope className="h-3 w-3" aria-hidden />
              {badge}
            </span>
          )}
        </div>
        {subtitle ? <p className="mb-3 -mt-2 text-xs text-muted-foreground">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex min-h-[40px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            {active && <Check className="h-3.5 w-3.5" aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CompletionChip({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        done ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", done ? "bg-emerald-500" : "bg-amber-500")} />
      {label}
    </span>
  );
}
