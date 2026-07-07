// src/hooks/useCanonicalWeeklyAdherence.ts
//
// P5 A.2 (D1) — one client-scoped canonical weekly-completion source, shared by
// AdherenceSummaryCard + WeeklyProgressCard (replaces the legacy useClientWorkoutsWeek
// client_day_modules embed). Same logic as the coach useAdherencePulse: resolve the
// client's active client_plan_assignment, load its (deload-aware) canonical schedule,
// and count this IGU week's sessions. Completion in canonical = a session with status
// "completed" (the schedule adapter derives that from exercise_set_logs). Empty (0/0)
// when the client has no active assignment / null schedule.

import { useCallback, useEffect, useRef, useState } from "react";
import { startOfIguWeek, endOfIguWeek } from "@/lib/weekUtils";
import { resolveActiveAssignment, loadCanonicalSchedule } from "@/lib/canonicalScheduleAdapter";

/** One scheduled session this week + whether it's been completed. */
export interface WeeklyAdherenceModule {
  id: string;
  /** activity_type — for the per-type breakdown (strength / mobility / …). */
  type: string;
  completed: boolean;
}

export interface CanonicalWeeklyAdherence {
  loading: boolean;
  modules: WeeklyAdherenceModule[];
  weeklyScheduled: number;
  weeklyCompleted: number;
  /** 0-100, or null when nothing is scheduled this week. */
  weeklyCompletionPct: number | null;
}

const EMPTY: CanonicalWeeklyAdherence = {
  loading: true,
  modules: [],
  weeklyScheduled: 0,
  weeklyCompleted: 0,
  weeklyCompletionPct: null,
};

export function useCanonicalWeeklyAdherence(userId: string | undefined): CanonicalWeeklyAdherence {
  const [data, setData] = useState<CanonicalWeeklyAdherence>(EMPTY);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (uid: string) => {
    const mondayIso = startOfIguWeek().toISOString().slice(0, 10);
    const sundayIso = endOfIguWeek().toISOString().slice(0, 10);

    const assignment = await resolveActiveAssignment(uid);
    const schedule = assignment ? await loadCanonicalSchedule(assignment.id) : null;

    const modules: WeeklyAdherenceModule[] = [];
    if (schedule) {
      for (const [iso, day] of schedule.byDate) {
        if (iso < mondayIso || iso > sundayIso) continue;
        for (const m of day.modules) {
          modules.push({ id: m.id, type: m.module_type, completed: m.status === "completed" });
        }
      }
    }
    const weeklyCompleted = modules.filter((m) => m.completed).length;
    const weeklyScheduled = modules.length;
    setData({
      loading: false,
      modules,
      weeklyScheduled,
      weeklyCompleted,
      weeklyCompletionPct: weeklyScheduled > 0 ? Math.round((weeklyCompleted / weeklyScheduled) * 100) : null,
    });
  }, []);

  useEffect(() => {
    if (!userId) {
      setData({ ...EMPTY, loading: false });
      return;
    }
    if (hasFetched.current === userId) return;
    hasFetched.current = userId;
    setData((d) => ({ ...d, loading: true }));
    load(userId).catch((err) => {
      console.error("[useCanonicalWeeklyAdherence]", err);
      setData({ ...EMPTY, loading: false });
    });
  }, [userId, load]);

  return data;
}
