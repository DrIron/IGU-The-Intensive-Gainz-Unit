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
import { Loader2, AlertTriangle, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { withTimeout } from "@/lib/withTimeout";
import {
  getMuscleDisplay,
  MUSCLE_TO_EXERCISE_FILTER,
  DAYS_OF_WEEK,
  ACTIVITY_TYPE_COLORS,
  defaultSessionName,
  type MuscleSlotData,
  type WeekData,
  type SessionData,
} from "@/types/muscle-builder";
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

/** Payload shape sent to `convert_muscle_plan_to_program_v2` */
interface RpcSession {
  id: string;
  dayIndex: number;         // absolute (week offset applied)
  name?: string;
  type: string;
  sortOrder: number;
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

  // Preview breakdown grouped by week → day → session, mirroring how the
  // converted program will look (one module per session).
  const weekBreakdowns = useMemo(() => {
    return weeks.map((week, wi) => {
      const sessions = (week.sessions ?? []).slice().sort((a, b) => {
        if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
        return a.sortOrder - b.sortOrder;
      });
      const slotsBySession = new Map<string, MuscleSlotData[]>();
      for (const slot of week.slots) {
        const key = slot.sessionId || '__orphan__';
        const list = slotsBySession.get(key) || [];
        list.push(slot);
        slotsBySession.set(key, list);
      }
      const daysMap = new Map<number, SessionData[]>();
      for (const s of sessions) {
        const list = daysMap.get(s.dayIndex) || [];
        list.push(s);
        daysMap.set(s.dayIndex, list);
      }
      return {
        weekIndex: wi,
        label: week.label || `Week ${wi + 1}`,
        isDeload: week.isDeload,
        days: Array.from(daysMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([dayIndex, daySessions]) => ({
            dayIndex,
            sessions: daySessions.map(session => ({
              session,
              slots: (slotsBySession.get(session.id) || []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
            })),
          })),
      };
    });
  }, [weeks]);

  const exerciseStats = useMemo(() => {
    const strength = allSlots.filter(s => !s.activityType || s.activityType === 'strength');
    const withExercise = strength.filter(s => s.exercise).length;
    const withoutExercise = strength.length - withExercise;
    return { withExercise, withoutExercise };
  }, [allSlots]);

  const totalSessions = useMemo(
    () => weeks.reduce((sum, w) => sum + (w.sessions?.length ?? 0), 0),
    [weeks],
  );

  const totalTrainingDays = useMemo(() => {
    const set = new Set<string>();
    for (let wi = 0; wi < weeks.length; wi++) {
      for (const s of weeks[wi].sessions ?? []) set.add(`${wi}:${s.dayIndex}`);
    }
    return set.size;
  }, [weeks]);

  const handleConvert = useCallback(async () => {
    setConverting(true);
    try {
      if (isDirty && onSave) await onSave();

      // Flatten weeks → absolute session list (W1=1-7, W2=8-14, ...).
      // sessionId remapping: we preserve the client id so the RPC can echo
      // it back in the session_to_module map.
      const rpcSessions: RpcSession[] = [];
      const sessionSlotMap = new Map<string, MuscleSlotData[]>(); // client session id → its slots
      for (let wi = 0; wi < weeks.length; wi++) {
        const offset = wi * 7;
        for (const session of weeks[wi].sessions ?? []) {
          const absId = `${wi}:${session.id}`;
          rpcSessions.push({
            id: absId,
            dayIndex: session.dayIndex + offset,
            name: session.name?.trim() || undefined,
            type: session.type,
            sortOrder: session.sortOrder,
          });
          const mySlots = weeks[wi].slots
            .filter(sl => sl.sessionId === session.id)
            .map(sl => ({ ...sl, dayIndex: sl.dayIndex + offset }));
          sessionSlotMap.set(absId, mySlots);
        }
      }

      const { data, error } = await withTimeout(
        supabase.rpc("convert_muscle_plan_to_program_v2", {
          p_coach_id: coachUserId,
          p_plan_name: planName,
          p_plan_description: `Converted from muscle plan. ${weekCount} week${weekCount > 1 ? 's' : ''}, ${summary.musclesTargeted} muscles, ${summary.totalSets} total sets/week.`,
          p_muscle_template_id: templateId,
          p_sessions: rpcSessions,
        }),
        30000,
        "Convert muscle plan to program",
      );

      if (error) throw error;

      const result = data as {
        program_id: string;
        total_days: number;
        total_modules: number;
        session_to_module: Record<string, string>;
      };

      // 2. Insert module_exercises for strength session slots.
      //    Non-strength sessions keep module-only shape (title encodes
      //    the activity, same as the legacy conversion did for activities).
      let preSelectedCount = 0;
      let autoFilledCount = 0;

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
        if (firstSet.rest_seconds_max != null) presc.rest_seconds_max = firstSet.rest_seconds_max;
        if (firstSet.tempo ?? slot.tempo) presc.tempo = firstSet.tempo ?? slot.tempo;
        return presc;
      };

      // Auto-fill helper: pick first active exercise for a muscleId from the library.
      // Pre-loads the lookup set from all unplaced slots to keep the query shape stable.
      const unplacedMuscleIds = new Set<string>();
      for (const session of rpcSessions) {
        if (session.type !== 'strength') continue;
        const slotsForSession = sessionSlotMap.get(session.id) || [];
        for (const slot of slotsForSession) {
          if (!slot.exercise && slot.muscleId) {
            const filters = MUSCLE_TO_EXERCISE_FILTER[slot.muscleId];
            if (filters) for (const f of filters) unplacedMuscleIds.add(f);
          }
        }
      }

      const exercisesByMuscle = new Map<string, { id: string; primary_muscle: string }[]>();
      if (unplacedMuscleIds.size > 0) {
        const { data: exercises } = await supabase
          .from('exercise_library')
          .select('id, name, primary_muscle')
          .in('primary_muscle', Array.from(unplacedMuscleIds))
          .eq('is_active', true)
          .order('name');
        if (exercises) {
          for (const ex of exercises) {
            const arr = exercisesByMuscle.get(ex.primary_muscle) || [];
            arr.push(ex);
            exercisesByMuscle.set(ex.primary_muscle, arr);
          }
        }
      }

      for (const session of rpcSessions) {
        const moduleId = result.session_to_module[session.id];
        if (!moduleId) continue;
        if (session.type !== 'strength') continue;  // Non-strength = module only.

        const slotsForSession = sessionSlotMap.get(session.id) || [];
        let sortOrder = 1;
        for (const slot of slotsForSession) {
          if (slot.exercise) {
            const meId = crypto.randomUUID();
            meInserts.push({
              id: meId,
              day_module_id: moduleId,
              exercise_id: slot.exercise.exerciseId,
              section: 'main',
              sort_order: sortOrder++,
              ...(slot.exercise.instructions ? { instructions: slot.exercise.instructions } : {}),
            });
            prescInserts.push(buildPrescription(meId, slot));
            preSelectedCount++;

            if (slot.replacements && slot.replacements.length > 0) {
              for (const rep of slot.replacements) {
                const repMeId = crypto.randomUUID();
                meInserts.push({
                  id: repMeId,
                  day_module_id: moduleId,
                  exercise_id: rep.exerciseId,
                  section: 'accessory',
                  sort_order: sortOrder++,
                });
                prescInserts.push(buildPrescription(repMeId, slot));
              }
            }
          } else if (slot.muscleId) {
            // Auto-fill: pick one exercise per slot from the library.
            const filters = MUSCLE_TO_EXERCISE_FILTER[slot.muscleId];
            if (!filters) continue;
            let picked: { id: string } | null = null;
            for (const filter of filters) {
              const list = exercisesByMuscle.get(filter);
              if (list && list.length > 0) { picked = list[0]; break; }
            }
            if (!picked) continue;
            const meId = crypto.randomUUID();
            meInserts.push({
              id: meId,
              day_module_id: moduleId,
              exercise_id: picked.id,
              section: 'main',
              sort_order: sortOrder++,
            });
            prescInserts.push(buildPrescription(meId, slot));
            autoFilledCount++;
          }
        }
      }

      if (meInserts.length > 0) {
        const { error: meErr } = await supabase.from('module_exercises').insert(meInserts);
        if (meErr) throw meErr;
        const { error: prescErr } = await supabase.from('exercise_prescriptions').insert(prescInserts);
        if (prescErr) throw prescErr;
      }

      const parts: string[] = [`${result.total_days} training days, ${result.total_modules} sessions.`];
      if (weekCount > 1) parts.unshift(`${weekCount} weeks.`);
      if (preSelectedCount > 0) parts.push(`${preSelectedCount} exercises from your selections.`);
      if (autoFilledCount > 0) parts.push(`${autoFilledCount} auto-filled.`);

      toast({ title: "Program created", description: parts.join(' ') });

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
  }, [weeks, weekCount, summary, planName, coachUserId, templateId, isDirty, onSave, toast, onOpenChange, onOpenProgram]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Program</DialogTitle>
          <DialogDescription>
            {weekCount > 1 ? `${weekCount} weeks, ` : ''}
            {totalTrainingDays} training day{totalTrainingDays !== 1 ? 's' : ''}
            {weekCount > 1 ? '' : '/week'}, {totalSessions} session{totalSessions !== 1 ? 's' : ''}.
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
              {days.map(({ dayIndex, sessions }) => (
                <div key={`${weekIndex}-${dayIndex}`} className="rounded-md border border-border/30 bg-muted/10 px-3 py-2 mb-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold">
                      {DAYS_OF_WEEK[dayIndex - 1]}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {sessions.length} session{sessions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {sessions.map(({ session, slots }) => {
                      const typeColors = ACTIVITY_TYPE_COLORS[session.type];
                      const sessionLabel = session.name?.trim() || defaultSessionName(session.type);
                      return (
                        <div key={session.id} className="pl-2 border-l-2" style={{ borderColor: typeColors.colorHex }}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${typeColors.colorClass}`} />
                            <span className="text-xs font-medium">{sessionLabel}</span>
                            <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                              {slots.length} {slots.length === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                          {slots.map(slot => {
                            const isStrength = !slot.activityType || slot.activityType === 'strength';
                            if (isStrength) {
                              const muscle = getMuscleDisplay(slot.muscleId);
                              if (!muscle) return null;
                              return (
                                <div key={slot.id} className="flex items-center gap-1.5 text-xs text-muted-foreground pl-2">
                                  <div className={`w-1 h-1 rounded-full ${muscle.colorClass}`} />
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
                            return (
                              <div key={slot.id} className="flex items-center gap-1.5 text-xs text-muted-foreground pl-2">
                                <span className="truncate">{slot.activityName || slot.activityId}</span>
                                <span className="ml-auto font-mono shrink-0">{slot.duration || 30}min</span>
                              </div>
                            );
                          })}
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
              All {exerciseStats.withExercise} strength slots have exercises assigned
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Each session becomes a day module. Strength slots become exercises inside the module; non-strength sessions keep their coach-defined name as the module title.
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
