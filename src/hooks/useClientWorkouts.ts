// src/hooks/useClientWorkouts.ts
// Client-side workout data hooks (logged-in user's own programs / modules).
//
// Coach-side hooks live in src/components/client-overview/workouts/useClientWorkouts.ts.
// Don't mix the two — they query the same tables but with different RLS / filter
// semantics (coach views a specific clientUserId; this hook is always self).
//
// Cache shape (key prefix shared so a single invalidate-by-prefix in
// WorkoutSessionV2.completeWorkout() clears all client-side workout views):
//   ['client-workouts', userId, 'today', 'yyyy-MM-dd']
//   ['client-workouts', userId, 'month', 'yyyy-MM']
//   ['client-workouts', userId, 'week', 'yyyy-MM-dd' (Mon anchor)]

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import {
  loadCanonicalSchedule,
  canonicalSessionTitle,
  resolveActiveAssignment,
} from "@/lib/canonicalScheduleAdapter";

/** Short enough that completed workouts surface promptly via poll/focus,
 *  long enough to dedupe back-to-back remounts during navigation. */
const THIRTY_SECONDS = 30_000;

export interface ClientWorkoutModule {
  id: string;
  title: string;
  module_type: string;
  status: string;
  sort_order?: number;
  client_module_exercises?: { count: number }[];
  /** Deload v2 (canonical, board_v2): this module's running week is a recovery/deload week. */
  isDeload?: boolean;
  /** board_v2 canonical nav marker — present only on canonical-synthesized modules. */
  canonical?: { assignmentId: string; date: string };
}

export interface ClientProgramDayRow {
  id: string;
  date: string;
  title: string;
  day_index?: number;
  client_day_modules: ClientWorkoutModule[];
  /** Deload v2 (canonical, board_v2): this day belongs to a recovery/deload running week. */
  isDeload?: boolean;
}

export interface TodayProgramResult {
  program: {
    id: string;
    status: string;
    source_template_id: string | null;
    client_program_days: ClientProgramDayRow[];
  } | null;
  programName: string | null;
}

/**
 * Calendar-month view of client_day_modules.
 * Pass the displayed month's anchor Date — key includes yyyy-MM so navigating
 * months triggers a fresh fetch automatically.
 */
export function useClientWorkoutsMonth(
  userId: string | undefined,
  monthAnchor: Date,
) {
  const monthKey = format(monthAnchor, "yyyy-MM");
  return useQuery({
    queryKey: ["client-workouts", userId, "month", monthKey],
    enabled: !!userId,
    staleTime: THIRTY_SECONDS,
    // Override QueryClient default (false) so completing a workout in another
    // tab surfaces on this one when it regains focus.
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const monthStart = startOfMonth(monthAnchor);
      const monthEnd = endOfMonth(monthAnchor);
      // local-time yyyy-MM-dd; never .toISOString() against a DATE column
      // (#8 will hoist this to a shared helper).
      const { data, error } = await supabase
        .from("client_program_days")
        .select(`
          id,
          date,
          title,
          client_programs!inner (
            user_id,
            status
          ),
          client_day_modules (
            id,
            title,
            module_type,
            status,
            client_module_exercises (
              exercise_library ( primary_muscle )
            )
          )
        `)
        .eq("client_programs.user_id", userId!)
        .eq("client_programs.status", "active")
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return (data ?? []) as unknown as ClientProgramDayRow[];
    },
  });
}

/**
 * Active client_program + days/modules + program-template name, scoped to the
 * logged-in user. The hero consumes the full day list and computes today's
 * workout + upcoming preview in render — keeping selection logic out of the
 * hook so other consumers can use the same data without re-fetching.
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
      // loadCanonicalSchedule) and synthesize the TodayProgramResult shape the card
      // consumes, so an on-demand deload's insert+shift reflects in "today".
      // No active assignment / null schedule → no program.
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
          client_day_modules: day.modules.map((m, i) => ({
            id: m.id, // plan_session_id — the canonical session link target
            title: canonicalSessionTitle(m),
            module_type: m.module_type,
            status: m.status, // "completed" (all slots logged) or ""
            sort_order: i,
            client_module_exercises: [{ count: m.exerciseCount }],
            isDeload: m.isDeload,
            canonical: { assignmentId: assignment.id, date: iso },
          })),
        });
      }
      return {
        program: {
          id: assignment.id,
          status: "active",
          source_template_id: null,
          client_program_days: days,
        },
        programName,
      };
    },
  });
}

export interface ClientWeekModuleRow {
  id: string;
  title: string | null;
  module_type: string;
  status: string;
  completed_at: string | null;
  client_program_days: { date: string } | null;
}

/**
 * Mon-Sun adherence window for client_day_modules. The hook owns the week
 * boundaries so AdherenceSummaryCard doesn't have to and so completeWorkout()'s
 * invalidate-by-prefix already catches it.
 *
 * Default `weekAnchor` = now → the current Mon-Sun week. Pass a different
 * anchor to read past/future weeks (the queryKey re-derives accordingly).
 */
export function useClientWorkoutsWeek(
  userId: string | undefined,
  weekAnchor: Date = new Date(),
) {
  // Mon-Sun week — see src/lib/weekUtils.ts on main after fix/workout-pipeline-hardening merges; swap to startOfIguWeek in a follow-up.
  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekAnchor, { weekStartsOn: 1 });
  const weekKey = format(weekStart, "yyyy-MM-dd");
  return useQuery({
    queryKey: ["client-workouts", userId, "week", weekKey],
    enabled: !!userId,
    staleTime: THIRTY_SECONDS,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Nested join through client_program_days → client_programs is the same
      // pattern useClientWorkoutsMonth uses; date column lives on
      // client_program_days, not on client_day_modules itself.
      const { data, error } = await supabase
        .from("client_day_modules")
        .select(`
          id,
          title,
          module_type,
          status,
          completed_at,
          client_module_exercises (
            exercise_library ( primary_muscle )
          ),
          client_program_days!inner (
            date,
            client_programs!inner (
              user_id,
              status
            )
          )
        `)
        .eq("client_program_days.client_programs.user_id", userId!)
        .eq("client_program_days.client_programs.status", "active")
        .gte("client_program_days.date", format(weekStart, "yyyy-MM-dd"))
        .lte("client_program_days.date", format(weekEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return (data ?? []) as unknown as ClientWeekModuleRow[];
    },
  });
}

/**
 * Derive a one-line session brief (exercise count + primary muscles) from a
 * client_day_module that selected `client_module_exercises (exercise_library
 * (primary_muscle))`. Tolerant of the raw nested shape — accepts `any`.
 */
export function deriveModuleBrief(module: any): { exerciseCount: number; muscles: string[] } {
  const exs: any[] = Array.isArray(module?.client_module_exercises) ? module.client_module_exercises : [];
  const muscles: string[] = [];
  for (const e of exs) {
    const m: string | null | undefined = e?.exercise_library?.primary_muscle;
    if (m && !muscles.includes(m)) muscles.push(m);
  }
  return { exerciseCount: exs.length, muscles: muscles.slice(0, 3) };
}
