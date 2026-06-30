/**
 * Deload v2 — canonical SCHEDULE for the client's calendar grid. See docs/DELOAD_V2.md.
 *
 * The legacy grid renders from client_program_days (a pre-deload deep-copy snapshot), so an
 * on-demand deload (insert + shift) never shows. This builds the grid straight from the canonical
 * running sequence instead: buildRunningSequence(plan_weeks, client_plan_inserted_deloads) gives the
 * shifted week order (on-demand templates excluded, inserts spliced); each running week's content
 * comes from contentPlanWeekId's plan_sessions/plan_slots on the assignee's CLONE — the same model
 * canonicalSessionResolver reads. One batched set of queries (not N per-day resolves): a month grid
 * would otherwise fire 40+ heavy resolver calls.
 *
 * S3 (own-your-copy): the retired client_plan_overrides fetch + merge was removed — under the
 * canonical-read flags the clone IS the divergence (S2 writes it directly). The
 * client_plan_inserted_deloads + buildRunningSequence path (the deload sequence) is UNCHANGED.
 *
 * Returns a date→day map for the calendar. Dates outside [start, start + N running weeks) have no
 * entry (program not started / ended). board_v2-gated by the caller.
 */
import { supabase } from "@/integrations/supabase/client";
import { boardDayDate } from "@/lib/boardDates";
import { buildRunningSequence, type SequencePlanWeek, type SequenceInsert } from "@/lib/deloadSequence";

export interface CanonicalScheduleModule {
  id: string; // plan_session_id supplying this day's content (the canonical session link target)
  title: string | null;
  module_type: string; // activity_type
  status: string; // "completed" (all slots logged) or "" (date-derived by the grid)
  exerciseCount: number;
  muscles: string[];
  isDeload: boolean; // the running week is a deload (inserted on-demand, or pinned)
}

export interface CanonicalScheduleDay {
  runningIndex: number;
  isDeload: boolean;
  modules: CanonicalScheduleModule[];
}

export interface CanonicalSchedule {
  startDate: string;
  /** Total running weeks (base + inserted deloads). */
  totalWeeks: number;
  /** Per running week, in order: its 1-based index + whether it's a deload (inserted or pinned). */
  weeks: { runningIndex: number; isDeload: boolean }[];
  /** yyyy-mm-dd → that day's resolved canonical sessions. */
  byDate: Map<string, CanonicalScheduleDay>;
}

// Drilldown-shaped projection (coach Client Overview → Workouts → Programs). Neutral shape the
// drilldown maps to its DrilldownDay/DrilldownModule (kept lib-side to avoid re-deriving dates).
export interface CanonicalDrilldownModule {
  id: string; // plan_session_id (canonical session link target)
  title: string | null;
  moduleType: string;
  sessionType: string;
  status: string | null; // "completed" or null
  completedAt: string | null; // sentinel (the date) when completed — drives the check icon
  sortOrder: number;
  isDeload: boolean;
  date: string; // yyyy-mm-dd, for the canonical WorkoutSessionV2 link
}
export interface CanonicalDrilldownDay {
  id: string;
  dayIndex: number; // absolute: (runningIndex-1)*7 + dayOfWeek
  date: string;
  title: string | null; // "Recovery" on a deload week, else null
  isDeload: boolean;
  modules: CanonicalDrilldownModule[];
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function pushTo<K, V>(map: Map<K, V[]>, key: K, val: V): void {
  const list = map.get(key);
  if (list) list.push(val);
  else map.set(key, [val]);
}

const DEFAULT_SESSION_NAMES: Record<string, string> = {
  strength: "Strength",
  cardio: "Cardio",
  hiit: "HIIT",
  yoga_mobility: "Yoga / Mobility",
  recovery: "Recovery",
  sport_specific: "Sport-Specific",
};

interface SessionRow {
  id: string;
  plan_week_id: string;
  day_index: number;
  name: string | null;
  activity_type: string;
  sort_order: number | null;
}
interface SlotRow {
  id: string;
  plan_session_id: string;
  exercise_id: string | null;
  prescription_json: Record<string, unknown> | null;
}

export interface ActiveAssignment {
  id: string;
  plan_id: string;
  start_date: string;
}

/**
 * Resolve a client's active canonical assignment (the newest active
 * client_plan_assignment). Shared by the board_v2 canonical surfaces
 * (WorkoutCalendar, useClientWorkoutsToday, …) so the lookup isn't re-duplicated.
 * Returns null when the client has no active canonical assignment (caller falls
 * back to the legacy path).
 */
export async function resolveActiveAssignment(clientId: string): Promise<ActiveAssignment | null> {
  const { data } = await supabase
    .from("client_plan_assignment")
    .select("id, plan_id, start_date")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.id || !data.plan_id || !data.start_date) return null;
  return { id: data.id, plan_id: data.plan_id, start_date: data.start_date };
}

