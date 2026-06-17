import { describe, it, expect } from "vitest";
import { classifyPhaseStatus, type PhaseStatus } from "@/lib/interpret";

/**
 * Parity guard for the NutritionPhaseCard dedupe.
 *
 * `oldInlineStatus` is a verbatim copy of the status useMemo that used to live
 * in NutritionPhaseCard.tsx (before it delegated to classifyPhaseStatus). This
 * test sweeps a representative grid of inputs and asserts the extracted
 * classifier returns IDENTICAL results across all 5 statuses. If this ever
 * fails, the extraction drifted from the original card behavior.
 */
function oldInlineStatus(args: {
  isActive: boolean;
  latestActualChangePercent: number | null;
  weeklyRatePercentage: number;
  goalType: string;
}): PhaseStatus {
  const { isActive, latestActualChangePercent, weeklyRatePercentage, goalType } = args;
  if (isActive === false) return "completed";
  if (latestActualChangePercent == null) return "no_data";
  const expected = weeklyRatePercentage;
  if (goalType === "maintenance") {
    return Math.abs(latestActualChangePercent) <= 0.25 ? "on_track" : "behind";
  }
  const signedExpected = goalType === "fat_loss" ? -expected : expected;
  if (signedExpected === 0) return "on_track";
  const deviation = ((latestActualChangePercent - signedExpected) / Math.abs(signedExpected)) * 100;
  if (Math.abs(deviation) <= 30) return "on_track";
  if (goalType === "fat_loss") {
    return latestActualChangePercent < signedExpected ? "ahead" : "behind";
  }
  return latestActualChangePercent > signedExpected ? "ahead" : "behind";
}

describe("NutritionPhaseCard status parity (extracted classifier === old inline logic)", () => {
  const goalTypes = ["fat_loss", "muscle_gain", "maintenance"] as const;
  const rates = [0, 0.25, 0.5, 0.6, 1, 2];
  const actuals: Array<number | null> = [null, -2, -1.2, -0.8, -0.6, -0.5, -0.2, 0, 0.1, 0.5, 1, 2];
  const actives = [true, false];

  const grid: Array<{
    isActive: boolean;
    latestActualChangePercent: number | null;
    weeklyRatePercentage: number;
    goalType: (typeof goalTypes)[number];
  }> = [];
  for (const goalType of goalTypes)
    for (const weeklyRatePercentage of rates)
      for (const latestActualChangePercent of actuals)
        for (const isActive of actives)
          grid.push({ isActive, latestActualChangePercent, weeklyRatePercentage, goalType });

  it(`matches across all ${goalTypes.length * rates.length * actuals.length * actives.length} grid cases`, () => {
    for (const c of grid) {
      expect(classifyPhaseStatus(c), JSON.stringify(c)).toBe(oldInlineStatus(c));
    }
  });

  it("covers all 5 statuses in the grid (no dead branch)", () => {
    const seen = new Set(grid.map((c) => classifyPhaseStatus(c)));
    expect([...seen].sort()).toEqual(["ahead", "behind", "completed", "no_data", "on_track"]);
  });
});
