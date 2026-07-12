import {
  getMuscleDisplay,
  resolveParentMuscleId,
  defaultSessionName,
  ACTIVITY_TYPE_LABELS,
  type ActivityType,
  type MuscleSlotData,
  type SessionData,
} from "@/types/muscle-builder";

/**
 * programSummaryAdapter — map a SAVED program's rows into the `MuscleSlotData[]`
 * shape `useMusclePlanVolume` already eats (§11.3).
 *
 * PURE. No Supabase, no fetching, no React — `shared/` stays presentational per
 * §11.1. The caller (a hook/page) fetches rows and hands them in.
 *
 * ── WHICH SURFACE IS CANONICAL (verified against prod 2026-07-12) ────────────
 * `COACH_PROGRAMS_VIEW_PLAN.md` §3 originally pointed the adapter at
 * `program_template_days → day_modules → module_exercises`. That is NOT the
 * canonical program — it is the output of `convert_muscle_plan_to_program_v2`
 * (the legacy "Convert to Program" flow), flagged KEEP-but-legacy in
 * `P5_LEGACY_DROP_BUILD.md:47`. It exists only for plans a coach happened to
 * convert and is not what a client assignment reads. §3 now carries a correction.
 *
 * The canonical read is:
 *   plan (kind='template') → plan_weeks → plan_sessions → plan_slots
 * and `plan_slots.prescription_json` already carries `muscleId` + `sets`
 * (682/682 template slots on prod — 100% coverage), so the canonical path below
 * is a pure field map with no exercise-library join.
 *
 * The legacy shim stays only for library rows with no canonical mirror (prod has
 * one: an orphaned double-conversion). It dies with the legacy tables.
 *
 * ── PER-WEEK SCOPING (important) ─────────────────────────────────────────────
 * `useMusclePlanVolume` computes SETS PER WEEK. `plan_sessions.day_index` is
 * 1-7 *within a week*, and a plan carries N `plan_weeks`. Passing every week's
 * slots at once would multiply every number by N (an 8-week plan would report 8×
 * its real weekly volume). Callers MUST pass ONE week's rows — use
 * `pickRepresentativeWeek()` to choose it.
 */

// ---------------------------------------------------------------------------
// Row shapes (structural — mirror the columns, not the generated Supabase types,
// so callers can pass a narrowed select without a cast).
// ---------------------------------------------------------------------------

export interface CanonicalPlanWeekRow {
  id: string;
  week_index: number;
  is_deload?: boolean | null;
}

export interface CanonicalPlanSessionRow {
  id: string;
  plan_week_id: string | null;
  day_index: number;
  name: string | null;
  activity_type: string | null;
  sort_order: number | null;
}

export interface CanonicalPlanSlotRow {
  id: string;
  plan_session_id: string | null;
  sort_order: number | null;
  /** Carries muscleId / sets / repMin / repMax / setsDetail / exerciseName. */
  prescription_json: unknown;
}

