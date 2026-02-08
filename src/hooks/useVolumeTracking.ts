import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MuscleGroupVolume {
  muscle_group: string;
  total_sets: number;
  total_reps: number;
  total_volume: number; // sets × reps × load
}

interface WeeklyVolume {
  week_start: string;
  muscle_groups: MuscleGroupVolume[];
}

interface UseVolumeTrackingResult {
  weeklyVolume: WeeklyVolume[];
  loading: boolean;
  refetch: () => void;
}

/**
 * Tracks weekly training volume per muscle group from exercise logs.
 * Calculates total sets, reps, and volume (sets × reps × load) per muscle group per week.
 */
export function useVolumeTracking(
  clientUserId: string | undefined,
  weeksBack = 8
): UseVolumeTrackingResult {
  const [weeklyVolume, setWeeklyVolume] = useState<WeeklyVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const fetchVolume = useCallback(async () => {
    if (!clientUserId) return;

    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeksBack * 7);

      // Get all exercise set logs for this client in the date range
      const { data: logs, error: logsError } = await supabase
        .from("exercise_set_logs")
        .select(`
          set_index,
          performed_reps,
          performed_load,
          created_at,
          client_module_exercise_id
        `)
        .eq("created_by_user_id", clientUserId)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .not("performed_reps", "is", null);

      if (logsError) throw logsError;
      if (!logs || logs.length === 0) {
        setWeeklyVolume([]);
        return;
      }

      // Get exercise IDs for all the logged exercises
      const cmeIds = [...new Set(logs.map((l) => l.client_module_exercise_id))];

      const { data: cmeData, error: cmeError } = await supabase
        .from("client_module_exercises")
        .select("id, exercise_id")
        .in("id", cmeIds);

      if (cmeError) throw cmeError;

      // Get exercise library data for muscle groups
      const exerciseIds = [...new Set((cmeData || []).map((c) => c.exercise_id))];

      const { data: exerciseData, error: exError } = await supabase
        .from("exercise_library")
        .select("id, primary_muscle")
        .in("id", exerciseIds);

      if (exError) throw exError;

      // Build lookup maps
      const cmeToExercise = new Map<string, string>();
      for (const cme of cmeData || []) {
        cmeToExercise.set(cme.id, cme.exercise_id);
      }

      const exerciseToMuscle = new Map<string, string>();
      for (const ex of exerciseData || []) {
        exerciseToMuscle.set(ex.id, ex.primary_muscle);
      }

      // Group logs by week
      const weekMap = new Map<string, Map<string, MuscleGroupVolume>>();

      for (const log of logs) {
        const exerciseId = cmeToExercise.get(log.client_module_exercise_id);
        if (!exerciseId) continue;

        const muscle = exerciseToMuscle.get(exerciseId);
        if (!muscle) continue;

        // Get Monday of the week for this log
        const logDate = new Date(log.created_at);
        const dayOfWeek = logDate.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(logDate);
        monday.setDate(monday.getDate() + mondayOffset);
        const weekKey = monday.toISOString().split("T")[0];

        if (!weekMap.has(weekKey)) {
          weekMap.set(weekKey, new Map());
        }

        const muscleMap = weekMap.get(weekKey)!;
        if (!muscleMap.has(muscle)) {
          muscleMap.set(muscle, {
            muscle_group: muscle,
            total_sets: 0,
            total_reps: 0,
            total_volume: 0,
          });
        }

        const vol = muscleMap.get(muscle)!;
        vol.total_sets += 1;
        vol.total_reps += log.performed_reps || 0;
        vol.total_volume += (log.performed_reps || 0) * (log.performed_load || 0);
      }

      // Convert to sorted array
      const result: WeeklyVolume[] = Array.from(weekMap.entries())
        .map(([weekStart, muscleMap]) => ({
          week_start: weekStart,
          muscle_groups: Array.from(muscleMap.values()).sort(
            (a, b) => b.total_sets - a.total_sets
          ),
        }))
        .sort((a, b) => a.week_start.localeCompare(b.week_start));

      setWeeklyVolume(result);
    } catch (error) {
      console.error("Error fetching volume data:", error);
    } finally {
      setLoading(false);
    }
  }, [clientUserId, weeksBack]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchVolume();
  }, [fetchVolume]);

  const refetch = () => {
    hasFetched.current = false;
    setLoading(true);
    fetchVolume();
  };

  return { weeklyVolume, loading, refetch };
}
