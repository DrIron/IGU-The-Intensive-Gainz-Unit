import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TrendPoint, TrendPhase } from "@/components/client-overview/charts/PhaseAnnotatedTrendChart";
import { rollingAdherence, dayCalorieBand, type AdherenceBand } from "@/lib/adherence";

/**
 * Nutrition intake history for the History & Trends surface (P5b), reusable on coach + client.
 *
 * DEGRADE-SAFE, mirroring WorkoutHistoryTrends: a failed read warns and leaves the slice empty
 * so the shared chart shows its calm empty state. There is deliberately NO error banner — a
 * history panel that can't load is quiet, not alarming.
 *
 * TARGET is a UNIFIED TIMELINE, phases-first-else-goals (the getActiveNutritionTarget
 * precedence, applied over time). A coached client's per-day target is the nutrition_phase in
 * effect that day (with chart bands); a team-plan self-service client's is the nutrition_goal
 * in effect that day (target + intake lines, no bands — goals aren't phases). Precedence is
 * exclusive: any real phase target means phases win and goals are ignored entirely.
 */

const ADHERENCE_WINDOW_DAYS = 56; // fixed trailing 8 weeks
const DAY_MS = 24 * 60 * 60 * 1000;

interface RollupRow {
  log_date: string;
  total_kcal: number;
  total_protein_g: number;
  total_fat_g: number;
  total_carb_g: number;
}

