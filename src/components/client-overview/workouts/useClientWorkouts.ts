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
import { startOfIguWeek, endOfIguWeek } from "@/lib/weekUtils";
import {
  resolveActiveAssignment,
  loadCanonicalSchedule,
  canonicalLastWorkoutAt,
} from "@/lib/canonicalScheduleAdapter";

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
        // Canonical: the client's plan assignments ARE the program list. Query ALL
        // statuses (active + ended) so history shows, newest first. Each assignment
        // synthesizes one summary from its (deload-aware) schedule + last logged set.
        const { data: assignmentRows, error: aErr } = await supabase
          .from("client_plan_assignment")
          .select("id, plan_id, start_date, status, created_at")
          .eq("client_id", userId)
          .order("start_date", { ascending: false })
          .order("created_at", { ascending: false });
        if (aErr) throw aErr;
        const assignments = assignmentRows ?? [];
        if (assignments.length === 0) {
          setPrograms([]);
          setLoading(false);
          return;
        }

        // Plan names — one batched query (no nested FK join).
        const planIds = Array.from(
          new Set(assignments.map((a) => a.plan_id).filter((v): v is string => Boolean(v))),
        );
        const planNameById = new Map<string, string>();
        if (planIds.length > 0) {
          const { data: planRows, error: planErr } = await supabase
            .from("plan")
            .select("id, name")
            .in("id", planIds);
          if (planErr) throw planErr;
          for (const p of planRows ?? []) planNameById.set(p.id, p.name);
        }

        // Per-assignment schedule + last-workout (parallel). The schedule may be
        // null for an ended assignment (plan_* reads require an active assignment)
        // → its summary keeps zeroed counts.
        const summaries = await Promise.all(
          assignments.map(async (a): Promise<ClientProgramSummary> => {
            const [schedule, lastActivityAt] = await Promise.all([
              loadCanonicalSchedule(a.id),
              canonicalLastWorkoutAt(a.id),
            ]);
            let totalModules = 0;
            let completedModules = 0;
            let totalDays = 0;
            if (schedule) {
              totalDays = schedule.byDate.size;
              for (const day of schedule.byDate.values()) {
                for (const m of day.modules) {
                  totalModules += 1;
                  if (m.status === "completed") completedModules += 1;
                }
              }
            }
            return {
              id: a.id,
              title: (a.plan_id ? planNameById.get(a.plan_id) : null) ?? "Training program",
              status: a.status ?? "active",
              startDate: a.start_date,
              macrocycleId: null,
              macrocycleName: null,
              sourceTemplateId: null,
              totalDays,
              completedModules,
              totalModules,
              lastActivityAt,
            };
          }),
        );
        setPrograms(summaries);
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

    // Weekly completion for the current IGU week (Mon-Sun).
    const monday = startOfIguWeek();
    const sunday = endOfIguWeek();
    const mondayIso = monday.toISOString().slice(0, 10);
    const sundayIso = sunday.toISOString().slice(0, 10);

    let weeklyScheduled = 0;
    let weeklyCompleted = 0;

    // Canonical (active assignment + schedule): count this week's modules from the
    // (deload-aware) schedule — zero modules this week is a real "nothing scheduled".
    // Stays empty (0/0) when the client has no active assignment / null schedule.
    const assignment = await resolveActiveAssignment(clientUserId);
    if (assignment) {
      const schedule = await loadCanonicalSchedule(assignment.id);
      if (schedule) {
        for (const [iso, day] of schedule.byDate) {
          if (iso < mondayIso || iso > sundayIso) continue;
          for (const m of day.modules) {
            weeklyScheduled += 1;
            if (m.status === "completed") weeklyCompleted += 1;
          }
        }
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
  /** Deload v2 — this running week is a recovery/deload week (canonical drilldown only). */
  isDeload?: boolean;
}

export interface DrilldownModule {
  id: string;
  title: string | null;
  moduleType: string | null;
  sessionType: string | null;
  status: string | null;
  completedAt: string | null;
  sortOrder: number;
  /** Deload v2 — belongs to a recovery/deload week (canonical drilldown only). */
  isDeload?: boolean;
  /** Deload v2 — canonical session: open via WorkoutSessionV2 ?assignment=&session=&date= params. */
  canonical?: { assignmentId: string; date: string };
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

/** A canonical session target (board_v2): the assignment + the plan_session to view. */
export interface CanonicalSessionTarget {
  assignmentId: string;
  planSessionId: string;
}

/** Read all slots (incl. unlogged) + their set logs for a canonical plan_session. */
async function loadCanonicalSessionEntries(
  target: CanonicalSessionTarget,
): Promise<SessionLogEntry[]> {
  // Slots for the session (slot-driven so prescribed-but-unlogged exercises still show).
  const { data: slotRows, error: slotErr } = await supabase
    .from("plan_slots")
    .select("id, exercise_id, section, sort_order, instructions, prescription_json")
    .eq("plan_session_id", target.planSessionId)
    .order("sort_order", { ascending: true });
  if (slotErr) throw slotErr;
  const slots = slotRows ?? [];
  if (slots.length === 0) return [];

  const exerciseIds = Array.from(
    new Set(slots.map((s) => s.exercise_id).filter((v): v is string => !!v)),
  );
  const nameById = new Map<string, string>();
  if (exerciseIds.length > 0) {
    const { data: lib, error: libErr } = await supabase
      .from("exercise_library")
      .select("id, name")
      .in("id", exerciseIds);
    if (libErr) throw libErr;
    for (const x of lib ?? []) nameById.set(x.id, x.name);
  }

  // Set logs keyed by (assignment_id, plan_slot_id) — canonical logs have
  // client_module_exercise_id NULL (coach reads via the canonical RLS policy).
  const slotIds = slots.map((s) => s.id);
  const { data: logs, error: logsErr } = await supabase
    .from("exercise_set_logs")
    .select("plan_slot_id, set_index, performed_load, performed_reps, performed_rir, performed_rpe, notes, created_at")
    .eq("assignment_id", target.assignmentId)
    .in("plan_slot_id", slotIds)
    .order("set_index", { ascending: true });
  if (logsErr) throw logsErr;
  const setsBySlot = new Map<string, SetLogRow[]>();
  for (const l of logs ?? []) {
    const arr = setsBySlot.get(l.plan_slot_id as string) ?? [];
    arr.push({
      setIndex: l.set_index,
      performedLoad: l.performed_load,
      performedReps: l.performed_reps,
      performedRir: l.performed_rir,
      performedRpe: l.performed_rpe,
      notes: l.notes,
      createdAt: l.created_at,
    });
    setsBySlot.set(l.plan_slot_id as string, arr);
  }

  return slots.map((s) => {
    // Normalise the builder-shape prescription_json so the viewer's set-count
    // reader (set_count / sets_json) works: surface a numeric set_count.
    const pj = (s.prescription_json as Record<string, unknown> | null) ?? null;
    const setCount =
      pj && typeof pj.sets === "number"
        ? pj.sets
        : pj && Array.isArray(pj.setsDetail)
          ? (pj.setsDetail as unknown[]).length
          : null;
    const snapshot = pj ? { ...pj, set_count: setCount } : null;
    return {
      id: s.id, // plan_slot_id (React key)
      exerciseName: s.exercise_id ? nameById.get(s.exercise_id) ?? "Unknown exercise" : "Unknown exercise",
      section: (s.section as string | null) ?? null,
      sortOrder: (s.sort_order as number | null) ?? 0,
      sets: setsBySlot.get(s.id) ?? [],
      prescriptionSnapshotJson: snapshot,
      instructions: (s.instructions as string | null) ?? null,
    };
  });
}

/**
 * Fetch the exercises + logs for a canonical session: pass `canonical`
 * ({ assignmentId, planSessionId }). Returns empty when the target is null.
 */
export function useSessionLog(canonical: CanonicalSessionTarget | null) {
  const [entries, setEntries] = useState<SessionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef<string | null>(null);

  const loadCanonical = useCallback(async (target: CanonicalSessionTarget) => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await loadCanonicalSessionEntries(target));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load session");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const canonicalKey = canonical
    ? `${canonical.assignmentId}:${canonical.planSessionId}`
    : null;
  useEffect(() => {
    if (!canonical || !canonicalKey) {
      setEntries([]);
      hasFetched.current = null;
      return;
    }
    if (hasFetched.current === canonicalKey) return;
    hasFetched.current = canonicalKey;
    loadCanonical(canonical);
  }, [canonical, canonicalKey, loadCanonical]);

  return { entries, loading, error };
}
