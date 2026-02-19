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
import { MUSCLE_GROUPS, DAYS_OF_WEEK, getMuscleDisplay, resolveParentMuscleId } from "@/types/muscle-builder";
import type { MuscleSlotData } from "@/types/muscle-builder";

import { useMuscleBuilderState } from "./hooks/useMuscleBuilderState";
import { useMusclePlanVolume } from "./hooks/useMusclePlanVolume";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { MusclePalette } from "./MusclePalette";
import { VolumeOverview } from "./VolumeOverview";
import { FrequencyHeatmap } from "./FrequencyHeatmap";
import { PresetSelector } from "./PresetSelector";
import { ConvertToProgram } from "./ConvertToProgram";

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
  const { volumeEntries, summary, frequencyMatrix, placementCounts, consecutiveDayWarnings } =
    useMusclePlanVolume(state.slots);
  const { toast } = useToast();

  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);

  // #9 — Copy Day
  const [copiedDayIndex, setCopiedDayIndex] = useState<number | null>(null);

  // #6 — Volume bar click → scroll
  const [highlightedMuscleId, setHighlightedMuscleId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // #2 — Delete undo ref
  const lastDeletedSlotRef = useRef<{ dayIndex: number; muscleId: string; sets: number; sortOrder: number } | null>(null);

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

      // Palette → Day: ADD muscle (copy)
      if (source.droppableId === 'palette' && destination.droppableId.startsWith('day-')) {
        const dayIndex = parseInt(destination.droppableId.replace('day-', ''));
        const muscleId = draggableId.replace('palette-', '');
        dispatch({ type: 'ADD_MUSCLE', dayIndex, muscleId });
        return;
      }

      // Day → Same Day: REORDER
      if (
        source.droppableId.startsWith('day-') &&
        source.droppableId === destination.droppableId
      ) {
        const dayIndex = parseInt(source.droppableId.replace('day-', ''));
        dispatch({
          type: 'REORDER',
          dayIndex,
          fromIndex: source.index,
          toIndex: destination.index,
        });
        return;
      }

      // Day → Different Day: MOVE
      if (
        source.droppableId.startsWith('day-') &&
        destination.droppableId.startsWith('day-')
      ) {
        const toDay = parseInt(destination.droppableId.replace('day-', ''));
        const slotId = draggableId.replace('slot-', '');

        dispatch({
          type: 'MOVE_MUSCLE',
          slotId,
          toDay,
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

  // Click/tap to add muscle (mobile inline picker + desktop popover)
  const handleAddMuscle = useCallback(
    (dayIndex: number, muscleId: string) => {
      dispatch({ type: 'ADD_MUSCLE', dayIndex, muscleId });
    },
    [dispatch]
  );

  // #2 — Delete with undo
  const handleRemoveMuscle = useCallback(
    (slotId: string) => {
      const slot = state.slots.find(s => s.id === slotId);
      if (slot) {
        lastDeletedSlotRef.current = {
          dayIndex: slot.dayIndex,
          muscleId: slot.muscleId,
          sets: slot.sets,
          sortOrder: slot.sortOrder,
        };
      }
      dispatch({ type: 'REMOVE_MUSCLE', slotId });
      const muscle = slot ? getMuscleDisplay(slot.muscleId) : null;
      const dayName = slot ? DAYS_OF_WEEK[slot.dayIndex - 1] : '';
      toast({
        title: `Removed ${muscle?.label || 'muscle'} from ${dayName}`,
        action: (
          <ToastAction
            altText="Undo"
            onClick={() => {
              const deleted = lastDeletedSlotRef.current;
              if (deleted) {
                dispatch({ type: 'ADD_MUSCLE', dayIndex: deleted.dayIndex, muscleId: deleted.muscleId, sets: deleted.sets });
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    },
    [state.slots, dispatch, toast]
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

  // #6 — Volume bar click → scroll to first day with muscle
  const handleMuscleClick = useCallback(
    (muscleId: string) => {
      const slot = state.slots.find(s => resolveParentMuscleId(s.muscleId) === muscleId);
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
    [state.slots, dispatch]
  );

  const isEmpty = state.slots.length === 0;

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
            <Button variant="outline" size="sm" onClick={save} disabled={state.isSaving || !state.isDirty}>
              {state.isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save
              {state.isDirty && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </Button>
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

            {/* Weekly Calendar */}
            <WeeklyCalendar
              slots={state.slots}
              selectedDayIndex={state.selectedDayIndex}
              onSelectDay={handleSelectDay}
              onSetSlotDetails={handleSetSlotDetails}
              onRemove={handleRemoveMuscle}
              onAddMuscle={handleAddMuscle}
              copiedDayIndex={copiedDayIndex}
              onCopyDay={handleCopyDay}
              onPasteDay={handlePasteDay}
              highlightedMuscleId={highlightedMuscleId}
              onSetAllSets={handleSetAllSets}
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
                    slots={state.slots}
                    frequencyMatrix={frequencyMatrix}
                    consecutiveDayWarnings={consecutiveDayWarnings}
                  />
                </TabsContent>
              </Tabs>
            )}

            {/* Convert to Program Dialog */}
            <ConvertToProgram
              slots={state.slots}
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
