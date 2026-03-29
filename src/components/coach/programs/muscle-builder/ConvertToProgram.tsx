import { memo, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Dumbbell, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { withTimeout } from "@/lib/withTimeout";
import { getMuscleDisplay, MUSCLE_TO_EXERCISE_FILTER, DAYS_OF_WEEK, resolveParentMuscleId, type MuscleSlotData } from "@/types/muscle-builder";
import type { VolumeSummary } from "./hooks/useMusclePlanVolume";

interface ConvertToProgramProps {
  slots: MuscleSlotData[];
  summary: VolumeSummary;
  planName: string;
  coachUserId: string;
  templateId: string | null;
  isDirty?: boolean;
  onSave?: () => Promise<void>;
  onOpenProgram?: (programId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ConvertToProgram = memo(function ConvertToProgram({
  slots,
  summary,
  planName,
  coachUserId,
  templateId,
  isDirty,
  onSave,
  onOpenProgram,
  open,
  onOpenChange,
}: ConvertToProgramProps) {
  const [converting, setConverting] = useState(false);
  const { toast } = useToast();

  // Group slots by training day for the preview
  const dayBreakdown = useMemo(() => {
    const map = new Map<number, MuscleSlotData[]>();
    for (const slot of slots) {
      const day = map.get(slot.dayIndex) || [];
      day.push(slot);
      map.set(slot.dayIndex, day);
    }
    // Sort by day index and sort slots within each day
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([dayIndex, daySlots]) => ({
        dayIndex,
        daySlots: [...daySlots].sort((a, b) => a.sortOrder - b.sortOrder),
        totalSets: daySlots.reduce((sum, s) => sum + s.sets, 0),
      }));
  }, [slots]);

  // Count slots with/without exercises for the warning
  const exerciseStats = useMemo(() => {
    const withExercise = slots.filter(s => s.exercise).length;
    const withoutExercise = slots.length - withExercise;
    return { withExercise, withoutExercise };
  }, [slots]);

  const handleConvert = useCallback(async () => {
    setConverting(true);
    try {
      // Auto-save if dirty
      if (isDirty && onSave) {
        await onSave();
      }

      // Build the slot array with muscle labels for the RPC
      const rpcSlots = slots.map(s => ({
        dayIndex: s.dayIndex,
        muscleId: s.muscleId,
        sets: s.sets,
        sortOrder: s.sortOrder,
        muscleLabel: getMuscleDisplay(s.muscleId)?.label || s.muscleId,
      }));

      const { data, error } = await withTimeout(
        supabase.rpc("convert_muscle_plan_to_program", {
          p_coach_id: coachUserId,
          p_plan_name: planName,
          p_plan_description: `Converted from muscle plan. ${summary.musclesTargeted} muscles, ${summary.totalSets} total sets.`,
          p_muscle_template_id: templateId,
          p_day_slots: rpcSlots,
        }),
        30000,
        "Convert muscle plan to program",
      );

      if (error) throw error;

      const result = data as { program_id: string; total_days: number; total_modules: number };

      // Fill exercises for each module (pre-selected first, then auto-fill for the rest)
      let preSelectedCount = 0;
      let autoFilledCount = 0;
      try {
        // Build rep range + intensity lookup: muscleId → queue of slot details (including exercise info)
        const slotQueue = new Map<string, MuscleSlotData[]>();
        for (const slot of slots) {
          const arr = slotQueue.get(slot.muscleId) || [];
          arr.push(slot);
          slotQueue.set(slot.muscleId, arr);
          // Also map to parent ID as fallback
          const parentId = resolveParentMuscleId(slot.muscleId);
          if (parentId !== slot.muscleId) {
            const parentArr = slotQueue.get(parentId) || [];
            parentArr.push({ ...slot });
            slotQueue.set(parentId, parentArr);
          }
        }

        // 1. Get all day_modules for this program with source_muscle_id
        const { data: days } = await supabase
          .from('program_template_days')
          .select('id')
          .eq('program_template_id', result.program_id);

        const dayIds = days?.map(d => d.id) || [];
        if (dayIds.length > 0) {
          const { data: modules } = await supabase
            .from('day_modules')
            .select('id, source_muscle_id')
            .in('program_template_day_id', dayIds)
            .not('source_muscle_id', 'is', null);

          if (modules && modules.length > 0) {
            const meInserts: { id: string; day_module_id: string; exercise_id: string; section: string; sort_order: number }[] = [];
            const prescInserts: Record<string, unknown>[] = [];

            // Helper: build prescription for a module exercise
            const buildPrescription = (meId: string, slot: MuscleSlotData) => {
              const repMin = slot.repMin ?? 8;
              const repMax = slot.repMax ?? 12;
              const hasRpe = slot.rpe != null && slot.rir == null;
              const intensityType = hasRpe ? 'RPE' : 'RIR';
              const intensityValue = hasRpe ? slot.rpe! : (slot.rir ?? 2);
              const setsJson = Array.from({ length: 3 }, (_, si) => ({
                set_number: si + 1,
                rep_range_min: repMin,
                rep_range_max: repMax,
                rest_seconds: 90,
                ...(hasRpe ? { rpe: slot.rpe } : { rir: slot.rir ?? 2 }),
                ...(slot.tempo ? { tempo: slot.tempo } : {}),
              }));
              const presc: Record<string, unknown> = {
                module_exercise_id: meId,
                set_count: 3,
                rep_range_min: repMin,
                rep_range_max: repMax,
                intensity_type: intensityType,
                intensity_value: intensityValue,
                rest_seconds: 90,
                sets_json: setsJson,
              };
              if (slot.tempo) presc.tempo = slot.tempo;
              return presc;
            };

            // Collect modules that need auto-fill (no pre-selected exercise)
            const autoFillModules: typeof modules = [];

            for (const mod of modules) {
              const slot = slotQueue.get(mod.source_muscle_id!)?.shift();
              if (!slot) { autoFillModules.push(mod); continue; }

              if (slot.exercise) {
                // Pre-selected exercise — use it directly
                const meId = crypto.randomUUID();
                meInserts.push({ id: meId, day_module_id: mod.id, exercise_id: slot.exercise.exerciseId, section: 'main', sort_order: 1 });
                prescInserts.push(buildPrescription(meId, slot));
                preSelectedCount++;

                // Also add replacement exercises if any
                if (slot.replacements && slot.replacements.length > 0) {
                  for (let ri = 0; ri < slot.replacements.length; ri++) {
                    const repMeId = crypto.randomUUID();
                    meInserts.push({ id: repMeId, day_module_id: mod.id, exercise_id: slot.replacements[ri].exerciseId, section: 'accessory', sort_order: ri + 2 });
                    prescInserts.push(buildPrescription(repMeId, slot));
                  }
                }
              } else {
                autoFillModules.push(mod);
              }
            }

            // Auto-fill remaining modules (same logic as before)
            if (autoFillModules.length > 0) {
              const muscleFilterMap = new Map<string, string[]>();
              const allPrimaryMuscles = new Set<string>();
              for (const mod of autoFillModules) {
                const filters = MUSCLE_TO_EXERCISE_FILTER[mod.source_muscle_id!];
                if (filters && filters.length > 0) {
                  muscleFilterMap.set(mod.id, filters);
                  for (const f of filters) allPrimaryMuscles.add(f);
                }
              }

              if (allPrimaryMuscles.size > 0) {
                const { data: exercises } = await supabase
                  .from('exercise_library')
                  .select('id, name, primary_muscle')
                  .in('primary_muscle', Array.from(allPrimaryMuscles))
                  .eq('is_active', true)
                  .order('name');

                if (exercises && exercises.length > 0) {
                  const exercisesByMuscle = new Map<string, typeof exercises>();
                  for (const ex of exercises) {
                    const arr = exercisesByMuscle.get(ex.primary_muscle) || [];
                    arr.push(ex);
                    exercisesByMuscle.set(ex.primary_muscle, arr);
                  }

                  for (const mod of autoFillModules) {
                    const filters = muscleFilterMap.get(mod.id);
                    if (!filters) continue;

                    const seen = new Set<string>();
                    const picked: { id: string }[] = [];
                    for (const filter of filters) {
                      for (const ex of exercisesByMuscle.get(filter) || []) {
                        if (picked.length >= 3) break;
                        if (seen.has(ex.id)) continue;
                        seen.add(ex.id);
                        picked.push(ex);
                      }
                      if (picked.length >= 3) break;
                    }

                    // Find slot details for this module's muscle
                    const matchingSlot = slots.find(s => s.muscleId === mod.source_muscle_id) || { repMin: 8, repMax: 12, tempo: undefined, rir: undefined, rpe: undefined } as MuscleSlotData;

                    for (let i = 0; i < picked.length; i++) {
                      const meId = crypto.randomUUID();
                      meInserts.push({ id: meId, day_module_id: mod.id, exercise_id: picked[i].id, section: 'main', sort_order: i + 1 });
                      prescInserts.push(buildPrescription(meId, matchingSlot));
                    }
                    autoFilledCount += picked.length;
                  }
                }
              }
            }

            // Batch insert all exercises and prescriptions
            if (meInserts.length > 0) {
              await supabase.from('module_exercises').insert(meInserts);
              await supabase.from('exercise_prescriptions').insert(prescInserts);
            }
          }
        }
      } catch (autoFillError) {
        console.warn('Exercise fill failed:', autoFillError);
      }

      const parts: string[] = [`${result.total_days} training days, ${result.total_modules} modules.`];
      if (preSelectedCount > 0) parts.push(`${preSelectedCount} exercises from your selections.`);
      if (autoFilledCount > 0) parts.push(`${autoFilledCount} auto-filled.`);

      toast({
        title: "Program created",
        description: parts.join(' '),
      });

      // Close dialog and navigate immediately
      onOpenChange(false);
      onOpenProgram?.(result.program_id);
    } catch (error: any) {
      toast({
        title: "Conversion failed",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  }, [slots, summary, planName, coachUserId, templateId, isDirty, onSave, toast, onOpenChange, onOpenProgram]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Program</DialogTitle>
          <DialogDescription>
            Convert your muscle plan into a program with {summary.trainingDays} training days
            and {slots.length} modules.
          </DialogDescription>
        </DialogHeader>

        {/* Day-by-day breakdown */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {dayBreakdown.map(({ dayIndex, daySlots, totalSets }) => (
            <div key={dayIndex} className="rounded-md border border-border/30 bg-muted/10 px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">
                  {DAYS_OF_WEEK[dayIndex - 1]}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {daySlots.length} modules, {totalSets} sets
                </span>
              </div>
              <div className="space-y-0.5">
                {daySlots.map(slot => {
                  const muscle = getMuscleDisplay(slot.muscleId);
                  if (!muscle) return null;
                  return (
                    <div key={slot.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className={`w-1.5 h-1.5 rounded-full ${muscle.colorClass}`} />
                      <span>{muscle.label}</span>
                      <span className="mx-1 text-border">→</span>
                      {slot.exercise ? (
                        <span className="text-emerald-500 font-medium truncate flex-1">{slot.exercise.name}</span>
                      ) : (
                        <span className="text-muted-foreground/50 italic truncate flex-1">auto-fill</span>
                      )}
                      <span className="ml-auto font-mono shrink-0">{slot.sets}s</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Exercise assignment status */}
        {exerciseStats.withoutExercise > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="text-amber-600 dark:text-amber-400 font-medium">
                {exerciseStats.withoutExercise} slot{exerciseStats.withoutExercise > 1 ? 's' : ''} without exercises
              </p>
              <p className="text-muted-foreground mt-0.5">
                Auto-fill will pick exercises from the library. You can still convert and edit later.
              </p>
            </div>
          </div>
        )}
        {exerciseStats.withoutExercise === 0 && exerciseStats.withExercise > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <Check className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              All {exerciseStats.withExercise} slots have exercises assigned
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {exerciseStats.withExercise > 0
            ? "Your chosen exercises will be used directly. Slots without exercises will be auto-filled from the library."
            : "Each muscle slot becomes a day module with exercises auto-filled from the library. You can edit them in the program editor."}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={converting}>
            Cancel
          </Button>
          <Button onClick={handleConvert} disabled={converting}>
            {converting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Program
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
