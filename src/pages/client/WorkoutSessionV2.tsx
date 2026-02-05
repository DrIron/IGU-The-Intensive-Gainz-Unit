/**
 * WorkoutSessionV2.tsx
 *
 * Enhanced workout logging page with:
 * - Per-set prescriptions (each set can have different tempo, RIR, rest, etc.)
 * - Compact history blocks showing previous performance
 * - Rest timer with pause/skip
 * - Video thumbnails with modal player
 * - Progress tracking
 *
 * Backward compatible with legacy prescription_snapshot_json
 * Forward compatible with sets_json (V2 per-set data)
 */

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  Clock,
  History,
  Trophy,
  MessageSquare,
  Save,
  Loader2,
  Dumbbell,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

interface SetPrescription {
  set_number: number;
  reps?: string;
  rep_range_min?: number;
  rep_range_max?: number;
  rir?: number;
  rpe?: number;
  rest_seconds?: number;
  tempo?: string;
  weight_suggestion?: string;
  notes?: string;
}

interface HistorySet {
  set_number: number;
  weight: number;
  reps: number;
  rir?: number;
  rpe?: number;
}

interface Exercise {
  id: string;
  exercise_id: string;
  section: "warmup" | "main" | "accessory" | "cooldown";
  sort_order: number;
  instructions: string | null;
  // Legacy shared prescription (fallback)
  prescription_snapshot_json: {
    set_count?: number;
    rep_range_min?: number;
    rep_range_max?: number;
    tempo?: string;
    rest_seconds?: number;
    intensity_type?: string;
    intensity_value?: number;
    sets_json?: SetPrescription[];
  };
  // V2: Per-set prescriptions (if available)
  sets_json?: SetPrescription[];
  exercise: {
    name: string;
    default_video_url: string | null;
    primary_muscle: string;
  };
  // History from previous sessions
  history?: {
    date: string;
    sets: HistorySet[];
  };
  personal_best?: {
    weight: number;
    reps: number;
    date: string;
  };
}

interface SetLog {
  set_index: number;
  performed_reps: number | null;
  performed_load: number | null;
  performed_rir: number | null;
  performed_rpe: number | null;
  notes: string;
  completed: boolean;
}

interface Module {
  id: string;
  title: string;
  module_type: string;
  status: string;
  completed_at: string | null;
  module_owner_coach_id: string;
  coach_name: string;
  exercises: Exercise[];
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getYouTubeThumbnail(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/]+)/
  );
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
}

function getYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/]+)/
  );
  return match ? match[1] : null;
}

// Convert legacy shared prescription to per-set array
function legacyToPerSet(
  prescription: Exercise["prescription_snapshot_json"]
): SetPrescription[] {
  const setCount = prescription.set_count || 3;
  const reps =
    prescription.rep_range_min && prescription.rep_range_max
      ? `${prescription.rep_range_min}-${prescription.rep_range_max}`
      : prescription.rep_range_min?.toString() || "8-12";

  return Array.from({ length: setCount }, (_, i) => ({
    set_number: i + 1,
    reps,
    rep_range_min: prescription.rep_range_min,
    rep_range_max: prescription.rep_range_max,
    rir:
      prescription.intensity_type === "RIR"
        ? prescription.intensity_value
        : undefined,
    rpe:
      prescription.intensity_type === "RPE"
        ? prescription.intensity_value
        : undefined,
    rest_seconds: prescription.rest_seconds,
    tempo: prescription.tempo,
  }));
}

// =============================================================================
// COMPONENTS
// =============================================================================

// Video Thumbnail with modal
function VideoThumbnail({
  url,
  name,
}: {
  url: string | null;
  name: string;
}) {
  const [showVideo, setShowVideo] = useState(false);
  const thumbnail = getYouTubeThumbnail(url);
  const videoId = getYouTubeId(url);

  if (!url) {
    return (
      <div className="w-16 h-12 md:w-20 md:h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Dumbbell className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowVideo(true);
        }}
        className="relative w-16 h-12 md:w-20 md:h-14 rounded-lg overflow-hidden shrink-0 group cursor-pointer"
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/80 to-primary" />
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-colors">
          <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white/90 flex items-center justify-center">
            <Play
              className="w-3 h-3 text-primary ml-0.5"
              fill="currentColor"
            />
          </div>
        </div>
      </button>

      {/* Video Modal */}
      {showVideo && videoId && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowVideo(false)}
        >
          <div className="relative w-full max-w-2xl aspect-video bg-black rounded-xl overflow-hidden">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowVideo(false)}
              className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// Compact History Block
