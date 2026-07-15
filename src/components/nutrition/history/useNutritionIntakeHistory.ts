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
 * TARGET IS PHASE-BASED ONLY. The per-day target is the nutrition_phase in effect that day.
 * A team-plan self-service client (target in nutrition_goals, no phases) gets the intake trend
 * but a neutral "no target" adherence state — goals-based history is a deferred follow-up. We
 * do NOT inline a goals coalesce here.
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
 */
export function phaseInEffect(phases: PhaseWithTarget[], dayMs: number): PhaseWithTarget | null {
  let current: PhaseWithTarget | null = null;
  for (const p of phases) {
    if (p.startMs <= dayMs) current = p;
    else break;
  }
  return current;
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
    const [rollupRes, phasesRes] = await Promise.all([
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
    ]);
    if (rollupRes.error) console.warn("[NutritionIntakeHistory] rollups:", rollupRes.error.message);
    if (phasesRes.error) console.warn("[NutritionIntakeHistory] phases:", phasesRes.error.message);

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

    const phases: TrendPhase[] = phasesWithTarget.map((p) => ({ t: p.startMs, name: p.name }));

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
      // Target line only where a phase was in effect (with a real calorie target).
      const ph = phaseInEffect(phasesWithTarget, t);
      if (ph && ph.kcal > 0) target.push({ t, value: Math.round(ph.kcal) });
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
      const ph = phaseInEffect(phasesWithTarget, dayMs);
      const targetKcal = ph && ph.kcal > 0 ? ph.kcal : null;
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
      hasTargetHistory: phasesWithTarget.some((p) => p.kcal > 0),
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
