// src/hooks/useClientWorkouts.ts
// Client-side workout data hook (logged-in user's own program), canonical-only.
//
// Coach-side hooks live in src/components/client-overview/workouts/useClientWorkouts.ts.
//
// P5 A.2: the legacy month/week hooks (client_day_modules embeds) were removed
// once AdherenceSummaryCard/WeeklyProgressCard moved to useCanonicalWeeklyAdherence
// and ClientScheduleCalendar went canonical-only. Only the canonical "today" hook
// remains; its result-shape field names are canonical (`days`/`modules`/
// `exerciseCount`) — no legacy table names in the shape.
//
// Cache key prefix shared so completeWorkout()'s invalidate-by-prefix clears it:
//   ['client-workouts', userId, 'today', 'yyyy-MM-dd']

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  loadCanonicalSchedule,
  canonicalSessionTitle,
  resolveActiveAssignment,
} from "@/lib/canonicalScheduleAdapter";

/** Short enough that completed workouts surface promptly via poll/focus,
 *  long enough to dedupe back-to-back remounts during navigation. */
const THIRTY_SECONDS = 30_000;

export interface ClientWorkoutModule {
  id: string; // plan_session_id — the canonical session link target
  title: string;
  module_type: string;
  status: string;
  sort_order?: number;
  exerciseCount: number;
  /** Deload v2 (canonical): this module's running week is a recovery/deload week. */
  isDeload?: boolean;
  /** Canonical nav marker for WorkoutSessionV2 (?assignment=&session=&date=). */
  canonical?: { assignmentId: string; date: string };
}

export interface ClientProgramDayRow {
  id: string;
  date: string;
  title: string;
  day_index?: number;
  modules: ClientWorkoutModule[];
  /** Deload v2 (canonical): this day belongs to a recovery/deload running week. */
  isDeload?: boolean;
}

export interface TodayProgramResult {
  program: {
    id: string;
    status: string;
    days: ClientProgramDayRow[];
  } | null;
  programName: string | null;
}

/**
 * Active canonical program (deload-aware) scoped to the logged-in user, shaped
 * for the Today hero. The hero computes today's workout + upcoming preview in
 * render — selection logic stays out of the hook so consumers share the data.
 *
 * Key includes today's yyyy-MM-dd so midnight rollover triggers refetch.
 */
export function useClientWorkoutsToday(userId: string | undefined) {
  const todayKey = format(new Date(), "yyyy-MM-dd");
  return useQuery<TodayProgramResult>({
    queryKey: ["client-workouts", userId, "today", todayKey],
    enabled: !!userId,
    staleTime: THIRTY_SECONDS,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Read the client's canonical clone schedule (deload-aware via
      // loadCanonicalSchedule) so an on-demand deload's insert+shift reflects in
      // "today". No active assignment / null schedule → no program.
      const assignment = await resolveActiveAssignment(userId!);
      if (!assignment) return { program: null, programName: null };
      const schedule = await loadCanonicalSchedule(assignment.id);
      if (!schedule) return { program: null, programName: null };

      const { data: planRow } = await supabase
        .from("plan")
        .select("name")
        .eq("id", assignment.plan_id)
        .maybeSingle();
      const programName = planRow?.name ?? "Your Program";
      const days: ClientProgramDayRow[] = [];
      for (const [iso, day] of schedule.byDate) {
        days.push({
          id: `canon-${iso}`,
          date: iso,
          title: day.isDeload
            ? "Recovery"
            : day.modules[0]
              ? canonicalSessionTitle(day.modules[0])
              : "Workout",
          day_index: day.runningIndex,
          isDeload: day.isDeload,
          modules: day.modules.map((m, i) => ({
            id: m.id, // plan_session_id — the canonical session link target
            title: canonicalSessionTitle(m),
            module_type: m.module_type,
            status: m.status, // "completed" (all slots logged) or ""
            sort_order: i,
            exerciseCount: m.exerciseCount,
            isDeload: m.isDeload,
            canonical: { assignmentId: assignment.id, date: iso },
          })),
        });
      }
      return {
        program: {
          id: assignment.id,
          status: "active",
          days,
        },
        programName,
      };
    },
  });
}
