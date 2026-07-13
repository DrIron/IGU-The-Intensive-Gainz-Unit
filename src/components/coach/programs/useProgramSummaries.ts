import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { estimateSessionDuration, type SetDurationInputs } from "@/lib/sessionDuration";
import type { MuscleSlotData, SessionData } from "@/types/muscle-builder";
import {
  adaptCanonicalPlanToSlots,
  adaptCanonicalPlanToSessions,
  adaptLegacyProgramToSlots,
  adaptLegacyProgramToSessions,
  deriveProgramStructure,
  deriveFocusChips,
  deriveMuscleRibbon,
  countExercises,
  pickRepresentativeWeek,
  type CanonicalPlanSessionRow,
  type CanonicalPlanSlotRow,
  type CanonicalPlanWeekRow,
  type ProgramStructure,
  type FocusChips,
} from "./shared/programSummaryAdapter";
import type { MuscleRibbonSegment } from "./shared/MuscleDistributionRibbon";
import type { StatStripDuration } from "./shared/ProgramStatStrip";
import type { ProgramReach } from "./shared/ProgramSummaryCard";

/**
 * useProgramSummaries — the DATA FETCH for the program library / detail (§11.1
 * keeps `shared/` pure, so this lives outside it).
 *
 * ── The join (verified against prod 2026-07-12) ──────────────────────────────
 *   library row      = program_templates.id
 *     ← muscle_program_templates.converted_program_id   (reverse map)
 *     → muscle_program_templates.id
 *     ← plan.source_muscle_template_id  (kind='template')
 *     → plan → plan_weeks / plan_sessions / plan_slots       ← CANONICAL, primary
 *
 * Selection rule: canonical when a plan mirror exists, else the legacy shim
 * (program_template_days → day_modules → module_exercises → exercise_prescriptions).
 * Prod has exactly one legacy-only row today: an orphaned double-conversion whose
 * muscle_program_templates.converted_program_id was overwritten by the later one.
 *
 * ── Per-week scoping ────────────────────────────────────────────────────────
 * `useMusclePlanVolume` computes sets PER WEEK. A plan carries N plan_weeks with
 * day_index 1-7 inside each. We summarise ONE representative week (first
 * non-deload) — otherwise an 8-week plan would report 8× its weekly volume.
 *
 * Batched: one query per table across all requested programs. No N+1 across the grid.
 */

export interface ProgramSummary {
  programId: string;
  /** Which surface fed this summary — canonical mirror, or the legacy shim. */
  source: "canonical" | "legacy";
  slots: MuscleSlotData[];
  sessions: SessionData[];
  structure: ProgramStructure;
  ribbon: MuscleRibbonSegment[];
  focus: FocusChips;
  sets: number;
  exercises: number;
  duration: StatStripDuration | null;
  reach: ProgramReach;
  /** The Planning Board plan behind this program, when there is one (Edit action). */
  muscleTemplateId: string | null;
  /** The library row itself — lets the detail view render from a URL alone. */
  meta: { title: string; description: string | null; level: string | null; tags: string[] };
  /**
   * PR3 — the RAW canonical tree for this plan (every week, not just the
   * representative one).
   *
   * The hook already fetches the whole plan_weeks → plan_sessions → plan_slots
   * hierarchy above and then computes the card's summary over ONE week, discarding
   * the rest. Handing the rows back costs ZERO extra queries, so the week-by-week
   * detail view does not need a second read. Empty on the legacy shim path (there is
   * no canonical tree to hand back).
   *
   * Map any week with adaptCanonicalPlanToSessions / adaptCanonicalPlanToSlots.
   */
  tree: {
    weeks: CanonicalPlanWeekRow[];
    sessions: CanonicalPlanSessionRow[];
    slots: CanonicalPlanSlotRow[];
  };
}

