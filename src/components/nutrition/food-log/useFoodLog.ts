import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import type { NutritionTotals } from "../NutritionSummary";
import { sumEntries, type FoodLogUnit } from "@/lib/foodLog";

/**
 * The client's food diary for one day: entries, the day total, and the coach's target.
 *
 * The DB maintains `food_log_daily_rollup` by trigger, but the UI totals come from summing
 * the entries it already holds. That is deliberate: the donut must move the instant an entry
 * is added, and re-reading a trigger-written rollup would either lag by a round-trip or need
 * a refetch. Both agree — `sumEntries` mirrors the trigger's arithmetic exactly — and the
 * rollup remains the durable, staff-readable source for the coach surfaces (P4).
 */

export interface FoodLogEntry {
  id: string;
  food_id: string | null;
  food_name: string;
  meal_slot: string;
  quantity: number;
  unit: FoodLogUnit;
  quantity_g: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  portion_label: string | null;
}

/** The coach's target for the day, or null if the client has no active nutrition phase. */
export type DayTarget = NutritionTotals | null;

export function useFoodLog(clientUserId: string | null, logDate: string) {
  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [target, setTarget] = useState<DayTarget>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const fetchKey = useRef<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!clientUserId) return;
      try {
        if (!opts?.silent) setLoading(true);
        setLoadError(false);

        const TARGET_COLS = "daily_calories, protein_grams, fat_grams, carb_grams";
        const [entryRes, phaseRes] = await Promise.all([
          supabase
            .from("food_log_entries")
            .select(
              "id, food_id, food_name, meal_slot, quantity, unit, quantity_g, kcal, protein_g, fat_g, carb_g, source_note",
            )
            .eq("client_id", clientUserId)
            .eq("log_date", logDate)
            .order("logged_at", { ascending: true }),
          // The target: a COACHED client's lives on the active nutrition_phases row; a team-plan
          // self-service client's on nutrition_goals. Same columns on both. Phase wins — mirrors
          // NutritionTargetsCard's convention. Reading only nutrition_goals (the old bug) blanked
          // the target for every 1:1 client, who is exactly the client with a coach target to show.
          supabase
            .from("nutrition_phases")
            .select(TARGET_COLS)
            .eq("user_id", clientUserId)
            .eq("is_active", true)
            .maybeSingle(),
        ]);

        if (entryRes.error) throw entryRes.error;
        // Fall back to nutrition_goals only when there's no active phase.
        const goalRes =
          phaseRes.data || phaseRes.error
            ? { data: null }
            : await supabase
                .from("nutrition_goals")
                .select(TARGET_COLS)
                .eq("user_id", clientUserId)
                .eq("is_active", true)
                .maybeSingle();

        setEntries(
          (entryRes.data ?? []).map((e) => ({
            id: e.id as string,
            food_id: (e.food_id as string | null) ?? null,
            food_name: e.food_name as string,
            meal_slot: e.meal_slot as string,
            quantity: Number(e.quantity),
            unit: e.unit as FoodLogUnit,
            quantity_g: Number(e.quantity_g),
            kcal: Number(e.kcal),
            protein_g: Number(e.protein_g),
            fat_g: Number(e.fat_g),
            carb_g: Number(e.carb_g),
            // The portion label is stashed on source_note at write time so an entry can
            // still say "1 breast" after the food (and its portions) are gone.
            portion_label: (e.source_note as string | null) ?? null,
          })),
        );

        // Phase wins; else the goals fallback; else no target. A target-read error is NOT a
        // diary failure — the target is optional (a client with none still logs food), so we
        // leave target null rather than blanking the diary with loadError.
        const t = phaseRes.data ?? goalRes.data;
        setTarget(
          t && Number(t.daily_calories) > 0
            ? {
                kcal: Number(t.daily_calories),
                protein: Number(t.protein_grams ?? 0),
                fat: Number(t.fat_grams ?? 0),
                carbs: Number(t.carb_grams ?? 0),
              }
            : null,
        );
      } catch (e: unknown) {
        // A failed read is NOT an empty diary. Never render "nothing logged" for this.
        captureException(e, { source: "useFoodLog" });
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

  const totals: NutritionTotals = sumEntries(entries);

  return { entries, totals, target, loading, loadError, reload: load };
}

/** Write payload — everything the entry needs to stand on its own forever. */
export interface NewEntry {
  clientId: string;
  logDate: string;
  mealSlot: string;
  foodId: string;
  foodName: string;
  quantity: number;
  unit: FoodLogUnit;
  quantityG: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  micros: Record<string, number>;
  portionLabel: string | null;
}

export async function insertEntry(e: NewEntry): Promise<void> {
  const { error } = await supabase.from("food_log_entries").insert({
    client_id: e.clientId,
    log_date: e.logDate,
    meal_slot: e.mealSlot,
    food_id: e.foodId,
    food_name: e.foodName,
    quantity: e.quantity,
    unit: e.unit,
    quantity_g: e.quantityG,
    kcal: e.kcal,
    protein_g: e.proteinG,
    fat_g: e.fatG,
    carb_g: e.carbG,
    micros: e.micros,
    source_note: e.portionLabel,
    created_by_role: "client",
  });
  if (error) throw error;
}

export async function updateEntry(
  id: string,
  patch: Pick<NewEntry, "quantity" | "unit" | "quantityG" | "kcal" | "proteinG" | "fatG" | "carbG" | "micros" | "portionLabel" | "mealSlot">,
): Promise<void> {
  const { error } = await supabase
    .from("food_log_entries")
    .update({
      meal_slot: patch.mealSlot,
      quantity: patch.quantity,
      unit: patch.unit,
      quantity_g: patch.quantityG,
      kcal: patch.kcal,
      protein_g: patch.proteinG,
      fat_g: patch.fatG,
      carb_g: patch.carbG,
      micros: patch.micros,
      source_note: patch.portionLabel,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from("food_log_entries").delete().eq("id", id);
  if (error) throw error;
}
