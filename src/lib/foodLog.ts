/**
 * Food-log math (FOOD_LOGGING_PLAN §4.1 D6, §4.3).
 *
 * PURE. No fetching, no React. Everything the diary computes lives here so the P1 gate —
 * "log the same food by grams and by serving and get matching totals" — is a unit test on
 * a function, not a click-through of a drawer.
 *
 * The one invariant everything else rests on: **nutrition is stored per 100 g, so every
 * entry resolves to GRAMS before any math happens.** `quantity` + `unit` are what the
 * client typed; `quantity_g` is the truth. Log 174 g of chicken or log "1 breast" (174 g)
 * and you must land on byte-identical macros, because both collapse to the same grams.
 */

export type FoodLogUnit = "g" | "kg" | "ml" | "l" | "serving";

export interface FoodPortion {
  id: string;
  label: string;
  gram_weight: number;
  unit_kind: "mass" | "volume" | "serving";
  /**
   * Millilitres occupied by 100 g of this food — i.e. the density, inverted.
   * Milk: 100 g ≈ 97 ml. Olive oil: 100 g ≈ 109 ml (it floats, so it takes more room).
   *
   * Its PRESENCE is what makes ml/L legal for a food. A solid has no density, so the unit
   * picker must never offer to log chicken in millilitres.
   */
  ml_equiv: number | null;
}

/** Per-100g nutrition, as stored. */
export interface FoodMacros100g {
  kcal_100g: number;
  protein_100g: number;
  fat_100g: number;
  carb_100g: number;
}

export interface EntryMacros {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
}

/** Round to 2dp — matches the NUMERIC(10,2) columns, so the client and the DB agree. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The density of a food, in ml per 100 g, or null if it has none.
 *
 * Any volume portion carries it. A food without one is a solid as far as we're concerned,
 * and we decline to guess: assuming 1 g/ml for "anything liquid-ish" is exactly the kind of
 * silent fabrication that makes a logged number untrustworthy.
 */
export function densityMlPer100g(portions: FoodPortion[]): number | null {
  const withDensity = portions.find((p) => p.ml_equiv != null && p.ml_equiv > 0);
  return withDensity?.ml_equiv ?? null;
}

/**
 * The units this food may legally be logged in (D6: "show only units valid for that food").
 *
 * - mass (g/kg) — always. Everything has a weight.
 * - volume (ml/L) — only with a density.
 * - serving — only if the food actually has named measures.
 */
export function availableUnits(portions: FoodPortion[]): FoodLogUnit[] {
  const units: FoodLogUnit[] = ["g", "kg"];
  if (densityMlPer100g(portions) != null) units.push("ml", "l");
  if (portions.length > 0) units.push("serving");
  return units;
}

/**
 * Resolve what the client typed into GRAMS. Returns null when the combination is not
 * loggable (ml for a food with no density; a serving with no portion chosen) — the caller
 * must refuse to write rather than invent a number.
 */
export function toGrams(
  quantity: number,
  unit: FoodLogUnit,
  portions: FoodPortion[],
  portionId?: string | null,
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  switch (unit) {
    case "g":
      return r2(quantity);
    case "kg":
      return r2(quantity * 1000);
    case "ml":
    case "l": {
      const mlPer100g = densityMlPer100g(portions);
      if (mlPer100g == null) return null; // no density -> not loggable by volume. Don't guess.
      const ml = unit === "l" ? quantity * 1000 : quantity;
      return r2((ml * 100) / mlPer100g);
    }
    case "serving": {
      const portion = portions.find((p) => p.id === portionId);
      if (!portion) return null;
      return r2(quantity * portion.gram_weight);
    }
    default:
      return null;
  }
}

/**
 * Per-100g nutrition scaled to the resolved grams. This is the ONLY place entry macros are
 * computed — the drawer's live "impact on targets" preview and the row actually written to
 * `food_log_entries` both call it, so what the client is shown is what gets stored.
 */
export function macrosForGrams(food: FoodMacros100g, grams: number): EntryMacros {
  const f = grams / 100;
  return {
    kcal: r2(food.kcal_100g * f),
    protein_g: r2(food.protein_100g * f),
    fat_g: r2(food.fat_100g * f),
    carb_g: r2(food.carb_100g * f),
  };
}

/** Scale an arbitrary micronutrient map (per-100g) to the resolved grams, for the snapshot. */
export function microsForGrams(
  micros100g: Record<string, number>,
  grams: number,
): Record<string, number> {
  const f = grams / 100;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(micros100g)) {
    if (Number.isFinite(v)) out[k] = r2(v * f);
  }
  return out;
}

/**
 * The default unit + amount when the client opens a food.
 *
 * D6: "default = last-used per food, else the food's default serving". Falling back to a
 * named portion over raw grams matters — "1 breast" is the tap a human wants; "174 g" is
 * the tap a database wants.
 */
export function defaultUnitFor(
  portions: FoodPortion[],
  servingDefaultG: number | null,
  lastUsed?: { unit: FoodLogUnit; quantity: number; portionId: string | null } | null,
): { unit: FoodLogUnit; quantity: number; portionId: string | null } {
  if (lastUsed && availableUnits(portions).includes(lastUsed.unit)) {
    // A last-used SERVING is only still valid if that portion still exists.
    if (lastUsed.unit !== "serving" || portions.some((p) => p.id === lastUsed.portionId)) {
      return lastUsed;
    }
  }
  const firstServing = portions.find((p) => p.unit_kind === "serving") ?? portions[0];
  if (firstServing) {
    return { unit: "serving", quantity: 1, portionId: firstServing.id };
  }
  return { unit: "g", quantity: servingDefaultG && servingDefaultG > 0 ? servingDefaultG : 100, portionId: null };
}

/** Sum entry snapshots into a day total. The rollup is the DB's job; this mirrors it for the UI. */
export function sumEntries(
  entries: Array<{ kcal: number; protein_g: number; fat_g: number; carb_g: number }>,
): { kcal: number; protein: number; fat: number; carbs: number } {
  return entries.reduce(
    (acc, e) => ({
      kcal: r2(acc.kcal + e.kcal),
      protein: r2(acc.protein + e.protein_g),
      fat: r2(acc.fat + e.fat_g),
      carbs: r2(acc.carbs + e.carb_g),
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
}

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

/** Display label for a logged amount, e.g. "1 breast (174 g)" or "180 g". */
export function formatAmount(
  quantity: number,
  unit: FoodLogUnit,
  quantityG: number,
  portionLabel?: string | null,
): string {
  const q = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1);
  const grams = Math.round(quantityG);
  if (unit === "serving" && portionLabel) {
    const base = quantity === 1 ? portionLabel : `${q} × ${portionLabel}`;
    // Don't restate grams the label already carries: "1 handful (30 g)" must not render as
    // "1 handful (30 g) (30 g)". At 2×, though, the totals DIFFER from the label — "2 × 1
    // handful (30 g) (60 g)" — so the suffix stays, because then it is telling you something.
    if (base.includes(`${grams} g`)) return base;
    return `${base} (${grams} g)`;
  }
  if (unit === "g") return `${Math.round(quantityG)} g`;
  return `${q} ${unit === "l" ? "L" : unit} (${Math.round(quantityG)} g)`;
}