/** Legacy tree (transitional shim — dies with the legacy tables). */
export interface LegacyDayRow {
  id: string;
  day_index: number;
}
export interface LegacyModuleRow {
  id: string;
  program_template_day_id: string | null;
  title: string | null;
  session_type: string | null;
  sort_order: number | null;
  /** Set during Planning Board conversion — the muscle this module came from. */
  source_muscle_id: string | null;
}
export interface LegacyModuleExerciseRow {
  id: string;
  day_module_id: string | null;
  sort_order: number | null;
}
export interface LegacyPrescriptionRow {
  module_exercise_id: string | null;
  set_count: number | null;
  rep_range_min: number | null;
  rep_range_max: number | null;
  tempo: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** prescription_json is `unknown` off the wire; read it defensively. */
function pj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

const ACTIVITY_TYPES = new Set<string>([
  "strength",
  "cardio",
  "hiit",
  "yoga_mobility",
  "recovery",
  "sport_specific",
]);

function toActivityType(v: unknown): ActivityType {
  return typeof v === "string" && ACTIVITY_TYPES.has(v) ? (v as ActivityType) : "strength";
}

/**
 * Which week should the summary describe?
 *
 * The first NON-DELOAD week — a deload week under-reports the program's real
 * weekly volume, so summarising one would make the card lie. Falls back to the
 * lowest week_index when every week is a deload (or none are flagged).
 */
export function pickRepresentativeWeek(weeks: CanonicalPlanWeekRow[]): CanonicalPlanWeekRow | null {
  if (weeks.length === 0) return null;
  const ordered = [...weeks].sort((a, b) => a.week_index - b.week_index);
  return ordered.find((w) => !w.is_deload) ?? ordered[0];
}

// ---------------------------------------------------------------------------
// PRIMARY — canonical plan* → MuscleSlotData[]
// ---------------------------------------------------------------------------

/**
 * Map ONE week's canonical rows into board slots.
 *
 * Pass only the sessions belonging to the representative week (and the slots
 * belonging to those sessions) — see the per-week scoping note above.
 */
export function adaptCanonicalPlanToSlots(
  sessions: CanonicalPlanSessionRow[],
  slots: CanonicalPlanSlotRow[],
): MuscleSlotData[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  return slots
    .filter((slot) => slot.plan_session_id != null && sessionById.has(slot.plan_session_id))
    .map((slot, i) => {
      const session = sessionById.get(slot.plan_session_id as string)!;
      const p = pj(slot.prescription_json);
      const activityType = toActivityType(session.activity_type);

      return {
        id: slot.id,
        dayIndex: session.day_index,
        // Every canonical template slot carries muscleId (verified 100% on prod).
        // Non-strength slots legitimately have none — they contribute no muscle
        // volume, and the ribbon/volume math skip them.
        muscleId: str(p.muscleId) ?? "",
        sets: num(p.sets, 0),
        repMin: num(p.repMin, 0),
        repMax: num(p.repMax, 0),
        tempo: str(p.tempo),
        rir: typeof p.rir === "number" ? p.rir : undefined,
        rpe: typeof p.rpe === "number" ? p.rpe : undefined,
        sortOrder: slot.sort_order ?? i,
        sessionId: session.id,
        setsDetail: Array.isArray(p.setsDetail)
          ? (p.setsDetail as MuscleSlotData["setsDetail"])
          : undefined,
        exercise: str(p.exerciseName) ? { exerciseId: "", name: str(p.exerciseName)! } : undefined,
        activityType,
      } satisfies MuscleSlotData;
    });
}

/** Canonical sessions → board `SessionData[]` (drives focus chips + session count). */
export function adaptCanonicalPlanToSessions(sessions: CanonicalPlanSessionRow[]): SessionData[] {
  return sessions.map((s, i) => ({
    id: s.id,
    dayIndex: s.day_index,
    name: s.name ?? undefined,
    type: toActivityType(s.activity_type),
    sortOrder: s.sort_order ?? i,
  }));
}

// ---------------------------------------------------------------------------
// TRANSITIONAL — legacy program tree → MuscleSlotData[]
// ---------------------------------------------------------------------------

/**
 * Legacy shim for library rows with no canonical mirror.
 *
 * Muscle comes from `day_modules.source_muscle_id` (written during Planning Board
 * conversion — see CLAUDE.md); sets/reps from `exercise_prescriptions`. One
 * `day_modules` row = one session; each `module_exercises` row under it = one slot.
 *
 * Legacy `program_template_days.day_index` is ABSOLUTE across weeks (W1 = 1-7,
 * W2 = 8-14, …), so it is folded back to 1-7 to match the canonical/board shape.
 *
 * Dies with the legacy tables — do not extend.
 */
export function adaptLegacyProgramToSlots(
  days: LegacyDayRow[],
  modules: LegacyModuleRow[],
  moduleExercises: LegacyModuleExerciseRow[],
  prescriptions: LegacyPrescriptionRow[],
): MuscleSlotData[] {
  const dayById = new Map(days.map((d) => [d.id, d]));
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const rxByModuleExercise = new Map(
    prescriptions
      .filter((r) => r.module_exercise_id != null)
      .map((r) => [r.module_exercise_id as string, r]),
  );

  return moduleExercises
    .filter((me) => me.day_module_id != null && moduleById.has(me.day_module_id))
    .map((me, i) => {
      const mod = moduleById.get(me.day_module_id as string)!;
      const day = mod.program_template_day_id ? dayById.get(mod.program_template_day_id) : undefined;
      const rx = rxByModuleExercise.get(me.id);

      // Legacy day_index is absolute (W2 day 1 = 8). Fold back to 1-7.
      const absolute = day?.day_index ?? 1;
      const dayIndex = ((absolute - 1) % 7) + 1;

      return {
        id: me.id,
        dayIndex,
        muscleId: mod.source_muscle_id ?? "",
        sets: rx?.set_count ?? 0,
        repMin: rx?.rep_range_min ?? 0,
        repMax: rx?.rep_range_max ?? 0,
        tempo: rx?.tempo ?? undefined,
        sortOrder: me.sort_order ?? i,
        sessionId: mod.id,
        activityType: toActivityType(mod.session_type),
      } satisfies MuscleSlotData;
    });
}

/** Legacy modules → `SessionData[]` (one module = one session). */
export function adaptLegacyProgramToSessions(
  days: LegacyDayRow[],
  modules: LegacyModuleRow[],
): SessionData[] {
  const dayById = new Map(days.map((d) => [d.id, d]));
  return modules.map((m, i) => {
    const absolute = m.program_template_day_id ? (dayById.get(m.program_template_day_id)?.day_index ?? 1) : 1;
    return {
      id: m.id,
      dayIndex: ((absolute - 1) % 7) + 1,
      name: m.title ?? undefined,
      type: toActivityType(m.session_type),
      sortOrder: m.sort_order ?? i,
    };
  });
}

// ---------------------------------------------------------------------------
// Derived summary bits (pure)
// ---------------------------------------------------------------------------

export interface ProgramStructure {
  weeks: number;
  daysPerWeek: number;
  /** Total sessions across the WHOLE program (not just the representative week). */
  sessions: number;
}

/** "6 wks · 4 days/wk · 24 sessions". `daysPerWeek` = distinct training days in the rep week. */
export function deriveProgramStructure(
  weekCount: number,
  representativeWeekSessions: SessionData[],
  totalSessionCount: number,
): ProgramStructure {
  const trainingDays = new Set(representativeWeekSessions.map((s) => s.dayIndex));
  return {
    weeks: Math.max(weekCount, 0),
    daysPerWeek: trainingDays.size,
    sessions: Math.max(totalSessionCount, 0),
  };
}

export interface FocusChips {
  chips: string[];
  /** How many distinct focuses were dropped by the cap → renders as "+N". */
  overflow: number;
}

/**
 * Focus chips — what this program trains, in ≤3 words.
 *
 * LOCKED (§6.2): primary = the coach's own `plan_sessions.name`. Fallback for an
 * UNNAMED session = its dominant muscle region ("Chest focus") or, for
 * non-strength, the activity-type label ("Cardio" / "Mobility").
 *
 * The fallback is the MAIN path, not an edge case: only 24/108 template sessions
 * on prod are named (22%). Deliberately NOT a Push/Pull/Legs inference engine —
 * archetype-guessing is brittle for IGU's mixed sessions.
 *
 * Chips are ranked by how much volume sits behind them, so the cap keeps the
 * biggest focuses rather than the alphabetically-first ones.
 */
export function deriveFocusChips(
  sessions: SessionData[],
  slots: MuscleSlotData[],
  max = 3,
): FocusChips {
  const slotsBySession = new Map<string, MuscleSlotData[]>();
  for (const slot of slots) {
    if (!slot.sessionId) continue;
    const list = slotsBySession.get(slot.sessionId) ?? [];
    list.push(slot);
    slotsBySession.set(slot.sessionId, list);
  }

  // label -> total sets behind it (for ranking)
  const weight = new Map<string, number>();

  for (const session of sessions) {
    const sessionSlots = slotsBySession.get(session.id) ?? [];
    const sets = sessionSlots.reduce((sum, s) => sum + s.sets, 0);

    const label = labelForSession(session, sessionSlots);
    if (!label) continue;
    weight.set(label, (weight.get(label) ?? 0) + sets);
  }

  const ranked = [...weight.entries()]
    .sort(([aLabel, aSets], [bLabel, bSets]) => bSets - aSets || aLabel.localeCompare(bLabel))
    .map(([label]) => label);

  return { chips: ranked.slice(0, max), overflow: Math.max(ranked.length - max, 0) };
}

/** One session's chip label: coach's name → dominant muscle → activity label. */
function labelForSession(session: SessionData, sessionSlots: MuscleSlotData[]): string | null {
  const named = session.name?.trim();
  if (named) return named;

  // Non-strength: the activity type IS the focus ("Cardio", "Mobility").
  if (session.type && session.type !== "strength") {
    return ACTIVITY_TYPE_LABELS[session.type] ?? defaultSessionName(session.type);
  }

  // Strength: dominant PARENT muscle by set volume → "Chest focus".
  const byMuscle = new Map<string, number>();
  for (const slot of sessionSlots) {
    if (!slot.muscleId) continue;
    if (slot.activityType && slot.activityType !== "strength") continue;
    const parent = resolveParentMuscleId(slot.muscleId);
    byMuscle.set(parent, (byMuscle.get(parent) ?? 0) + slot.sets);
  }

  let topId: string | null = null;
  let topSets = -1;
  for (const [id, sets] of byMuscle) {
    if (sets > topSets) {
      topId = id;
      topSets = sets;
    }
  }
  if (!topId) return null;

  const display = getMuscleDisplay(topId);
  return display ? `${display.label} focus` : null;
}

/**
 * Ribbon segments for a whole program — the DayColumn ribbon, aggregated.
 * Parent-muscle colour + share of total strength sets, volume-sorted.
 */
export function deriveMuscleRibbon(
  slots: MuscleSlotData[],
): { id: string; colorHex: string; pct: number }[] {
  const totals = new Map<string, { sets: number; colorHex: string }>();

  for (const slot of slots) {
    if (slot.activityType && slot.activityType !== "strength") continue;
    if (!slot.muscleId) continue;
    const parent = resolveParentMuscleId(slot.muscleId);
    const display = getMuscleDisplay(parent);
    if (!display) continue;
    const entry = totals.get(parent);
    if (entry) entry.sets += slot.sets;
    else totals.set(parent, { sets: slot.sets, colorHex: display.colorHex });
  }

  const sum = [...totals.values()].reduce((s, e) => s + e.sets, 0);
  if (sum === 0) return [];

  return [...totals.entries()]
    .sort(([, a], [, b]) => b.sets - a.sets)
    .map(([id, { sets, colorHex }]) => ({ id, colorHex, pct: (sets / sum) * 100 }));
}

/** Distinct exercises in the representative week (the strip's "N exercises"). */
export function countExercises(slots: MuscleSlotData[]): number {
  return slots.filter((s) => !s.activityType || s.activityType === "strength").length;
}
