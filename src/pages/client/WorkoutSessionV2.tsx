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
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/withTimeout";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerScrollArea,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
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
  ArrowRightLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { useProgressionSuggestions } from "@/hooks/useProgressionSuggestions";
import { ProgressionSuggestionBanner } from "@/components/workout/ProgressionSuggestionBanner";
import type { ProgressionConfig, ColumnConfig, ClientInputColumnType } from "@/types/workout-builder";
import {
  DEFAULT_PROGRESSION_CONFIG,
  splitColumnsByCategory,
  PERFORMED_JSON_COLUMN_TYPES,
} from "@/types/workout-builder";

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
  rest_seconds_max?: number;
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
    rest_seconds_max?: number;
    intensity_type?: string;
    intensity_value?: number;
    sets_json?: SetPrescription[];
    column_config?: ColumnConfig[];
    linear_progression_enabled?: boolean;
    progression_config?: ProgressionConfig;
  };
  // V2: Per-set prescriptions (if available)
  sets_json?: SetPrescription[];
  // Client-input columns the coach configured (drives which inputs the client
  // fills). is_activity = any non-core input column present → render the
  // dynamic activity grid instead of the strength Weight/Reps/RIR grid.
  input_columns: ColumnConfig[];
  is_activity: boolean;
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
  // Non-core performed metrics (time/distance/pace/hr/calories/side/rounds),
  // keyed by ClientInputColumnType → persisted to exercise_set_logs.performed_json.
  performed_extra: Record<string, string | number>;
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

// Client-input column types that render as free text rather than a number.
const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "performed_pace",
  "performed_side",
  "client_notes",
]);

