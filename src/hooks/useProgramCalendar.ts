// src/hooks/useProgramCalendar.ts
// Hook for managing program calendar state and operations

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import {
  CalendarWeek,
  CalendarDay,
  CalendarSession,
  SessionType,
  SessionTiming,
} from "@/types/workout-builder";

interface UseProgramCalendarOptions {
  programId: string;
  coachUserId: string;
}

interface UseProgramCalendarReturn {
  weeks: CalendarWeek[];
  loading: boolean;
  selectedWeek: number;
  setSelectedWeek: (week: number) => void;

  // Operations
  addWeek: () => void;
  addSession: (dayIndex: number, title: string, type: SessionType, timing: SessionTiming) => Promise<string | null>;
  copyWeek: (fromWeek: number, toWeek: number) => Promise<void>;
  deleteSession: (moduleId: string) => Promise<void>;
  togglePublish: (moduleId: string, currentStatus: string) => Promise<void>;
  refresh: () => Promise<void>;

  // Helpers
  getDayByIndex: (dayIndex: number) => CalendarDay | null;
  getSessionsForDay: (dayIndex: number) => CalendarSession[];
  getTotalDays: () => number;
  getPublishedCount: () => number;
  getDraftCount: () => number;
}

export function useProgramCalendar({
  programId,
  coachUserId,
}: UseProgramCalendarOptions): UseProgramCalendarReturn {
  const [weeks, setWeeks] = useState<CalendarWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const hasFetched = useRef(false);
  const { toast } = useToast();

  // Load program structure
  const loadProgram = useCallback(async () => {
    if (!programId) {
      setLoading(false);
      return;
    }

    try {
      const { data: days, error } = await supabase
        .from("program_template_days")
        .select(`*, day_modules(*)`)
        .eq("program_template_id", programId)
        .order("day_index");

      if (error) throw error;

      // Group into weeks
      const weekMap = new Map<number, CalendarDay[]>();
      const maxDayIndex = Math.max(...(days || []).map((d) => d.day_index), 0);
      const totalWeeks = Math.max(1, Math.ceil(maxDayIndex / 7));

      for (let w = 1; w <= totalWeeks; w++) {
        weekMap.set(w, []);
        for (let d = 1; d <= 7; d++) {
          const dayIndex = (w - 1) * 7 + d;
          const dayData = days?.find((day) => day.day_index === dayIndex);

          const sessions: CalendarSession[] = (dayData?.day_modules || []).map((mod: any) => ({
            id: mod.id,
            title: mod.title,
            sessionType: mod.session_type || mod.module_type || "strength",
            sessionTiming: mod.session_timing || "anytime",
            status: mod.status,
            moduleCount: 1,
            exerciseCount: 0,
          }));

          weekMap.get(w)!.push({
            date: new Date(),
            dayIndex,
            sessions,
            isRestDay: sessions.length === 0,
          });
        }
      }

      const calendarWeeks: CalendarWeek[] = Array.from(weekMap.entries()).map(
        ([weekNum, calendarDays]) => ({
          weekNumber: weekNum,
          startDate: new Date(),
          days: calendarDays,
        })
      );

      setWeeks(calendarWeeks);
    } catch (error: any) {
      toast({
        title: "Error loading program",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [programId, toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadProgram();
  }, [loadProgram]);

  // Add a new week
  const addWeek = useCallback(() => {
    const newWeekNum = weeks.length + 1;
    const newWeek: CalendarWeek = {
      weekNumber: newWeekNum,
      startDate: new Date(),
      days: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(),
        dayIndex: (newWeekNum - 1) * 7 + i + 1,
        sessions: [],
        isRestDay: true,
      })),
    };
    setWeeks([...weeks, newWeek]);
    setSelectedWeek(newWeekNum);
  }, [weeks]);

  // Add session to day
  const addSession = useCallback(
    async (
      dayIndex: number,
      title: string,
      type: SessionType,
      timing: SessionTiming
    ): Promise<string | null> => {
      try {
        // Get or create day
        let dayId: string;
        const { data: existingDay } = await supabase
          .from("program_template_days")
          .select("id")
          .eq("program_template_id", programId)
          .eq("day_index", dayIndex)
          .single();

        if (existingDay) {
          dayId = existingDay.id;
        } else {
          const { data: newDay, error: dayError } = await supabase
            .from("program_template_days")
            .insert({
              program_template_id: programId,
              day_index: dayIndex,
              day_title: `Day ${dayIndex}`,
            })
            .select()
            .single();

          if (dayError) throw dayError;
          dayId = newDay.id;
        }

        // Get max sort order
        const { data: existingModules } = await supabase
          .from("day_modules")
          .select("sort_order")
          .eq("program_template_day_id", dayId);

        const maxOrder = Math.max(0, ...(existingModules || []).map((m) => m.sort_order));

        // Create module
        const { data: module, error: moduleError } = await supabase
          .from("day_modules")
          .insert({
            program_template_day_id: dayId,
            module_owner_coach_id: coachUserId,
            module_type: type,
            session_type: type,
            session_timing: timing,
            title,
            sort_order: maxOrder + 1,
            status: "draft",
          })
          .select()
          .single();

        if (moduleError) throw moduleError;

        await loadProgram();
        return module.id;
      } catch (error: any) {
        toast({
          title: "Error adding session",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
        return null;
      }
    },
    [programId, coachUserId, loadProgram, toast]
  );

  // Copy week
  const copyWeek = useCallback(
    async (fromWeek: number, toWeek: number) => {
      try {
        const sourceWeek = weeks.find((w) => w.weekNumber === fromWeek);
        if (!sourceWeek) return;

        for (const day of sourceWeek.days) {
          const targetDayIndex = (toWeek - 1) * 7 + ((day.dayIndex - 1) % 7) + 1;
          if (day.sessions.length === 0) continue;

          // Get or create target day
          let targetDayId: string;
          const { data: existingDay } = await supabase
            .from("program_template_days")
            .select("id")
            .eq("program_template_id", programId)
            .eq("day_index", targetDayIndex)
            .single();

          if (existingDay) {
            targetDayId = existingDay.id;
          } else {
            const { data: newDay, error } = await supabase
              .from("program_template_days")
              .insert({
                program_template_id: programId,
                day_index: targetDayIndex,
                day_title: `Day ${targetDayIndex}`,
              })
              .select()
              .single();

            if (error) throw error;
            targetDayId = newDay.id;
          }

          // Copy each session
          for (const session of day.sessions) {
            const { data: sourceModule } = await supabase
              .from("day_modules")
              .select(`*, module_exercises(*, exercise_prescriptions(*))`)
              .eq("id", session.id)
              .single();

            if (!sourceModule) continue;

            const { data: newModule, error: moduleError } = await supabase
              .from("day_modules")
              .insert({
                program_template_day_id: targetDayId,
                module_owner_coach_id: sourceModule.module_owner_coach_id,
                module_type: sourceModule.module_type,
                session_type: sourceModule.session_type,
                session_timing: sourceModule.session_timing,
                title: sourceModule.title,
                sort_order: sourceModule.sort_order,
                status: "draft",
                source_muscle_id: sourceModule.source_muscle_id,
              })
              .select()
              .single();

            if (moduleError) throw moduleError;

            // Copy exercises and prescriptions
            if (sourceModule.module_exercises) {
              for (const ex of sourceModule.module_exercises) {
                const { data: newEx, error: exError } = await supabase
                  .from("module_exercises")
                  .insert({
                    day_module_id: newModule.id,
                    exercise_id: ex.exercise_id,
                    section: ex.section,
                    sort_order: ex.sort_order,
                    instructions: ex.instructions,
                  })
                  .select()
                  .single();

                if (exError) throw exError;

                if (ex.exercise_prescriptions?.[0]) {
                  const presc = ex.exercise_prescriptions[0];
                  await supabase.from("exercise_prescriptions").insert({
                    module_exercise_id: newEx.id,
                    set_count: presc.set_count,
                    rep_range_min: presc.rep_range_min,
                    rep_range_max: presc.rep_range_max,
                    tempo: presc.tempo,
                    rest_seconds: presc.rest_seconds,
                    intensity_type: presc.intensity_type,
                    intensity_value: presc.intensity_value,
                    column_config: presc.column_config,
                    sets_json: presc.sets_json,
                    custom_fields_json: presc.custom_fields_json,
                  });
                }
              }
            }
          }
        }

        await loadProgram();
        toast({ title: "Week copied successfully" });
      } catch (error: any) {
        toast({
          title: "Error copying week",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
      }
    },
    [weeks, programId, loadProgram, toast]
  );

  // Delete session
  const deleteSession = useCallback(
    async (moduleId: string) => {
      try {
        const { error } = await supabase.from("day_modules").delete().eq("id", moduleId);
        if (error) throw error;
        await loadProgram();
        toast({ title: "Session deleted" });
      } catch (error: any) {
        toast({
          title: "Error deleting session",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
      }
    },
    [loadProgram, toast]
  );

  // Toggle publish status
  const togglePublish = useCallback(
    async (moduleId: string, currentStatus: string) => {
      try {
        const newStatus = currentStatus === "published" ? "draft" : "published";
        const { error } = await supabase
          .from("day_modules")
          .update({ status: newStatus })
          .eq("id", moduleId);
        if (error) throw error;
        await loadProgram();
        toast({
          title: newStatus === "published" ? "Session published" : "Session unpublished",
        });
      } catch (error: any) {
        toast({
          title: "Error updating status",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
      }
    },
    [loadProgram, toast]
  );

  // Helpers
  const getDayByIndex = useCallback(
    (dayIndex: number): CalendarDay | null => {
      for (const week of weeks) {
        const day = week.days.find((d) => d.dayIndex === dayIndex);
        if (day) return day;
      }
      return null;
    },
    [weeks]
  );

  const getSessionsForDay = useCallback(
    (dayIndex: number): CalendarSession[] => {
      const day = getDayByIndex(dayIndex);
      return day?.sessions || [];
    },
    [getDayByIndex]
  );

  const getTotalDays = useCallback(() => {
    return weeks.reduce((acc, week) => acc + week.days.filter((d) => !d.isRestDay).length, 0);
  }, [weeks]);

  const getPublishedCount = useCallback(() => {
    return weeks.reduce(
      (acc, week) =>
        acc +
        week.days.reduce(
          (dayAcc, day) =>
            dayAcc + day.sessions.filter((s) => s.status === "published").length,
          0
        ),
      0
    );
  }, [weeks]);

  const getDraftCount = useCallback(() => {
    return weeks.reduce(
      (acc, week) =>
        acc +
        week.days.reduce(
          (dayAcc, day) =>
            dayAcc + day.sessions.filter((s) => s.status === "draft").length,
          0
        ),
      0
    );
  }, [weeks]);

  return {
    weeks,
    loading,
    selectedWeek,
    setSelectedWeek,
    addWeek,
    addSession,
    copyWeek,
    deleteSession,
    togglePublish,
    refresh: loadProgram,
    getDayByIndex,
    getSessionsForDay,
    getTotalDays,
    getPublishedCount,
    getDraftCount,
  };
}

export default useProgramCalendar;
