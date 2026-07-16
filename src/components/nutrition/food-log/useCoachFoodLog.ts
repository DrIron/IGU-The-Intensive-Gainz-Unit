import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import type { NutritionTotals } from "../NutritionSummary";
import type { FoodLogUnit } from "@/lib/foodLog";
import type { FoodLogWriteRole } from "./useFoodLog";

/**
 * The COACH/DIETITIAN read of a client's food log for one day (P4).
 *
 * All shaping happens server-side in get_client_daily_nutrition — the role gate, and the
 * macro/micro boundary. This hook does no filtering of its own: whatever the RPC returns is
 * already scoped to what the caller may see. A coach's payload physically has no hidden micro
 * key, so there is nothing to hide here and no way to accidentally leak one.
 */

export interface CoachLogEntry {
  id: string;
  food_id: string | null;
  meal_slot: string;
  food_name: string;
  quantity: number;
  unit: FoodLogUnit;
  quantity_g: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  portion_label: string | null;
  /** Attribution — 'client' when self-logged, a staff role when a coach/dietitian added it. */
  created_by_role: FoodLogWriteRole;
}

interface DailyNutritionPayload {
  log_date: string;
  micros_included: boolean;
  totals: { kcal: number; protein_g: number; fat_g: number; carb_g: number };
  target: { kcal: number; protein_g: number; fat_g: number; carb_g: number } | null;
  entries: Array<Record<string, unknown>>;
  day_micros: Record<string, number>;
}

export function useCoachFoodLog(clientUserId: string | null, logDate: string) {
  const [totals, setTotals] = useState<NutritionTotals>({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
  const [target, setTarget] = useState<NutritionTotals | null>(null);
  const [entries, setEntries] = useState<CoachLogEntry[]>([]);
  const [dayMicros, setDayMicros] = useState<Record<string, number>>({});
  const [microsIncluded, setMicrosIncluded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const fetchKey = useRef<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!clientUserId) return;
      try {
        if (!opts?.silent) setLoading(true);
        setLoadError(false);

        const { data, error } = await supabase.rpc("get_client_daily_nutrition", {
          p_client_id: clientUserId,
          p_log_date: logDate,
        });
        if (error) throw error;

        const p = data as unknown as DailyNutritionPayload | null;
        const t = p?.totals ?? { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 };
        setTotals({ kcal: Number(t.kcal), protein: Number(t.protein_g), fat: Number(t.fat_g), carbs: Number(t.carb_g) });
        setTarget(
          p?.target
            ? {
                kcal: Number(p.target.kcal),
                protein: Number(p.target.protein_g),
                fat: Number(p.target.fat_g),
                carbs: Number(p.target.carb_g),
              }
            : null,
        );
        setEntries(
          (p?.entries ?? []).map((e) => ({
            id: e.id as string,
            food_id: (e.food_id as string | null) ?? null,
            meal_slot: e.meal_slot as string,
            food_name: e.food_name as string,
            quantity: Number(e.quantity),
            unit: e.unit as FoodLogUnit,
            quantity_g: Number(e.quantity_g),
            kcal: Number(e.kcal),
            protein_g: Number(e.protein_g),
            fat_g: Number(e.fat_g),
            carb_g: Number(e.carb_g),
            portion_label: (e.portion_label as string | null) ?? null,
            created_by_role: ((e.created_by_role as string | null) ?? "client") as FoodLogWriteRole,
          })),
        );
        setDayMicros((p?.day_micros ?? {}) as Record<string, number>);
        setMicrosIncluded(Boolean(p?.micros_included));
      } catch (e: unknown) {
        // A failed read is NOT an empty day. Never render "nothing logged" for this — a coach
        // could act on a false "the client hasn't eaten" when the read simply broke.
        captureException(e, { source: "useCoachFoodLog" });
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    },
    [clientUserId, logDate],
  );

  useEffect(() => {
    const key = `${clientUserId}:${logDate}`;
    if (fetchKey.current === key) return;
    fetchKey.current = key;
    void load();
  }, [clientUserId, logDate, load]);

  return { totals, target, entries, dayMicros, microsIncluded, loading, loadError, reload: load };
}
