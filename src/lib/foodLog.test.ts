import { describe, it, expect } from "vitest";
import {
  availableUnits,
  densityMlPer100g,
  toGrams,
  macrosForGrams,
  microsForGrams,
  defaultUnitFor,
  sumEntries,
  formatAmount,
  type FoodPortion,
} from "./foodLog";

/**
 * P1 GATE — "log the same food by grams AND by serving and get matching totals."
 *
 * The whole unit model (D6) hangs on one invariant: nutrition is per 100 g, so every entry
 * must collapse to GRAMS before any math runs. If grams and servings disagreed, the diary
 * would be quietly wrong in a way no error could ever surface — the client would just be
 * eating different numbers than the ones on screen.
 *
 * Fixtures are the real seeded rows (prod, 2026-07-14).
 */

// Chicken breast: 120 kcal / P22.5 / F2.6 / C0 per 100 g. "1 breast" = 174 g. NO density.
const CHICKEN = { kcal_100g: 120, protein_100g: 22.5, fat_100g: 2.6, carb_100g: 0 };
const CHICKEN_PORTIONS: FoodPortion[] = [
  { id: "p-breast", label: "1 breast", gram_weight: 174, unit_kind: "serving", ml_equiv: null },
];

// Whole milk: 61 kcal per 100 g, and 100 g occupies ~97 ml -> it CAN be logged in ml.
const MILK = { kcal_100g: 61, protein_100g: 3.2, fat_100g: 3.3, carb_100g: 4.8 };
const MILK_PORTIONS: FoodPortion[] = [
  { id: "p-cup", label: "1 cup (250 ml)", gram_weight: 258, unit_kind: "volume", ml_equiv: 97 },
];

describe("P1 GATE — grams and servings must agree", () => {
  it("174 g of chicken === 1 breast, to the gram and to the macro", () => {
    const byGrams = toGrams(174, "g", CHICKEN_PORTIONS);
    const byServing = toGrams(1, "serving", CHICKEN_PORTIONS, "p-breast");

    expect(byGrams).toBe(174);
    expect(byServing).toBe(174);
    expect(byServing).toBe(byGrams);

    // ...and therefore the macros are identical, because they are derived from the grams.
    expect(macrosForGrams(CHICKEN, byServing!)).toEqual(macrosForGrams(CHICKEN, byGrams!));
    expect(macrosForGrams(CHICKEN, byGrams!)).toEqual({
      kcal: 208.8, // 120 * 1.74
      protein_g: 39.15,
      fat_g: 4.52,
      carb_g: 0,
    });
  });

  it("2 breasts === 348 g === 0.348 kg — every unit lands on the same grams", () => {
    const two = toGrams(2, "serving", CHICKEN_PORTIONS, "p-breast");
    expect(two).toBe(348);
    expect(toGrams(348, "g", CHICKEN_PORTIONS)).toBe(348);
    expect(toGrams(0.348, "kg", CHICKEN_PORTIONS)).toBe(348);

    const a = macrosForGrams(CHICKEN, two!);
    expect(a).toEqual(macrosForGrams(CHICKEN, toGrams(0.348, "kg", CHICKEN_PORTIONS)!));
  });

  it("250 ml of milk === 1 cup, via the density", () => {
    // 100 g of milk = 97 ml, so 250 ml = 250 * 100/97 = 257.73 g. The seeded cup says 258 g.
    const byMl = toGrams(250, "ml", MILK_PORTIONS);
    const byCup = toGrams(1, "serving", MILK_PORTIONS, "p-cup");

    expect(byMl).toBe(257.73);
    expect(byCup).toBe(258);
    // They agree to within a rounding of the household measure — not bit-identical, and
    // pretending otherwise would be the lie. A quarter of a gram of milk is not a real
    // difference; silently coercing one to the other WOULD be.
    expect(Math.abs(byMl! - byCup!)).toBeLessThan(0.5);

    expect(toGrams(0.25, "l", MILK_PORTIONS)).toBe(byMl); // L is just ml × 1000
  });
});

