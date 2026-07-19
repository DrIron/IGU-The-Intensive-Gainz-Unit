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
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/withTimeout";
import { selectWithRetry } from "@/lib/selectWithRetry";
import { captureException } from "@/lib/errorLogging";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  SkipForward,
  List,
  Lock,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { cn } from "@/lib/utils";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { useProgressionSuggestions } from "@/hooks/useProgressionSuggestions";
import { ProgressionSuggestionBanner } from "@/components/workout/ProgressionSuggestionBanner";
import { getYouTubeId, getYouTubeThumbnail } from "@/lib/youtube";
import { ExerciseDemoCard } from "@/components/exercise/ExerciseDemoCard";
import type { ProgressionConfig, ColumnConfig, ClientInputColumnType } from "@/types/workout-builder";
import {
  DEFAULT_PROGRESSION_CONFIG,
  splitColumnsByCategory,
  PERFORMED_JSON_COLUMN_TYPES,
} from "@/types/workout-builder";
import { fromCanonicalKg, toCanonicalKg, type WeightUnit } from "@/utils/weightUnits";
import { resolveCanonicalSession, loadCrossInstanceHistory } from "@/lib/canonicalSessionResolver";
import type { Json } from "@/integrations/supabase/types";
import type { SetBranch as SetBranchT } from "@/types/workout-builder";
import {
  isBackoffSet,
  computeBackoffWeight,
  dropBranches,
  computeDropWeight,
  backoffBadgeLabel,
  dropBadgeLabel,
  restRepeatBranch,
  restPauseMaxRounds,
  restPauseRoundKey,
  restPauseRoundNumbers,
  restPauseBadgeLabel,
} from "@/lib/setInstructions";
import { useWeightUnit } from "@/hooks/useWeightUnit";
import { ClickableCard } from "@/components/ui/clickable-card";
import { SessionProgressRing } from "@/components/workout/SessionProgressRing";
import { WeightUnitToggle } from "@/components/workout/WeightUnitToggle";
import {
  WorkoutCompletionSheet,
  type WorkoutSummary,
} from "@/components/workout/WorkoutCompletionSheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  weight?: number; // fixed prescribed weight (kg), if the coach pinned one
  notes?: string;
  // Per-set instruction family (resolved by the canonical logger — see setInstructions.ts).
  amrap?: boolean;
  weight_mode?: "absolute" | "backoff";
  backoff?: { ref_set_index: number; basis: "percent" | "drop"; value: number; rounding?: number };
  branches?: SetBranchT[];
}

/** Exported for unit tests. */
export interface HistorySet {
  set_number: number;
  weight: number;
  reps: number;
  rir?: number;
  rpe?: number;
}

/** Exported for unit tests. */
export interface Exercise {
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
    client_name: string | null;
    default_video_url: string | null;
    // Canonical muscle FKs — the demo card resolves muscle_id → display_name (primary_muscle text
    // is NULL for canonical rows). subdivision_id qualifies the primary chip.
    muscle_id: string | null;
    subdivision_id: string | null;
    primary_muscle: string;
    // Form-guide content (exercise_library) shown in the in-session demo card.
    description: string | null;
    setup_instructions: string | null;
    setup_points: string[] | null;
    equipment: string | null;
    secondary_muscles: string[] | null;
    laterality: string | null;
    resistance_profiles: string[] | null;
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
  // PR reference data, derived from ALL prior logs of this movement (canonical
  // kg). Stable for the session (computed once at load). Drives the three PR
  // types: heaviest-ever, heaviest-at-a-rep-count, and "got easier" (same
  // load×reps at a higher RIR than before).
  pr_refs?: {
    bestAbsolute: number;
    bestByReps: Record<number, number>;
    bestRirByLoadReps: Record<string, number>;
  };
  // Coach-recorded skip (client_module_exercises.skipped) — distinct from
  // incomplete; a skipped exercise drops out of the remaining tally.
  skipped?: boolean;
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
  // exercise_set_logs.skipped — a skipped set is a row with skipped=true and
  // null performed_* values; counts as addressed but renders neutral, not done.
  skipped: boolean;
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
  onOpenGuide,
}: {
  url: string | null;
  name: string;
  // When set, tapping the thumbnail opens the full Form & demo sheet instead
  // of the bare video modal (so video + setup/execution live in one place).
  onOpenGuide?: () => void;
}) {
  const [showVideo, setShowVideo] = useState(false);
  const thumbnail = getYouTubeThumbnail(url);
  const videoId = getYouTubeId(url);

  if (!url) {
    const placeholder = (
      <div className="w-16 h-12 md:w-20 md:h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Dumbbell className="w-4 h-4 text-muted-foreground" />
      </div>
    );
    return onOpenGuide ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpenGuide(); }}
        aria-label={`${name} form guide`}
        className="shrink-0"
      >
        {placeholder}
      </button>
    ) : (
      placeholder
    );
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onOpenGuide) onOpenGuide();
          else setShowVideo(true);
        }}
        aria-label={`${name} form guide`}
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


// Client-input column types that render as free text rather than a number.
const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "performed_pace",
  "performed_side",
  "client_notes",
]);

// Per-Set Row with its own prescription.
// Strength items render the classic Weight / Reps / RIR-or-RPE grid unchanged.
// Activity items render inputs DYNAMICALLY from the coach-configured input columns.
// A set is a PR if it beats any of three records vs the movement's prior
// history: heaviest load ever, heaviest at this rep count (±1), or same
// load×reps at a higher RIR than before ("got easier"). All loads canonical kg.
function detectSetPr(
  refs: Exercise["pr_refs"] | undefined,
  load: number | null,
  reps: number | null,
  rir: number | null,
): boolean {
  if (!refs || load == null) return false;
  if (load > refs.bestAbsolute) return true;
  if (reps != null) {
    let bestAtReps = 0;
    for (let r = reps - 1; r <= reps + 1; r++) bestAtReps = Math.max(bestAtReps, refs.bestByReps[r] ?? 0);
    if (bestAtReps > 0 && load > bestAtReps) return true;
    if (rir != null) {
      const prior = refs.bestRirByLoadReps[`${load}:${reps}`];
      if (prior != null && rir > prior) return true;
    }
  }
  return false;
}

// Heaviest historical load within ±1 of the target reps — the rep-range record
// surfaced in the exercise header.
function bestInRepWindow(refs: Exercise["pr_refs"] | undefined, targetReps: number | null): number | null {
  if (!refs || targetReps == null) return null;
  let best = 0;
  for (let r = targetReps - 1; r <= targetReps + 1; r++) best = Math.max(best, refs.bestByReps[r] ?? 0);
  return best > 0 ? best : null;
}

// Which PR a set earned, for the summary label (most impressive first). Returns
// null when the set beat no record.
function classifySetPr(
  refs: Exercise["pr_refs"] | undefined,
  load: number | null,
  reps: number | null,
  rir: number | null,
): "heaviest" | "rep_range" | "easier" | null {
  if (!refs || load == null) return null;
  if (load > refs.bestAbsolute) return "heaviest";
  if (reps != null) {
    let bestAtReps = 0;
    for (let r = reps - 1; r <= reps + 1; r++) bestAtReps = Math.max(bestAtReps, refs.bestByReps[r] ?? 0);
    if (bestAtReps > 0 && load > bestAtReps) return "rep_range";
    if (rir != null) {
      const prior = refs.bestRirByLoadReps[`${load}:${reps}`];
      if (prior != null && rir > prior) return "easier";
    }
  }
  return null;
}

