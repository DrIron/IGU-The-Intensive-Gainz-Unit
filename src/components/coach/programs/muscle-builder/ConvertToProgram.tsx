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
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { withTimeout } from "@/lib/withTimeout";
import { getMuscleDisplay, MUSCLE_TO_EXERCISE_FILTER, DAYS_OF_WEEK, type MuscleSlotData } from "@/types/muscle-builder";
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

      // Auto-fill exercises for each module (best-effort)
      let autoFilledCount = 0;
      try {
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
            // 2. Build muscle filter map and collect all primary_muscle values
            const muscleFilterMap = new Map<string, string[]>();
            const allPrimaryMuscles = new Set<string>();
            for (const mod of modules) {
              const filters = MUSCLE_TO_EXERCISE_FILTER[mod.source_muscle_id!];
              if (filters && filters.length > 0) {
                muscleFilterMap.set(mod.id, filters);
                for (const f of filters) allPrimaryMuscles.add(f);
              }
            }

            // 3. Batch query all matching exercises
            if (allPrimaryMuscles.size > 0) {
              const { data: exercises } = await supabase
                .from('exercise_library')
                .select('id, name, primary_muscle')
                .in('primary_muscle', Array.from(allPrimaryMuscles))
                .eq('is_active', true)
                .order('name');

              if (exercises && exercises.length > 0) {
                // Group by primary_muscle
                const exercisesByMuscle = new Map<string, typeof exercises>();
                for (const ex of exercises) {
                  const arr = exercisesByMuscle.get(ex.primary_muscle) || [];
                  arr.push(ex);
                  exercisesByMuscle.set(ex.primary_muscle, arr);
                }

                // 4. Pick up to 3 exercises per module, build batch inserts
                const meInserts: { id: string; day_module_id: string; exercise_id: string; section: string; sort_order: number }[] = [];
                const prescInserts: { module_exercise_id: string; set_count: number; rep_range_min: number; rep_range_max: number; intensity_type: string; intensity_value: number; rest_seconds: number }[] = [];

                for (const mod of modules) {
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

                  for (let i = 0; i < picked.length; i++) {
                    const meId = crypto.randomUUID();
                    meInserts.push({ id: meId, day_module_id: mod.id, exercise_id: picked[i].id, section: 'main', sort_order: i + 1 });
                    prescInserts.push({ module_exercise_id: meId, set_count: 3, rep_range_min: 8, rep_range_max: 12, intensity_type: 'rir', intensity_value: 2, rest_seconds: 90 });
                  }
                  autoFilledCount += picked.length;
                }

                // 5. Batch insert
                if (meInserts.length > 0) {
                  await supabase.from('module_exercises').insert(meInserts);
                  await supabase.from('exercise_prescriptions').insert(prescInserts);
                }
              }
            }
          }
        }
      } catch (autoFillError) {
        console.warn('Exercise auto-fill failed:', autoFillError);
      }

      toast({
        title: "Program created",
        description: autoFilledCount > 0
          ? `${result.total_days} training days, ${result.total_modules} modules. ${autoFilledCount} exercises auto-filled.`
          : `${result.total_days} training days with ${result.total_modules} muscle modules.`,
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
                      <span className="ml-auto font-mono">{slot.sets} sets</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Each muscle slot becomes a day module with exercises auto-filled from the library. You can edit them in the program editor.
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
