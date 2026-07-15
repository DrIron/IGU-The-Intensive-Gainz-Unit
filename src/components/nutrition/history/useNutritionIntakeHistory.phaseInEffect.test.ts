import { describe, it, expect } from "vitest";
import { phaseInEffect, type PhaseWithTarget } from "./useNutritionIntakeHistory";

/**
 * The per-day target = the phase in effect that day (greatest start ≤ day). A day before the
 * first phase has no target. This is the same [start, nextStart) partitioning the chart uses
 * for its bands — getting it wrong would show the WRONG target line, so it's pinned directly.
 */

const day = (iso: string) => new Date(iso + "T00:00:00Z").getTime();

const phases: PhaseWithTarget[] = [
  { startMs: day("2026-01-01"), name: "Cut", kcal: 1800, protein: 160, fat: 50, carbs: 150 },
  { startMs: day("2026-03-01"), name: "Maintain", kcal: 2200, protein: 170, fat: 60, carbs: 220 },
  { startMs: day("2026-05-01"), name: "Bulk", kcal: 2800, protein: 180, fat: 75, carbs: 320 },
];

describe("phaseInEffect", () => {
  it("a day before the first phase has NO target", () => {
    expect(phaseInEffect(phases, day("2025-12-31"))).toBeNull();
  });

  it("picks the phase whose [start, nextStart) contains the day", () => {
    expect(phaseInEffect(phases, day("2026-01-15"))?.name).toBe("Cut");
    expect(phaseInEffect(phases, day("2026-04-10"))?.name).toBe("Maintain");
    expect(phaseInEffect(phases, day("2026-06-01"))?.name).toBe("Bulk");
  });

  it("the target flips exactly at each phase boundary (start date is inclusive of the new phase)", () => {
    // The day before a boundary is still the old phase; the boundary day is the new one.
    expect(phaseInEffect(phases, day("2026-02-28"))?.kcal).toBe(1800); // still Cut
    expect(phaseInEffect(phases, day("2026-03-01"))?.kcal).toBe(2200); // Maintain begins
    expect(phaseInEffect(phases, day("2026-04-30"))?.kcal).toBe(2200); // still Maintain
    expect(phaseInEffect(phases, day("2026-05-01"))?.kcal).toBe(2800); // Bulk begins
  });

  it("after the last phase start, that last phase stays in effect indefinitely", () => {
    expect(phaseInEffect(phases, day("2027-01-01"))?.name).toBe("Bulk");
  });

  it("no phases at all → null", () => {
    expect(phaseInEffect([], day("2026-01-15"))).toBeNull();
  });
});