function SetRow({
  prescription,
  historySet,
  log,
  onUpdate,
  onUpdateExtra,
  onComplete,
  onSkip,
  isActive,
  inputColumns,
  isActivity,
  unit,
  isPr,
  amrap,
  prefillWeightKg,
  instructionBadges,
  restPause,
}: {
  prescription: SetPrescription;
  historySet?: HistorySet;
  log: SetLog;
  onUpdate: (field: keyof SetLog, value: any) => void;
  onUpdateExtra: (key: string, value: string | number | null) => void;
  onComplete: () => void;
  onSkip: () => void;
  isActive: boolean;
  inputColumns: ColumnConfig[];
  isActivity: boolean;
  unit: WeightUnit;
  isPr?: boolean;
  // Set-instruction resolution (canonical authored data only; absent => inert for legacy).
  amrap?: boolean;
  prefillWeightKg?: number | null;
  instructionBadges?: string[];
  restPause?: { restSeconds: number; maxRounds: number | null } | null;
}) {
  // A completed set collapses to one line; tapping expands the editable inputs
  // again (persisted values stay until re-saved). Weights display in `unit`;
  // storage stays canonical kg.
  const [reopened, setReopened] = useState(false);
  const hasRir = prescription.rir !== undefined;
  const hasRpe = prescription.rpe !== undefined;
  const repsDisplay =
    prescription.reps ||
    (prescription.rep_range_min && prescription.rep_range_max
      ? `${prescription.rep_range_min}-${prescription.rep_range_max}`
      : "8-12");

  const visibleInputs = inputColumns.filter((c) => c.visible !== false);

  // Rest-pause repeat rounds (round 1 = the main set). Generated LAZILY — only once the main set
  // is logged — and always bounded (restPauseRoundNumbers clamps). Reps live in performed_json
  // under restPauseRoundKey(n); no extra log rows (keying stays set_index-based).
  const mainSetLogged = log.performed_reps != null || log.completed;
  const restPauseRounds: number[] =
    restPause && mainSetLogged ? restPauseRoundNumbers(restPause.maxRounds, log.performed_extra) : [];

  // Rest-pause round footer — rendered in BOTH the completed (collapsed) and active branches, so
  // logging the main set surfaces the to-failure rounds (the completed-set early return otherwise
  // skips it). Reps persist in performed_json under restPauseRoundKey(n) (no extra log rows).
  const restPauseFooter =
    restPauseRounds.length > 0 ? (
      <div className="px-3 py-2 border-t bg-amber-500/5 rounded-b-xl">
        <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 mb-1.5">
          Rest-pause · {restPause?.restSeconds ?? 0}s rest · same weight, reps to failure
        </p>
        <div className="flex flex-wrap gap-2">
          {restPauseRounds.map((n) => (
            <div key={n} className="flex flex-col">
              <label className="text-[9px] text-muted-foreground mb-0.5">Round {n}</label>
              <Input
                type="number"
                inputMode="numeric"
                value={(log.performed_extra[restPauseRoundKey(n)] as number | string | undefined) ?? ""}
                onChange={(e) => onUpdateExtra(restPauseRoundKey(n), e.target.value ? parseInt(e.target.value) : null)}
                className="h-9 w-16 text-center text-sm"
                placeholder="reps"
              />
            </div>
          ))}
        </div>
      </div>
    ) : null;

  // Current logged value for an input column.
  const inputValue = (col: ColumnConfig): string | number => {
    switch (col.type as ClientInputColumnType) {
      case "performed_weight": return fromCanonicalKg(log.performed_load, unit, unit === "kg" ? 1 : 0) ?? "";
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
      case "performed_weight": onUpdate("performed_load", toCanonicalKg(val === null ? null : Number(val), unit)); break;
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

  // Skipped → neutral line (§5), distinct from completed; Undo to un-skip.
  if (log.skipped) {
    return (
      <div className="rounded-xl border border-status-neutral/30 bg-status-neutral/10 px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
            <SkipForward className="w-3.5 h-3.5" />
          </span>
          <span className="truncate">Set {prescription.set_number} · Skipped</span>
        </span>
        <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={onSkip}>
          Undo
        </Button>
      </div>
    );
  }

  // Completed → one-line summary (§2c); tap to re-open the inputs.
  if (log.completed && !reopened) {
    const wDisplay = fromCanonicalKg(log.performed_load, unit, unit === "kg" ? 1 : 0);
    const intensity =
      log.performed_rpe != null
        ? ` @ RPE ${log.performed_rpe}`
        : log.performed_rir != null
          ? ` @ RIR ${log.performed_rir}`
          : "";
    return (
      <div className="rounded-xl border border-status-ontrack/30 bg-status-ontrack/5">
      <button
        type="button"
        onClick={() => setReopened(true)}
        aria-label={`Set ${prescription.set_number} logged — tap to edit`}
        className="w-full px-3 py-2.5 min-h-[44px] flex items-center justify-between gap-2 text-left touch-manipulation"
      >
        <span className="text-sm flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-full bg-status-ontrack text-white flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </span>
          <span className="font-medium shrink-0">Set {prescription.set_number}</span>
          {!isActivity && (
            <span className="font-mono text-muted-foreground truncate">
              {wDisplay ?? "—"}
              {unit}×{log.performed_reps ?? "—"}
              {intensity}
            </span>
          )}
          {isPr && (
            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              <Trophy className="w-2.5 h-2.5" aria-hidden="true" /> PR
            </span>
          )}
        </span>
        {/* Lock signals "done" — still tappable to fix a mis-log. */}
        <Lock className="w-3.5 h-3.5 text-status-ontrack shrink-0" aria-hidden="true" />
      </button>
      {restPauseFooter}
      </div>
    );
  }

  // Active (dominant) or upcoming (dimmed). Completed+reopened lands here too.
  return (
    <div
      className={cn(
        "rounded-xl border transition-all",
        isActive
          ? "bg-primary/5 border-primary/30 border-l-2 border-l-status-ontrack"
          : "bg-card border-border",
        !isActive && "opacity-60"
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
              {/* AMRAP suppresses the rep-range target — the client logs reps freely. */}
              <Badge variant="default" className="text-xs">
                {amrap ? "AMRAP" : `${repsDisplay} reps`}
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
              {/* Set instructions (back-off / drop), amber. */}
              {(instructionBadges ?? []).map((b, i) => (
                <Badge
                  key={`instr-${i}`}
                  variant="outline"
                  className="text-xs border-amber-500/50 text-amber-700 dark:text-amber-400"
                >
                  {b}
                </Badge>
              ))}
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

        <div className="flex items-center gap-2 shrink-0">
          {prescription.weight_suggestion && (
            <span className="text-xs text-amber-600 dark:text-amber-400 italic">
              {prescription.weight_suggestion}
            </span>
          )}
        </div>
      </div>

      {/* Input row (WK4: ghost placeholders + fixed-height "last" captions so
          inputs stay aligned; WK1: 44px targets). Activity keeps its 2-col grid. */}
      {isActivity ? (
        <div className="px-3 py-2.5 flex items-end gap-2">
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
                    className="h-11 text-center text-base"
                  />
                </div>
              );
            })}
          </div>
          <Button
            variant={isFilledOut ? "default" : "outline"}
            size="icon"
            onClick={() => { setReopened(false); onComplete(); }}
            disabled={!isFilledOut}
            aria-label="Complete set"
            className="h-11 w-11 shrink-0"
          >
            <CheckCircle2 className="w-5 h-5" />
          </Button>
        </div>
      ) : (
        <div className="px-3 py-2.5 flex items-start gap-2">
          <div className="flex-1 grid grid-cols-3 gap-2">
            {/* Weight */}
            <div className="flex flex-col">
              <label className="text-[10px] text-muted-foreground mb-1">Weight ({unit})</label>
              <Input
                type="number"
                inputMode="decimal"
                step={unit === "kg" ? "0.5" : "1"}
                // Back-off prefill (computed from the reference set) takes the placeholder when
                // present; otherwise the client's last-time weight. Storage stays canonical kg.
                placeholder={(
                  fromCanonicalKg(prefillWeightKg ?? historySet?.weight ?? null, unit, unit === "kg" ? 1 : 0) ?? "—"
                ).toString()}
                value={fromCanonicalKg(log.performed_load, unit, unit === "kg" ? 1 : 0) ?? ""}
                onChange={(e) =>
                  onUpdate("performed_load", e.target.value ? toCanonicalKg(parseFloat(e.target.value), unit) : null)
                }
                className="h-11 text-center text-base"
              />
              <span className="mt-1 h-3.5 text-[9px] leading-[14px] font-mono text-muted-foreground text-center">
                {historySet?.weight != null ? `last ${fromCanonicalKg(historySet.weight, unit, unit === "kg" ? 1 : 0)}` : ""}
              </span>
            </div>
            {/* Reps */}
            <div className="flex flex-col">
              <label className="text-[10px] text-muted-foreground mb-1">Reps</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder={(historySet?.reps ?? prescription.rep_range_min)?.toString() || "8"}
                value={log.performed_reps ?? ""}
                onChange={(e) => onUpdate("performed_reps", e.target.value ? parseInt(e.target.value) : null)}
                className="h-11 text-center text-base"
              />
              <span className="mt-1 h-3.5 text-[9px] leading-[14px] font-mono text-muted-foreground text-center">
                {historySet?.reps != null ? `last ${historySet.reps}` : ""}
              </span>
            </div>
            {/* RIR / RPE */}
            <div className="flex flex-col">
              <label className="text-[10px] text-muted-foreground mb-1">{hasRpe ? "RPE" : "RIR"}</label>
              <Input
                type="number"
                inputMode="numeric"
                min={hasRpe ? 1 : 0}
                max={hasRpe ? 10 : 5}
                placeholder={(hasRpe ? (historySet?.rpe ?? prescription.rpe) : (historySet?.rir ?? prescription.rir))?.toString() || (hasRpe ? "8" : "2")}
                value={hasRpe ? (log.performed_rpe ?? "") : (log.performed_rir ?? "")}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value) : null;
                  onUpdate(hasRpe ? "performed_rpe" : "performed_rir", val);
                }}
                className="h-11 text-center text-base"
              />
              <span className="mt-1 h-3.5 text-[9px] leading-[14px] font-mono text-muted-foreground text-center">
                {hasRpe
                  ? (historySet?.rpe != null ? `last ${historySet.rpe}` : "")
                  : (historySet?.rir != null ? `last ${historySet.rir}` : "")}
              </span>
            </div>
          </div>
          {/* Complete — invisible label spacer aligns the button to the input box top */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] mb-1 invisible select-none" aria-hidden="true">.</span>
            <Button
              variant={isFilledOut ? "default" : "outline"}
              size="icon"
              onClick={() => { setReopened(false); onComplete(); }}
              disabled={!isFilledOut}
              aria-label="Complete set"
              className="h-11 w-11"
            >
              <CheckCircle2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Rest & Repeat rounds (active / re-opened state). Same block renders under the
          completed-collapsed summary too via restPauseFooter. */}
      {restPauseFooter}
    </div>
  );
}