// Per-Set Row with its own prescription.
// Strength items render the classic Weight / Reps / RIR-or-RPE grid unchanged.
// Activity items render inputs DYNAMICALLY from the coach-configured input columns.
function SetRow({
  prescription,
  historySet,
  log,
  onUpdate,
  onUpdateExtra,
  onComplete,
  isActive,
  inputColumns,
  isActivity,
}: {
  prescription: SetPrescription;
  historySet?: HistorySet;
  log: SetLog;
  onUpdate: (field: keyof SetLog, value: any) => void;
  onUpdateExtra: (key: string, value: string | number | null) => void;
  onComplete: () => void;
  isActive: boolean;
  inputColumns: ColumnConfig[];
  isActivity: boolean;
}) {
  const hasRir = prescription.rir !== undefined;
  const hasRpe = prescription.rpe !== undefined;
  const repsDisplay =
    prescription.reps ||
    (prescription.rep_range_min && prescription.rep_range_max
      ? `${prescription.rep_range_min}-${prescription.rep_range_max}`
      : "8-12");

  const visibleInputs = inputColumns.filter((c) => c.visible !== false);

  // Current logged value for an input column.
  const inputValue = (col: ColumnConfig): string | number => {
    switch (col.type as ClientInputColumnType) {
      case "performed_weight": return log.performed_load ?? "";
      case "performed_reps": return log.performed_reps ?? "";
      case "performed_rir": return log.performed_rir ?? "";
      case "performed_rpe": return log.performed_rpe ?? "";
      case "client_notes": return log.notes ?? "";
      default: return log.performed_extra[col.type] ?? "";
    }
  };

  // Route a column's raw value into the right SetLog field (core → typed
  // columns, everything else → performed_extra → performed_json).
  const updateInput = (col: ColumnConfig, raw: string) => {
    const type = col.type as ClientInputColumnType;
    const isText = TEXT_INPUT_TYPES.has(type);
    const val: string | number | null = raw === "" ? null : isText ? raw : Number(raw);
    switch (type) {
      case "performed_weight": onUpdate("performed_load", val); break;
      case "performed_reps": onUpdate("performed_reps", val); break;
      case "performed_rir": onUpdate("performed_rir", val); break;
      case "performed_rpe": onUpdate("performed_rpe", val); break;
      case "client_notes": onUpdate("notes", (val as string) ?? ""); break;
      default: onUpdateExtra(type, val); break;
    }
  };

  const colFilled = (col: ColumnConfig): boolean => {
    switch (col.type as ClientInputColumnType) {
      case "performed_weight": return log.performed_load != null;
      case "performed_reps": return log.performed_reps != null;
      case "performed_rir": return log.performed_rir != null;
      case "performed_rpe": return log.performed_rpe != null;
      case "client_notes": return !!log.notes;
      default: { const v = log.performed_extra[col.type]; return v != null && v !== ""; }
    }
  };

  // A non-rep "complete" affordance: an activity row is done once ANY of its
  // configured inputs has a value (strength keeps the weight+reps requirement).
  const isFilledOut = isActivity
    ? visibleInputs.some(colFilled)
    : log.performed_load !== null && log.performed_reps !== null;

  // Activity prescription badges (replace the rep/RIR/RPE badges).
  const activityBadges: string[] = [];
  if (isActivity) {
    if (prescription.time_seconds != null)
      activityBadges.push(
        prescription.time_seconds >= 60
          ? `${Math.round(prescription.time_seconds / 60)} min`
          : `${prescription.time_seconds}s`,
      );
    if (prescription.distance_meters != null)
      activityBadges.push(
        prescription.distance_meters >= 1000
          ? `${(prescription.distance_meters / 1000).toFixed(1)} km`
          : `${prescription.distance_meters} m`,
      );
    if (prescription.pace) activityBadges.push(String(prescription.pace));
    if (prescription.rounds != null) activityBadges.push(`${prescription.rounds} rounds`);
    if (prescription.target_hr != null) activityBadges.push(`${prescription.target_hr} bpm`);
  }

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
          {isActivity ? (
            activityBadges.length > 0 ? (
              activityBadges.map((b, i) => (
                <Badge key={i} variant={i === 0 ? "default" : "outline"} className="text-xs">
                  {b}
                </Badge>
              ))
            ) : (
              <Badge variant="default" className="text-xs">
                Log your effort
              </Badge>
            )
          ) : (
            <>
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
            </>
          )}
          {prescription.rest_seconds && prescription.rest_seconds > 0 && (
            <Badge variant="outline" className="text-xs">
              <Clock className="w-3 h-3 mr-1" />
              {prescription.rest_seconds_max && prescription.rest_seconds_max !== prescription.rest_seconds
                ? `${prescription.rest_seconds}-${prescription.rest_seconds_max}s`
                : `${prescription.rest_seconds}s`}
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
        {/* Previous hint (strength only — weight×reps) */}
        {historySet && !log.completed && !isActivity && (
          <div className="w-14 shrink-0 text-center hidden sm:block">
            <p className="text-[10px] text-muted-foreground">Last</p>
            <p className="text-xs text-muted-foreground font-mono">
              {historySet.weight}×{historySet.reps}
            </p>
          </div>
        )}

        {/* Inputs */}
        {isActivity ? (
          <div className="flex-1 grid grid-cols-2 gap-2">
            {visibleInputs.map((col) => {
              const isText = TEXT_INPUT_TYPES.has(col.type);
              return (
                <div key={col.id}>
                  <label className="text-[10px] text-muted-foreground block mb-1">
                    {col.label}
                    {col.unit ? ` (${col.unit})` : ""}
                  </label>
                  <Input
                    type={isText ? "text" : "number"}
                    inputMode={isText ? "text" : "decimal"}
                    placeholder={col.placeholder || "—"}
                    value={inputValue(col)}
                    onChange={(e) => updateInput(col, e.target.value)}
                    disabled={log.completed}
                    className="h-10 text-center"
                  />
                </div>
              );
            })}
          </div>
        ) : (
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
        )}

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
  onUpdateLogExtra,
  onCompleteSet,
  onSwapExercise,
  isExpanded,
  onToggle,
  activeSuggestionForSet,
  onDismissSuggestion,
}: {
  exercise: Exercise;
  exerciseIndex: number;
  logs: SetLog[];
  onUpdateLog: (setIndex: number, field: keyof SetLog, value: any) => void;
  onUpdateLogExtra: (setIndex: number, key: string, value: string | number | null) => void;
  onCompleteSet: (setIndex: number, restSeconds?: number) => void;
  onSwapExercise: () => void;
  isExpanded: boolean;
  onToggle: () => void;
  activeSuggestionForSet: Map<number, { id: string; type: string; text: string }>;
  onDismissSuggestion: (suggestionId: string) => void;
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
                    {completedSets}/{totalSets}{" "}
                    {exercise.is_activity ? (totalSets > 1 ? "rounds" : "entry") : "sets"}
                  </span>
                  {exercise.personal_best && (
                    <span className="text-xs text-amber-500 flex items-center gap-1">
                      <Trophy className="w-3 h-3" />
                      {exercise.personal_best.weight}kg
                    </span>
                  )}
                </div>
              </div>

              {/* Swap + Expand */}
              <div className="flex items-center gap-1 shrink-0">
                {!isComplete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSwapExercise();
                    }}
                    title="Swap Exercise"
                  >
                    <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
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
              {prescriptions.map((prescription, i) => {
                const suggestion = activeSuggestionForSet.get(i + 1);
                return (
                  <div key={i} className="space-y-1">
                    <SetRow
                      prescription={prescription}
                      historySet={exercise.history?.sets[i]}
                      log={
                        logs[i] || {
                          set_index: i + 1,
                          performed_reps: null,
                          performed_load: null,
                          performed_rir: null,
                          performed_rpe: null,
                          performed_extra: {},
                          notes: "",
                          completed: false,
                        }
                      }
                      onUpdate={(field, value) => onUpdateLog(i, field, value)}
                      onUpdateExtra={(key, value) => onUpdateLogExtra(i, key, value)}
                      onComplete={() =>
                        onCompleteSet(i, prescription.rest_seconds)
                      }
                      isActive={activeSetIndex === i}
                      inputColumns={exercise.input_columns}
                      isActivity={exercise.is_activity}
                    />
                    {suggestion && (
                      <ProgressionSuggestionBanner
                        suggestionType={suggestion.type as any}
                        suggestionText={suggestion.text}
                        onDismiss={() => onDismissSuggestion(suggestion.id)}
                      />
                    )}
                  </div>
                );
              })}
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

// Swap Exercise Picker - shown as a modal overlay
function SwapExercisePicker({
  currentExercise,
  onSelect,
  onClose,
}: {
  currentExercise?: Exercise;
  onSelect: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const [exercises, setExercises] = useState<
    { id: string; name: string; primary_muscle: string; equipment: string | null }[]
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("exercise_library")
        .select("id, name, primary_muscle, equipment")
        .eq("is_active", true)
        .eq("is_global", true)
        .order("name");
      setExercises(data || []);
      setLoading(false);
    };
    load();
  }, []);

  // Filter: prioritize same muscle group, then allow all
  const filtered = exercises.filter((ex) => {
    if (currentExercise && ex.id === currentExercise.exercise_id) return false;
    if (!searchQuery) return true;
    return (
      ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.primary_muscle.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Sort: same muscle group first
  const sorted = [...filtered].sort((a, b) => {
    const currentMuscle = currentExercise?.exercise.primary_muscle || "";
    const aMatch = a.primary_muscle === currentMuscle ? 0 : 1;
    const bMatch = b.primary_muscle === currentMuscle ? 0 : 1;
    return aMatch - bMatch || a.name.localeCompare(b.name);
  });

  // Shared search box + scrollable results, reused by both the mobile Drawer
  // and the desktop overlay so the list markup lives in one place.
  const searchAndList = (
    <>
      <div className="p-4 border-b">
        <Input
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          // No autofocus on mobile: focusing on mount opens the keyboard, which
          // resizes the visual viewport and makes the bottom sheet drift and
          // clip its title. Desktop keeps autofocus for fast typing.
          autoFocus={!isMobile}
        />
      </div>
      <DrawerScrollArea className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {searchQuery
              ? `No exercises found matching "${searchQuery}"`
              : "No exercises found"}
          </p>
        ) : (
          <div className="divide-y">
            {sorted.map((ex) => (
              <button
                key={ex.id}
                onClick={() => onSelect(ex.id)}
                className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <p className="font-medium text-sm">{ex.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ex.primary_muscle}
                  {ex.equipment && ` \u2022 ${ex.equipment}`}
                </p>
              </button>
            ))}
          </div>
        )}
      </DrawerScrollArea>
    </>
  );

  // Mobile: vaul Drawer. Safe-area aware + dvh-bounded so the sheet stays put
  // and the title never clips off-screen (CLAUDE.md "Mobile branching").
  if (isMobile) {
    return (
      <Drawer open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DrawerContent className="max-h-[92dvh] flex flex-col">
          <div className="px-4 pt-2 pb-1">
            <DrawerTitle>Swap Exercise</DrawerTitle>
            {currentExercise && (
              <DrawerDescription>
                Replace {currentExercise.exercise.name}
              </DrawerDescription>
            )}
          </div>
          <div className="flex flex-col min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">
            {searchAndList}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: centered modal overlay.
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="bg-background w-full max-w-lg max-h-[80vh] rounded-2xl flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Swap Exercise</h3>
            {currentExercise && (
              <p className="text-sm text-muted-foreground">
                Replace {currentExercise.exercise.name}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        {searchAndList}
      </div>
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
  const queryClient = useQueryClient();

  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [setLogs, setSetLogs] = useState<Record<string, SetLog[]>>({});
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  // `token` increments each time a fresh timer starts so <RestTimer> remounts
  // via its `key` prop and the internal countdown resets. Without it, a second
  // completeSet while the previous timer is still running keeps the stale
  // `remaining` state (React doesn't re-run useState(duration) on prop change).
  const [restTimer, setRestTimer] = useState<{
    active: boolean;
    duration: number;
    token: number;
  }>({
    active: false,
    duration: 0,
    token: 0,
  });
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null);
  const [showSwapPicker, setShowSwapPicker] = useState(false);

  const hasFetched = useRef(false);
  const setLogsRef = useRef(setLogs);
  setLogsRef.current = setLogs;

  // Progression suggestions
  const {
    evaluate: evaluateProgression,
    logResponse: logProgressionResponse,
    activeSuggestions,
  } = useProgressionSuggestions();

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
      } = await withTimeout(supabase.auth.getUser(), 8000);
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
        .maybeSingle();

      if (moduleError) throw moduleError;
      if (!moduleData) {
        toast({ title: "Workout not found", description: "This workout session may have been removed or is no longer available.", variant: "destructive" });
        navigate("/client/workout/calendar");
        return;
      }

      // Use the get_coach_for_client RPC, not the coaches_client_safe view.
      // The view inherits RLS from `coaches` which denies client SELECT, so
      // queries against the view return NULL for clients and the title fell
      // back to "by Coach" (smoke-tested 2026-05-17). The RPC is SECURITY
      // DEFINER and returns the same 8-column safe subset gated on
      // is_primary_coach_for_user / is_care_team_member_for_client.
      const { data: coachJson } = await supabase.rpc("get_coach_for_client", {
        p_coach_user_id: moduleData.module_owner_coach_id,
      });
      const coachData = coachJson as { first_name?: string } | null;

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

          // Client-input columns the coach configured (snapshotted into
          // prescription_snapshot_json.column_config by assign_program). The
          // input half drives which fields the client fills; presence of any
          // non-core input type flags this as an activity (dynamic inputs).
          const allColumns: ColumnConfig[] = Array.isArray((prescription as any).column_config)
            ? ((prescription as any).column_config as ColumnConfig[])
            : [];
          const { inputColumns } = splitColumnsByCategory(allColumns);
          const isActivity = inputColumns.some((c) =>
            PERFORMED_JSON_COLUMN_TYPES.has(c.type as ClientInputColumnType)
          );

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
            const existingExtra =
              (existing?.performed_json as Record<string, string | number> | null) ?? {};
            return {
              set_index: i + 1,
              performed_reps: existing?.performed_reps ?? null,
              performed_load: existing?.performed_load ?? null,
              performed_rir: existing?.performed_rir ?? null,
              performed_rpe: existing?.performed_rpe ?? null,
              performed_extra: existingExtra,
              notes: existing?.notes || "",
              completed: existing
                ? existing.performed_reps !== null ||
                  existing.performed_load !== null ||
                  Object.keys(existingExtra).length > 0
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

          // Get last performance (history) — only for the same exercise.
          // Skip for activities: history/PB are weight×reps-centric and those
          // columns are null for activity rows (the data lives in performed_json).
          let historyData: any[] | null = null;
          if (!isActivity && sameExerciseIds.length > 0) {
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

          // Get personal best — only for the same exercise (strength only).
          let pbData: any[] | null = null;
          if (!isActivity && sameExerciseIds.length > 0) {
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
            input_columns: inputColumns,
            is_activity: isActivity,
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
        description: sanitizeErrorForUser(error),
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

  // Update a non-core performed metric (performed_json blob) for one set.
  const updateSetExtra = (
    exerciseId: string,
    setIndex: number,
    key: string,
    value: string | number | null
  ) => {
    setSetLogs((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((log, i) => {
        if (i !== setIndex) return log;
        const next = { ...log.performed_extra };
        if (value === null || value === "") delete next[key];
        else next[key] = value;
        return { ...log, performed_extra: next };
      }),
    }));
  };

  // Complete a set (mark as done + PERSIST IMMEDIATELY + start rest timer +
  // evaluate progression).
  //
  // Previously this only toggled local `completed: true` state. The DB write
  // was deferred to the top-bar Save or Complete Workout buttons, so
  // navigating away between a check-click and a Save-click lost the log.
  // Now every check writes its single set via upsert with visible error
  // feedback — the top-bar Save remains for batch/notes flushes.
  const completeSet = async (
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

    // Per-set upsert — write-through so closing the tab never loses this set.
    const exerciseForSave = module?.exercises.find((e) => e.id === exerciseId);
    const logForSave = setLogsRef.current[exerciseId]?.[setIndex];
    if (user && exerciseForSave && logForSave) {
      const { error } = await supabase
        .from("exercise_set_logs")
        .upsert(
          {
            client_module_exercise_id: exerciseId,
            set_index: logForSave.set_index,
            prescribed: exerciseForSave.prescription_snapshot_json,
            performed_reps: logForSave.performed_reps,
            performed_load: logForSave.performed_load,
            performed_rir: logForSave.performed_rir,
            performed_rpe: logForSave.performed_rpe,
            performed_json: logForSave.performed_extra ?? {},
            notes: logForSave.notes || null,
            created_by_user_id: user.id,
          },
          { onConflict: "client_module_exercise_id,set_index" },
        );
      if (error) {
        // Revert the local "completed" flag so the coach/client isn't misled
        // about a set that didn't actually save.
        setSetLogs((prev) => ({
          ...prev,
          [exerciseId]: prev[exerciseId].map((log, i) =>
            i === setIndex ? { ...log, completed: false } : log
          ),
        }));
        toast({
          title: "Set didn't save",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
        return;
      }
    }

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
      setRestTimer((prev) => ({
        active: true,
        duration: restSeconds,
        token: prev.token + 1,
      }));
    }

    // Evaluate progression suggestion if enabled
    if (exercise && user) {
      const snapshot = exercise.prescription_snapshot_json;
      if (snapshot.linear_progression_enabled) {
        const config: ProgressionConfig =
          snapshot.progression_config ?? DEFAULT_PROGRESSION_CONFIG;
        const prescription = prescriptions[setIndex];
        const log = setLogsRef.current[exerciseId]?.[setIndex];

        if (log && log.performed_reps !== null && log.performed_load !== null) {
          evaluateProgression(
            {
              set_number: setIndex + 1,
              prescribed_weight: prescription?.weight_suggestion
                ? parseFloat(prescription.weight_suggestion)
                : null,
              prescribed_rep_min: prescription?.rep_range_min ?? null,
              prescribed_rep_max: prescription?.rep_range_max ?? null,
              prescribed_rir: prescription?.rir ?? null,
              performed_weight: log.performed_load,
              performed_reps: log.performed_reps,
              performed_rir: log.performed_rir,
              performed_rpe: log.performed_rpe,
            },
            config,
            {
              clientId: user.id,
              clientModuleExerciseId: exerciseId,
              exerciseLibraryId: exercise.exercise_id,
              sessionDate: new Date().toISOString().split("T")[0],
            }
          );
        }
      }
    }
  };

  // Swap exercise
  const swapExercise = async (newExerciseId: string) => {
    if (!swapExerciseId || !module) return;

    try {
      // Get new exercise info. .maybeSingle() so a row that's been deleted
      // from the library since the picker rendered surfaces as null rather
      // than a thrown PostgREST 406 — CLAUDE.md ".maybeSingle() vs .single()" rule.
      const { data: newExLib, error: exError } = await supabase
        .from("exercise_library")
        .select("name, primary_muscle, default_video_url")
        .eq("id", newExerciseId)
        .maybeSingle();

      if (exError) throw exError;
      if (!newExLib) {
        toast({
          title: "Exercise not found",
          description: "It may have been removed from the library. Pick a different one.",
          variant: "destructive",
        });
        return;
      }

      // Update the client_module_exercises record to point to new exercise
      const { error: updateError } = await supabase
        .from("client_module_exercises")
        .update({ exercise_id: newExerciseId })
        .eq("id", swapExerciseId);

      if (updateError) throw updateError;

      // Update local state
      const updatedExercises = module.exercises.map((ex) => {
        if (ex.id !== swapExerciseId) return ex;
        return {
          ...ex,
          exercise_id: newExerciseId,
          exercise: {
            name: newExLib.name,
            primary_muscle: newExLib.primary_muscle,
            default_video_url: newExLib.default_video_url,
          },
          history: undefined,
          personal_best: undefined,
        };
      });

      setModule({ ...module, exercises: updatedExercises });

      // Reset logs for the swapped exercise (fresh start)
      const oldLogs = setLogs[swapExerciseId] || [];
      setSetLogs((prev) => ({
        ...prev,
        [swapExerciseId]: oldLogs.map((log) => ({
          ...log,
          performed_reps: null,
          performed_load: null,
          performed_rir: null,
          performed_rpe: null,
          notes: "",
          completed: false,
        })),
      }));

      toast({
        title: "Exercise swapped",
        description: `Switched to ${newExLib.name}`,
      });
    } catch (error: any) {
      toast({
        title: "Error swapping exercise",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSwapExerciseId(null);
      setShowSwapPicker(false);
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
          const hasExtra = Object.keys(log.performed_extra || {}).length > 0;
          if (log.performed_reps !== null || log.performed_load !== null || hasExtra) {
            allLogs.push({
              client_module_exercise_id: exerciseId,
              set_index: log.set_index,
              prescribed: exercise.prescription_snapshot_json,
              performed_reps: log.performed_reps,
              performed_load: log.performed_load,
              performed_rir: log.performed_rir,
              performed_rpe: log.performed_rpe,
              performed_json: log.performed_extra ?? {},
              notes: log.notes || null,
              created_by_user_id: user.id,
            });
          }
        });
      });

      // Per CLAUDE.md: always destructure { error } on supabase mutations.
      // The prior version silently dropped RLS/constraint failures and let the
      // session runner render a "Progress saved" toast when nothing persisted.
      //
      // Parallel fan-out via Promise.allSettled (CLAUDE.md "Parallelize Supabase
      // calls in loops" rule). Each upsert resolves rather than rejects on RLS
      // denial — its error lives on .value.error, not in a rejection — so we
      // tally both rejected promises AND fulfilled-with-error results.
      const results = await Promise.allSettled(
        allLogs.map((log) =>
          supabase.from("exercise_set_logs").upsert(log, {
            onConflict: "client_module_exercise_id,set_index",
          }),
        ),
      );

      const failures: unknown[] = [];
      for (const r of results) {
        if (r.status === "rejected") {
          failures.push(r.reason);
        } else if (r.value.error) {
          failures.push(r.value.error);
        }
      }

      if (failures.length > 0) {
        // Surface the first failure through the existing catch handler so the
        // toast + sanitizeErrorForUser flow renders unchanged. Binary UX
        // (success | error) preserved per the original behavior.
        throw failures[0];
      }

      toast({
        title: "Progress saved",
        description: "Your workout data has been saved",
      });
    } catch (error: unknown) {
      toast({
        title: "Error saving",
        description: sanitizeErrorForUser(error),
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

      // PR #131: clients have NO RLS UPDATE path on client_day_modules. The
      // "client_day_modules_update" policy only grants
      // ( is_admin(auth.uid()) OR module_owner_coach_id = auth.uid() ), so a
      // direct .update() by the client silently no-ops (0 rows, status stuck on
      // 'scheduled'). Route completion through the complete_client_day_module
      // SECURITY DEFINER RPC, which authorises the caller itself (client /
      // owning coach / admin / service_role) and raises explicitly on failure.
      // PR #117's rows-affected check was the safety net that detected this
      // gap; this RPC is the structural fix. The RPC is idempotent on
      // re-completion and raises 42501 (not authorised) / 42704 (not found),
      // so its return payload isn't needed here.
      const { error: completeErr } = await supabase.rpc(
        "complete_client_day_module",
        { p_module_id: module.id }
      );

      if (completeErr) {
        // 42501 = not authorised -> keep PR #117's "expired" UX (still
        // accurate: the set logs were already persisted by saveProgress()
        // above). Any other code (e.g. 42704 module not found) is a real error.
        if ((completeErr as { code?: string }).code === "42501") {
          toast({
            title: "Couldn't mark complete",
            description:
              "Your session may have expired -- please refresh and try again. Your set logs are saved.",
            variant: "destructive",
          });
          return;
        }
        throw completeErr;
      }

      // Invalidate client-side workout views so TodaysWorkoutHero and
      // WorkoutCalendar refresh within ~1s of return without manual refresh.
      // Partial-key form clears both 'today' and 'month' (any month) in one call.
      if (user) {
        await queryClient.invalidateQueries({
          queryKey: ["client-workouts", user.id],
        });
      }

      toast({
        title: "Workout completed!",
        description: "Great job finishing your workout!",
      });

      navigate("/client/workout/calendar");
    } catch (error: any) {
      toast({
        title: "Error completing workout",
        description: sanitizeErrorForUser(error),
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
          {module.exercises.map((exercise, index) => {
            // Build a map of active suggestions for this exercise (setNumber → suggestion)
            const suggestionsForExercise = new Map<
              number,
              { id: string; type: string; text: string }
            >();
            for (const s of activeSuggestions) {
              if (s.exerciseId === exercise.id) {
                suggestionsForExercise.set(s.setNumber, {
                  id: s.id,
                  type: s.result.type,
                  text: s.result.text,
                });
              }
            }

            return (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                exerciseIndex={index}
                logs={setLogs[exercise.id] || []}
                onUpdateLog={(setIndex, field, value) =>
                  updateSetLog(exercise.id, setIndex, field, value)
                }
                onUpdateLogExtra={(setIndex, key, value) =>
                  updateSetExtra(exercise.id, setIndex, key, value)
                }
                onCompleteSet={(setIndex, restSeconds) =>
                  completeSet(exercise.id, setIndex, restSeconds)
                }
                onSwapExercise={() => {
                  setSwapExerciseId(exercise.id);
                  setShowSwapPicker(true);
                }}
                isExpanded={expandedExercise === exercise.id}
                onToggle={() =>
                  setExpandedExercise(
                    expandedExercise === exercise.id ? null : exercise.id
                  )
                }
                activeSuggestionForSet={suggestionsForExercise}
                onDismissSuggestion={(id) =>
                  logProgressionResponse(id, "dismissed")
                }
              />
            );
          })}
        </main>

        {/* Rest timer */}
        {restTimer.active && (
          <RestTimer
            key={restTimer.token}
            duration={restTimer.duration}
            onComplete={() =>
              setRestTimer((prev) => ({ active: false, duration: 0, token: prev.token }))
            }
            onSkip={() =>
              setRestTimer((prev) => ({ active: false, duration: 0, token: prev.token }))
            }
          />
        )}

        {/* Exercise Swap Picker */}
        {showSwapPicker && (
          <SwapExercisePicker
            currentExercise={module.exercises.find((e) => e.id === swapExerciseId)}
            onSelect={(newExerciseId) => swapExercise(newExerciseId)}
            onClose={() => {
              setShowSwapPicker(false);
              setSwapExerciseId(null);
            }}
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
