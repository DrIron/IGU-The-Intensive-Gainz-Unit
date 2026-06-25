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
}

export interface ClientProgramDayRow {
  id: string;
  date: string;
  title: string;
  day_index?: number;
  client_day_modules: ClientWorkoutModule[];
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
            status
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
      // Nested join through client_programs → client_program_days →
      // client_day_modules → client_module_exercises (count). The CLAUDE.md
      // "unreliable nested FK" rule applies to template-side joins
      // (client_programs → program_templates); the template name is fetched
      // separately below for exactly that reason.
      const { data: program, error: programError } = await supabase
        .from("client_programs")
        .select(`
          id,
          status,
          source_template_id,
          client_program_days (
            id,
            title,
            day_index,
            date,
            client_day_modules (
              id,
              title,
              module_type,
              status,
              sort_order,
              client_module_exercises (count)
            )
          )
        `)
        .eq("user_id", userId!)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (programError) throw programError;
      if (!program) return { program: null, programName: null };

      let programName = "Your Program";
      if (program.source_template_id) {
        // Degrade gracefully: a failed template name lookup shouldn't fail
        // the whole hero. Log + fall back to "Your Program".
        const { data: templateData, error: templateError } = await supabase
          .from("program_templates")
          .select("title")
          .eq("id", program.source_template_id)
          .maybeSingle();
        if (templateError) {
          console.warn(
            "[useClientWorkoutsToday] template lookup failed:",
            templateError.message,
          );
        } else if (templateData?.title) {
          programName = templateData.title;
        }
      }
      return {
        program: program as unknown as TodayProgramResult["program"],
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
