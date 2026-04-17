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
import { getMuscleDisplay, getActivityDisplay, MUSCLE_TO_EXERCISE_FILTER, DAYS_OF_WEEK, ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_COLORS, resolveParentMuscleId, type MuscleSlotData, type WeekData, type ActivityType } from "@/types/muscle-builder";
import type { VolumeSummary } from "./hooks/useMusclePlanVolume";

interface ConvertToProgramProps {
  weeks: WeekData[];
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
  weeks,
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

  const allSlots = useMemo(() => weeks.flatMap(w => w.slots), [weeks]);
  const weekCount = weeks.length;

  // Group slots by week then by training day for the preview
  const weekBreakdowns = useMemo(() => {
    return weeks.map((week, wi) => {
      const map = new Map<number, MuscleSlotData[]>();
      for (const slot of week.slots) {
        const day = map.get(slot.dayIndex) || [];
        day.push(slot);
        map.set(slot.dayIndex, day);
      }
      return {
        weekIndex: wi,
        label: week.label || `Week ${wi + 1}`,
        isDeload: week.isDeload,
        days: Array.from(map.entries())
          .sort(([a], [b]) => a - b)
          .map(([dayIndex, daySlots]) => ({
            dayIndex,
            daySlots: [...daySlots].sort((a, b) => a.sortOrder - b.sortOrder),
            totalSets: daySlots.reduce((sum, s) => sum + s.sets, 0),
          })),
      };
    });
  }, [weeks]);

  const exerciseStats = useMemo(() => {
    const withExercise = allSlots.filter(s => s.exercise).length;
    const withoutExercise = allSlots.length - withExercise;
    return { withExercise, withoutExercise };
  }, [allSlots]);

