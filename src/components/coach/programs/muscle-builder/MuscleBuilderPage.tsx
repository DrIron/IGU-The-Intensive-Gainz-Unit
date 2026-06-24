import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
  Bookmark,
  ChevronRight,
  X,
  Zap,
  Undo2,
  Redo2,
  Plus,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MUSCLE_GROUPS, DAYS_OF_WEEK, getMuscleDisplay, resolveParentMuscleId } from "@/types/muscle-builder";
import type { ActivityType, MuscleSlotData, SlotExercise } from "@/types/muscle-builder";
import type { SetPrescription } from "@/types/workout-builder";
import { AVAILABLE_CLIENT_COLUMNS } from "@/types/workout-builder";
import { ExercisePickerDialog } from "../ExercisePickerDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings2 } from "lucide-react";

import { useMuscleBuilderState, getCurrentSlots, getCurrentSessions, hasAnyDeltaRules } from "./hooks/useMuscleBuilderState";
import { useMusclePlanVolume } from "./hooks/useMusclePlanVolume";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { WeekTabStrip } from "./WeekTabStrip";
import { VolumeOverview } from "./VolumeOverview";
import { FrequencyHeatmap } from "./FrequencyHeatmap";
import { ProgressionOverview } from "./ProgressionOverview";
import { PresetSelector } from "./PresetSelector";
import { ConvertToProgram } from "./ConvertToProgram";
import { SaveStatusBadge, type SaveState } from "./SaveStatusBadge";
import { LinkedContentList } from "@/components/educational/LinkedContentList";
import { DeloadDialog, type ApplyDeloadParams } from "./DeloadDialog";
import { ProgressionRulesBar } from "./ProgressionRulesBar";

interface MuscleBuilderPageProps {
  coachUserId: string;
  existingTemplateId?: string;
  onBack: () => void;
  onOpenProgram?: (programId: string) => void;
}

