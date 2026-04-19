import { useState, useCallback, useRef, useEffect } from "react";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ToastAction } from "@/components/ui/toast";
import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
  Bookmark,
  Palette,
  ChevronRight,
  X,
  Zap,
  Undo2,
  Redo2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MUSCLE_GROUPS, DAYS_OF_WEEK, getMuscleDisplay, resolveParentMuscleId, ACTIVITY_MAP } from "@/types/muscle-builder";
import type { ActivityType, MuscleSlotData, SlotExercise } from "@/types/muscle-builder";
import type { SetPrescription } from "@/types/workout-builder";
import { AVAILABLE_CLIENT_COLUMNS } from "@/types/workout-builder";
import { ExercisePickerDialog } from "../ExercisePickerDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings2 } from "lucide-react";

import { useMuscleBuilderState, getCurrentSlots, getCurrentSessions } from "./hooks/useMuscleBuilderState";
import { useMusclePlanVolume } from "./hooks/useMusclePlanVolume";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { WeekTabStrip } from "./WeekTabStrip";
import { MusclePalette } from "./MusclePalette";
import { VolumeOverview } from "./VolumeOverview";
import { FrequencyHeatmap } from "./FrequencyHeatmap";
import { ProgressionOverview } from "./ProgressionOverview";
import { PresetSelector } from "./PresetSelector";
import { ConvertToProgram } from "./ConvertToProgram";
import { SaveStatusBadge, type SaveState } from "./SaveStatusBadge";

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

  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);

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

      // Palette → Session: ADD muscle/activity directly into a session.
      // Droppable ids are `session-${uuid}`; palette draggables remain
      // `palette-${muscleId}` or `palette-activity-${activityId}`.
      if (source.droppableId === 'palette' && destination.droppableId.startsWith('session-')) {
        const sessionId = destination.droppableId.replace('session-', '');
        const session = currentWeekSessions.find(s => s.id === sessionId);
        if (!session) return;
        const paletteId = draggableId.replace('palette-', '');

        if (paletteId.startsWith('activity-')) {
          const activityId = paletteId.replace('activity-', '');
          const activityDef = ACTIVITY_MAP.get(activityId);
          dispatch({
            type: 'ADD_ACTIVITY',
            dayIndex: session.dayIndex,
            activityId,
            activityType: activityDef?.category || session.type,
            sessionId,
          });
        } else {
          dispatch({ type: 'ADD_MUSCLE', dayIndex: session.dayIndex, muscleId: paletteId, sessionId });
        }
        return;
      }

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
    [dispatch, currentWeekSessions]
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

  const handleAddSession = useCallback(
    (dayIndex: number, sessionType: ActivityType) => {
      dispatch({ type: 'ADD_SESSION', dayIndex, sessionType });
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

            {/* Palette trigger — hidden on mobile (inline picker replaces it), visible on tablet */}
            <Sheet open={mobilePaletteOpen} onOpenChange={setMobilePaletteOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="hidden sm:inline-flex lg:hidden">
                  <Palette className="h-4 w-4 mr-2" />
                  Muscles
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[60vh]">
                <SheetHeader>
                  <SheetTitle>Muscle Palette</SheetTitle>
                </SheetHeader>
                <div className="mt-4 overflow-y-auto">
                  <MusclePalette placementCounts={placementCounts} />
                </div>
              </SheetContent>
            </Sheet>

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
        <div className="flex gap-4">
          {/* Left: Calendar + Analytics */}
          <div className="flex-1 space-y-4 min-w-0">
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
              onRemoveWeek={handleRemoveWeek}
              onDuplicateWeek={handleDuplicateWeek}
              onSetWeekLabel={handleSetWeekLabel}
              onToggleDeload={handleToggleDeload}
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
            />

            {/* #4 — First-time onboarding guide */}
            {isEmpty && (
              <div className="rounded-lg border-2 border-dashed border-border/60 bg-muted/10 p-6">
                <h3 className="text-sm font-semibold mb-4">How to build a muscle plan</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { step: 1, title: 'Pick a preset', desc: 'Start from a template above, or drag muscles manually' },
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
                  <Palette className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Drag muscles from the palette on the right, or click + on any day</span>
                  <span className="sm:hidden">Tap a day, then tap + Add Muscle</span>
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
                    <TabsTrigger value="progression">Progression</TabsTrigger>
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
                  <TabsContent value="progression" className="mt-3">
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

          {/* Right: Muscle Palette (desktop) */}
          <div className="hidden lg:block w-64 shrink-0 border-l border-border/50 pl-4">
            <MusclePalette placementCounts={placementCounts} />
          </div>
        </div>
      </div>

      {/* ── Exercise Picker Dialog ──────────────────────────────── */}
      <ExercisePickerDialog
        open={exercisePickerOpen}
        onOpenChange={setExercisePickerOpen}
        onSelectExercise={handleExerciseSelected}
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