/** A phase with its target macros, for per-day target resolution. */
export interface PhaseWithTarget {
  startMs: number;
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

/**
 * The phase in effect on a given day = the one with the greatest start ≤ day. A day before the
 * first phase has no target (null) — the same [start, nextStart) partitioning the chart uses
 * for its phase bands. `phases` MUST be sorted ascending by startMs.
 *
 * Kept as the phase-specific case (its test proves the partition); `targetInEffect` below
 * generalizes it to explicit [start, end) segments so goals — which carry their own end_date
 * and can have gaps — work too.
 */
export function phaseInEffect(phases: PhaseWithTarget[], dayMs: number): PhaseWithTarget | null {
  let current: PhaseWithTarget | null = null;
  for (const p of phases) {
    if (p.startMs <= dayMs) current = p;
    else break;
  }
  return current;
}

/** A span of time during which one target applied. endMs null = open-ended (still active). */
export interface TargetSegment {
  startMs: number;
  endMs: number | null;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

/**
 * The target segment in effect on a given day: startMs ≤ day AND (endMs == null || day < endMs).
 *
 * Unlike phaseInEffect this uses EXPLICIT ends, so it handles the two shapes uniformly:
 *   - phases: contiguous (each endMs = the next phase's start; the last is null) — no gaps.
 *   - goals: each span carries its own end_date, so there CAN be a gap between two goals. A day
 *     in that gap, or before the first / after an ended last span, correctly resolves to null →
 *     no target → adherence not-measurable there (never a red verdict on a targetless day).
 * `segments` MUST be sorted ascending by startMs.
 */
export function targetInEffect(segments: TargetSegment[], dayMs: number): TargetSegment | null {
  for (const s of segments) {
    if (s.startMs <= dayMs && (s.endMs == null || dayMs < s.endMs)) return s;
  }
  return null;
}

export interface NutritionAdherenceWindow {
  perDay: AdherenceBand[];
  adherentPct: number | null;
  loggedDays: number;
  totalDays: number;
  streak: number; // consecutive logged days ending on the most recent day of the window
}

export interface NutritionIntakeHistoryData {
  intake: TrendPoint[];
  target: TrendPoint[];
  protein: TrendPoint[];
  fat: TrendPoint[];
  carbs: TrendPoint[];
  phases: TrendPhase[];
  adherence: NutritionAdherenceWindow;
  /** False when the client has no phases at all (team-plan self-service) → neutral adherence. */
  hasTargetHistory: boolean;
  loading: boolean;
}

const EMPTY_ADHERENCE: NutritionAdherenceWindow = {
  perDay: [],
  adherentPct: null,
  loggedDays: 0,
  totalDays: ADHERENCE_WINDOW_DAYS,
  streak: 0,
};

/** Midnight-of-day ms for an ISO date string (local), so day math lines up with the strip. */
function dayStartMs(isoDate: string): number {
  const d = new Date(isoDate + "T00:00:00");
  return d.getTime();
}

export function useNutritionIntakeHistory(clientUserId: string | null) {
  const [data, setData] = useState<NutritionIntakeHistoryData>({
    intake: [], target: [], protein: [], fat: [], carbs: [], phases: [],
    adherence: EMPTY_ADHERENCE, hasTargetHistory: false, loading: true,
  });
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    const [rollupRes, phasesRes, goalsRes] = await Promise.all([
      supabase
        .from("food_log_daily_rollup")
        .select("log_date, total_kcal, total_protein_g, total_fat_g, total_carb_g")
        .eq("client_id", userId)
        .order("log_date", { ascending: true }),
      supabase
        .from("nutrition_phases")
        .select("start_date, phase_name, daily_calories, protein_grams, fat_grams, carb_grams")
        .eq("user_id", userId)
        .order("start_date", { ascending: true }),
      supabase
        .from("nutrition_goals")
        .select("start_date, end_date, daily_calories, protein_grams, fat_grams, carb_grams")
        .eq("user_id", userId)
        .order("start_date", { ascending: true }),
    ]);
    if (rollupRes.error) console.warn("[NutritionIntakeHistory] rollups:", rollupRes.error.message);
    if (phasesRes.error) console.warn("[NutritionIntakeHistory] phases:", phasesRes.error.message);
    if (goalsRes.error) console.warn("[NutritionIntakeHistory] goals:", goalsRes.error.message);

    const rollups = (rollupRes.data ?? []) as RollupRow[];

    const phasesWithTarget: PhaseWithTarget[] = (phasesRes.data ?? [])
      .map((p) => ({
        startMs: new Date(p.start_date as string).getTime(),
        name: (p.phase_name as string) ?? "Phase",
        kcal: Number(p.daily_calories ?? 0),
        protein: Number(p.protein_grams ?? 0),
        fat: Number(p.fat_grams ?? 0),
        carbs: Number(p.carb_grams ?? 0),
      }))
      .filter((p) => Number.isFinite(p.startMs))
      .sort((a, b) => a.startMs - b.startMs);

    // Unified target timeline, phases-first-else-goals (the getActiveNutritionTarget precedence,
    // applied OVER TIME). Precedence is EXCLUSIVE: a client with any real phase target uses
    // phases and ignores goals entirely.
    const usePhases = phasesWithTarget.some((p) => p.kcal > 0);

    let segments: TargetSegment[];
    let phases: TrendPhase[];
    if (usePhases) {
      // Contiguous partition: each phase runs until the next phase starts (last is open-ended).
      segments = phasesWithTarget.map((p, i) => ({
        startMs: p.startMs,
        endMs: i + 1 < phasesWithTarget.length ? phasesWithTarget[i + 1].startMs : null,
        kcal: p.kcal,
        protein: p.protein,
        fat: p.fat,
        carbs: p.carbs,
      }));
      phases = phasesWithTarget.map((p) => ({ t: p.startMs, name: p.name }));
    } else {
      // Team-plan self-service: goals carry their OWN end_date (null = active). Goals aren't
      // phases, so no chart bands — just the intake + target lines.
      segments = (goalsRes.data ?? [])
        .map((g) => ({
          startMs: new Date(g.start_date as string).getTime(),
          endMs: g.end_date ? new Date(g.end_date as string).getTime() : null,
          kcal: Number(g.daily_calories ?? 0),
          protein: Number(g.protein_grams ?? 0),
          fat: Number(g.fat_grams ?? 0),
          carbs: Number(g.carb_grams ?? 0),
        }))
        .filter((s) => Number.isFinite(s.startMs))
        .sort((a, b) => a.startMs - b.startMs);
      phases = [];
    }

    // Trend series over all logged history.
    const intake: TrendPoint[] = [];
    const target: TrendPoint[] = [];
    const protein: TrendPoint[] = [];
    const fat: TrendPoint[] = [];
    const carbs: TrendPoint[] = [];
    for (const r of rollups) {
      const t = dayStartMs(r.log_date);
      if (!Number.isFinite(t)) continue;
      intake.push({ t, value: Math.round(Number(r.total_kcal)) });
      protein.push({ t, value: Math.round(Number(r.total_protein_g)) });
      fat.push({ t, value: Math.round(Number(r.total_fat_g)) });
      carbs.push({ t, value: Math.round(Number(r.total_carb_g)) });
      // Target line only where a target segment (phase or goal) was in effect.
      const seg = targetInEffect(segments, t);
      if (seg && seg.kcal > 0) target.push({ t, value: Math.round(seg.kcal) });
    }

    // Adherence over the fixed trailing 56-day window.
    const byDate = new Map<string, RollupRow>();
    for (const r of rollups) byDate.set(r.log_date, r);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowDays: { consumedKcal: number | null; targetKcal: number | null; logged: boolean }[] = [];
    for (let i = ADHERENCE_WINDOW_DAYS - 1; i >= 0; i--) {
      const dayMs = today.getTime() - i * DAY_MS;
      const iso = new Date(dayMs).toISOString().slice(0, 10);
      const row = byDate.get(iso);
      const seg = targetInEffect(segments, dayMs);
      const targetKcal = seg && seg.kcal > 0 ? seg.kcal : null;
      windowDays.push({
        consumedKcal: row ? Number(row.total_kcal) : null,
        targetKcal,
        logged: row != null,
      });
    }

    const rolling = rollingAdherence(
      windowDays.map((d) => ({ consumedKcal: d.consumedKcal, targetKcal: d.targetKcal })),
    );
    // Per-day band via the pure module (identical to rolling.perDay, kept explicit for clarity).
    const perDay = windowDays.map((d) => dayCalorieBand(d.consumedKcal, d.targetKcal));

    // Current streak: consecutive LOGGED days counting back from the most recent day.
    let streak = 0;
    for (let i = windowDays.length - 1; i >= 0; i--) {
      if (windowDays[i].logged) streak++;
      else break;
    }

    setData({
      intake, target, protein, fat, carbs, phases,
      adherence: {
        perDay,
        adherentPct: rolling.adherentPct,
        loggedDays: rolling.loggedDays,
        totalDays: ADHERENCE_WINDOW_DAYS,
        streak,
      },
      hasTargetHistory: segments.some((s) => s.kcal > 0),
      loading: false,
    });
  }, []);

  useEffect(() => {
    if (!clientUserId || hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    // Degrade-safe: a thrown read leaves the slice at its empty defaults, loading=false.
    load(clientUserId).catch((err) => {
      console.error("[NutritionIntakeHistory]", err);
      setData((prev) => ({ ...prev, loading: false }));
    });
  }, [clientUserId, load]);

  return data;
}
