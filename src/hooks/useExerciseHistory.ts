// src/hooks/useExerciseHistory.ts
// Hook for fetching and managing exercise history data

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SetLog } from "@/types/workout-builder";

interface ExerciseHistoryEntry {
  id: string;
  date: string;
  module_title: string;
  sets: SetLog[];
  total_volume: number;
  max_load: number;
}

interface UseExerciseHistoryOptions {
  userId: string;
  exerciseId: string;
  limit?: number;
}

interface UseExerciseHistoryReturn {
  history: ExerciseHistoryEntry[];
  loading: boolean;
  error: string | null;
  personalBest: {
    max_load: number;
    max_volume: number;
    date: string;
  } | null;
  lastPerformance: ExerciseHistoryEntry | null;
  refresh: () => Promise<void>;
}

export function useExerciseHistory({
  userId,
  exerciseId,
  limit = 20,
}: UseExerciseHistoryOptions): UseExerciseHistoryReturn {
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personalBest, setPersonalBest] = useState<{
    max_load: number;
    max_volume: number;
    date: string;
  } | null>(null);
  const hasFetched = useRef(false);

  const loadHistory = useCallback(async () => {
    if (!userId || !exerciseId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get all set logs for this exercise
      const { data: logs, error: logsError } = await supabase
        .from("exercise_set_logs")
        .select(`
          *,
          client_module_exercises!inner (
            exercise_id,
            client_day_modules!inner (
              title,
              client_program_days!inner (
                date
              )
            )
          )
        `)
        .eq("created_by_user_id", userId)
        .eq("client_module_exercises.exercise_id", exerciseId)
        .order("created_at", { ascending: false })
        .limit(limit * 5); // Get more to account for multiple sets per session

      if (logsError) throw logsError;

      // Group logs by session date
      const sessionMap = new Map<string, {
        date: string;
        module_title: string;
        sets: any[];
      }>();

      (logs || []).forEach((log: any) => {
        const date = log.client_module_exercises?.client_day_modules?.client_program_days?.date;
        const moduleTitle = log.client_module_exercises?.client_day_modules?.title || "Workout";

        if (!date) return;

        if (!sessionMap.has(date)) {
          sessionMap.set(date, {
            date,
            module_title: moduleTitle,
            sets: [],
          });
        }

        sessionMap.get(date)!.sets.push({
          set_index: log.set_index,
          performed_reps: log.performed_reps,
          performed_load: log.performed_load,
          performed_rir: log.performed_rir,
          performed_rpe: log.performed_rpe,
          performed_time: null,
          performed_distance: null,
          notes: log.notes || "",
        });
      });

      // Convert to array and calculate metrics
      const historyEntries: ExerciseHistoryEntry[] = Array.from(sessionMap.values())
        .map((session, index) => {
          // Sort sets by index
          session.sets.sort((a, b) => a.set_index - b.set_index);

          // Calculate total volume (reps x load)
          const totalVolume = session.sets.reduce((sum, set) => {
            if (set.performed_reps && set.performed_load) {
              return sum + set.performed_reps * set.performed_load;
            }
            return sum;
          }, 0);

          // Get max load
          const maxLoad = Math.max(
            ...session.sets
              .map((s) => s.performed_load)
              .filter((l): l is number => l !== null)
          );

          return {
            id: `history-${index}`,
            date: session.date,
            module_title: session.module_title,
            sets: session.sets,
            total_volume: totalVolume,
            max_load: maxLoad || 0,
          };
        })
        .slice(0, limit);

      setHistory(historyEntries);

      // Calculate personal bests
      if (historyEntries.length > 0) {
        let maxLoad = 0;
        let maxVolume = 0;
        let maxLoadDate = "";

        historyEntries.forEach((entry) => {
          if (entry.max_load > maxLoad) {
            maxLoad = entry.max_load;
            maxLoadDate = entry.date;
          }
          if (entry.total_volume > maxVolume) {
            maxVolume = entry.total_volume;
          }
        });

        setPersonalBest({
          max_load: maxLoad,
          max_volume: maxVolume,
          date: maxLoadDate,
        });
      }
    } catch (err: any) {
      console.error("Error loading exercise history:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, exerciseId, limit]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadHistory();
  }, [loadHistory]);

  const lastPerformance = history.length > 0 ? history[0] : null;

  return {
    history,
    loading,
    error,
    personalBest,
    lastPerformance,
    refresh: loadHistory,
  };
}

export default useExerciseHistory;
