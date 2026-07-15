import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";

/**
 * The active nutrition target for a client — ONE source of truth for the phase-first coalesce.
 *
 * A coached (1:1) client's target lives on the active `nutrition_phases` row; a team-plan
 * self-service client's on `nutrition_goals`. Both carry identical columns. Phase wins.
 *
 * This coalesce was copy-pasted into five places, and #215 was caused by one copy drifting
 * (the food-log reads had only ever queried nutrition_goals, blanking every 1:1 client's
 * target). This is the single TS implementation; the SQL side has get_active_nutrition_target
 * for the same reason.
 *
 * RESILIENT BY DESIGN: it never throws. A target is optional — a client with none still logs
 * food — so a failed target read must not become a hard failure for the surface that needs it.
 * On any query error it logs and returns null, centralizing the deliberate "target error ≠
 * load failure" split that useFoodLog established in #215.
 */

export interface ActiveNutritionTarget {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  goalType: string | null;
  source: "phase" | "goal";
  /** The untouched phase/goal row, for callers needing more than the four macros. */
  raw: Record<string, unknown>;
}

/** Shape a raw phase/goal row into the target, or null when it has no usable calorie target. */
function shape(row: Record<string, unknown> | null, source: "phase" | "goal"): ActiveNutritionTarget | null {
  if (!row) return null;
  const kcal = Number(row.daily_calories);
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  return {
    kcal,
    protein: Number(row.protein_grams ?? 0),
    fat: Number(row.fat_grams ?? 0),
    carbs: Number(row.carb_grams ?? 0),
    goalType: (row.goal_type as string | null) ?? null,
    source,
    raw: row,
  };
}

export async function getActiveNutritionTarget(userId: string): Promise<ActiveNutritionTarget | null> {
  try {
    // Active phase first. order+limit is intentional robustness over a bare .maybeSingle():
    // it matches the RPC's ORDER BY created_at DESC LIMIT 1 and won't throw if a client ever
    // ends up with two active rows.
    const phaseRes = await supabase
      .from("nutrition_phases")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (phaseRes.error) throw phaseRes.error;

    const phaseTarget = shape(phaseRes.data as Record<string, unknown> | null, "phase");
    if (phaseTarget) return phaseTarget;

    // Fall back to the active goal (team-plan self-service).
    const goalRes = await supabase
      .from("nutrition_goals")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (goalRes.error) throw goalRes.error;

    return shape(goalRes.data as Record<string, unknown> | null, "goal");
  } catch (e: unknown) {
    // Never throw: a target-read failure is "no target here", not a surface-level load failure.
    captureException(e, { source: "getActiveNutritionTarget" });
    return null;
  }
}