/** Est. time per session — reuses the builder's estimator over the rep week. */
function estimatePerSession(slots: MuscleSlotData[], sessions: SessionData[]): StatStripDuration | null {
  if (sessions.length === 0) return null;

  const strength = slots.filter((s) => !s.activityType || s.activityType === "strength");
  if (strength.length === 0) return null;

  const exercises: SetDurationInputs[][] = strength.map((slot) =>
    slot.setsDetail && slot.setsDetail.length > 0
      ? slot.setsDetail.map((s) => ({
          reps: s.reps,
          rep_range_min: s.rep_range_min,
          rep_range_max: s.rep_range_max,
          tempo: s.tempo,
          rest_seconds: s.rest_seconds,
          rest_seconds_max: s.rest_seconds_max,
        }))
      : Array.from({ length: Math.max(1, slot.sets) }, () => ({
          rep_range_min: slot.repMin,
          rep_range_max: slot.repMax,
          tempo: slot.tempo,
        })),
  );

  const est = estimateSessionDuration(exercises);
  if (est.minSeconds === 0 && est.maxSeconds === 0) return null;

  // The estimator totals the whole week; the strip shows time PER SESSION.
  const trainingDays = new Set(sessions.map((s) => s.dayIndex)).size || 1;
  return {
    minSeconds: Math.round(est.minSeconds / trainingDays),
    maxSeconds: Math.round(est.maxSeconds / trainingDays),
    inferred: est.inferred,
  };
}