  const handleConvert = useCallback(async () => {
    setConverting(true);
    try {
      if (isDirty && onSave) {
        await onSave();
      }

      // Flatten all weeks with offset dayIndex: W0=1-7, W1=8-14, W2=15-21, etc.
      const allStrengthSlots: (MuscleSlotData & { _offsetDayIndex: number; _weekIndex: number })[] = [];
      const allActivitySlots: (MuscleSlotData & { _offsetDayIndex: number; _weekIndex: number })[] = [];

      for (let wi = 0; wi < weeks.length; wi++) {
        const offset = wi * 7;
        for (const slot of weeks[wi].slots) {
          const offsetSlot = { ...slot, _offsetDayIndex: slot.dayIndex + offset, _weekIndex: wi };
          if (!slot.activityType || slot.activityType === 'strength') {
            allStrengthSlots.push(offsetSlot);
          } else {
            allActivitySlots.push(offsetSlot);
          }
        }
      }

      const rpcSlots = allStrengthSlots.map(s => {
        const weekLabel = weekCount > 1 ? `W${s._weekIndex + 1} ` : '';
        return {
          dayIndex: s._offsetDayIndex,
          muscleId: s.muscleId,
          sets: s.sets,
          sortOrder: s.sortOrder,
          muscleLabel: `${weekLabel}${getMuscleDisplay(s.muscleId)?.label || s.muscleId}`,
        };
      });

      const { data, error } = await withTimeout(
        supabase.rpc("convert_muscle_plan_to_program", {
          p_coach_id: coachUserId,
          p_plan_name: planName,
          p_plan_description: `Converted from muscle plan. ${weekCount} week${weekCount > 1 ? 's' : ''}, ${summary.musclesTargeted} muscles, ${summary.totalSets} total sets/week.`,
          p_muscle_template_id: templateId,
          p_day_slots: rpcSlots,
        }),
        30000,
        "Convert muscle plan to program",
      );

      if (error) throw error;

      const result = data as { program_id: string; total_days: number; total_modules: number };

      // Add non-strength activity modules
      if (allActivitySlots.length > 0) {
        try {
          const { data: days } = await supabase
            .from('program_template_days')
            .select('id, day_index')
            .eq('program_template_id', result.program_id);

          if (days) {
            const dayMap = new Map(days.map(d => [d.day_index, d.id]));
            const SESSION_TYPE_MAP: Record<string, string> = {
              cardio: 'cardio', hiit: 'hiit', yoga_mobility: 'mobility',
              recovery: 'recovery', sport_specific: 'sport_specific',
            };

            for (const slot of allActivitySlots) {
              let dayId = dayMap.get(slot._offsetDayIndex);
              if (!dayId) {
                const dayName = DAYS_OF_WEEK[(slot.dayIndex - 1) % 7];
                const weekLabel = weekCount > 1 ? `W${slot._weekIndex + 1} ` : '';
                const { data: newDay } = await supabase
                  .from('program_template_days')
                  .insert({ program_template_id: result.program_id, day_index: slot._offsetDayIndex, day_title: `${weekLabel}${dayName} — ${slot.activityName || 'Activity'}` })
                  .select('id')
                  .single();
                if (newDay) { dayId = newDay.id; dayMap.set(slot._offsetDayIndex, dayId); }
              }
              if (dayId) {
                await supabase.from('day_modules').insert({
                  program_template_day_id: dayId,
                  module_owner_coach_id: coachUserId,
                  module_type: 'strength',
                  session_type: SESSION_TYPE_MAP[slot.activityType!] || 'other',
                  session_timing: 'anytime',
                  title: `${slot.activityName || 'Activity'} — ${slot.duration || 30}min`,
                  status: 'draft',
                });
              }
            }
          }
        } catch (activityErr) {
          console.warn('Activity module creation failed:', activityErr);
        }
      }

      // Fill exercises for each module
      let preSelectedCount = 0;
      let autoFilledCount = 0;
      try {
        const slotQueue = new Map<string, MuscleSlotData[]>();
        for (const slot of allStrengthSlots) {
          const arr = slotQueue.get(slot.muscleId) || [];
          arr.push(slot);
          slotQueue.set(slot.muscleId, arr);
          const parentId = resolveParentMuscleId(slot.muscleId);
          if (parentId !== slot.muscleId) {
            const parentArr = slotQueue.get(parentId) || [];
            parentArr.push({ ...slot });
            slotQueue.set(parentId, parentArr);
          }
        }

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
            const meInserts: { id: string; day_module_id: string; exercise_id: string; section: string; sort_order: number; instructions?: string }[] = [];
            const prescInserts: Record<string, unknown>[] = [];

            const buildPrescription = (meId: string, slot: MuscleSlotData) => {
              const setsJson = slot.setsDetail && slot.setsDetail.length > 0
                ? slot.setsDetail
                : Array.from({ length: slot.sets || 3 }, (_, si) => {
                    const repMin = slot.repMin ?? 8;
                    const repMax = slot.repMax ?? 12;
                    const hasRpe = slot.rpe != null && slot.rir == null;
                    return {
                      set_number: si + 1,
                      rep_range_min: repMin,
                      rep_range_max: repMax,
                      rest_seconds: 90,
                      ...(hasRpe ? { rpe: slot.rpe } : { rir: slot.rir ?? 2 }),
                      ...(slot.tempo ? { tempo: slot.tempo } : {}),
                    };
                  });

              const firstSet = setsJson[0] || {};
              const repMin = firstSet.rep_range_min ?? slot.repMin ?? 8;
              const repMax = firstSet.rep_range_max ?? slot.repMax ?? 12;
              const hasRpe = (firstSet.rpe != null && firstSet.rir == null) || (slot.rpe != null && slot.rir == null);
              const intensityType = hasRpe ? 'RPE' : 'RIR';
              const intensityValue = hasRpe ? (firstSet.rpe ?? slot.rpe ?? 8) : (firstSet.rir ?? slot.rir ?? 2);

              const presc: Record<string, unknown> = {
                module_exercise_id: meId,
                set_count: setsJson.length,
                rep_range_min: repMin,
                rep_range_max: repMax,
                intensity_type: intensityType,
                intensity_value: intensityValue,
                rest_seconds: firstSet.rest_seconds ?? 90,
                sets_json: setsJson,
              };
              if (firstSet.tempo ?? slot.tempo) presc.tempo = firstSet.tempo ?? slot.tempo;
              return presc;
            };

            const autoFillModules: typeof modules = [];

            for (const mod of modules) {
              const slot = slotQueue.get(mod.source_muscle_id!)?.shift();
              if (!slot) { autoFillModules.push(mod); continue; }

              if (slot.exercise) {
                const meId = crypto.randomUUID();
                meInserts.push({ id: meId, day_module_id: mod.id, exercise_id: slot.exercise.exerciseId, section: 'main', sort_order: 1, ...(slot.exercise.instructions ? { instructions: slot.exercise.instructions } : {}) });
                prescInserts.push(buildPrescription(meId, slot));
                preSelectedCount++;

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

                    const matchingSlot = allSlots.find(s => s.muscleId === mod.source_muscle_id) || { repMin: 8, repMax: 12, tempo: undefined, rir: undefined, rpe: undefined } as MuscleSlotData;

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

            if (meInserts.length > 0) {
              const { error: meInsertError } = await supabase.from('module_exercises').insert(meInserts);
              if (meInsertError) throw meInsertError;
              const { error: prescInsertError } = await supabase.from('exercise_prescriptions').insert(prescInserts);
              if (prescInsertError) throw prescInsertError;
            }
          }
        }
      } catch (autoFillError) {
        // Don't block program creation — the program scaffold already exists.
        // But surface the failure so the coach knows they'll need to add exercises manually.
        console.error('Exercise fill failed:', autoFillError);
        toast({
          title: "Program created, but exercises couldn't be added",
          description: autoFillError instanceof Error ? autoFillError.message : "Add exercises manually in the program editor.",
          variant: "destructive",
        });
      }

      const parts: string[] = [`${result.total_days} training days, ${result.total_modules} modules.`];
      if (weekCount > 1) parts.unshift(`${weekCount} weeks.`);
      if (preSelectedCount > 0) parts.push(`${preSelectedCount} exercises from your selections.`);
      if (autoFilledCount > 0) parts.push(`${autoFilledCount} auto-filled.`);

      toast({
        title: "Program created",
        description: parts.join(' '),
      });

      onOpenChange(false);
      onOpenProgram?.(result.program_id);
    } catch (error: unknown) {
      toast({
        title: "Conversion failed",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  }, [weeks, allSlots, weekCount, summary, planName, coachUserId, templateId, isDirty, onSave, toast, onOpenChange, onOpenProgram]);

  const totalModules = allSlots.length;
  const totalTrainingDays = new Set(allSlots.map(s => s.dayIndex)).size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Program</DialogTitle>
          <DialogDescription>
            Convert your muscle plan into a program with {weekCount > 1 ? `${weekCount} weeks, ` : ''}
            {totalTrainingDays} training day{totalTrainingDays !== 1 ? 's' : ''}/week
            {' '}and {totalModules} module{totalModules !== 1 ? 's' : ''}{weekCount > 1 ? '/week' : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {weekBreakdowns.map(({ weekIndex, label, isDeload, days }) => (
            <div key={weekIndex}>
              {weekCount > 1 && (
                <div className="flex items-center gap-2 mt-2 mb-1">
                  <span className="text-xs font-semibold">{label}</span>
                  {isDeload && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">Deload</span>
                  )}
                </div>
              )}
              {days.map(({ dayIndex, daySlots, totalSets }) => (
                <div key={`${weekIndex}-${dayIndex}`} className="rounded-md border border-border/30 bg-muted/10 px-3 py-2 mb-1">
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
                      const isStrength = !slot.activityType || slot.activityType === 'strength';
                      if (isStrength) {
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
                      }
                      const typeColors = ACTIVITY_TYPE_COLORS[slot.activityType!];
                      return (
                        <div key={slot.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <div className={`w-1.5 h-1.5 rounded-full ${typeColors.colorClass}`} />
                          <span>{slot.activityName || slot.activityId}</span>
                          <span className="ml-auto font-mono shrink-0">{slot.duration || 30}min</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

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