/**
 * Build the canonical schedule for an assignment. Returns null when there's no canonical plan to
 * read (caller falls back to the legacy grid).
 */
export async function loadCanonicalSchedule(assignmentId: string): Promise<CanonicalSchedule | null> {
  const { data: assignment } = await supabase
    .from("client_plan_assignment")
    .select("id, plan_id, start_date")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return null;

  // S3: read the clone's plan_* directly + the inserted-deload sequence. No override fetch.
  const [{ data: weekRows }, { data: insRows }, { data: sessionRows }, { data: slotRows }] =
    await Promise.all([
      supabase
        .from("plan_weeks")
        .select("id, week_index, is_deload, deload_placement")
        .eq("plan_id", assignment.plan_id)
        .order("week_index"),
      supabase
        .from("client_plan_inserted_deloads")
        .select("id, position_week_index, source_plan_week_id, preset_id")
        .eq("assignment_id", assignmentId)
        .order("position_week_index"),
      supabase
        .from("plan_sessions")
        .select("id, plan_week_id, day_index, name, activity_type, sort_order")
        .eq("plan_id", assignment.plan_id),
      supabase
        .from("plan_slots")
        .select("id, plan_session_id, exercise_id, prescription_json")
        .eq("plan_id", assignment.plan_id),
    ]);

  if (!weekRows || weekRows.length === 0) return null;

  const weeks: SequencePlanWeek[] = weekRows.map((w) => ({
    id: w.id,
    week_index: w.week_index,
    is_deload: !!w.is_deload,
    deload_placement: (w.deload_placement as string | null) ?? null,
  }));
  const inserts: SequenceInsert[] = (insRows ?? []).map((r) => ({
    id: r.id,
    position_week_index: r.position_week_index,
    source_plan_week_id: r.source_plan_week_id,
    preset_id: (r.preset_id as string | null) ?? null,
  }));
  const sequence = buildRunningSequence(weeks, inserts);

  // Slots grouped by session → count + exercise/muscle ids (clone slots, no override layer).
  const slotsBySession = new Map<string, SlotRow[]>();
  for (const sl of (slotRows ?? []) as SlotRow[]) {
    pushTo(slotsBySession, sl.plan_session_id, sl);
  }

  // Sessions grouped by plan_week_id.
  const sessionsByWeek = new Map<string, SessionRow[]>();
  for (const s of (sessionRows ?? []) as SessionRow[]) {
    pushTo(sessionsByWeek, s.plan_week_id, s);
  }

  // Muscle labels: exercise_id → primary_muscle (one batched lookup).
  const exerciseIds = new Set<string>();
  for (const list of slotsBySession.values()) for (const sl of list) if (sl.exercise_id) exerciseIds.add(sl.exercise_id);
  const muscleByExercise = new Map<string, string>();
  if (exerciseIds.size > 0) {
    const { data: lib } = await supabase
      .from("exercise_library")
      .select("id, primary_muscle")
      .in("id", [...exerciseIds]);
    for (const r of lib ?? []) if (r.primary_muscle) muscleByExercise.set(r.id, r.primary_muscle);
  }

  // Completion: a session is "completed" when every slot has at least one log (one batched query).
  const { data: logs } = await supabase
    .from("exercise_set_logs")
    .select("plan_slot_id")
    .eq("assignment_id", assignmentId);
  const loggedSlotIds = new Set<string>((logs ?? []).map((l) => l.plan_slot_id as string).filter(Boolean));

  const muscleLabel = (sl: SlotRow): string | null => {
    if (sl.exercise_id && muscleByExercise.has(sl.exercise_id)) return muscleByExercise.get(sl.exercise_id)!;
    const m = (sl.prescription_json as Record<string, unknown> | null)?.muscleId;
    return typeof m === "string" && m ? m : null;
  };

  const byDate = new Map<string, CanonicalScheduleDay>();
  for (const rw of sequence) {
    const sessions = sessionsByWeek.get(rw.contentPlanWeekId) ?? [];
    // Group this content week's sessions by day_index.
    const byDay = new Map<number, SessionRow[]>();
    for (const s of sessions) pushTo(byDay, s.day_index, s);

    for (const [dayIndex, daySessions] of byDay) {
      const date = isoDate(boardDayDate(assignment.start_date, rw.runningIndex, dayIndex));
      const ordered = daySessions.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const modules: CanonicalScheduleModule[] = ordered.map((s) => {
        const slots = slotsBySession.get(s.id) ?? [];
        const muscles = [...new Set(slots.map(muscleLabel).filter((x): x is string => !!x))].slice(0, 4);
        const completed = slots.length > 0 && slots.every((sl) => loggedSlotIds.has(sl.id));
        return {
          id: s.id,
          title: s.name ?? null,
          module_type: s.activity_type,
          status: completed ? "completed" : "",
          exerciseCount: slots.length,
          muscles,
          isDeload: rw.isDeload,
        };
      });
      byDate.set(date, { runningIndex: rw.runningIndex, isDeload: rw.isDeload, modules });
    }
  }

  return {
    startDate: assignment.start_date,
    totalWeeks: sequence.length,
    weeks: sequence.map((rw) => ({ runningIndex: rw.runningIndex, isDeload: rw.isDeload })),
    byDate,
  };
}