export function useProgramSummaries(programIds: string[]) {
  const [summaries, setSummaries] = useState<Map<string, ProgramSummary>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Stable key so the effect doesn't loop on a new array identity each render.
  const key = programIds.slice().sort().join(",");
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setSummaries(new Map());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 0. the library rows themselves (title/level/tags for the detail header)
      const { data: programs, error: progErr } = await supabase
        .from("program_templates")
        .select("id, title, description, level, tags")
        .in("id", ids);
      if (progErr) throw progErr;
      const metaById = new Map(
        (programs ?? []).map((p) => [
          p.id,
          {
            title: p.title ?? "Untitled program",
            description: p.description ?? null,
            level: p.level ?? null,
            tags: (p.tags ?? []) as string[],
          },
        ]),
      );

      // 1. library row -> muscle template (the board plan behind it)
      const { data: mpts, error: mptErr } = await supabase
        .from("muscle_program_templates")
        .select("id, converted_program_id")
        .in("converted_program_id", ids);
      if (mptErr) throw mptErr;

      const mptByProgram = new Map<string, string>();
      for (const m of mpts ?? []) {
        if (m.converted_program_id) mptByProgram.set(m.converted_program_id, m.id);
      }
      const mptIds = [...mptByProgram.values()];

      // 2. muscle template -> canonical template plan
      const { data: plans, error: planErr } = mptIds.length
        ? await supabase
            .from("plan")
            .select("id, source_muscle_template_id")
            .eq("kind", "template")
            .in("source_muscle_template_id", mptIds)
        : { data: [], error: null };
      if (planErr) throw planErr;

      const planByMpt = new Map<string, string>();
      for (const p of plans ?? []) {
        if (p.source_muscle_template_id) planByMpt.set(p.source_muscle_template_id, p.id);
      }
      const planIds = [...planByMpt.values()];

      // 3. canonical rows (batched across every plan)
      const [weeksRes, sessionsRes, slotsRes] = planIds.length
        ? await Promise.all([
            supabase.from("plan_weeks").select("id, plan_id, week_index, is_deload").in("plan_id", planIds),
            supabase
              .from("plan_sessions")
              .select("id, plan_id, plan_week_id, day_index, name, activity_type, sort_order")
              .in("plan_id", planIds),
            supabase
              .from("plan_slots")
              .select("id, plan_id, plan_session_id, sort_order, activity_id, activity_name, prescription_json")
              .in("plan_id", planIds),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];
      if (weeksRes.error) throw weeksRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (slotsRes.error) throw slotsRes.error;

      // 4. reach — assignments point at the CLIENT CLONE, which links back to the
      //    template via plan.source_template_plan_id. No new infra needed.
      const reachByPlan = new Map<string, ProgramReach>();
      if (planIds.length) {
        const { data: clones, error: cloneErr } = await supabase
          .from("plan")
          .select("id, source_template_plan_id")
          .in("source_template_plan_id", planIds);
        if (cloneErr) throw cloneErr;

        const templateByClone = new Map<string, string>();
        for (const c of clones ?? []) {
          if (c.source_template_plan_id) templateByClone.set(c.id, c.source_template_plan_id);
        }
        const cloneIds = [...templateByClone.keys()];

        if (cloneIds.length) {
          const { data: assignments, error: aErr } = await supabase
            .from("client_plan_assignment")
            .select("client_id, team_id, plan_id, status")
            .in("plan_id", cloneIds)
            .eq("status", "active");
          if (aErr) throw aErr;

          const clientsByPlan = new Map<string, Set<string>>();
          const teamsByPlan = new Map<string, Set<string>>();
          for (const a of assignments ?? []) {
            const templateId = a.plan_id ? templateByClone.get(a.plan_id) : undefined;
            if (!templateId) continue;
            if (a.client_id) {
              const set = clientsByPlan.get(templateId) ?? new Set();
              set.add(a.client_id);
              clientsByPlan.set(templateId, set);
            }
            if (a.team_id) {
              const set = teamsByPlan.get(templateId) ?? new Set();
              set.add(a.team_id);
              teamsByPlan.set(templateId, set);
            }
          }
          for (const planId of planIds) {
            reachByPlan.set(planId, {
              clients: clientsByPlan.get(planId)?.size ?? 0,
              teams: teamsByPlan.get(planId)?.size ?? 0,
            });
          }
        }
      }

      // 5. legacy shim — only for library rows with NO canonical plan.
      const legacyIds = ids.filter((id) => {
        const mptId = mptByProgram.get(id);
        return !mptId || !planByMpt.has(mptId);
      });

      let legacyDays: { id: string; day_index: number; program_template_id: string | null }[] = [];
      let legacyModules: Awaited<ReturnType<typeof fetchLegacyModules>> = [];
      let legacyMe: { id: string; day_module_id: string | null; sort_order: number | null }[] = [];
      let legacyRx: {
        module_exercise_id: string | null;
        set_count: number | null;
        rep_range_min: number | null;
        rep_range_max: number | null;
        tempo: string | null;
      }[] = [];

      if (legacyIds.length) {
        const { data: days, error: dErr } = await supabase
          .from("program_template_days")
          .select("id, day_index, program_template_id")
          .in("program_template_id", legacyIds);
        if (dErr) throw dErr;
        legacyDays = days ?? [];

        const dayIds = legacyDays.map((d) => d.id);
        if (dayIds.length) {
          legacyModules = await fetchLegacyModules(dayIds);
          const moduleIds = legacyModules.map((m) => m.id);
          if (moduleIds.length) {
            const { data: me, error: meErr } = await supabase
              .from("module_exercises")
              .select("id, day_module_id, sort_order")
              .in("day_module_id", moduleIds);
            if (meErr) throw meErr;
            legacyMe = me ?? [];

            const meIds = legacyMe.map((m) => m.id);
            if (meIds.length) {
              const { data: rx, error: rxErr } = await supabase
                .from("exercise_prescriptions")
                .select("module_exercise_id, set_count, rep_range_min, rep_range_max, tempo")
                .in("module_exercise_id", meIds);
              if (rxErr) throw rxErr;
              legacyRx = rx ?? [];
            }
          }
        }
      }

      // 6. assemble one summary per library row
      const next = new Map<string, ProgramSummary>();

      for (const programId of ids) {
        const mptId = mptByProgram.get(programId) ?? null;
        const planId = mptId ? (planByMpt.get(mptId) ?? null) : null;

        let slots: MuscleSlotData[];
        let tree: ProgramSummary["tree"] = { weeks: [], sessions: [], slots: [] };
        let repWeekSessions: SessionData[];
        let totalSessions: number;
        let weekCount: number;
        let source: ProgramSummary["source"];

        if (planId) {
          source = "canonical";
          const weeks = (weeksRes.data ?? []).filter((w) => w.plan_id === planId) as CanonicalPlanWeekRow[];
          const allSessions = (sessionsRes.data ?? []).filter(
            (s) => s.plan_id === planId,
          ) as unknown as (CanonicalPlanSessionRow & { plan_id: string })[];
          const allSlots = (slotsRes.data ?? []).filter(
            (s) => s.plan_id === planId,
          ) as unknown as (CanonicalPlanSlotRow & { plan_id: string })[];

          const repWeek = pickRepresentativeWeek(weeks);
          const weekSessions = repWeek
            ? allSessions.filter((s) => s.plan_week_id === repWeek.id)
            : allSessions;
          const weekSessionIds = new Set(weekSessions.map((s) => s.id));
          const weekSlots = allSlots.filter(
            (s) => s.plan_session_id != null && weekSessionIds.has(s.plan_session_id),
          );

          slots = adaptCanonicalPlanToSlots(weekSessions, weekSlots);
          repWeekSessions = adaptCanonicalPlanToSessions(weekSessions);
          totalSessions = allSessions.length;
          weekCount = weeks.length;

          // PR3: hand the raw tree back instead of throwing it away — the rows are
          // already in memory, so the week-by-week view costs no extra query.
          // Defensive dedupe by slot id: canonical plan_slots.id is a PK so duplicates
          // shouldn't occur (the known "Prenatal Trimester 1" dup is a duplicate
          // builder_slot_id in slot_config, which save_plan_from_builder already
          // collapses). Deduping here means any future dup can't double-count sets.
          const seen = new Set<string>();
          tree = {
            weeks: [...weeks].sort((a, b) => a.week_index - b.week_index),
            sessions: allSessions,
            slots: allSlots.filter((sl) => !seen.has(sl.id) && seen.add(sl.id)),
          };
        } else {
          source = "legacy";
          const days = legacyDays.filter((d) => d.program_template_id === programId);
          const dayIds = new Set(days.map((d) => d.id));
          const modules = legacyModules.filter(
            (m) => m.program_template_day_id != null && dayIds.has(m.program_template_day_id),
          );
          const moduleIds = new Set(modules.map((m) => m.id));
          const mes = legacyMe.filter((m) => m.day_module_id != null && moduleIds.has(m.day_module_id));

          const allSlots = adaptLegacyProgramToSlots(days, modules, mes, legacyRx);
          const allSessions = adaptLegacyProgramToSessions(days, modules);

          // Legacy day_index is absolute across weeks — week 1 is day_index 1-7.
          const week1DayIds = new Set(days.filter((d) => d.day_index <= 7).map((d) => d.id));
          const week1ModuleIds = new Set(
            modules
              .filter((m) => m.program_template_day_id != null && week1DayIds.has(m.program_template_day_id))
              .map((m) => m.id),
          );
          slots = allSlots.filter((s) => s.sessionId != null && week1ModuleIds.has(s.sessionId));
          repWeekSessions = allSessions.filter((s) => week1ModuleIds.has(s.id));
          totalSessions = allSessions.length;
          weekCount = days.length > 0 ? Math.ceil(Math.max(...days.map((d) => d.day_index)) / 7) : 0;
        }

        const strengthSlots = slots.filter((s) => !s.activityType || s.activityType === "strength");
        const reach = planId ? (reachByPlan.get(planId) ?? { clients: 0, teams: 0 }) : { clients: 0, teams: 0 };

        next.set(programId, {
          programId,
          source,
          slots,
          sessions: repWeekSessions,
          structure: deriveProgramStructure(weekCount, repWeekSessions, totalSessions),
          ribbon: deriveMuscleRibbon(slots),
          focus: deriveFocusChips(repWeekSessions, slots),
          sets: strengthSlots.reduce((sum, s) => sum + s.sets, 0),
          exercises: countExercises(slots),
          duration: estimatePerSession(slots, repWeekSessions),
          reach,
          muscleTemplateId: mptId,
          meta: metaById.get(programId) ?? {
            title: "Untitled program",
            description: null,
            level: null,
            tags: [],
          },
          tree,
        });
      }

      setSummaries(next);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      captureException(e, { source: "useProgramSummaries" });
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current === key) return;
    hasFetched.current = key;
    void load(key ? key.split(",") : []);
  }, [key, load]);

  return { summaries, isLoading, error };
}

async function fetchLegacyModules(dayIds: string[]) {
  const { data, error } = await supabase
    .from("day_modules")
    .select("id, program_template_day_id, title, session_type, sort_order, source_muscle_id")
    .in("program_template_day_id", dayIds);
  if (error) throw error;
  return data ?? [];
}