// Exercise Card
/** Exported for unit tests (WorkoutSessionV2.history.test.tsx) — not a public entry point. */
export function ExerciseCard({
  exercise,
  exerciseIndex,
  logs,
  onUpdateLog,
  onUpdateLogExtra,
  onCompleteSet,
  onSwapExercise,
  onSkipExercise,
  onSkipSet,
  isExpanded,
  onToggle,
  activeSuggestionForSet,
  onDismissSuggestion,
  unit,
}: {
  exercise: Exercise;
  exerciseIndex: number;
  logs: SetLog[];
  onUpdateLog: (setIndex: number, field: keyof SetLog, value: any) => void;
  onUpdateLogExtra: (setIndex: number, key: string, value: string | number | null) => void;
  onCompleteSet: (setIndex: number, restSeconds?: number, forceRest?: boolean) => void;
  onSwapExercise: () => void;
  onSkipExercise: () => void;
  onSkipSet: (setIndex: number) => void;
  isExpanded: boolean;
  onToggle: () => void;
  activeSuggestionForSet: Map<number, { id: string; type: string; text: string }>;
  onDismissSuggestion: (suggestionId: string) => void;
  unit: WeightUnit;
}) {
  const [guideOpen, setGuideOpen] = useState(false);

  // Get per-set prescriptions: V2 from prescription_snapshot_json.sets_json, or convert from legacy
  const prescriptions: SetPrescription[] =
    exercise.sets_json ||
    exercise.prescription_snapshot_json.sets_json ||
    legacyToPerSet(exercise.prescription_snapshot_json);

  const totalSets = prescriptions.length;
  const completedSets = logs.filter((l) => l.completed).length;
  // "Addressed" = completed OR skipped (§5): both count toward done so the
  // workout can finish; the active set is the first not-yet-addressed one.
  const isComplete = totalSets > 0 && completedSets === totalSets;
  const allAddressed =
    totalSets > 0 && logs.filter((l) => l.completed || l.skipped).length === totalSets;
  const activeSetIndex = logs.findIndex((l) => !l.completed && !l.skipped);

  const fmtW = (kg: number) => fromCanonicalKg(kg, unit, unit === "kg" ? 1 : 0);

  // --- Skipped exercise (§5): muted collapsed row, Undo to restore ---
  if (exercise.skipped) {
    return (
      <Card className="border-status-neutral/30 bg-status-neutral/5">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
              <SkipForward className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base truncate text-muted-foreground">
                {exercise.exercise.name}
              </CardTitle>
              <CardDescription className="text-xs">Skipped</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onSkipExercise}>
              Undo
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  // p0 = the representative (first) set's prescription -- used below for the
  // rep-range PR window. The one-line "Target" summary was dropped: it only
  // reflected set 1 and misled when prescriptions ramp per set. Each set row
  // shows its own target.
  const p0 = prescriptions[0];

  // "Last" = the FINAL set of the previous session. That is the highest set_number, which
  // today happens to sit at sets[0] because the rows arrive newest-log-first -- an ordering
  // coincidence, not a guarantee. Derive it explicitly so a re-ordered input can't silently
  // relabel some middle set as the last one (the same positional assumption that reversed
  // the per-set history below).
  const lastSet = exercise.history?.sets?.reduce(
    (latest, s) => (latest == null || s.set_number > latest.set_number ? s : latest),
    undefined as HistorySet | undefined,
  );
  const pb = exercise.personal_best;
  // Rep-range record (heaviest within ±1 of the target reps) — the PR coaches
  // and lifters actually train against, matching what the History screen shows.
  const rngMin = p0?.rep_range_min;
  const rngMax = p0?.rep_range_max;
  const targetReps =
    (typeof p0?.reps === "number" ? p0.reps : null) ??
    (rngMin != null && rngMax != null ? Math.round((rngMin + rngMax) / 2) : rngMin ?? null);
  const repRangeBest = bestInRepWindow(exercise.pr_refs, targetReps);

  return (
    <Card
      className={cn(
        "transition-colors",
        isComplete && "border-status-ontrack/40",
        !isComplete && allAddressed && "border-status-neutral/40",
      )}
    >
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3 px-4">
            <div className="flex items-start gap-3">
              {/* Status indicator */}
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold",
                  isComplete ? "bg-status-ontrack text-white" : "bg-primary/20 text-primary",
                )}
              >
                {isComplete ? <CheckCircle2 className="w-4 h-4" /> : exerciseIndex + 1}
              </div>

              {/* Video thumbnail — opens the Form & demo sheet */}
              <VideoThumbnail
                url={exercise.exercise.default_video_url}
                name={exercise.exercise.name}
                onOpenGuide={() => setGuideOpen(true)}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate">{exercise.exercise.name}</CardTitle>
                <CardDescription className="text-sm">
                  {exercise.exercise.primary_muscle}
                </CardDescription>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setGuideOpen(true); }}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-status-ontrack touch-manipulation whitespace-nowrap"
                >
                  <Info className="w-3 h-3" aria-hidden="true" /> Form &amp; demo
                </button>
                {/* Per-set mini progress segments (§2b) */}
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex items-center gap-1">
                    {prescriptions.map((_, i) => {
                      const l = logs[i];
                      return (
                        <span
                          key={i}
                          className={cn(
                            "h-1.5 w-4 rounded-full",
                            l?.completed
                              ? "bg-status-ontrack"
                              : l?.skipped
                                ? "bg-status-neutral"
                                : "bg-muted",
                          )}
                        />
                      );
                    })}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {completedSets}/{totalSets}
                    {exercise.is_activity ? (totalSets > 1 ? " rounds" : " entry") : " sets"}
                  </span>
                </div>
              </div>

              {/* Swap + Expand. Unit toggle moved into the body (declutters the
                  header on mobile); the explicit skip button is gone -- skipping
                  is implicit (leave a set empty + unchecked, confirmed on Finish). */}
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
                    title="Swap exercise"
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

            {/* History/PR inline (§2d). The per-set target lives on each set
                row below -- a single summary line only reflected set 1's
                prescription, so it was dropped. */}
            <div className="space-y-1">
              {lastSet || pb ? (
                <p
                  className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap"
                  data-history-summary
                >
                  {lastSet && (
                    <span>
                      <History className="inline w-3 h-3 mr-1 -mt-0.5" />
                      Last {fmtW(lastSet.weight)}
                      {unit}×{lastSet.reps}
                    </span>
                  )}
                  {repRangeBest != null ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      <Trophy className="inline w-3 h-3 mr-1 -mt-0.5" />
                      Best @{targetReps}: {fmtW(repRangeBest)}
                      {unit}
                    </span>
                  ) : (
                    pb && (
                      <span className="text-amber-600 dark:text-amber-400">
                        <Trophy className="inline w-3 h-3 mr-1 -mt-0.5" />
                        PR {fmtW(pb.weight)}
                        {unit}×{pb.reps}
                      </span>
                    )
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">First time — no history</p>
              )}
            </div>

            {/* Per-set rows */}
            <div className="space-y-2">
              {prescriptions.map((prescription, i) => {
                const suggestion = activeSuggestionForSet.get(i + 1);
                const setLog = logs[i];
                const isPr =
                  !exercise.is_activity && setLog?.completed
                    ? detectSetPr(exercise.pr_refs, setLog.performed_load, setLog.performed_reps, setLog.performed_rir)
                    : false;
                // Set-instruction resolution (back-off / drop / AMRAP). Inert when the fields
                // are absent (legacy / non-instruction), so this is a no-op outside canonical
                // authored data. Recomputes live as the reference set is logged (re-render).
                const amrap = prescription.amrap === true;
                let prefillWeightKg: number | null = null;
                const instructionBadges: string[] = [];
                if (isBackoffSet(prescription) && prescription.backoff) {
                  const ref = prescription.backoff.ref_set_index;
                  prefillWeightKg = computeBackoffWeight(
                    prescription.backoff,
                    logs[ref]?.performed_load ?? null,
                    prescriptions[ref]?.weight ?? null,
                  );
                  instructionBadges.push(
                    backoffBadgeLabel(prescription.backoff) +
                      (prefillWeightKg != null ? ` → ${fmtW(prefillWeightKg)}${unit}` : ""),
                  );
                }
                for (const branch of dropBranches(prescription)) {
                  const dw = computeDropWeight(branch, logs[i]?.performed_load ?? null, prescription.weight ?? null);
                  instructionBadges.push(dropBadgeLabel(branch) + (dw != null ? ` → ${fmtW(dw)}${unit}` : ""));
                }
                // Rest & Repeat (rest-pause): badge + the per-round inputs (rounds in performed_json).
                const restRepeat = restRepeatBranch(prescription);
                const restPause = restRepeat
                  ? { restSeconds: restRepeat.rest_seconds, maxRounds: restPauseMaxRounds(restRepeat) }
                  : null;
                if (restRepeat) instructionBadges.push(restPauseBadgeLabel(restRepeat));
                return (
                  <div key={i} className="space-y-1" data-set-row={prescription.set_number}>
                    <SetRow
                      prescription={prescription}
                      // Match by set IDENTITY, never by array position. `history.sets` is
                      // built newest-log-first, so sets[0] is the LAST set of the previous
                      // session -- indexing by `i` handed set 1 the values from set 4, set 2
                      // the values from set 3, and so on. Every set row showed a number the
                      // client never lifted on that set.
                      historySet={exercise.history?.sets.find(
                        (s) => s.set_number === prescription.set_number,
                      )}
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
                          skipped: false,
                        }
                      }
                      onUpdate={(field, value) => onUpdateLog(i, field, value)}
                      onUpdateExtra={(key, value) => onUpdateLogExtra(i, key, value)}
                      onComplete={() => onCompleteSet(i, restRepeat ? restRepeat.rest_seconds : prescription.rest_seconds, !!restRepeat)}
                      onSkip={() => onSkipSet(i)}
                      isActive={activeSetIndex === i}
                      inputColumns={exercise.input_columns}
                      isActivity={exercise.is_activity}
                      unit={unit}
                      isPr={isPr}
                      amrap={amrap}
                      prefillWeightKg={prefillWeightKg}
                      instructionBadges={instructionBadges}
                      restPause={restPause}
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
      <ExerciseDemoCard
        context="in-session"
        exercise={exercise.exercise}
        open={guideOpen}
        onOpenChange={setGuideOpen}
        lastSet={lastSet ? { weight: Number(fmtW(lastSet.weight)), reps: lastSet.reps, unit } : null}
        onSwap={() => {
          setGuideOpen(false);
          onSwapExercise();
        }}
      />
    </Card>
  );
}

// Rest Timer
// WK2: anchored to a wall-clock timestamp (`endAt`) rather than decrementing a
// local counter on a setInterval. Mobile browsers throttle/suspend timers when
// the tab is backgrounded (constant in a gym — screen locks mid-rest), which
// made the old setInterval drift minutes behind. Here every tick recomputes
// `remaining` from `Date.now()`, and we force an immediate resync on focus /
// visibility so the countdown is correct the instant the user looks back.
function RestTimer({
  duration,
  onComplete,
  onSkip,
}: {
  duration: number;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [endAt, setEndAt] = useState(() => Date.now() + duration * 1000);
  const [remaining, setRemaining] = useState(duration);
  const [isPaused, setIsPaused] = useState(false);
  // While paused we freeze the remaining seconds; resume re-anchors `endAt`.
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const firedRef = useRef(false);

  // New rest period (duration prop changes) — re-anchor and re-arm.
  useEffect(() => {
    setEndAt(Date.now() + duration * 1000);
    setPausedRemaining(null);
    setIsPaused(false);
    firedRef.current = false;
  }, [duration]);

  useEffect(() => {
    if (isPaused) {
      setRemaining(pausedRemaining ?? 0);
      return;
    }
    const tick = () => {
      const secs = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0 && !firedRef.current) {
        firedRef.current = true;
        onCompleteRef.current();
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [isPaused, endAt, pausedRemaining]);

  const togglePause = () => {
    if (isPaused) {
      // Resume: re-anchor the end time from the frozen remaining.
      setEndAt(Date.now() + (pausedRemaining ?? remaining) * 1000);
      setPausedRemaining(null);
      firedRef.current = false;
      setIsPaused(false);
    } else {
      setPausedRemaining(remaining);
      setIsPaused(true);
    }
  };

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = ((duration - remaining) / duration) * 100;

  return (
    <div className="fixed inset-x-0 bottom-20 md:bottom-24 mx-4 z-40">
      <Card className=" border-primary/20">
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
                onClick={togglePause}
                aria-label={isPaused ? "Resume rest timer" : "Pause rest timer"}
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
      <Drawer
        open
        onOpenChange={(open) => { if (!open) onClose(); }}
        repositionInputs={false}
        shouldScaleBackground={false}
      >
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Finish re-entrancy guard. markUnloggedSkipped applies optimistic skip flags
  // BEFORE its write settles, so computeUnloggedSets() reports 0 unlogged during
  // the await window — a second Finish tap would then call completeWorkout()
  // directly, bypassing the pending skip-writes and navigating away (unmount
  // aborts them → lost skip rows → corrupted adherence). The ref is the
  // synchronous guard (set before any await); isFinishing drives button-disable.
  const isFinishingRef = useRef(false);
  const [isFinishing, setIsFinishing] = useState(false);
  // Implicit skip: how many sets are unlogged when the client taps Finish.
  // null = no confirm open; a number = show "N sets unlogged" confirmation.
  const [finishUnloggedCount, setFinishUnloggedCount] = useState<number | null>(null);
  const [user, setUser] = useState<any>(null);

  const [setLogs, setSetLogs] = useState<Record<string, SetLog[]>>({});
  // WK7 §3 — overview (whole-session list) ↔ focus (one exercise at a time).
  const [mode, setMode] = useState<"overview" | "focus">("overview");
  const [focusIndex, setFocusIndex] = useState(0);
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

  // WK7 §4 — per-client display/entry unit (weights persist canonically in kg).
  // `unit` is the client-wide default; individual exercises can override it
  // (a machine reads in kg, the dumbbells are in lb — same gym). Overrides are
  // remembered per exercise on the device via localStorage so the choice sticks
  // across sessions. Storage stays canonical kg regardless of display unit.
  // One unit for the WHOLE session (kg/lb). Defaults to the client's saved
  // preference; a single toggle in the session header overrides it for this
  // session only. Replaces the old per-exercise override -- the toggle no
  // longer repeats on every exercise card. Storage stays canonical kg.
  const { unit: preferredUnit } = useWeightUnit();
  const [sessionUnitOverride, setSessionUnitOverride] = useState<WeightUnit | null>(null);
  const activeUnit: WeightUnit = sessionUnitOverride ?? preferredUnit;
  // WK7 §2e — completion summary sheet shown before navigating to the calendar.
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  // WA1 — coach WhatsApp number for the "Message coach about this session"
  // button (1:1 clients only; null => no button). Resolved in a separate
  // ref-guarded effect, NOT in loadSession's read burst (BUG3 / WK7 §1.5).
  const [coachWhatsApp, setCoachWhatsApp] = useState<string | null>(null);
  // Elapsed source (§2e): earliest persisted set-log created_at for this session
  // (survives reload/resume); mount time is the fallback before any set logged.
  const sessionMountRef = useRef<number>(Date.now());
  const [earliestLoggedAtMs, setEarliestLoggedAtMs] = useState<number | null>(null);

  const hasFetched = useRef(false);
  const setLogsRef = useRef(setLogs);
  setLogsRef.current = setLogs;

  // D3: canonical is the ONLY read/log path (board_v2 is on in prod; the legacy client_*
  // loader is retired). The canonical Start links carry ?assignment&session&date; an old
  // /session/:moduleId bookmark with no ?assignment resolves to nothing → redirect to the
  // calendar (loadCanonicalSession), never a legacy fallback.
  const [searchParams] = useSearchParams();
  const canonicalAssignmentParam = searchParams.get("assignment");
  const canonicalSessionParam = searchParams.get("session");
  const canonicalDateParam = searchParams.get("date");
  // Non-null while a canonical session is loaded → logging writes assignment_id + plan_slot_id.
  const [canonicalAssignmentId, setCanonicalAssignmentId] = useState<string | null>(null);
  const canonicalAssignmentIdRef = useRef<string | null>(null);
  canonicalAssignmentIdRef.current = canonicalAssignmentId;

  // D3 log-row keying: canonical only — (assignment_id, plan_slot_id). Exercise.id IS the
  // plan_slot id (set by loadCanonicalSession), so `exerciseId` doubles as plan_slot_id.
  // client_module_exercise_id is no longer written (defaults null; dropped in Stage B).
  const buildLogKey = (
    exerciseId: string,
  ): { assignment_id: string; plan_slot_id: string } => ({
    assignment_id: canonicalAssignmentIdRef.current as string,
    plan_slot_id: exerciseId,
  });
  const logConflictTarget = (): string => "assignment_id,plan_slot_id,set_index";

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

  // D3: the SOLE loader. Resolves ONE session from client_plan_assignment + plan_* into the
  // Module/Exercise/SetLog state the render + logging UI reads. Also rebuilds cross-instance
  // history / personal-best / PR-refs (parity with the retired legacy loader).
  const loadCanonicalSession = useCallback(async () => {
    if (!canonicalAssignmentParam) {
      // Canonical is the only loader now — an old /session/:moduleId bookmark (or any load with
      // no ?assignment) can't resolve. Redirect to the calendar; never a legacy fallback.
      navigate("/client/workout/calendar");
      return;
    }
    try {
      setLoadError(false);
      // Retry getUser with a per-attempt timeout — a transient pooler/auth blip here was
      // stranding the load (the recurring "Request timed out after 8000ms").
      const { data: userData } = await selectWithRetry(
        () => supabase.auth.getUser(),
        3,
        400,
        { timeoutMs: 8000, label: "Get user" },
      );
      const currentUser = userData?.user;
      if (!currentUser) {
        navigate("/auth");
        return;
      }
      setUser(currentUser);

      // Labeled timeout so a genuine resolver hang surfaces as a clear error rather than the
      // misleading getUser/8000ms one. The resolver's own queries already retry on blips
      // (selectWithRetry inside), so this is the last-resort ceiling.
      const resolved = await withTimeout(
        resolveCanonicalSession({
          assignmentId: canonicalAssignmentParam,
          planSessionId: canonicalSessionParam ?? undefined,
          date: canonicalDateParam ?? undefined,
        }),
        25000,
        "Resolve canonical session",
      );
      if (!resolved) {
        toast({
          title: "Workout not found",
          description: "This canonical session could not be resolved.",
          variant: "destructive",
        });
        navigate("/client/workout/calendar");
        return;
      }

      const { data: coachJson } = await supabase.rpc("get_coach_for_client", {
        p_coach_user_id: resolved.ownerCoachId,
      });
      const coachData = coachJson as { first_name?: string } | null;

      // D3 parity: cross-instance movement history / PB / PR-refs. ONE batched read (see
      // loadCrossInstanceHistory — no per-exercise fan-out), keyed by all rendered exercise_ids.
      const historyByExerciseId = await loadCrossInstanceHistory(
        currentUser.id,
        resolved.exercises.map((rex) => rex.exerciseId),
      );

      const initialLogs: Record<string, SetLog[]> = {};
      const formattedExercises: Exercise[] = resolved.exercises.map((rex) => {
        const prescription = rex.prescriptionSnapshot;
        const setsJson = prescription.sets_json ?? undefined;
        const setCount = setsJson?.length || prescription.set_count || 3;

        const allColumns: ColumnConfig[] = Array.isArray(prescription.column_config)
          ? prescription.column_config
          : [];
        const { inputColumns } = splitColumnsByCategory(allColumns);
        const isActivity = inputColumns.some((c) =>
          PERFORMED_JSON_COLUMN_TYPES.has(c.type as ClientInputColumnType),
        );

        const existingLogs = resolved.existingLogs.filter(
          (l) => l.plan_slot_id === rex.planSlotId,
        );
        initialLogs[rex.planSlotId] = Array.from({ length: setCount }, (_, i) => {
          const existing = existingLogs.find((l) => l.set_index === i + 1);
          const existingExtra = existing?.performed_json ?? {};
          return {
            set_index: i + 1,
            performed_reps: existing?.performed_reps ?? null,
            performed_load: existing?.performed_load ?? null,
            performed_rir: existing?.performed_rir ?? null,
            performed_rpe: existing?.performed_rpe ?? null,
            performed_extra: existingExtra,
            notes: existing?.notes || "",
            skipped: existing?.skipped ?? false,
            completed:
              existing && !existing.skipped
                ? existing.performed_reps !== null ||
                  existing.performed_load !== null ||
                  Object.keys(existingExtra).length > 0
                : false,
          };
        });

        // Cross-instance history / PB / PR-refs from the batched read, excluding THIS instance's
        // slot (mirrors the legacy sameExerciseIds.filter(id => id !== ex.id)). Skip for
        // activities — history/PB are weight×reps-centric and null for activity rows.
        let historyData: import("@/lib/canonicalSessionResolver").CrossInstanceLogRow[] | null = null;
        let pbRow: { performed_load: number; performed_reps: number | null; created_at: string } | null = null;
        let prRefs: Exercise["pr_refs"] | null = null;
        if (!isActivity) {
          const logsForExercise = (historyByExerciseId.get(rex.exerciseId) ?? []).filter(
            (l) => l.plan_slot_id !== rex.planSlotId,
          );
          if (logsForExercise.length > 0) {
            // Scope history to the PREVIOUS INSTANCE of this movement, not the most recent
            // N logs. A plan_slot is week-scoped, so all logs sharing the newest log's
            // plan_slot_id ARE that one previous session — no more, no less.
            //
            // The old `slice(0, setCount)` blended sessions whenever the set counts differed:
            // if last week was 2 sets and today prescribes 4, it pulled 2 logs from last week
            // and 2 from the week before, then labelled the whole lot with last week's date.
            // Rows are matched by set_number below, so a stale set 3/4 would have been shown
            // as last week's. Filtering by instance makes that impossible.
            const lastInstanceSlotId = logsForExercise[0].plan_slot_id;
            historyData = logsForExercise.filter((l) => l.plan_slot_id === lastInstanceSlotId);
            let best: (typeof logsForExercise)[number] | null = null;
            for (const l of logsForExercise) {
              if (l.performed_load != null && (best == null || l.performed_load > best.performed_load!)) best = l;
            }
            pbRow = best
              ? { performed_load: best.performed_load!, performed_reps: best.performed_reps, created_at: best.created_at }
              : null;
            const bestByReps: Record<number, number> = {};
            const bestRirByLoadReps: Record<string, number> = {};
            let bestAbsolute = 0;
            for (const l of logsForExercise) {
              if (l.performed_load == null) continue;
              bestAbsolute = Math.max(bestAbsolute, l.performed_load);
              if (l.performed_reps != null) {
                bestByReps[l.performed_reps] = Math.max(bestByReps[l.performed_reps] ?? 0, l.performed_load);
                if (l.performed_rir != null) {
                  const k = `${l.performed_load}:${l.performed_reps}`;
                  bestRirByLoadReps[k] = Math.max(bestRirByLoadReps[k] ?? -1, l.performed_rir);
                }
              }
            }
            prRefs = { bestAbsolute, bestByReps, bestRirByLoadReps };
          }
        }

        return {
          id: rex.planSlotId,
          exercise_id: rex.exerciseId,
          section: rex.section,
          sort_order: rex.sortOrder,
          instructions: rex.instructions,
          prescription_snapshot_json: prescription as unknown as Exercise["prescription_snapshot_json"],
          sets_json: setsJson as unknown as Exercise["sets_json"],
          input_columns: inputColumns,
          is_activity: isActivity,
          skipped: false,
          exercise: {
            name: rex.library?.name || "Unknown Exercise",
            client_name: rex.library?.client_name ?? null,
            default_video_url: rex.library?.default_video_url ?? null,
            muscle_id: rex.library?.muscle_id ?? null,
            subdivision_id: rex.library?.subdivision_id ?? null,
            primary_muscle: rex.library?.primary_muscle || "",
            description: rex.library?.description ?? null,
            setup_instructions: rex.library?.setup_instructions ?? null,
            setup_points: rex.library?.setup_points ?? null,
            equipment: rex.library?.equipment ?? null,
            secondary_muscles: rex.library?.secondary_muscles ?? null,
            laterality: rex.library?.laterality ?? null,
            resistance_profiles: rex.library?.resistance_profiles ?? null,
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
          personal_best: pbRow
            ? { weight: pbRow.performed_load, reps: pbRow.performed_reps || 0, date: pbRow.created_at }
            : undefined,
          pr_refs: prRefs ?? undefined,
        };
      });

      // Elapsed-time source: earliest canonical log created_at (parity with legacy).
      const logCreatedAts = resolved.existingLogs
        .map((l) => (l.created_at ? new Date(l.created_at).getTime() : NaN))
        .filter((t) => Number.isFinite(t));
      setEarliestLoggedAtMs(logCreatedAts.length ? Math.min(...logCreatedAts) : null);

      setCanonicalAssignmentId(resolved.assignmentId);
      setSetLogs(initialLogs);
      setModule({
        id: resolved.planSessionId,
        title: resolved.isDeload ? `${resolved.title} · Deload` : resolved.title,
        module_type: resolved.activityType,
        status: "scheduled",
        completed_at: null,
        module_owner_coach_id: resolved.ownerCoachId,
        coach_name: coachData?.first_name || "Coach",
        exercises: formattedExercises,
      });

      const firstIncomplete = formattedExercises.findIndex((ex) => {
        const logs = initialLogs[ex.id];
        return !ex.skipped && logs && logs.some((l) => !l.completed && !l.skipped);
      });
      if (firstIncomplete >= 0) setFocusIndex(firstIncomplete);
    } catch (error: any) {
      console.error("Error loading canonical session:", error);
      setLoadError(true);
      toast({
        title: "Error loading workout",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [canonicalAssignmentParam, canonicalSessionParam, canonicalDateParam, navigate, toast]);

  // Manual retry after a failed load — the hasFetched guard otherwise blocks
  // re-runs, so a transient failure would strand the user with no recovery.
  const handleRetryLoad = useCallback(() => {
    hasFetched.current = true;
    setLoadError(false);
    setLoading(true);
    loadCanonicalSession();
  }, [loadCanonicalSession]);

  // hasFetched ref guard pattern to prevent infinite loops
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    // D3: canonical is the only loader.
    loadCanonicalSession();
  }, [loadCanonicalSession]);

  // WA1 — resolve the coach's WhatsApp number for the completion-sheet button.
  // Deliberately NOT part of loadSession's Promise.all burst (BUG3 / WK7 §1.5
  // pooler-starvation rule): its own ref-guarded effect that runs once after
  // `module` + `user` are set. Gated to 1:1 tiers (team_plan excluded); the
  // button only appears when the coach also has a number set (RPC returns null
  // otherwise). Non-critical — failures never block the session UI.
  const coachWaResolvedRef = useRef(false);
  useEffect(() => {
    if (coachWaResolvedRef.current) return;
    if (!module || !user?.id) return;
    coachWaResolvedRef.current = true;
    (async () => {
      try {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("service_id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .maybeSingle();
        if (!sub?.service_id) return;
        const { data: svc } = await supabase
          .from("services")
          .select("slug")
          .eq("id", sub.service_id)
          .maybeSingle();
        const oneToOneSlugs = ["one_to_one_online", "one_to_one_complete", "hybrid", "in_person"];
        if (!svc?.slug || !oneToOneSlugs.includes(svc.slug)) return; // team_plan / unknown => no button
        const { data: wa } = await supabase.rpc("get_coach_whatsapp_for_client", {
          p_coach_user_id: module.module_owner_coach_id,
        });
        setCoachWhatsApp((wa as string | null) ?? null);
      } catch (err) {
        console.error("WA1: failed to resolve coach WhatsApp", err);
      }
    })();
  }, [module, user]);

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
    restSeconds?: number,
    forceRest?: boolean, // rest-pause: rest before the repeat round even on the last set
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
      // Retry on transient failures — the upsert is idempotent (onConflict), and
      // on mobile a brief connectivity/pooler blip would otherwise permanently
      // drop the set with no recovery. Observed in prod: whole exercises lost
      // their sets to short blips while neighbouring exercises saved fine.
      const { error } = await selectWithRetry(() =>
        supabase
          .from("exercise_set_logs")
          .upsert(
            {
              ...buildLogKey(exerciseId),
              set_index: logForSave.set_index,
              prescribed: exerciseForSave.prescription_snapshot_json as unknown as Json,
              performed_reps: logForSave.performed_reps,
              performed_load: logForSave.performed_load,
              performed_rir: logForSave.performed_rir,
              performed_rpe: logForSave.performed_rpe,
              performed_json: logForSave.performed_extra ?? {},
              notes: logForSave.notes || null,
              created_by_user_id: user.id,
            },
            { onConflict: logConflictTarget() },
          ),
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
      (setIndex < prescriptions.length - 1 || forceRest)
    ) {
      setRestTimer((prev) => ({
        active: true,
        duration: restSeconds,
        token: prev.token + 1,
      }));
    }

    // Evaluate progression suggestion if enabled. Skipped in canonical mode:
    // progression_suggestions is keyed on client_module_exercise_id (NOT NULL FK), which
    // canonical sessions don't have. Re-pairs with the P3/P4 resolver work. (Also no-ops
    // naturally — canonical snapshots don't carry linear_progression_enabled.)
    if (!canonicalAssignmentIdRef.current && exercise && user) {
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

  // WK7 §5 — Skip a single set: write an exercise_set_logs row with skipped=true
  // and null performed_* via the EXISTING upsert (no RPC), same onConflict as
  // completeSet. Sibling to completeSet, never overloading it. Toggling off
  // re-upserts skipped=false.
  const skipSet = async (exerciseId: string, setIndex: number) => {
    const current = setLogsRef.current[exerciseId]?.[setIndex];
    const nextSkipped = !current?.skipped;
    setSetLogs((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((log, i) =>
        i === setIndex ? { ...log, skipped: nextSkipped, completed: false } : log,
      ),
    }));
    if (!user || !current) return;
    // Retry on transient failures (mobile pooler/connectivity blips), like
    // completeSet — the upsert is idempotent via onConflict, so a brief blip
    // shouldn't permanently drop the skip.
    const { error } = await selectWithRetry(() =>
      supabase.from("exercise_set_logs").upsert(
        {
          ...buildLogKey(exerciseId),
          set_index: current.set_index,
          skipped: nextSkipped,
          performed_reps: null,
          performed_load: null,
          performed_rir: null,
          performed_rpe: null,
          performed_json: {},
          created_by_user_id: user.id,
        },
        { onConflict: logConflictTarget() },
      ),
    );
    if (error) {
      // Revert local flag so the UI doesn't lie about a skip that didn't persist.
      setSetLogs((prev) => ({
        ...prev,
        [exerciseId]: prev[exerciseId].map((log, i) =>
          i === setIndex ? { ...log, skipped: !nextSkipped } : log,
        ),
      }));
      toast({
        title: "Couldn't update set",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  // WK7 §5 — Skip (or un-skip) a whole exercise via the skip_client_exercise RPC.
  const skipExercise = async (exerciseId: string) => {
    if (!module) return;
    const ex = module.exercises.find((e) => e.id === exerciseId);
    const nextSkipped = !ex?.skipped;
    const { error } = await supabase.rpc("skip_client_exercise", {
      p_cme_id: exerciseId,
      p_skipped: nextSkipped,
    });
    if (error) {
      toast({
        title: "Couldn't update exercise",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
      return;
    }
    setModule((prev) =>
      prev
        ? {
            ...prev,
            exercises: prev.exercises.map((e) =>
              e.id === exerciseId ? { ...e, skipped: nextSkipped } : e,
            ),
          }
        : prev,
    );
  };

  // Swap exercise
  const swapExercise = async (newExerciseId: string) => {
    if (!swapExerciseId || !module) return;

    // Canonical mode: swapping is an edit (a client_plan_override) — deferred to P4.
    // Guard so we don't silently no-op against client_module_exercises by plan_slot id.
    if (canonicalAssignmentIdRef.current) {
      toast({
        title: "Not available yet",
        description: "Swapping exercises isn't supported in the canonical preview.",
      });
      setShowSwapPicker(false);
      return;
    }

    try {
      // Get new exercise info. .maybeSingle() so a row that's been deleted
      // from the library since the picker rendered surfaces as null rather
      // than a thrown PostgREST 406 — CLAUDE.md ".maybeSingle() vs .single()" rule.
      const { data: newExLib, error: exError } = await supabase
        .from("exercise_library")
        .select("name, client_name, muscle_id, subdivision_id, primary_muscle, default_video_url, description, setup_instructions, setup_points, equipment, secondary_muscles, laterality, resistance_profiles")
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

      // P5 A.2: legacy-only path (canonical sessions return early at the guard
      // above). The old client_module_exercises write was removed — a canonical
      // client-initiated swap needs a coach/admin-scoped RPC (plan_slots is
      // owner-write-only) and is tracked separately. Local state only here.

      // Update local state
      const updatedExercises = module.exercises.map((ex) => {
        if (ex.id !== swapExerciseId) return ex;
        return {
          ...ex,
          exercise_id: newExerciseId,
          exercise: {
            name: newExLib.name,
            client_name: newExLib.client_name ?? null,
            muscle_id: newExLib.muscle_id ?? null,
            subdivision_id: newExLib.subdivision_id ?? null,
            primary_muscle: newExLib.primary_muscle,
            default_video_url: newExLib.default_video_url,
            description: newExLib.description ?? null,
            setup_instructions: newExLib.setup_instructions ?? null,
            setup_points: newExLib.setup_points ?? null,
            equipment: newExLib.equipment ?? null,
            secondary_muscles: newExLib.secondary_muscles ?? null,
            laterality: newExLib.laterality ?? null,
            resistance_profiles: newExLib.resistance_profiles ?? null,
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
  // Returns true on success (including nothing-to-save), false if the batch write
  // failed. Callers that gate on the result (completeWorkout) MUST NOT proceed on
  // false — a completion dialog atop a failed save is the PR2c symptom. Pass
  // { silentSuccess } to suppress the "Progress saved" toast when saving as a
  // sub-step of Finish (the completion dialog is the feedback there).
  //
  // ONE batched array upsert, not N parallel single-row upserts (PR2b / WK7 §1.5
  // lesson): 22 parallel single-set writes at Finish burst the connection pooler →
  // selectWithRetry backoff → a transient "Error saving" toast even though every
  // row was already write-through-persisted by completeSet. One idempotent array
  // upsert is a single fast round-trip.
  //
  // TODO(dirty-tracking): completeSet already write-through-persists each set as it
  // completes, so at Finish this re-upserts rows that are usually already saved.
  // Tracking a per-set dirty flag (set on edit, cleared on persist) would shrink the
  // Finish payload to only genuinely-unsaved sets. Deferred — batching already
  // removes the burst; the redundant array upsert is one cheap idempotent round-trip.
  const saveProgress = async (opts?: { silentSuccess?: boolean }): Promise<boolean> => {
    if (!user || !module) return true;

    setSubmitting(true);
    try {
      const allLogs: any[] = [];

      Object.entries(setLogs).forEach(([exerciseId, logs]) => {
        const exercise = module.exercises.find((e) => e.id === exerciseId);
        if (!exercise) return;

        logs.forEach((log) => {
          const hasExtra = Object.keys(log.performed_extra || {}).length > 0;
          // Include notes-only sets — a set with just a note (no reps/load/extra)
          // was silently dropped by the bulk save before, losing the note.
          if (log.performed_reps !== null || log.performed_load !== null || hasExtra || log.notes) {
            allLogs.push({
              ...buildLogKey(exerciseId),
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

      if (allLogs.length === 0) {
        if (!opts?.silentSuccess) {
          toast({ title: "Progress saved", description: "Your workout data has been saved" });
        }
        return true;
      }

      // Single array upsert (idempotent via onConflict) — one round-trip, retried
      // as a whole on a transient blip. Per CLAUDE.md: destructure { error }.
      const { error } = await selectWithRetry(() =>
        supabase.from("exercise_set_logs").upsert(allLogs, { onConflict: logConflictTarget() }),
      );
      if (error) throw error;

      if (!opts?.silentSuccess) {
        toast({ title: "Progress saved", description: "Your workout data has been saved" });
      }
      return true;
    } catch (error: unknown) {
      // Was toast-only — invisible to Sentry. Capture so the finish-path failure
      // rate is measurable (PR2c), matching completeWorkout's capture.
      captureException(error, {
        source: "saveProgress",
        metadata: { moduleId: module?.id ?? null, logCount: Object.keys(setLogs).length },
      });
      toast({
        title: "Error saving",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // Complete workout
  // Implicit skip — a set left empty AND unchecked counts as skipped. Compute
  // the unlogged sets across non-skipped exercises (used to gate Finish and to
  // record them as skipped so the session can complete cleanly).
  const computeUnloggedSets = (): Array<{ exerciseId: string; setIndex: number; set_index: number }> => {
    const out: Array<{ exerciseId: string; setIndex: number; set_index: number }> = [];
    if (!module) return out;
    for (const ex of module.exercises) {
      if (ex.skipped) continue;
      const logs = setLogsRef.current[ex.id] || [];
      logs.forEach((l, i) => {
        if (!l.completed && !l.skipped) {
          out.push({ exerciseId: ex.id, setIndex: i, set_index: l.set_index });
        }
      });
    }
    return out;
  };

  // Persist the implicit skips. Returns false if the write failed — the caller
  // must NOT proceed to completeWorkout on false (a Finish that silently drops the
  // skip writes would leave the session half-persisted; canonical completion is
  // purely the set logs, so lost skips corrupt adherence directly).
  //
  // ONE batched array upsert, not N parallel single-row upserts: 21 parallel
  // single-set writes burst the connection pooler → selectWithRetry backoff →
  // rows land ~30s apart while the optimistic flags are already applied (the
  // WK7 §1.5 / P0-postmortem pattern). One array upsert is a single fast,
  // atomic round-trip.
  const markUnloggedSkipped = async (
    unlogged: Array<{ exerciseId: string; setIndex: number; set_index: number }>,
  ): Promise<boolean> => {
    if (unlogged.length === 0) return true;
    setSetLogs((prev) => {
      const next = { ...prev };
      for (const u of unlogged) {
        next[u.exerciseId] = (next[u.exerciseId] || []).map((log, i) =>
          i === u.setIndex ? { ...log, skipped: true, completed: false } : log,
        );
      }
      return next;
    });
    if (!user) return true;

    // Build the full skip-row array (skipped sets carry null performed_* values).
    const rows = unlogged.map((u) => ({
      ...buildLogKey(u.exerciseId),
      set_index: u.set_index,
      skipped: true,
      performed_reps: null,
      performed_load: null,
      performed_rir: null,
      performed_rpe: null,
      performed_json: {},
      created_by_user_id: user.id,
    }));

    const { error } = await selectWithRetry(() =>
      supabase.from("exercise_set_logs").upsert(rows, { onConflict: logConflictTarget() }),
    );

    if (error) {
      // Revert the optimistic skip flags so the UI doesn't claim skips that
      // didn't persist (matches completeSet/skipSet).
      setSetLogs((prev) => {
        const next = { ...prev };
        for (const u of unlogged) {
          next[u.exerciseId] = (next[u.exerciseId] || []).map((log, i) =>
            i === u.setIndex ? { ...log, skipped: false, completed: false } : log,
          );
        }
        return next;
      });
      toast({
        title: "Couldn't finish — some sets didn't save",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  // Belt-and-suspenders: warn before an unload/navigation while the finish writes
  // are in flight, so a stray refresh/close doesn't abort pending skip-writes.
  useEffect(() => {
    if (!isFinishing) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isFinishing]);

  // The single guarded finish flow: persist skips, then (only if that settled OK)
  // complete. The isFinishingRef guard is set synchronously before any await, so a
  // second Finish tap during the write window is a no-op (computeUnloggedSets lies
  // during that window because the optimistic flags are already applied).
  const runFinish = async (
    unlogged: Array<{ exerciseId: string; setIndex: number; set_index: number }>,
  ) => {
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;
    setIsFinishing(true);
    try {
      const ok = await markUnloggedSkipped(unlogged);
      if (!ok) return; // skip-writes failed → do NOT complete/navigate
      await completeWorkout();
    } finally {
      isFinishingRef.current = false;
      setIsFinishing(false);
    }
  };

  // Finish entry point: if anything is unlogged, confirm (it'll be skipped),
  // otherwise complete straight away. Guarded so a burst of taps can't re-enter.
  const handleFinish = () => {
    if (isFinishingRef.current) return;
    const unlogged = computeUnloggedSets();
    if (unlogged.length > 0) {
      setFinishUnloggedCount(unlogged.length);
    } else {
      void runFinish([]);
    }
  };

  const confirmFinish = () => {
    setFinishUnloggedCount(null);
    // Compute unlogged BEFORE runFinish applies the optimistic flags.
    void runFinish(computeUnloggedSets());
  };

  const completeWorkout = async () => {
    if (!module) return;

    setSubmitting(true);
    try {
      // Gate on the save result — do NOT show the completion dialog when the set-log
      // save failed (the PR2c symptom: error toast + completion dialog at once).
      // saveProgress already toasted + captured; stay on the session, like
      // markUnloggedSkipped's false path. Silent success — the dialog is the feedback.
      const saved = await saveProgress({ silentSuccess: true });
      if (!saved) return;

      // Canonical Finish (P3+): there is no client_day_module to complete — module.id is
      // a plan_session id, and the set logs were already persisted by saveProgress()
      // above. The legacy per-module completion RPC path was removed in P5 A.3: it was
      // provably dead post-flip (board_v2 ON + coverage = 0 → every active client has a
      // canonical assignment, so the old legacy-completion guard was always true and the
      // RPC + its 42501 "expired" UX never ran). Finish now just falls through to
      // the summary. saveProgress() above is the SOLE set-log persistence point — do not
      // add another completion write here.
      // TODO(P4): record per-assignment session completion in the canonical model.

      // Invalidate client-side workout views so TodaysWorkoutHero and
      // WorkoutCalendar refresh within ~1s of return without manual refresh.
      // Partial-key form clears both 'today' and 'month' (any month) in one call.
      if (user) {
        await queryClient.invalidateQueries({
          queryKey: ["client-workouts", user.id],
        });
      }

      // WK7 §2e — build the session summary and show it before leaving; the
      // sheet's "Done" performs the navigate. Volume in canonical kg (the sheet
      // converts to the display unit). PRs = actual logged rep-maxes vs the
      // exercise's prior history (classifySetPr / prEngine) — no estimation.
      let volumeKg = 0;
      let setsCompleted = 0;
      let setsSkipped = 0;
      for (const exLogs of Object.values(setLogs)) {
        for (const l of exLogs) {
          if (l.completed) {
            setsCompleted += 1;
            volumeKg += (l.performed_load || 0) * (l.performed_reps || 0);
          }
          if (l.skipped) setsSkipped += 1;
        }
      }
      // Typed PRs via the three-record model (heaviest ever / rep-range / got
      // easier), one entry per exercise (the most impressive record it earned).
      const prs: WorkoutSummary["prs"] = [];
      for (const ex of module.exercises) {
        if (ex.is_activity) continue;
        let best: { set: SetLog; type: "heaviest" | "rep_range" | "easier" } | null = null;
        const rank = { heaviest: 3, rep_range: 2, easier: 1 } as const;
        for (const l of setLogs[ex.id] || []) {
          if (!l.completed) continue;
          const t = classifySetPr(ex.pr_refs, l.performed_load, l.performed_reps, l.performed_rir);
          if (t && (!best || rank[t] > rank[best.type])) best = { set: l, type: t };
        }
        if (best && best.set.performed_load != null && best.set.performed_reps != null) {
          prs.push({
            name: ex.exercise.name,
            weightKg: best.set.performed_load,
            reps: best.set.performed_reps,
            type: best.type,
          });
        }
      }
      const base = earliestLoggedAtMs ?? sessionMountRef.current;
      let elapsedSeconds: number | null = (Date.now() - base) / 1000;
      // Guard a misleading number (e.g. a resume where the first set is from a
      // prior day) — omit rather than show a wrong elapsed.
      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 24 * 3600) {
        elapsedSeconds = null;
      }
      const exerciseCount = module.exercises.filter(
        (ex) => !ex.skipped && (setLogs[ex.id] || []).some((l) => l.completed),
      ).length;
      setSummary({ volumeKg, setsCompleted, setsSkipped, exerciseCount, prs, elapsedSeconds });
    } catch (error: any) {
      // Surface finish failures in Sentry — this catch was swallowing the
      // completion write failing (completed_at NULL despite logged sets) with no
      // capture, so the prod bug was invisible.
      captureException(error, { source: "completeWorkout", metadata: { moduleId: module.id } });
      toast({
        title: "Error completing workout",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate progress (§5): skipped sets — and every set of a skipped exercise
  // — drop OUT of the remaining tally (they count as addressed), so a workout
  // with skips can still reach 100% and complete.
  let totalSets = 0;
  let completedSets = 0;
  if (module) {
    for (const ex of module.exercises) {
      if (ex.skipped) continue;
      for (const l of setLogs[ex.id] || []) {
        if (l.skipped) continue;
        totalSets += 1;
        if (l.completed) completedSets += 1;
      }
    }
  }
  const progressPercent = totalSets > 0 ? (completedSets / totalSets) * 100 : 100;

  // §3 paging — Resume jumps to the first exercise with an unaddressed set;
  // Begin starts at 0. `hasLoggedProgress` flips Begin → Resume on a resumed
  // session (any set already completed/skipped).
  const firstIncompleteIndex = module
    ? module.exercises.findIndex((ex) => {
        if (ex.skipped) return false;
        return (setLogs[ex.id] || []).some((l) => !l.completed && !l.skipped);
      })
    : -1;
  const hasLoggedProgress = Object.values(setLogs)
    .flat()
    .some((l) => l.completed || l.skipped);
  const focusExercise = module?.exercises[focusIndex];
  const isLastFocus = module ? focusIndex >= module.exercises.length - 1 : true;
  const remainingSets = totalSets - completedSets;

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
        <div className="container max-w-3xl mx-auto px-4 py-6 pt-20 space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              {loadError
                ? "We couldn't load this workout -- this is usually a temporary connection issue. Please try again."
                : "Workout not found"}
            </AlertDescription>
          </Alert>
          {loadError && (
            <div className="flex gap-3">
              <Button onClick={handleRetryLoad}>Try again</Button>
              <Button
                variant="outline"
                onClick={() => navigate("/client/workout/calendar")}
              >
                Back to calendar
              </Button>
            </div>
          )}
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
              {/* One session-wide unit toggle (replaces the per-exercise one). */}
              <WeightUnitToggle
                unit={activeUnit}
                onChange={async (u) => setSessionUnitOverride(u)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saveProgress()}
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

            {/* Progress ring + context (§2a) */}
            <div className="mt-3 flex items-center gap-3">
              <SessionProgressRing completed={completedSets} total={totalSets} />
              <div className="leading-tight">
                <p className="text-sm font-medium">
                  {completedSets}/{totalSets} sets
                </p>
                <p className="text-xs text-muted-foreground">
                  {progressPercent >= 100
                    ? "All sets done"
                    : `${totalSets - completedSets} to go`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Body — §3: overview list OR single-exercise focus */}
        <main className="container max-w-3xl mx-auto px-4 py-4 space-y-3 pb-28">
          {mode === "overview" ? (
            /* Overview — whole session at a glance (§3b) */
            <div className="space-y-2">
              {module.exercises.map((exercise, index) => {
                const logs = setLogs[exercise.id] || [];
                const total = logs.length;
                const done = logs.filter((l) => l.completed).length;
                const skipped = logs.filter((l) => l.skipped).length;
                const allAddressed = total > 0 && done + skipped === total;
                const started = done > 0 || skipped > 0;
                const status = exercise.skipped
                  ? { label: "Skipped", cls: "bg-status-neutral/10 text-muted-foreground" }
                  : allAddressed
                    ? { label: "Done", cls: "bg-status-ontrack/10 text-status-ontrack" }
                    : started
                      ? { label: "In progress", cls: "bg-primary/10 text-primary" }
                      : { label: "Not started", cls: "bg-muted text-muted-foreground" };
                const unitNoun = exercise.is_activity
                  ? total === 1
                    ? "entry"
                    : "entries"
                  : "sets";
                return (
                  <ClickableCard
                    key={exercise.id}
                    ariaLabel={`${exercise.exercise.name} — ${status.label}. Open to log.`}
                    onClick={() => {
                      setFocusIndex(index);
                      setMode("focus");
                    }}
                  >
                    <div className="flex items-center gap-3 p-3">
                      {exercise.skipped ? (
                        <span className="w-[34px] h-[34px] rounded-full bg-muted flex items-center justify-center shrink-0">
                          <SkipForward className="w-4 h-4 text-muted-foreground" />
                        </span>
                      ) : (
                        <SessionProgressRing
                          completed={allAddressed ? total : done}
                          total={total}
                          size={34}
                          strokeWidth={3}
                          label={
                            allAddressed ? (
                              <CheckCircle2 className="w-4 h-4 text-status-ontrack" />
                            ) : started ? (
                              `${done}/${total}`
                            ) : null
                          }
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{exercise.exercise.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {exercise.exercise.primary_muscle}
                          {total > 0 ? ` · ${total} ${unitNoun}` : ""}
                        </p>
                      </div>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0", status.cls)}>
                        {status.label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </ClickableCard>
                );
              })}
            </div>
          ) : focusExercise ? (
            /* Focus — one exercise at a time (§3c) */
            <div className="space-y-3">
              {/* Stepper header */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">
                    {focusExercise.exercise.primary_muscle}
                  </p>
                  <p className="text-sm font-medium">
                    Exercise {focusIndex + 1} of {module.exercises.length}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setMode("overview")}>
                  <List className="w-4 h-4 mr-1" />
                  Overview
                </Button>
              </div>
              {/* Segment row — tap to jump */}
              <div className="flex items-center gap-1.5">
                {module.exercises.map((ex, i) => {
                  const exLogs = setLogs[ex.id] || [];
                  const exAddressed =
                    exLogs.length > 0 &&
                    exLogs.filter((l) => l.completed || l.skipped).length === exLogs.length;
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => setFocusIndex(i)}
                      aria-label={`Go to exercise ${i + 1}`}
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors",
                        i === focusIndex
                          ? "bg-primary"
                          : ex.skipped
                            ? "bg-status-neutral"
                            : exAddressed
                              ? "bg-status-ontrack"
                              : "bg-muted",
                      )}
                    />
                  );
                })}
              </div>
              {/* The single exercise card (always expanded) */}
              {(() => {
                const suggestionsForExercise = new Map<
                  number,
                  { id: string; type: string; text: string }
                >();
                for (const s of activeSuggestions) {
                  if (s.exerciseId === focusExercise.id) {
                    suggestionsForExercise.set(s.setNumber, {
                      id: s.id,
                      type: s.result.type,
                      text: s.result.text,
                    });
                  }
                }
                return (
                  <ExerciseCard
                    key={focusExercise.id}
                    exercise={focusExercise}
                    exerciseIndex={focusIndex}
                    logs={setLogs[focusExercise.id] || []}
                    onUpdateLog={(setIndex, field, value) =>
                      updateSetLog(focusExercise.id, setIndex, field, value)
                    }
                    onUpdateLogExtra={(setIndex, key, value) =>
                      updateSetExtra(focusExercise.id, setIndex, key, value)
                    }
                    onCompleteSet={(setIndex, restSeconds, forceRest) =>
                      completeSet(focusExercise.id, setIndex, restSeconds, forceRest)
                    }
                    onSwapExercise={() => {
                      setSwapExerciseId(focusExercise.id);
                      setShowSwapPicker(true);
                    }}
                    onSkipExercise={() => skipExercise(focusExercise.id)}
                    onSkipSet={(setIndex) => skipSet(focusExercise.id, setIndex)}
                    isExpanded={true}
                    onToggle={() => {}}
                    activeSuggestionForSet={suggestionsForExercise}
                    onDismissSuggestion={(id) => logProgressionResponse(id, "dismissed")}
                    unit={activeUnit}
                  />
                );
              })()}
            </div>
          ) : null}
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

        {/* Bottom CTA — §3: Begin/Resume/Finish on overview; Next/Finish on focus */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
          <div className="container max-w-3xl mx-auto">
            {mode === "overview" ? (
              <Button
                className="w-full h-12 text-base"
                disabled={submitting || isFinishing}
                onClick={() => {
                  if (progressPercent >= 100) {
                    handleFinish();
                    return;
                  }
                  setFocusIndex(
                    hasLoggedProgress && firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0,
                  );
                  setMode("focus");
                }}
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : progressPercent >= 100 ? (
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                ) : null}
                {progressPercent >= 100
                  ? "Finish workout"
                  : hasLoggedProgress
                    ? "Resume"
                    : "Begin workout"}
              </Button>
            ) : progressPercent >= 100 ? (
              <Button
                className="w-full h-12 text-base"
                onClick={handleFinish}
                disabled={submitting || isFinishing}
              >
                {submitting || isFinishing ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                )}
                Finish workout
              </Button>
            ) : !isLastFocus ? (
              <Button
                className="w-full h-12 text-base"
                onClick={() =>
                  setFocusIndex((i) =>
                    Math.min(i + 1, (module?.exercises.length ?? 1) - 1),
                  )
                }
              >
                Next exercise
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            ) : (
              /* Last exercise with sets still unlogged — implicit skip: finishing
                 marks the remaining sets skipped after a confirm. */
              <Button
                className="w-full h-12 text-base"
                variant="outline"
                onClick={handleFinish}
                disabled={submitting || isFinishing}
              >
                {submitting || isFinishing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Finish workout · {remainingSets} set{remainingSets !== 1 ? "s" : ""} left
              </Button>
            )}
            {/* Partial finish from the overview — skip remaining unlogged sets. */}
            {mode === "overview" && hasLoggedProgress && progressPercent < 100 && (
              <Button
                variant="ghost"
                className="mt-2 w-full text-sm text-muted-foreground"
                onClick={handleFinish}
                disabled={submitting || isFinishing}
              >
                Finish &amp; skip remaining
              </Button>
            )}
          </div>
        </div>

        {/* WK7 §2e — completion summary; Done navigates to the calendar. */}
        <WorkoutCompletionSheet
          open={summary !== null}
          summary={summary}
          unit={activeUnit}
          onDone={() => {
            setSummary(null);
            navigate("/client/workout/calendar");
          }}
          coachWhatsApp={coachWhatsApp}
          moduleTitle={module?.title}
          sessionDateLabel={new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        />

        {/* Implicit skip — confirm finishing with unlogged sets. */}
        <AlertDialog
          open={finishUnloggedCount !== null}
          onOpenChange={(o) => { if (!o) setFinishUnloggedCount(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Finish with {finishUnloggedCount} set{finishUnloggedCount !== 1 ? "s" : ""} unlogged?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Any set you didn't log will be marked as skipped. Your logged sets are saved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep logging</AlertDialogCancel>
              <AlertDialogAction onClick={confirmFinish}>Finish workout</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}

export default function WorkoutSessionV2() {
  return <WorkoutSessionV2Content />;
}
