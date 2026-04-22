// src/components/client-overview/workouts/useClientWorkouts.ts
// Hooks powering the coach-facing Workouts tab on /coach/clients/:clientUserId.
//
// Fetching rules (CLAUDE.md):
//  - Never nest PostgREST FK joins on client_programs or profiles — queries
//    are split and composed in JS. See CoachDashboardOverview for precedent.
//  - Always destructure `{ error }` on Supabase calls so RLS failures surface.
//  - `.maybeSingle()` for optional rows.
//
// All hooks are scoped to a single `clientUserId` passed in — the hook is
// re-entered (via `hasFetched` comparing ids) when the client changes.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ClientProgramSummary {
  /** client_programs.id */
  id: string;
  /** program_templates.title, denormalised. Falls back to "Untitled program". */
  title: string;
  status: string;
  startDate: string;
  macrocycleId: string | null;
  macrocycleName: string | null;
  /** program_templates.id — the source template (may be null if orphaned). */
  sourceTemplateId: string | null;
  totalDays: number;
  completedModules: number;
  totalModules: number;
  lastActivityAt: string | null;
}

export interface AdherencePulse {
  activeProgram: ClientProgramSummary | null;
  lastWorkoutAt: string | null;
  /** Completion rate for the current ISO week, as a percentage 0-100. */
  weeklyCompletionPct: number | null;
  /** Workouts scheduled for current week (across all active programs). */
  weeklyScheduled: number;
  weeklyCompleted: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Fetch summaries for all client_programs belonging to `clientUserId`. */
export function useClientPrograms(clientUserId: string) {
  const [programs, setPrograms] = useState<ClientProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(
    async (userId: string) => {
      setLoading(true);
      setError(null);
      try {
        // 1. Base client_programs rows (no nested FKs — fetch ids + scalar fields).
        const { data: cp, error: cpErr } = await supabase
          .from("client_programs")
          .select("id, status, start_date, source_template_id, macrocycle_id")
          .eq("user_id", userId)
          .order("start_date", { ascending: false });
        if (cpErr) throw cpErr;
        const rows = cp ?? [];
        if (rows.length === 0) {
          setPrograms([]);
          setLoading(false);
          return;
        }

        const programIds = rows.map((r) => r.id);
        const templateIds = Array.from(
          new Set(
            rows
              .map((r) => r.source_template_id)
              .filter((v): v is string => Boolean(v)),
          ),
        );
        const macrocycleIds = Array.from(
          new Set(
            rows
              .map((r) => r.macrocycle_id)
              .filter((v): v is string => Boolean(v)),
          ),
        );

        // 2. Template titles — separate query instead of PostgREST FK join.
        const templateMap = new Map<string, string>();
        if (templateIds.length > 0) {
          const { data: tpl, error: tplErr } = await supabase
            .from("program_templates")
            .select("id, title")
            .in("id", templateIds);
          if (tplErr) throw tplErr;
          for (const t of tpl ?? []) templateMap.set(t.id, t.title);
        }

        // 3. Macrocycle names.
        const macrocycleMap = new Map<string, string>();
        if (macrocycleIds.length > 0) {
          const { data: macs, error: macErr } = await supabase
            .from("macrocycles")
            .select("id, name")
            .in("id", macrocycleIds);
          if (macErr) throw macErr;
          for (const m of macs ?? []) macrocycleMap.set(m.id, m.name);
        }

        // 4. Day counts per program.
        const { data: days, error: daysErr } = await supabase
          .from("client_program_days")
          .select("id, client_program_id")
          .in("client_program_id", programIds);
        if (daysErr) throw daysErr;
        const dayIdsByProgram = new Map<string, string[]>();
        const dayCountByProgram = new Map<string, number>();
        for (const d of days ?? []) {
          const arr = dayIdsByProgram.get(d.client_program_id) ?? [];
          arr.push(d.id);
          dayIdsByProgram.set(d.client_program_id, arr);
          dayCountByProgram.set(
            d.client_program_id,
            (dayCountByProgram.get(d.client_program_id) ?? 0) + 1,
          );
        }

        // 5. Module adherence per program. Batch all day ids then bucket.
        const allDayIds = (days ?? []).map((d) => d.id);
        const modsByDay = new Map<string, { completed_at: string | null }[]>();
        const modsByProgramCompleted = new Map<string, number>();
        const modsByProgramTotal = new Map<string, number>();
        const lastActivityByProgram = new Map<string, string>();

        if (allDayIds.length > 0) {
          const { data: mods, error: modsErr } = await supabase
            .from("client_day_modules")
            .select("client_program_day_id, completed_at")
            .in("client_program_day_id", allDayIds);
          if (modsErr) throw modsErr;
          // Bucket modules back onto their program via the dayIdsByProgram map.
          const dayToProgram = new Map<string, string>();
          for (const [pid, dayIds] of dayIdsByProgram) {
            for (const did of dayIds) dayToProgram.set(did, pid);
          }
          for (const m of mods ?? []) {
            const pid = dayToProgram.get(m.client_program_day_id);
            if (!pid) continue;
            modsByProgramTotal.set(pid, (modsByProgramTotal.get(pid) ?? 0) + 1);
            if (m.completed_at) {
              modsByProgramCompleted.set(
                pid,
                (modsByProgramCompleted.get(pid) ?? 0) + 1,
              );
              const prev = lastActivityByProgram.get(pid);
              if (!prev || prev < m.completed_at) {
                lastActivityByProgram.set(pid, m.completed_at);
              }
            }
            const arr = modsByDay.get(m.client_program_day_id) ?? [];
            arr.push({ completed_at: m.completed_at });
            modsByDay.set(m.client_program_day_id, arr);
          }
        }

        setPrograms(
          rows.map((r) => ({
            id: r.id,
            title: r.source_template_id
              ? templateMap.get(r.source_template_id) ?? "Untitled program"
              : "Untitled program",
            status: r.status,
            startDate: r.start_date,
            macrocycleId: r.macrocycle_id,
            macrocycleName: r.macrocycle_id
              ? macrocycleMap.get(r.macrocycle_id) ?? null
              : null,
            sourceTemplateId: r.source_template_id,
            totalDays: dayCountByProgram.get(r.id) ?? 0,
            completedModules: modsByProgramCompleted.get(r.id) ?? 0,
            totalModules: modsByProgramTotal.get(r.id) ?? 0,
            lastActivityAt: lastActivityByProgram.get(r.id) ?? null,
          })),
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load programs");
        setPrograms([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    load(clientUserId);
  }, [clientUserId, load]);

  const reload = useCallback(() => load(clientUserId), [clientUserId, load]);

  return { programs, loading, error, reload };
}

/** Adherence snapshot: current program, last completion, weekly completion. */
export function useAdherencePulse(
  clientUserId: string,
  programs: ClientProgramSummary[],
) {
  const [pulse, setPulse] = useState<AdherencePulse>({
    activeProgram: null,
    lastWorkoutAt: null,
    weeklyCompletionPct: null,
    weeklyScheduled: 0,
    weeklyCompleted: 0,
  });
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Pick the most recent active program as "current". If there are multiple,
    // this is the one we anchor the pulse on for clarity — others are still
    // visible in the program list.
    const active =
      programs.find((p) => p.status === "active") ??
      programs[0] ??
      null;
    const lastWorkoutAt = programs.reduce<string | null>((acc, p) => {
      if (!p.lastActivityAt) return acc;
      if (!acc || acc < p.lastActivityAt) return p.lastActivityAt;
      return acc;
    }, null);

    // Weekly completion — client_program_days.date falls in the current ISO
    // week (Mon-Sun local). Gather active programs' days, then bucket modules.
    const activeProgramIds = programs
      .filter((p) => p.status === "active")
      .map((p) => p.id);
    let weeklyScheduled = 0;
    let weeklyCompleted = 0;
    if (activeProgramIds.length > 0) {
      const now = new Date();
      const day = (now.getDay() + 6) % 7; // Mon=0
      const monday = new Date(now);
      monday.setHours(0, 0, 0, 0);
      monday.setDate(now.getDate() - day);
      const sunday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      const mondayIso = monday.toISOString().slice(0, 10);
      const sundayIso = sunday.toISOString().slice(0, 10);

      const { data: weekDays, error: dayErr } = await supabase
        .from("client_program_days")
        .select("id, client_program_id")
        .in("client_program_id", activeProgramIds)
        .gte("date", mondayIso)
        .lte("date", sundayIso);
      if (dayErr) {
        console.warn("[useAdherencePulse] day fetch:", dayErr.message);
      }
      const weekDayIds = (weekDays ?? []).map((d) => d.id);
      if (weekDayIds.length > 0) {
        const { data: mods, error: modErr } = await supabase
          .from("client_day_modules")
          .select("completed_at")
          .in("client_program_day_id", weekDayIds);
        if (modErr) {
          console.warn("[useAdherencePulse] modules:", modErr.message);
        }
        const rows = mods ?? [];
        weeklyScheduled = rows.length;
        weeklyCompleted = rows.filter((m) => m.completed_at).length;
      }
    }

    const pct =
      weeklyScheduled > 0
        ? Math.round((weeklyCompleted / weeklyScheduled) * 100)
        : null;

    setPulse({
      activeProgram: active,
      lastWorkoutAt,
      weeklyCompletionPct: pct,
      weeklyScheduled,
      weeklyCompleted,
    });
    setLoading(false);
  }, [programs]);

  useEffect(() => {
    const signature = `${clientUserId}:${programs.length}:${programs.map((p) => p.id).join(",")}`;
    if (hasFetched.current === signature) return;
    hasFetched.current = signature;
    load();
  }, [clientUserId, programs, load]);

  return { pulse, loading };
}

/** Derived helper: weeks since program start, capped at the program's own length. */
export function weeksIntoProgram(summary: ClientProgramSummary | null): number | null {
  if (!summary) return null;
  const start = new Date(summary.startDate);
  if (Number.isNaN(start.getTime())) return null;
  const weeksLived = Math.max(
    1,
    Math.floor((Date.now() - start.getTime()) / WEEK_MS) + 1,
  );
  if (summary.totalDays > 0) {
    const programWeeks = Math.max(1, Math.ceil(summary.totalDays / 7));
    return Math.min(weeksLived, programWeeks);
  }
  return weeksLived;
}

export interface DrilldownDay {
  id: string;
  dayIndex: number;
  date: string;
  title: string | null;
  modules: DrilldownModule[];
}

export interface DrilldownModule {
  id: string;
  title: string | null;
  moduleType: string | null;
  sessionType: string | null;
  status: string | null;
  completedAt: string | null;
  sortOrder: number;
}

/** Fetch day + module layout for a single client_program. */
export function useClientProgramDrilldown(clientProgramId: string | null) {
  const [days, setDays] = useState<DrilldownDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (programId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data: dayRows, error: dayErr } = await supabase
        .from("client_program_days")
        .select("id, day_index, date, title")
        .eq("client_program_id", programId)
        .order("day_index", { ascending: true });
      if (dayErr) throw dayErr;
      const dayList = dayRows ?? [];
      if (dayList.length === 0) {
        setDays([]);
        setLoading(false);
        return;
      }

      const dayIds = dayList.map((d) => d.id);
      const { data: modRows, error: modErr } = await supabase
        .from("client_day_modules")
        .select(
          "id, client_program_day_id, title, module_type, session_type, status, completed_at, sort_order",
        )
        .in("client_program_day_id", dayIds)
        .order("sort_order", { ascending: true });
      if (modErr) throw modErr;

      const modsByDay = new Map<string, DrilldownModule[]>();
      for (const m of modRows ?? []) {
        const arr = modsByDay.get(m.client_program_day_id) ?? [];
        arr.push({
          id: m.id,
          title: m.title,
          moduleType: m.module_type,
          sessionType: m.session_type,
          status: m.status,
          completedAt: m.completed_at,
          sortOrder: m.sort_order ?? 0,
        });
        modsByDay.set(m.client_program_day_id, arr);
      }

      setDays(
        dayList.map((d) => ({
          id: d.id,
          dayIndex: d.day_index,
          date: d.date,
          title: d.title,
          modules: modsByDay.get(d.id) ?? [],
        })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load program");
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!clientProgramId) {
      setDays([]);
      hasFetched.current = null;
      return;
    }
    if (hasFetched.current === clientProgramId) return;
    hasFetched.current = clientProgramId;
    load(clientProgramId);
  }, [clientProgramId, load]);

  const reload = useCallback(() => {
    if (clientProgramId) load(clientProgramId);
  }, [clientProgramId, load]);

  return { days, loading, error, reload };
}

export interface SessionLogEntry {
  /** client_module_exercises.id */
  id: string;
  exerciseName: string;
  section: string | null;
  sortOrder: number;
  /** Set logs for this exercise — empty if client didn't log. */
  sets: SetLogRow[];
  /** Snapshot of the prescription at assignment time. */
  prescriptionSnapshotJson: Record<string, unknown> | null;
  instructions: string | null;
}

export interface SetLogRow {
  setIndex: number;
  performedLoad: number | null;
  performedReps: number | null;
  performedRir: number | null;
  performedRpe: number | null;
  notes: string | null;
  createdAt: string | null;
}

/** Fetch the exercises + logs for a specific client_day_module. */
export function useSessionLog(clientDayModuleId: string | null) {
  const [entries, setEntries] = useState<SessionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (moduleId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data: exRows, error: exErr } = await supabase
        .from("client_module_exercises")
        .select(
          "id, exercise_id, section, sort_order, instructions, prescription_snapshot_json",
        )
        .eq("client_day_module_id", moduleId)
        .order("sort_order", { ascending: true });
      if (exErr) throw exErr;
      const list = exRows ?? [];
      if (list.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }

      const exerciseIds = Array.from(
        new Set(list.map((e) => e.exercise_id).filter((v): v is string => !!v)),
      );
      const exerciseNameMap = new Map<string, string>();
      if (exerciseIds.length > 0) {
        const { data: lib, error: libErr } = await supabase
          .from("exercise_library")
          .select("id, name")
          .in("id", exerciseIds);
        if (libErr) throw libErr;
        for (const x of lib ?? []) exerciseNameMap.set(x.id, x.name);
      }

      const cmeIds = list.map((e) => e.id);
      // Set logs table is `exercise_set_logs` per the data-model exploration.
      const { data: logs, error: logsErr } = await supabase
        .from("exercise_set_logs")
        .select(
          "client_module_exercise_id, set_index, performed_load, performed_reps, performed_rir, performed_rpe, notes, created_at",
        )
        .in("client_module_exercise_id", cmeIds)
        .order("set_index", { ascending: true });
      if (logsErr) throw logsErr;
      const setsByExercise = new Map<string, SetLogRow[]>();
      for (const l of logs ?? []) {
        const arr = setsByExercise.get(l.client_module_exercise_id) ?? [];
        arr.push({
          setIndex: l.set_index,
          performedLoad: l.performed_load,
          performedReps: l.performed_reps,
          performedRir: l.performed_rir,
          performedRpe: l.performed_rpe,
          notes: l.notes,
          createdAt: l.created_at,
        });
        setsByExercise.set(l.client_module_exercise_id, arr);
      }

      setEntries(
        list.map((e) => ({
          id: e.id,
          exerciseName: e.exercise_id
            ? exerciseNameMap.get(e.exercise_id) ?? "Unknown exercise"
            : "Unknown exercise",
          section: e.section,
          sortOrder: e.sort_order ?? 0,
          sets: setsByExercise.get(e.id) ?? [],
          prescriptionSnapshotJson:
            (e.prescription_snapshot_json as Record<string, unknown> | null) ??
            null,
          instructions: e.instructions,
        })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load session");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!clientDayModuleId) {
      setEntries([]);
      hasFetched.current = null;
      return;
    }
    if (hasFetched.current === clientDayModuleId) return;
    hasFetched.current = clientDayModuleId;
    load(clientDayModuleId);
  }, [clientDayModuleId, load]);

  return { entries, loading, error };
}