/**
 * Project a CanonicalSchedule into the coach drilldown's week/day grid: every running week × 7 days
 * (rest days included), ordered, with a per-week Recovery flag and canonical session links. Reuses
 * the same date math as the calendar (boardDayDate) — no re-derivation.
 */
export function canonicalDrilldownDays(schedule: CanonicalSchedule): CanonicalDrilldownDay[] {
  const out: CanonicalDrilldownDay[] = [];
  for (const wk of schedule.weeks) {
    for (let d = 1; d <= 7; d++) {
      const iso = isoDate(boardDayDate(schedule.startDate, wk.runningIndex, d));
      const entry = schedule.byDate.get(iso);
      const dayIndex = (wk.runningIndex - 1) * 7 + d;
      const modules: CanonicalDrilldownModule[] = (entry?.modules ?? []).map((m, i) => ({
        id: m.id,
        title: canonicalSessionTitle(m),
        moduleType: m.module_type,
        sessionType: m.module_type,
        status: m.status || null,
        completedAt: m.status === "completed" ? iso : null,
        sortOrder: i,
        isDeload: m.isDeload,
        date: iso,
      }));
      out.push({
        id: `canon-${iso}`,
        dayIndex,
        date: iso,
        title: wk.isDeload ? "Recovery" : null,
        isDeload: wk.isDeload,
        modules,
      });
    }
  }
  return out;
}

/** Default session title when the coach left it unnamed (mirrors the resolver). */
export function canonicalSessionTitle(m: CanonicalScheduleModule): string {
  return m.title?.trim() || DEFAULT_SESSION_NAMES[m.module_type] || "Session";
}