export function MuscleBuilderPage({
  coachUserId,
  existingTemplateId,
  onBack,
  onOpenProgram,
}: MuscleBuilderPageProps) {
  const { state, dispatch, save, saveAsPreset, canUndo, canRedo } = useMuscleBuilderState(coachUserId, existingTemplateId);
  const currentWeekSlots = getCurrentSlots(state);
  const currentWeekSessions = getCurrentSessions(state);
  const { volumeEntries, summary, frequencyMatrix, placementCounts, consecutiveDayWarnings } =
    useMusclePlanVolume(currentWeekSlots);
  const { toast } = useToast();

  // Recently-used muscles in the current week, most-recent first, deduped.
  // Drives the "Recently used" row at the top of every session picker so a
  // coach scaffolding "Pecs > Pecs > Pecs" across days doesn't have to scan
  // the body-region accordion three times.
  const recentMuscleIds = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    // sortOrder is monotonic per session; higher = added later. We want
    // newest-first across the entire week, so sort all slots by sortOrder desc.
    const sorted = currentWeekSlots
      .filter(s => !s.activityType || s.activityType === 'strength')
      .slice()
      .sort((a, b) => b.sortOrder - a.sortOrder);
    for (const slot of sorted) {
      if (seen.has(slot.muscleId)) continue;
      seen.add(slot.muscleId);
      out.push(slot.muscleId);
      if (out.length >= 5) break;
    }
    return out;
  }, [currentWeekSlots]);

  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  // PR L-fix: linked content lives on the converted program_template, not the
  // muscle template. We read muscle_program_templates.converted_program_id to
  // know whether to render LinkedContentList. Refetched when the Convert
  // dialog closes so a successful conversion surfaces the section without a
  // page reload (covers the case where onOpenProgram isn't provided and the
  // coach stays on the builder).
  const [convertedProgramId, setConvertedProgramId] = useState<string | null>(null);
  useEffect(() => {
    if (!state.templateId) {
      setConvertedProgramId(null);
      return;
    }
    if (showConvertDialog) return; // skip while dialog is open; refetch on close
    let cancelled = false;
    supabase
      .from("muscle_program_templates")
      .select("converted_program_id")
      .eq("id", state.templateId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[MuscleBuilderPage] converted_program_id fetch:", error.message);
          return;
        }
        setConvertedProgramId(data?.converted_program_id ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [state.templateId, showConvertDialog]);

  // Save status — derived from reducer state + two local pieces
  // (lastSavedAt so we can show "Saved 3s ago"; saveError so the badge can
  // render "Save failed — retry" without us having to surface it separately).
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const wasSaving = useRef(false);
  useEffect(() => {
    if (wasSaving.current && !state.isSaving) {
      // Just finished a save (or save attempt)
      if (state.isDirty) {
        // Save attempt failed — reducer fires SAVE_ERROR which keeps isDirty=true.
        setSaveError("please retry");
      } else {
        setLastSavedAt(Date.now());
        setSaveError(null);
      }
    }
    wasSaving.current = state.isSaving;
  }, [state.isSaving, state.isDirty]);

  const saveState: SaveState = state.isSaving
    ? "saving"
    : saveError
      ? "error"
      : state.isDirty
        ? "dirty"
        : lastSavedAt
          ? "saved"
          : "idle";

  // #9 — Copy Day
  const [copiedDayIndex, setCopiedDayIndex] = useState<number | null>(null);

  // #6 — Volume bar click → scroll
  const [highlightedMuscleId, setHighlightedMuscleId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Name-first sessions — id of a just-created session whose name input should
  // auto-focus on mount. Set by handleAddSession; SessionBlock reads it once.
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);

  // ── Exercise Picker state ───────────────────────────────────
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);
  const [pickerMuscleId, setPickerMuscleId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<'primary' | 'replacement'>('primary');



  // ── Undo/Redo keyboard shortcuts ─────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      // Don't intercept when focus is in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      e.preventDefault();
      if (e.shiftKey) {
        dispatch({ type: 'REDO' });
      } else {
        dispatch({ type: 'UNDO' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  // ── DnD Handler ──────────────────────────────────────────────
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;

      // Session → Same Session: REORDER within that session
      if (
        source.droppableId.startsWith('session-') &&
        source.droppableId === destination.droppableId
      ) {
        const sessionId = source.droppableId.replace('session-', '');
        dispatch({
          type: 'REORDER_IN_SESSION',
          sessionId,
          fromIndex: source.index,
          toIndex: destination.index,
        });
        return;
      }

      // Session → Different Session: MOVE slot to the target session
      if (
        source.droppableId.startsWith('session-') &&
        destination.droppableId.startsWith('session-')
      ) {
        const toSessionId = destination.droppableId.replace('session-', '');
        const slotId = draggableId.replace('slot-', '');
        dispatch({
          type: 'MOVE_SLOT_TO_SESSION',
          slotId,
          toSessionId,
          toIndex: destination.index,
        });
      }
    },
    [dispatch]
  );

  // ── Memoized callbacks for child components ──────────────────
  const handleSelectDay = useCallback(
    (dayIndex: number) => dispatch({ type: 'SELECT_DAY', dayIndex }),
    [dispatch]
  );

  const handleSetSlotDetails = useCallback(
    (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) =>
      dispatch({ type: 'SET_SLOT_DETAILS', slotId, ...details }),
    [dispatch]
  );

  const handleReorderSlot = useCallback(
    (dayIndex: number, fromIndex: number, toIndex: number) =>
      dispatch({ type: 'REORDER', dayIndex, fromIndex, toIndex }),
    [dispatch]
  );

  // Session-scoped add (used by both desktop SessionBlock and mobile inline picker).
  const handleAddMuscleToSession = useCallback(
    (sessionId: string, muscleId: string) => {
      const session = currentWeekSessions.find(s => s.id === sessionId);
      if (!session) return;
      dispatch({ type: 'ADD_MUSCLE', dayIndex: session.dayIndex, muscleId, sessionId });
    },
    [currentWeekSessions, dispatch]
  );

  const handleAddActivityToSession = useCallback(
    (sessionId: string, activityId: string, activityType: ActivityType) => {
      const session = currentWeekSessions.find(s => s.id === sessionId);
      if (!session) return;
      dispatch({ type: 'ADD_ACTIVITY', dayIndex: session.dayIndex, activityId, activityType, sessionId });
    },
    [currentWeekSessions, dispatch]
  );

  // Unified picker (5g): place a real exercise_library exercise into ANY session
  // regardless of its focus label. Non-strength categories flow through here so
  // the slot stores slot.exercise + a derived activityType.
  const handleAddExerciseToSession = useCallback(
    (sessionId: string, exercise: { exerciseId: string; name: string }, activityType: ActivityType) => {
      const session = currentWeekSessions.find(s => s.id === sessionId);
      if (!session) return;
      dispatch({ type: 'ADD_EXERCISE_TO_SESSION', dayIndex: session.dayIndex, sessionId, exercise, activityType });
    },
    [currentWeekSessions, dispatch]
  );

  const handleAddSession = useCallback(
    (dayIndex: number, sessionType: ActivityType) => {
      // Generate the id here so we can auto-focus the new session's name input.
      const sessionId = crypto.randomUUID();
      dispatch({ type: 'ADD_SESSION', dayIndex, sessionType, sessionId });
      setFocusSessionId(sessionId);
    },
    [dispatch]
  );

  const handleRenameSession = useCallback(
    (sessionId: string, name: string) => dispatch({ type: 'RENAME_SESSION', sessionId, name }),
    [dispatch]
  );

  const handleSetSessionType = useCallback(
    (sessionId: string, sessionType: ActivityType) => dispatch({ type: 'SET_SESSION_TYPE', sessionId, sessionType }),
    [dispatch]
  );

  const handleRemoveSession = useCallback(
    (sessionId: string) => {
      // Snapshot state so the toast can surface a label even though the slots
      // are about to be deleted. Undo restores via the shared history stack.
      const session = currentWeekSessions.find(s => s.id === sessionId);
      const label = session?.name?.trim() || (session ? session.type : 'session');
      dispatch({ type: 'REMOVE_SESSION', sessionId });
      toast({
        title: `Removed ${label}`,
        action: (
          <ToastAction altText="Undo" onClick={() => dispatch({ type: 'UNDO' })}>Undo</ToastAction>
        ),
      });
    },
    [currentWeekSessions, dispatch, toast]
  );

  const handleDuplicateSessionToDay = useCallback(
    (sessionId: string, toDayIndex: number) => {
      dispatch({ type: 'DUPLICATE_SESSION_TO_DAY', sessionId, toDayIndex });
      toast({ title: `Session duplicated to ${DAYS_OF_WEEK[toDayIndex - 1]}` });
    },
    [dispatch, toast]
  );

  const handleReorderSession = useCallback(
    (dayIndex: number, fromIndex: number, toIndex: number) =>
      dispatch({ type: 'REORDER_SESSION', dayIndex, fromIndex, toIndex }),
    [dispatch]
  );

  // #2 — Delete with undo
  const handleRemoveMuscle = useCallback(
    (slotId: string) => {
      const slot = currentWeekSlots.find(s => s.id === slotId);
      dispatch({ type: 'REMOVE_MUSCLE', slotId });
      const muscle = slot ? getMuscleDisplay(slot.muscleId) : null;
      const dayName = slot ? DAYS_OF_WEEK[slot.dayIndex - 1] : '';
      toast({
        title: `Removed ${muscle?.label || 'muscle'} from ${dayName}`,
        action: (
          <ToastAction
            altText="Undo"
            onClick={() => {
              dispatch({ type: 'UNDO' });
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    },
    [currentWeekSlots, dispatch, toast]
  );

  const handleLoadPreset = useCallback(
    (slots: MuscleSlotData[], name?: string) => {
      dispatch({ type: 'LOAD_PRESET', slots, name });
    },
    [dispatch]
  );

  const handleClearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
    setShowClearDialog(false);
  }, [dispatch]);

  // #9 — Copy / Paste day
  const handleCopyDay = useCallback((dayIndex: number) => {
    setCopiedDayIndex(dayIndex);
    toast({ title: `${DAYS_OF_WEEK[dayIndex - 1]} copied — click Paste on target day` });
  }, [toast]);

  const handlePasteDay = useCallback((toDayIndex: number) => {
    if (copiedDayIndex == null) return;
    dispatch({ type: 'PASTE_DAY', fromDayIndex: copiedDayIndex, toDayIndex });
    setCopiedDayIndex(null);
    toast({ title: `Pasted to ${DAYS_OF_WEEK[toDayIndex - 1]}` });
  }, [copiedDayIndex, dispatch, toast]);

  // #8 — Bulk set all for muscle
  const handleSetAllSets = useCallback(
    (muscleId: string, sets: number) => {
      dispatch({ type: 'SET_ALL_SETS_FOR_MUSCLE', muscleId, sets });
      const muscle = getMuscleDisplay(muscleId);
      toast({ title: `Set all ${muscle?.label || muscleId} to ${sets} sets` });
    },
    [dispatch, toast]
  );

  // ── Exercise callbacks ──────────────────────────────────────
  const handleOpenExercisePicker = useCallback(
    (slotId: string, muscleId: string, mode: 'primary' | 'replacement') => {
      setPickerSlotId(slotId);
      setPickerMuscleId(muscleId);
      setPickerMode(mode);
      setExercisePickerOpen(true);
    },
    []
  );

  const handleExerciseSelected = useCallback(
    (exerciseId: string, _section: string, exerciseName?: string) => {
      if (!pickerSlotId) return;

      const exercise: SlotExercise = { exerciseId, name: exerciseName || 'Exercise' };

      if (pickerMode === 'primary') {
        dispatch({ type: 'SET_EXERCISE', slotId: pickerSlotId, exercise });
      } else {
        dispatch({ type: 'ADD_REPLACEMENT', slotId: pickerSlotId, exercise });
      }

      setExercisePickerOpen(false);
    },
    [pickerSlotId, pickerMode, dispatch]
  );

  // Replacement-mode batch commit: one dispatch appends all checked picks as a
  // single undo step. Primary selection still flows through handleExerciseSelected.
  const handleExercisesSelected = useCallback(
    (picks: { exerciseId: string; section: string; exerciseName: string }[]) => {
      if (!pickerSlotId || picks.length === 0) return;
      const exercises: SlotExercise[] = picks.map(p => ({
        exerciseId: p.exerciseId,
        name: p.exerciseName || 'Exercise',
      }));
      dispatch({ type: 'ADD_REPLACEMENTS', slotId: pickerSlotId, exercises });
      setExercisePickerOpen(false);
    },
    [pickerSlotId, dispatch]
  );

  const handleClearExercise = useCallback(
    (slotId: string) => {
      dispatch({ type: 'CLEAR_EXERCISE', slotId });
    },
    [dispatch]
  );

  const handleRemoveReplacement = useCallback(
    (slotId: string, replacementIndex: number) => {
      dispatch({ type: 'REMOVE_REPLACEMENT', slotId, replacementIndex });
    },
    [dispatch]
  );

  // ── Per-set + instructions + client inputs callbacks ───────
  const handleTogglePerSet = useCallback(
    (slotId: string) => dispatch({ type: 'TOGGLE_PER_SET', slotId }),
    [dispatch]
  );

  const handleUpdateSetDetail = useCallback(
    (slotId: string, setIndex: number, field: keyof SetPrescription, value: number | string | undefined) =>
      dispatch({ type: 'UPDATE_SET_DETAIL', slotId, setIndex, field, value }),
    [dispatch]
  );

  const handleDeleteSetAtIndex = useCallback(
    (slotId: string, setIndex: number) => dispatch({ type: 'DELETE_SET_AT_INDEX', slotId, setIndex }),
    [dispatch]
  );

  const handleApplySetToRemaining = useCallback(
    (slotId: string, fromIndex: number) => dispatch({ type: 'APPLY_SET_TO_REMAINING', slotId, fromIndex }),
    [dispatch]
  );

  const handleSetExerciseInstructions = useCallback(
    (slotId: string, instructions: string) =>
      dispatch({ type: 'SET_EXERCISE_INSTRUCTIONS', slotId, instructions }),
    [dispatch]
  );

  const handleSetSlotClientInputs = useCallback(
    (slotId: string, columns: string[] | undefined) =>
      dispatch({ type: 'SET_SLOT_CLIENT_INPUTS', slotId, columns }),
    [dispatch]
  );

  const handleSetGlobalClientInputs = useCallback(
    (columns: string[]) => dispatch({ type: 'SET_GLOBAL_CLIENT_INPUTS', columns }),
    [dispatch]
  );

  const handleSetSlotColumns = useCallback(
    (slotId: string, columns: string[]) => dispatch({ type: 'SET_SLOT_COLUMNS', slotId, columns }),
    [dispatch]
  );

  const handleSetActivityDetails = useCallback(
    (slotId: string, details: Record<string, unknown>) =>
      dispatch({ type: 'SET_ACTIVITY_DETAILS', slotId, details: details as any }),
    [dispatch]
  );

  // #6 — Volume bar click → scroll to first day with muscle
  const handleMuscleClick = useCallback(
    (muscleId: string) => {
      const slot = currentWeekSlots.find(s => resolveParentMuscleId(s.muscleId) === muscleId);
      if (!slot) return;

      dispatch({ type: 'SELECT_DAY', dayIndex: slot.dayIndex });

      const dayEl = document.querySelector(`[data-day-index="${slot.dayIndex}"]`);
      if (dayEl) {
        dayEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }

      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      setHighlightedMuscleId(muscleId);
      highlightTimeoutRef.current = setTimeout(() => setHighlightedMuscleId(null), 1500);
    },
    [currentWeekSlots, dispatch]
  );

  const isEmpty = currentWeekSlots.length === 0;

  const handleSelectWeek = useCallback(
    (weekIndex: number) => dispatch({ type: 'SELECT_WEEK', weekIndex }),
    [dispatch]
  );
  const handleAddWeek = useCallback(() => dispatch({ type: 'ADD_WEEK' }), [dispatch]);
  const handleAddWeekWithRules = useCallback(
    () => dispatch({ type: 'ADD_WEEK_WITH_RULES' }),
    [dispatch],
  );
  const handleAddWeekBlank = useCallback(
    () => dispatch({ type: 'ADD_WEEK_BLANK' }),
    [dispatch],
  );
  const planHasRules = useMemo(() => hasAnyDeltaRules(state), [state]);
  const isDeloadByWeek = useMemo(
    () => state.weeks.map(w => !!w.isDeload),
    [state.weeks],
  );
  const handleSetSlotDeltaRules = useCallback(
    (slotId: string, rules: import("./weeklyDeltaEngine").WeeklyDeltaRule[]) =>
      dispatch({ type: 'SET_SLOT_DELTA_RULES', slotId, rules }),
    [dispatch],
  );

  // Phase 4 — for each slot in the current week, look up the W1 sibling's rule
  // targets so MuscleSlotCard can render the inheritance bar with the right
  // auto/override chips. W1 slots see their own targets; W2+ slots see the
  // W1 sibling's targets matched by (dayIndex, sortOrder).
  const w1RuleTargetsBySlotId = useMemo(() => {
    const w1 = state.weeks[0];
    const currentWeek = state.weeks[state.currentWeekIndex];
    if (!w1 || !currentWeek) return new Map<string, import("./weeklyDeltaEngine").DeltaTarget[]>();
    const map = new Map<string, import("./weeklyDeltaEngine").DeltaTarget[]>();
    for (const slot of currentWeek.slots) {
      const w1Sibling = w1.slots.find(
        s => s.dayIndex === slot.dayIndex && s.sortOrder === slot.sortOrder,
      );
      if (w1Sibling?.deltaRules?.length) {
        map.set(slot.id, w1Sibling.deltaRules.map(r => r.target));
      }
    }
    return map;
  }, [state.weeks, state.currentWeekIndex]);

  // Phase 5 — deload dialog
  const [deloadDialogWeekIndex, setDeloadDialogWeekIndex] = useState<number | null>(null);
  const handleOpenDeloadDialog = useCallback((weekIndex: number) => {
    setDeloadDialogWeekIndex(weekIndex);
  }, []);
  const handleCloseDeloadDialog = useCallback(() => {
    setDeloadDialogWeekIndex(null);
  }, []);
  const handleApplyDeload = useCallback(
    (params: ApplyDeloadParams) => {
      dispatch({
        type: 'APPLY_DELOAD',
        weekIndex: params.weekIndex,
        baseContent: params.baseContent,
        sourceWeekIndex: params.sourceWeekIndex,
        presetId: params.presetId,
      });
      toast({ title: 'Deload applied' });
    },
    [dispatch, toast],
  );

  const handleClearSlotOverride = useCallback(
    (slotId: string, target: import("./weeklyDeltaEngine").DeltaTarget) => {
      dispatch({ type: 'CLEAR_FIELD_MANUAL_OVERRIDE', slotId, field: target });
      // Re-derive that slot's lineage from W1 + rules. Find the W1 sibling id
      // to scope the recompute. If we can't find one, recompute the whole plan.
      const currentSlot = state.weeks[state.currentWeekIndex]?.slots.find(s => s.id === slotId);
      if (currentSlot) {
        const w1Sibling = state.weeks[0]?.slots.find(
          s => s.dayIndex === currentSlot.dayIndex && s.sortOrder === currentSlot.sortOrder,
        );
        if (w1Sibling) {
          dispatch({ type: 'RECOMPUTE_DOWNSTREAM_FROM_DELTAS', slotId: w1Sibling.id });
          return;
        }
      }
      dispatch({ type: 'RECOMPUTE_DOWNSTREAM_FROM_DELTAS' });
    },
    [state.weeks, state.currentWeekIndex, dispatch],
  );
  const handleRemoveWeek = useCallback(
    (weekIndex: number) => dispatch({ type: 'REMOVE_WEEK', weekIndex }),
    [dispatch]
  );
  const handleDuplicateWeek = useCallback(
    (weekIndex: number) => dispatch({ type: 'DUPLICATE_WEEK', weekIndex }),
    [dispatch]
  );
  const handleSetWeekLabel = useCallback(
    (weekIndex: number, label: string) => dispatch({ type: 'SET_WEEK_LABEL', weekIndex, label }),
    [dispatch]
  );
  const handleToggleDeload = useCallback(
    (weekIndex: number) => dispatch({ type: 'TOGGLE_DELOAD', weekIndex }),
    [dispatch]
  );

  const handleApplyToRemaining = useCallback(
    (slotId: string, fields: Record<string, unknown>) => {
      dispatch({ type: 'APPLY_SLOT_TO_REMAINING', slotId, fields: fields as Partial<MuscleSlotData> });
      toast({ title: 'Applied to remaining weeks' });
    },
    [dispatch, toast]
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="space-y-0.5">
              <Input
                value={state.name}
                onChange={e => dispatch({ type: 'SET_NAME', name: e.target.value })}
                className="text-xl font-bold font-display border-none bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="Muscle Plan Name"
              />
              <Input
                value={state.description}
                onChange={e => dispatch({ type: 'SET_DESCRIPTION', description: e.target.value })}
                className="text-xs text-muted-foreground border-none bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="Add a description..."
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Undo / Redo */}
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => dispatch({ type: 'UNDO' })}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => dispatch({ type: 'REDO' })}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>

            {!isEmpty && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setShowClearDialog(true)}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear
                </Button>
                <Button variant="outline" size="sm" onClick={saveAsPreset} disabled={state.isSaving}>
                  <Bookmark className="h-4 w-4 mr-1" />
                  Save Preset
                </Button>
              </>
            )}
            {/* Global Client Inputs Config */}
            {!isEmpty && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings2 className="h-4 w-4 mr-1" />
                    Client Inputs
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" align="end">
                  <div className="space-y-2">
                    <p className="text-xs font-medium">What clients fill in</p>
                    <p className="text-[10px] text-muted-foreground">Applies to all slots by default</p>
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_CLIENT_COLUMNS.map(col => {
                        const active = state.globalClientInputs.includes(col.type);
                        return (
                          <button
                            key={col.type}
                            className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                              active
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "border-border/50 text-muted-foreground hover:border-border"
                            }`}
                            onClick={() => {
                              const next = active
                                ? state.globalClientInputs.filter(t => t !== col.type)
                                : [...state.globalClientInputs, col.type];
                              handleSetGlobalClientInputs(next);
                            }}
                          >
                            {col.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <SaveStatusBadge
              state={saveState}
              lastSavedAt={lastSavedAt}
              errorMessage={saveError}
              onSave={save}
            />
            {!isEmpty && (
              <Button size="sm" onClick={() => setShowConvertDialog(true)}>
                <Zap className="h-4 w-4 mr-1" />
                Create Program
              </Button>
            )}
          </div>
        </div>

        {/* ── Breadcrumb ──────────────────────────────────────── */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <button onClick={onBack} className="hover:text-foreground transition-colors">
            Programs
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium truncate">
            {state.name || 'Muscle Plan'}
          </span>
        </nav>

        {/* #9 — Clipboard banner */}
        {copiedDayIndex != null && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <span>
              <strong>{DAYS_OF_WEEK[copiedDayIndex - 1]}</strong> copied — click Paste on target day
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => setCopiedDayIndex(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* ── Main Layout ─────────────────────────────────────── */}
        {/* Single full-width column. Right-rail palette was removed in favor
            of the per-session inline picker. */}
        <div className="space-y-4 min-w-0">
            {/* Empty state: show presets */}
            {isEmpty && (
              <PresetSelector coachUserId={coachUserId} onSelectPreset={handleLoadPreset} />
            )}

            {/* Week Tab Strip */}
            <WeekTabStrip
              weeks={state.weeks}
              currentWeekIndex={state.currentWeekIndex}
              onSelectWeek={handleSelectWeek}
              onAddWeek={handleAddWeek}
              onAddWeekWithRules={handleAddWeekWithRules}
              onAddWeekBlank={handleAddWeekBlank}
              hasAnyDeltaRules={planHasRules}
              onRemoveWeek={handleRemoveWeek}
              onDuplicateWeek={handleDuplicateWeek}
              onSetWeekLabel={handleSetWeekLabel}
              onToggleDeload={handleToggleDeload}
              onOpenDeloadDialog={handleOpenDeloadDialog}
            />

            {/* Progression rules bar — aggregated authoring/review of the W1
                delta rules, surfaced out of the per-slot popovers. Hidden for
                single-week plans (handled inside the component). */}
            <ProgressionRulesBar
              weeks={state.weeks}
              planHasRules={planHasRules}
              onSetSlotDeltaRules={handleSetSlotDeltaRules}
            />

            {/* Phase 5 — Deload customisation dialog */}
            <DeloadDialog
              open={deloadDialogWeekIndex != null}
              weekIndex={deloadDialogWeekIndex}
              weeks={state.weeks}
              onClose={handleCloseDeloadDialog}
              onApply={handleApplyDeload}
            />

            {/* Weekly Calendar */}
            <WeeklyCalendar
              slots={currentWeekSlots}
              sessions={currentWeekSessions}
              selectedDayIndex={state.selectedDayIndex}
              onSelectDay={handleSelectDay}
              onSetSlotDetails={handleSetSlotDetails}
              onRemove={handleRemoveMuscle}
              onAddMuscleToSession={handleAddMuscleToSession}
              onAddActivityToSession={handleAddActivityToSession}
              onAddExerciseToSession={handleAddExerciseToSession}
              onAddSession={handleAddSession}
              onRenameSession={handleRenameSession}
              onSetSessionType={handleSetSessionType}
              onRemoveSession={handleRemoveSession}
              onDuplicateSessionToDay={handleDuplicateSessionToDay}
              onReorderSession={handleReorderSession}
              onClearExercise={handleClearExercise}
              onRemoveReplacement={handleRemoveReplacement}
              onOpenExercisePicker={handleOpenExercisePicker}
              onTogglePerSet={handleTogglePerSet}
              onUpdateSetDetail={handleUpdateSetDetail}
              onDeleteSetAtIndex={handleDeleteSetAtIndex}
              onApplySetToRemaining={handleApplySetToRemaining}
              onSetExerciseInstructions={handleSetExerciseInstructions}
              onSetSlotClientInputs={handleSetSlotClientInputs}
              onSetSlotColumns={handleSetSlotColumns}
              onSetActivityDetails={handleSetActivityDetails}
              globalClientInputs={state.globalClientInputs}
              copiedDayIndex={copiedDayIndex}
              onCopyDay={handleCopyDay}
              onPasteDay={handlePasteDay}
              highlightedMuscleId={highlightedMuscleId}
              onSetAllSets={handleSetAllSets}
              onReorderSlot={handleReorderSlot}
              weekCount={state.weeks.length}
              onApplyToRemaining={state.weeks.length > 1 ? handleApplyToRemaining : undefined}
              placementCounts={placementCounts}
              recentMuscleIds={recentMuscleIds}
              weekIndex={state.currentWeekIndex}
              isDeloadByWeek={isDeloadByWeek}
              onSetSlotDeltaRules={handleSetSlotDeltaRules}
              w1RuleTargetsBySlotId={w1RuleTargetsBySlotId}
              onClearSlotOverride={handleClearSlotOverride}
              focusSessionId={focusSessionId}
            />

            {/* #4 — First-time onboarding guide */}
            {isEmpty && (
              <div className="rounded-lg border-2 border-dashed border-border/60 bg-muted/10 p-6">
                <h3 className="text-sm font-semibold mb-4">How to build a muscle plan</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { step: 1, title: 'Pick a preset', desc: 'Start from a template above, or add a session and place muscles' },
                    { step: 2, title: 'Adjust sets', desc: 'Use the number input on each muscle card' },
                    { step: 3, title: 'Check volume', desc: 'Review analytics below to stay in productive range' },
                    { step: 4, title: 'Convert', desc: 'Turn your plan into a program with exercises' },
                  ].map(s => (
                    <div key={s.step} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                          {s.step}
                        </span>
                        <span className="text-sm font-medium">{s.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pl-8">{s.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/30 text-xs text-muted-foreground">
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Hover any session and click + to add a muscle or activity</span>
                  <span className="sm:hidden">Tap a day, then tap + Add muscle</span>
                </div>
              </div>
            )}

            {/* Analytics tabs */}
            {!isEmpty && (
              <Tabs defaultValue="volume" className="w-full">
                <TabsList>
                  <TabsTrigger value="volume">Volume</TabsTrigger>
                  <TabsTrigger value="frequency">Frequency</TabsTrigger>
                  {state.weeks.length > 1 && (
                    <TabsTrigger value="progression">Across Weeks</TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="volume" className="mt-3">
                  <VolumeOverview
                    entries={volumeEntries}
                    summary={summary}
                    onMuscleClick={handleMuscleClick}
                  />
                </TabsContent>
                <TabsContent value="frequency" className="mt-3">
                  <FrequencyHeatmap
                    slots={currentWeekSlots}
                    frequencyMatrix={frequencyMatrix}
                    consecutiveDayWarnings={consecutiveDayWarnings}
                  />
                </TabsContent>
                {state.weeks.length > 1 && (
                  <TabsContent value="progression" className="mt-3 space-y-3">
                    {planHasRules && (
                      <div className="flex items-center justify-between gap-2 p-2 rounded-md border border-primary/30 bg-primary/5">
                        <div className="text-xs text-muted-foreground">
                          Re-derive W2+ values from your W1 rules. Manual overrides on later weeks are preserved.
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          onClick={() => {
                            dispatch({ type: 'RECOMPUTE_DOWNSTREAM_FROM_DELTAS' });
                            toast({ title: 'Recomputed downstream weeks' });
                          }}
                        >
                          Recompute downstream
                        </Button>
                      </div>
                    )}
                    <ProgressionOverview
                      weeks={state.weeks}
                      currentWeekIndex={state.currentWeekIndex}
                      onSelectWeek={handleSelectWeek}
                      onSetExerciseInstructions={handleSetExerciseInstructions}
                      onApplyToRemaining={handleApplyToRemaining}
                    />
                  </TabsContent>
                )}
              </Tabs>
            )}

            {/* Recommended content (PR L-fix). Linked content lives on the
                converted program_template, so the section appears only after
                conversion. Pre-conversion: inline hint that doubles as a nudge. */}
            {state.templateId &&
              (convertedProgramId ? (
                <LinkedContentList
                  target={{
                    kind: "program-template",
                    id: convertedProgramId,
                    title: state.name || "this program",
                  }}
                  emptyMessage="No content linked to this program yet. Add recommended videos or learning paths your clients should watch."
                />
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Convert this muscle plan to a program first to attach recommended educational content.
                  </AlertDescription>
                </Alert>
              ))}

            {/* Convert to Program Dialog */}
            <ConvertToProgram
              weeks={state.weeks}
              summary={summary}
              planName={state.name}
              coachUserId={coachUserId}
              templateId={state.templateId}
              isDirty={state.isDirty}
              onSave={save}
              onOpenProgram={onOpenProgram}
              open={showConvertDialog}
              onOpenChange={setShowConvertDialog}
            />
        </div>
      </div>

      {/* ── Exercise Picker Dialog ──────────────────────────────── */}
      <ExercisePickerDialog
        open={exercisePickerOpen}
        onOpenChange={setExercisePickerOpen}
        onSelectExercise={handleExerciseSelected}
        multiSelect={pickerMode === 'replacement'}
        onSelectMany={handleExercisesSelected}
        coachUserId={coachUserId}
        sourceMuscleId={pickerMuscleId}
      />

      {/* ── Clear Confirmation Dialog ─────────────────────────── */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all muscles?</DialogTitle>
            <DialogDescription>
              This will remove all muscle placements from every day. You can undo with Ctrl+Z.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClearAll}>Clear All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DragDropContext>
  );
}
