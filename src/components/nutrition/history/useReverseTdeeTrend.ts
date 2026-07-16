import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { computeReverseTdeeSeries, type LoggedKcalDay, type WeighIn } from "@/lib/reverseTdee";
import type { TrendPoint } from "@/components/client-overview/charts/PhaseAnnotatedTrendChart";

/**
 * NU2 — the rolling real (reverse) TDEE series for the History surface.
 *
 * Reads the client's logged calories (food_log_daily_rollup) + weigh-ins (weight_logs) and hands
 * both to the pure computeReverseTdeeSeries. All the honesty rules (the sparse-data gate,
 * smoothing) live in that pure module; this hook just supplies data.
 *
 * DEGRADE-SAFE, mirroring useNutritionIntakeHistory: a failed read warns and leaves the series
 * empty so the chart shows its calm empty state — NO error banner.
 */
export function useReverseTdeeTrend(clientUserId: string | null) {
  const [series, setSeries] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    const [rollupRes, weightRes] = await Promise.all([
      supabase
        .from("food_log_daily_rollup")
        .select("log_date, total_kcal")
        .eq("client_id", userId)
        .order("log_date", { ascending: true }),
      supabase
        .from("weight_logs")
        .select("log_date, weight_kg")
        .eq("user_id", userId)
        .order("log_date", { ascending: true }),
    ]);
    if (rollupRes.error) console.warn("[useReverseTdeeTrend] rollups:", rollupRes.error.message);
    if (weightRes.error) console.warn("[useReverseTdeeTrend] weights:", weightRes.error.message);

    const loggedDays: LoggedKcalDay[] = (rollupRes.data ?? []).map((r) => ({
      date: r.log_date as string,
      kcal: Number(r.total_kcal),
    }));
    const weighIns: WeighIn[] = (weightRes.data ?? []).map((w) => ({
      date: w.log_date as string,
      kg: Number(w.weight_kg),
    }));

    setSeries(computeReverseTdeeSeries(loggedDays, weighIns));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!clientUserId || hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    // Degrade-safe: a thrown read leaves the series empty, loading=false — never an error banner.
    load(clientUserId).catch((err) => {
      console.error("[useReverseTdeeTrend]", err);
      setSeries([]);
      setLoading(false);
    });
  }, [clientUserId, load]);

  return { series, loading };
}
