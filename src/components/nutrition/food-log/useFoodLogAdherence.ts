import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { format, subDays } from "date-fns";
import { rollingAdherence, macroDeviation, type RollingAdherence, type AdherenceBand } from "@/lib/adherence";

/**
 * 7-day food-log adherence for a client, for the coach/dietitian headline (P5a).
 *
 * Reads food_log_daily_rollup for the trailing 7 days (staff-read RLS already permits this)
 * and the active nutrition target, then hands both to the pure adherence module. All the
 * honesty rules — unlogged ≠ off_track, headline over logged days only — live in that module;
 * this hook just supplies data.
 *
 * TARGET SOURCE: active phase first, then active goal — the same coalesce as useFoodLog and
 * get_client_daily_nutrition. That coalesce now lives in several places; extracting a shared
 * getActiveNutritionTarget() is a deliberate later cleanup, out of scope for this slice.
 */

const TARGET_COLS = "daily_calories, protein_grams, fat_grams, carb_grams";

export interface AdherenceData extends RollingAdherence {
  /** null when there is no active target to measure against. */
  target: { kcal: number; protein: number; fat: number; carbs: number } | null;
  /** Averaged over logged days; null when nothing measurable. */
  avgConsumedKcal: number | null;
  macroBands: { protein: AdherenceBand; fat: AdherenceBand; carbs: AdherenceBand };
  avgConsumedMacros: { protein: number; fat: number; carbs: number } | null;
}

interface RollupRow {
  log_date: string;
  total_kcal: number;
  total_protein_g: number;
  total_fat_g: number;
  total_carb_g: number;
}

export function useFoodLogAdherence(clientUserId: string | null, endDate: Date) {
  const [data, setData] = useState<AdherenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const fetchKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!clientUserId) return;
    try {
      setLoading(true);
      setLoadError(false);

      // The 7 calendar dates of the window, oldest → newest.
      const dates: string[] = Array.from({ length: 7 }, (_, i) => format(subDays(endDate, 6 - i), "yyyy-MM-dd"));
      const from = dates[0];
      const to = dates[dates.length - 1];

      const [rollupRes, phaseRes] = await Promise.all([
        supabase
          .from("food_log_daily_rollup")
          .select("log_date, total_kcal, total_protein_g, total_fat_g, total_carb_g")
          .eq("client_id", clientUserId)
          .gte("log_date", from)
          .lte("log_date", to),
        supabase
          .from("nutrition_phases")
          .select(TARGET_COLS)
          .eq("user_id", clientUserId)
          .eq("is_active", true)
          .maybeSingle(),
      ]);

      if (rollupRes.error) throw rollupRes.error;

      const goalRes =
        phaseRes.data || phaseRes.error
          ? { data: null }
          : await supabase
              .from("nutrition_goals")
              .select(TARGET_COLS)
              .eq("user_id", clientUserId)
              .eq("is_active", true)
              .maybeSingle();

      const t = phaseRes.data ?? goalRes.data;
      const target =
        t && Number(t.daily_calories) > 0
          ? {
              kcal: Number(t.daily_calories),
              protein: Number(t.protein_grams ?? 0),
              fat: Number(t.fat_grams ?? 0),
              carbs: Number(t.carb_grams ?? 0),
            }
          : null;

      // Index rollups by date; a date with no row is an unlogged day (null intake).
      const byDate = new Map<string, RollupRow>();
      for (const r of (rollupRes.data ?? []) as RollupRow[]) byDate.set(r.log_date, r);

      const days = dates.map((d) => {
        const row = byDate.get(d);
        return {
          consumedKcal: row ? Number(row.total_kcal) : null,
          targetKcal: target?.kcal ?? null,
        };
      });
      const rolling = rollingAdherence(days);

      // Macro averages over LOGGED days only (same rule as calories).
      const loggedRows = dates.map((d) => byDate.get(d)).filter((r): r is RollupRow => r != null);
      const avgConsumedMacros =
        loggedRows.length > 0
          ? {
              protein: loggedRows.reduce((s, r) => s + Number(r.total_protein_g), 0) / loggedRows.length,
              fat: loggedRows.reduce((s, r) => s + Number(r.total_fat_g), 0) / loggedRows.length,
              carbs: loggedRows.reduce((s, r) => s + Number(r.total_carb_g), 0) / loggedRows.length,
            }
          : null;
      const avgConsumedKcal =
        loggedRows.length > 0
          ? loggedRows.reduce((s, r) => s + Number(r.total_kcal), 0) / loggedRows.length
          : null;

      setData({
        ...rolling,
        target,
        avgConsumedKcal,
        avgConsumedMacros,
        macroBands: {
          protein: macroDeviation(avgConsumedMacros?.protein ?? null, target?.protein ?? null),
          fat: macroDeviation(avgConsumedMacros?.fat ?? null, target?.fat ?? null),
          carbs: macroDeviation(avgConsumedMacros?.carbs ?? null, target?.carbs ?? null),
        },
      });
    } catch (e: unknown) {
      // A failed read is not "no adherence" — never render an empty/neutral week off a broken
      // fetch. Surface the error state instead.
      captureException(e, { source: "useFoodLogAdherence" });
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [clientUserId, endDate]);

  useEffect(() => {
    const key = `${clientUserId}:${format(endDate, "yyyy-MM-dd")}`;
    if (fetchKey.current === key) return;
    fetchKey.current = key;
    void load();
  }, [clientUserId, endDate, load]);

  return { data, loading, loadError, reload: load };
}