function HistoryBlock({
  history,
  personalBest,
}: {
  history?: Exercise["history"];
  personalBest?: Exercise["personal_best"];
}) {
  if (!history && !personalBest) {
    return (
      <div className="px-3 py-2 bg-muted/30 rounded-lg border border-dashed">
        <p className="text-xs text-muted-foreground text-center">
          First time — no history
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 bg-muted/30 rounded-lg space-y-2">
      {history && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <History className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Last: {format(new Date(history.date), "MMM d")}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {history.sets.map((set, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="text-xs font-mono px-1.5 py-0"
              >
                {set.weight}×{set.reps}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {personalBest && (
        <div
          className={cn(
            "flex items-center gap-2",
            history && "pt-1.5 border-t"
          )}
        >
          <Trophy className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            PR: {personalBest.weight}kg × {personalBest.reps}
          </span>
        </div>
      )}
    </div>
  );
}

// Per-Set Row with its own prescription
function SetRow({
  prescription,
  historySet,
  log,
  onUpdate,
  onComplete,
  isActive,
}: {
  prescription: SetPrescription;
  historySet?: HistorySet;
  log: SetLog;
  onUpdate: (field: keyof SetLog, value: any) => void;
  onComplete: () => void;
  isActive: boolean;
}) {
  const hasRir = prescription.rir !== undefined;
  const hasRpe = prescription.rpe !== undefined;
  const repsDisplay =
    prescription.reps ||
    (prescription.rep_range_min && prescription.rep_range_max
      ? `${prescription.rep_range_min}-${prescription.rep_range_max}`
      : "8-12");
  const isFilledOut =
    log.performed_load !== null && log.performed_reps !== null;

  return (
    <div
      className={cn(
        "rounded-xl border transition-all",
        log.completed && "bg-green-500/5 border-green-500/30",
        isActive && !log.completed && "bg-primary/5 border-primary/30",
        !isActive && !log.completed && "bg-card border-border"
      )}
    >
      {/* Set header with prescription badges */}
      <div className="px-3 py-2 border-b flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold",
              log.completed
                ? "bg-green-500 text-white"
                : "bg-muted text-foreground"
            )}
          >
            {log.completed ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              prescription.set_number
            )}
          </div>

          {/* Prescription badges */}
          <Badge variant="default" className="text-xs">
            {repsDisplay} reps
          </Badge>
          {hasRir && (
            <Badge variant="outline" className="text-xs">
              RIR {prescription.rir}
            </Badge>
          )}
          {hasRpe && (
            <Badge variant="outline" className="text-xs">
              RPE {prescription.rpe}
            </Badge>
          )}
          {prescription.tempo && (
            <Badge variant="outline" className="text-xs font-mono">
              {prescription.tempo}
            </Badge>
          )}
          {prescription.rest_seconds && prescription.rest_seconds > 0 && (
            <Badge variant="outline" className="text-xs">
              <Clock className="w-3 h-3 mr-1" />
              {prescription.rest_seconds}s
            </Badge>
          )}
        </div>

        {prescription.weight_suggestion && (
          <span className="text-xs text-amber-600 dark:text-amber-400 italic">
            {prescription.weight_suggestion}
          </span>
        )}
      </div>

      {/* Input row */}
      <div className="px-3 py-2.5 flex items-end gap-2">
        {/* Previous hint */}
        {historySet && !log.completed && (
          <div className="w-14 shrink-0 text-center hidden sm:block">
            <p className="text-[10px] text-muted-foreground">Last</p>
            <p className="text-xs text-muted-foreground font-mono">
              {historySet.weight}×{historySet.reps}
            </p>
          </div>
        )}

        {/* Inputs */}
        <div className="flex-1 grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">
              Weight (kg)
            </label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.5"
              placeholder={historySet?.weight?.toString() || "—"}
              value={log.performed_load ?? ""}
              onChange={(e) =>
                onUpdate(
                  "performed_load",
                  e.target.value ? parseFloat(e.target.value) : null
                )
              }
              disabled={log.completed}
              className="h-10 text-center"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">
              Reps
            </label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder={prescription.rep_range_min?.toString() || "8"}
              value={log.performed_reps ?? ""}
              onChange={(e) =>
                onUpdate(
                  "performed_reps",
                  e.target.value ? parseInt(e.target.value) : null
                )
              }
              disabled={log.completed}
              className="h-10 text-center"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">
              {hasRpe ? "RPE" : "RIR"}
            </label>
            <Input
              type="number"
              inputMode="numeric"
              min={hasRpe ? 1 : 0}
              max={hasRpe ? 10 : 5}
              placeholder={
                hasRpe
                  ? prescription.rpe?.toString()
                  : prescription.rir?.toString() || "2"
              }
              value={
                hasRpe
                  ? (log.performed_rpe ?? "")
                  : (log.performed_rir ?? "")
              }
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value) : null;
                onUpdate(hasRpe ? "performed_rpe" : "performed_rir", val);
              }}
              disabled={log.completed}
              className="h-10 text-center"
            />
          </div>
        </div>

        {/* Complete button */}
        <Button
          variant={
            log.completed ? "ghost" : isFilledOut ? "default" : "outline"
          }
          size="icon"
          onClick={onComplete}
          disabled={!isFilledOut || log.completed}
          className={cn(
            "h-10 w-10 shrink-0",
            log.completed && "text-green-500"
          )}
        >
          <CheckCircle2 className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

// Exercise Card
function ExerciseCard({
  exercise,
  exerciseIndex,
  logs,
  onUpdateLog,
  onCompleteSet,
  isExpanded,
  onToggle,
}: {
  exercise: Exercise;
  exerciseIndex: number;
  logs: SetLog[];
  onUpdateLog: (setIndex: number, field: keyof SetLog, value: any) => void;
  onCompleteSet: (setIndex: number, restSeconds?: number) => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  // Get per-set prescriptions: V2 from prescription_snapshot_json.sets_json, or convert from legacy
  const prescriptions: SetPrescription[] =
    exercise.sets_json ||
    exercise.prescription_snapshot_json.sets_json ||
    legacyToPerSet(exercise.prescription_snapshot_json);

  const completedSets = logs.filter((l) => l.completed).length;
  const totalSets = prescriptions.length;
  const isComplete = completedSets === totalSets;
  const activeSetIndex = logs.findIndex((l) => !l.completed);

  return (
    <Card
      className={cn("transition-colors", isComplete && "border-green-500/40")}
    >
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3 px-4">
            <div className="flex items-start gap-3">
              {/* Status indicator */}
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold",
                  isComplete
                    ? "bg-green-500 text-white"
                    : "bg-primary/20 text-primary"
                )}
              >
                {isComplete ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  exerciseIndex + 1
                )}
              </div>

              {/* Video thumbnail */}
              <VideoThumbnail
                url={exercise.exercise.default_video_url}
                name={exercise.exercise.name}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate">
                  {exercise.exercise.name}
                </CardTitle>
                <CardDescription className="text-sm">
                  {exercise.exercise.primary_muscle}
                </CardDescription>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {completedSets}/{totalSets} sets
                  </span>
                  {exercise.personal_best && (
                    <span className="text-xs text-amber-500 flex items-center gap-1">
                      <Trophy className="w-3 h-3" />
                      {exercise.personal_best.weight}kg
                    </span>
                  )}
                </div>
              </div>

              {/* Expand chevron */}
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {/* Coach notes */}
            {exercise.instructions && (
              <Alert className="border-amber-500/30 bg-amber-500/5">
                <MessageSquare className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-sm text-amber-700 dark:text-amber-300">
                  {exercise.instructions}
                </AlertDescription>
              </Alert>
            )}

            {/* History block */}
            <HistoryBlock
              history={exercise.history}
              personalBest={exercise.personal_best}
            />

            {/* Per-set rows */}
            <div className="space-y-2">
              {prescriptions.map((prescription, i) => (
                <SetRow
                  key={i}
                  prescription={prescription}
                  historySet={exercise.history?.sets[i]}
                  log={
                    logs[i] || {
                      set_index: i + 1,
                      performed_reps: null,
                      performed_load: null,
                      performed_rir: null,
                      performed_rpe: null,
                      notes: "",
                      completed: false,
                    }
                  }
                  onUpdate={(field, value) => onUpdateLog(i, field, value)}
                  onComplete={() =>
                    onCompleteSet(i, prescription.rest_seconds)
                  }
                  isActive={activeSetIndex === i}
                />
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// Rest Timer
function RestTimer({
  duration,
  onComplete,
  onSkip,
}: {
  duration: number;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [remaining, setRemaining] = useState(duration);
  const [isPaused, setIsPaused] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          onCompleteRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = ((duration - remaining) / duration) * 100;

  return (
    <div className="fixed inset-x-0 bottom-20 md:bottom-24 mx-4 z-40">
      <Card className="shadow-lg border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Timer display */}
            <div className="relative w-14 h-14 shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-muted"
                />
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray={150.8}
                  strokeDashoffset={150.8 - (progress / 100) * 150.8}
                  strokeLinecap="round"
                  className="text-primary transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-base font-bold font-mono">
                  {minutes}:{seconds.toString().padStart(2, "0")}
                </span>
              </div>
            </div>

            <div className="flex-1">
              <p className="font-semibold">Rest Time</p>
              <p className="text-sm text-muted-foreground">
                Get ready for next set
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsPaused(!isPaused)}
              >
                {isPaused ? (
                  <Play className="w-4 h-4" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
              </Button>
              <Button onClick={onSkip}>Skip</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function WorkoutSessionV2Content() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [setLogs, setSetLogs] = useState<Record<string, SetLog[]>>({});
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [restTimer, setRestTimer] = useState<{
    active: boolean;
    duration: number;
  }>({
    active: false,
    duration: 0,
  });

  const hasFetched = useRef(false);

  // Fix #1: useDocumentTitle API — use { title, description } not { title, suffix }
  useDocumentTitle({
    title: module ? `${module.title} - Workout` : "Loading Workout...",
    description: "Complete your workout session",
  });

  // Load session data
  const loadSession = useCallback(async () => {
    if (!moduleId) return;

    try {
      // Get current user
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) {
        navigate("/auth");
        return;
      }
      setUser(currentUser);

      // Get module data
      const { data: moduleData, error: moduleError } = await supabase
        .from("client_day_modules")
        .select("*")
        .eq("id", moduleId)
        .single();

      if (moduleError) throw moduleError;

      // Fix #4: Use coaches_client_safe view with .maybeSingle() (RLS-safe)
      const { data: coachData } = await supabase
        .from("coaches_client_safe")
        .select("first_name")
        .eq("user_id", moduleData.module_owner_coach_id)
        .maybeSingle();

      // Get exercises
      const { data: exercisesData, error: exercisesError } = await supabase
        .from("client_module_exercises")
        .select(
          `
          *,
          exercise_library(name, primary_muscle, default_video_url)
        `
        )
        .eq("client_day_module_id", moduleId)
        .order("section")
        .order("sort_order");

      if (exercisesError) throw exercisesError;

      // Get existing logs
      const exerciseIds = exercisesData?.map((e) => e.id) || [];
      const { data: logsData } = await supabase
        .from("exercise_set_logs")
        .select("*")
        .in("client_module_exercise_id", exerciseIds);

      // Initialize logs state
      const initialLogs: Record<string, SetLog[]> = {};

      // Format exercises with history
      const formattedExercises: Exercise[] = await Promise.all(
        (exercisesData || []).map(async (ex: any) => {
          const prescription = ex.prescription_snapshot_json || {};

          // Fix #3: Read sets_json from inside prescription_snapshot_json, not as a top-level column
          const setsJson = (prescription as any).sets_json as
            | SetPrescription[]
            | null;
          const setCount = setsJson?.length || prescription.set_count || 3;

          // Get existing logs for this exercise
          const existingLogs =
            logsData?.filter(
              (l) => l.client_module_exercise_id === ex.id
            ) || [];

          // Initialize logs
          initialLogs[ex.id] = Array.from({ length: setCount }, (_, i) => {
            const existing = existingLogs.find(
              (l) => l.set_index === i + 1
            );
            return {
              set_index: i + 1,
              performed_reps: existing?.performed_reps ?? null,
              performed_load: existing?.performed_load ?? null,
              performed_rir: existing?.performed_rir ?? null,
              performed_rpe: existing?.performed_rpe ?? null,
              notes: existing?.notes || "",
              completed: existing
                ? existing.performed_reps !== null ||
                  existing.performed_load !== null
                : false,
            };
          });

          // Fix #5: History/PB queries — filter by exercise_id through client_module_exercises
          // Find other client_module_exercises with the same exercise_id (same movement)
          const { data: sameExerciseInstances } = await supabase
            .from("client_module_exercises")
            .select("id")
            .eq("exercise_id", ex.exercise_id)
            .neq("id", ex.id);

          const sameExerciseIds =
            sameExerciseInstances?.map((e) => e.id) || [];

          // Get last performance (history) — only for the same exercise
          let historyData: any[] | null = null;
          if (sameExerciseIds.length > 0) {
            const { data } = await supabase
              .from("exercise_set_logs")
              .select(
                `
                set_index,
                performed_reps,
                performed_load,
                performed_rir,
                performed_rpe,
                created_at
              `
              )
              .in("client_module_exercise_id", sameExerciseIds)
              .eq("created_by_user_id", currentUser.id)
              .order("created_at", { ascending: false })
              .limit(setCount);
            historyData = data;
          }

          // Get personal best — only for the same exercise
          let pbData: any[] | null = null;
          if (sameExerciseIds.length > 0) {
            const { data } = await supabase
              .from("exercise_set_logs")
              .select("performed_load, performed_reps, created_at")
              .in("client_module_exercise_id", sameExerciseIds)
              .eq("created_by_user_id", currentUser.id)
              .not("performed_load", "is", null)
              .order("performed_load", { ascending: false })
              .limit(1);
            pbData = data;
          }

          return {
            id: ex.id,
            exercise_id: ex.exercise_id,
            section: ex.section,
            sort_order: ex.sort_order,
            instructions: ex.instructions,
            prescription_snapshot_json: prescription,
            sets_json: setsJson || undefined,
            exercise: {
              name: ex.exercise_library?.name || "Unknown Exercise",
              default_video_url: ex.exercise_library?.default_video_url,
              primary_muscle: ex.exercise_library?.primary_muscle || "",
            },
            history:
              historyData && historyData.length > 0
                ? {
                    date: historyData[0].created_at,
                    sets: historyData.map((h) => ({
                      set_number: h.set_index,
                      weight: h.performed_load || 0,
                      reps: h.performed_reps || 0,
                      rir: h.performed_rir ?? undefined,
                      rpe: h.performed_rpe ?? undefined,
                    })),
                  }
                : undefined,
            personal_best:
              pbData && pbData.length > 0
                ? {
                    weight: pbData[0].performed_load!,
                    reps: pbData[0].performed_reps || 0,
                    date: pbData[0].created_at,
                  }
                : undefined,
          };
        })
      );

      setSetLogs(initialLogs);
      setModule({
        id: moduleData.id,
        title: moduleData.title,
        module_type: moduleData.module_type,
        status: moduleData.status,
        completed_at: moduleData.completed_at,
        module_owner_coach_id: moduleData.module_owner_coach_id,
        coach_name: coachData?.first_name || "Coach",
        exercises: formattedExercises,
      });

      // Auto-expand first incomplete exercise
      const firstIncomplete = formattedExercises.find((ex) => {
        const logs = initialLogs[ex.id];
        return logs && logs.some((l) => !l.completed);
      });
      if (firstIncomplete) {
        setExpandedExercise(firstIncomplete.id);
      }
    } catch (error: any) {
      console.error("Error loading session:", error);
      toast({
        title: "Error loading workout",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [moduleId, navigate, toast]);

  // hasFetched ref guard pattern to prevent infinite loops
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadSession();
  }, [loadSession]);

  // Update log
  const updateSetLog = (
    exerciseId: string,
    setIndex: number,
    field: keyof SetLog,
    value: any
  ) => {
    setSetLogs((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((log, i) =>
        i === setIndex ? { ...log, [field]: value } : log
      ),
    }));
  };

  // Complete a set (mark as done + start rest timer)
  const completeSet = (
    exerciseId: string,
    setIndex: number,
    restSeconds?: number
  ) => {
    setSetLogs((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((log, i) =>
        i === setIndex ? { ...log, completed: true } : log
      ),
    }));

    // Start rest timer if there's rest time and not the last set
    const exercise = module?.exercises.find((e) => e.id === exerciseId);
    const prescriptions =
      exercise?.sets_json ||
      exercise?.prescription_snapshot_json.sets_json ||
      legacyToPerSet(exercise?.prescription_snapshot_json || {});
    if (
      restSeconds &&
      restSeconds > 0 &&
      setIndex < prescriptions.length - 1
    ) {
      setRestTimer({ active: true, duration: restSeconds });
    }
  };

  // Save progress
  const saveProgress = async () => {
    if (!user || !module) return;

    setSubmitting(true);
    try {
      const allLogs: any[] = [];

      Object.entries(setLogs).forEach(([exerciseId, logs]) => {
        const exercise = module.exercises.find((e) => e.id === exerciseId);
        if (!exercise) return;

        logs.forEach((log) => {
          if (log.performed_reps !== null || log.performed_load !== null) {
            allLogs.push({
              client_module_exercise_id: exerciseId,
              set_index: log.set_index,
              prescribed: exercise.prescription_snapshot_json,
              performed_reps: log.performed_reps,
              performed_load: log.performed_load,
              performed_rir: log.performed_rir,
              performed_rpe: log.performed_rpe,
              notes: log.notes || null,
              created_by_user_id: user.id,
            });
          }
        });
      });

      for (const log of allLogs) {
        await supabase
          .from("exercise_set_logs")
          .upsert(log, {
            onConflict: "client_module_exercise_id,set_index",
          });
      }

      toast({
        title: "Progress saved",
        description: "Your workout data has been saved",
      });
    } catch (error: any) {
      toast({
        title: "Error saving",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Complete workout
  const completeWorkout = async () => {
    if (!module) return;

    setSubmitting(true);
    try {
      await saveProgress();

      await supabase
        .from("client_day_modules")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", module.id);

      toast({
        title: "Workout completed!",
        description: "Great job finishing your workout!",
      });

      navigate("/client/workout/calendar");
    } catch (error: any) {
      toast({
        title: "Error completing workout",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate progress
  const totalSets = Object.values(setLogs).flat().length;
  const completedSets = Object.values(setLogs)
    .flat()
    .filter((l) => l.completed).length;
  const progressPercent =
    totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

  // Loading state
  if (loading) {
    return (
      <>
        {/* Fix #2: Pass user and userRole props to Navigation */}
        <Navigation user={user} userRole="client" />
        <div className="container max-w-3xl mx-auto px-4 py-6 pt-20 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  }

  if (!module) {
    return (
      <>
        <Navigation user={user} userRole="client" />
        <div className="container max-w-3xl mx-auto px-4 py-6 pt-20">
          <Alert variant="destructive">
            <AlertDescription>Workout not found</AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation user={user} userRole="client" />
      <div className="min-h-screen bg-background pt-16">
        {/* Header */}
        <div className="sticky top-16 z-30 bg-background/95 backdrop-blur border-b">
          <div className="container max-w-3xl mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-lg truncate">{module.title}</h1>
                <p className="text-sm text-muted-foreground">
                  by {module.coach_name}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={saveProgress}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span className="ml-2 hidden sm:inline">Save</span>
              </Button>
            </div>

            {/* Progress bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {completedSets}/{totalSets} sets
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          </div>
        </div>

        {/* Exercise list */}
        <main className="container max-w-3xl mx-auto px-4 py-4 space-y-3 pb-28">
          {module.exercises.map((exercise, index) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              exerciseIndex={index}
              logs={setLogs[exercise.id] || []}
              onUpdateLog={(setIndex, field, value) =>
                updateSetLog(exercise.id, setIndex, field, value)
              }
              onCompleteSet={(setIndex, restSeconds) =>
                completeSet(exercise.id, setIndex, restSeconds)
              }
              isExpanded={expandedExercise === exercise.id}
              onToggle={() =>
                setExpandedExercise(
                  expandedExercise === exercise.id ? null : exercise.id
                )
              }
            />
          ))}
        </main>

        {/* Rest timer */}
        {restTimer.active && (
          <RestTimer
            duration={restTimer.duration}
            onComplete={() => setRestTimer({ active: false, duration: 0 })}
            onSkip={() => setRestTimer({ active: false, duration: 0 })}
          />
        )}

        {/* Complete workout button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
          <div className="container max-w-3xl mx-auto">
            <Button
              className="w-full h-12 text-base"
              onClick={completeWorkout}
              disabled={submitting || progressPercent < 100}
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-5 h-5 mr-2" />
              )}
              {progressPercent < 100
                ? `Complete ${totalSets - completedSets} more set${totalSets - completedSets !== 1 ? "s" : ""}`
                : "Complete Workout"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function WorkoutSessionV2() {
  return <WorkoutSessionV2Content />;
}