describe("D6 — only the units that are actually valid for a food", () => {
  it("a solid offers mass + its servings, and NEVER volume", () => {
    expect(availableUnits(CHICKEN_PORTIONS)).toEqual(["g", "kg", "serving"]);
    expect(availableUnits(CHICKEN_PORTIONS)).not.toContain("ml");
    expect(availableUnits(CHICKEN_PORTIONS)).not.toContain("l");
    expect(densityMlPer100g(CHICKEN_PORTIONS)).toBeNull();
  });

  it("a liquid offers volume too, because it has a density", () => {
    expect(availableUnits(MILK_PORTIONS)).toEqual(["g", "kg", "ml", "l", "serving"]);
    expect(densityMlPer100g(MILK_PORTIONS)).toBe(97);
  });

  it("a food with no portions at all is still loggable by mass", () => {
    expect(availableUnits([])).toEqual(["g", "kg"]);
  });

  it("REFUSES to convert ml for a food with no density — it does not guess 1 g/ml", () => {
    // The tempting bug: assume water density and log 100 ml of chicken as 100 g.
    expect(toGrams(100, "ml", CHICKEN_PORTIONS)).toBeNull();
    expect(toGrams(1, "l", CHICKEN_PORTIONS)).toBeNull();
  });

  it("REFUSES a serving with no portion selected", () => {
    expect(toGrams(1, "serving", CHICKEN_PORTIONS, undefined)).toBeNull();
    expect(toGrams(1, "serving", CHICKEN_PORTIONS, "does-not-exist")).toBeNull();
  });

  it("rejects zero, negative and non-finite quantities", () => {
    expect(toGrams(0, "g", CHICKEN_PORTIONS)).toBeNull();
    expect(toGrams(-5, "g", CHICKEN_PORTIONS)).toBeNull();
    expect(toGrams(NaN, "g", CHICKEN_PORTIONS)).toBeNull();
  });
});

describe("defaults — fewest taps (D6)", () => {
  it("defaults to the named serving, not raw grams", () => {
    expect(defaultUnitFor(CHICKEN_PORTIONS, 120, null)).toEqual({
      unit: "serving",
      quantity: 1,
      portionId: "p-breast",
    });
  });

  it("honours the last-used unit for that food", () => {
    const lastUsed = { unit: "g" as const, quantity: 180, portionId: null };
    expect(defaultUnitFor(CHICKEN_PORTIONS, 120, lastUsed)).toEqual(lastUsed);
  });

  it("ignores a last-used unit the food can no longer offer", () => {
    // Client once logged this in ml; the food has since lost its density.
    const stale = { unit: "ml" as const, quantity: 200, portionId: null };
    expect(defaultUnitFor(CHICKEN_PORTIONS, 120, stale).unit).toBe("serving");

    // Or the portion they used was deleted.
    const staleServing = { unit: "serving" as const, quantity: 1, portionId: "deleted" };
    expect(defaultUnitFor(CHICKEN_PORTIONS, 120, staleServing).portionId).toBe("p-breast");
  });

  it("falls back to grams (at the default serving size) when a food has no portions", () => {
    expect(defaultUnitFor([], 30, null)).toEqual({ unit: "g", quantity: 30, portionId: null });
    expect(defaultUnitFor([], null, null)).toEqual({ unit: "g", quantity: 100, portionId: null });
  });
});

describe("snapshot math", () => {
  it("scales micros to the logged grams", () => {
    expect(microsForGrams({ sodium: 45, sugar: 0 }, 174)).toEqual({ sodium: 78.3, sugar: 0 });
  });

  it("sums a day without float drift", () => {
    const total = sumEntries([
      { kcal: 208.8, protein_g: 39.15, fat_g: 4.52, carb_g: 0 },
      { kcal: 157.3, protein_g: 8.25, fat_g: 8.51, carb_g: 12.38 },
    ]);
    expect(total).toEqual({ kcal: 366.1, protein: 47.4, fat: 13.03, carbs: 12.38 });
  });

  it("an empty day is zero, not NaN", () => {
    expect(sumEntries([])).toEqual({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
  });
});

describe("formatAmount — the client reads grams either way", () => {
  it("shows the household measure AND its grams, so the two are never in doubt", () => {
    expect(formatAmount(1, "serving", 174, "1 breast")).toBe("1 breast (174 g)");
    expect(formatAmount(2, "serving", 348, "1 breast")).toBe("2 × 1 breast (348 g)");
    expect(formatAmount(180, "g", 180)).toBe("180 g");

    // ...but never restates grams the label ALREADY carries. Caught on a screenshot:
    // "Almonds, raw — 1 handful (30 g) (30 g)".
    expect(formatAmount(1, "serving", 30, "1 handful (30 g)")).toBe("1 handful (30 g)");
    // At 2x the totals genuinely differ from the label, so the suffix earns its place again.
    expect(formatAmount(2, "serving", 60, "1 handful (30 g)")).toBe("2 × 1 handful (30 g) (60 g)");
    expect(formatAmount(250, "ml", 257.73)).toBe("250 ml (258 g)");
    expect(formatAmount(0.25, "l", 257.73)).toBe("0.3 L (258 g)");
  });
});
