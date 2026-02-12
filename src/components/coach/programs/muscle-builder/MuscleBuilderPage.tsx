import { useState, useCallback, useMemo } from "react";
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
import {
  ArrowLeft,
  Save,
  ArrowRightLeft,
  Trash2,
  Loader2,
  Bookmark,
  Palette,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MUSCLE_GROUPS } from "@/types/muscle-builder";

import { useMuscleBuilderState } from "./hooks/useMuscleBuilderState";
import { useMusclePlanVolume } from "./hooks/useMusclePlanVolume";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { MusclePalette } from "./MusclePalette";
import { VolumeOverview } from "./VolumeOverview";
import { FrequencyHeatmap } from "./FrequencyHeatmap";
import { PresetSelector } from "./PresetSelector";
import { ConvertToProgramDialog } from "./ConvertToProgramDialog";

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
  const { state, dispatch, save, saveAsPreset } = useMuscleBuilderState(coachUserId, existingTemplateId);
  const { volumeEntries, summary, frequencyMatrix, placementCounts, consecutiveDayWarnings } =
    useMusclePlanVolume(state.slots);
  const { toast } = useToast();

  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);

  // ── DnD Handler ──────────────────────────────────────────────
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;

      // Palette → Day: ADD muscle (copy)
      if (source.droppableId === 'palette' && destination.droppableId.startsWith('day-')) {
        const dayIndex = parseInt(destination.droppableId.replace('day-', ''));
        const muscleId = draggableId.replace('palette-', '');

        // Duplicate check
        const exists = state.slots.some(
          s => s.dayIndex === dayIndex && s.muscleId === muscleId
        );
        if (exists) {
          const muscle = MUSCLE_GROUPS.find(m => m.id === muscleId);
          toast({
            title: `${muscle?.label || muscleId} already on ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dayIndex - 1]}`,
            variant: 'destructive',
          });
          return;
        }

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
        const fromDay = parseInt(source.droppableId.replace('day-', ''));
        const toDay = parseInt(destination.droppableId.replace('day-', ''));
        // Extract muscleId from draggableId: "slot-{day}-{muscleId}"
        const muscleId = draggableId.replace(`slot-${fromDay}-`, '');

        const existsOnTarget = state.slots.some(
          s => s.dayIndex === toDay && s.muscleId === muscleId
        );
        if (existsOnTarget) {
          const muscle = MUSCLE_GROUPS.find(m => m.id === muscleId);
          toast({
            title: `${muscle?.label || muscleId} already on ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][toDay - 1]}`,
            variant: 'destructive',
          });
          return;
        }

        dispatch({
          type: 'MOVE_MUSCLE',
          fromDay,
          toDay,
          muscleId,
          toIndex: destination.index,
        });
      }
    },
    [state.slots, dispatch, toast]
  );

  // ── Memoized callbacks for child components ──────────────────
  const handleSelectDay = useCallback(
    (dayIndex: number) => dispatch({ type: 'SELECT_DAY', dayIndex }),
    [dispatch]
  );

  const handleSetSets = useCallback(
    (dayIndex: number, muscleId: string, sets: number) =>
      dispatch({ type: 'SET_SETS', dayIndex, muscleId, sets }),
    [dispatch]
  );

  const handleRemoveMuscle = useCallback(
    (dayIndex: number, muscleId: string) =>
      dispatch({ type: 'REMOVE_MUSCLE', dayIndex, muscleId }),
    [dispatch]
  );

  const handleLoadPreset = useCallback(
    (slots: import("@/types/muscle-builder").MuscleSlotData[], name?: string) => {
      dispatch({ type: 'LOAD_PRESET', slots, name });
    },
    [dispatch]
  );

  const handleConverted = useCallback(
    (programId: string) => {
      setShowConvertDialog(false);
      if (onOpenProgram) {
        onOpenProgram(programId);
      }
    },
    [onOpenProgram]
  );

  const handleClearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
    setShowClearDialog(false);
  }, [dispatch]);

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
            {/* Mobile palette trigger */}
            <Sheet open={mobilePaletteOpen} onOpenChange={setMobilePaletteOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConvertDialog(true)}
                >
                  <ArrowRightLeft className="h-4 w-4 mr-1" />
                  Convert
                </Button>
              </>
            )}
            <Button size="sm" onClick={save} disabled={state.isSaving || !state.isDirty}>
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
          </div>
        </div>

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
              onSetSets={handleSetSets}
              onRemove={handleRemoveMuscle}
            />

            {isEmpty && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Drag muscles from the palette to start planning your week
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
                  <VolumeOverview entries={volumeEntries} summary={summary} />
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
              This will remove all muscle placements from every day. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClearAll}>Clear All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Convert Dialog ────────────────────────────────────── */}
      <ConvertToProgramDialog
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
        slots={state.slots}
        summary={summary}
        planName={state.name}
        coachUserId={coachUserId}
        templateId={state.templateId}
        onConverted={handleConverted}
      />
    </DragDropContext>
  );
}
