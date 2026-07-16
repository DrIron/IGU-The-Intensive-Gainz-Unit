import { describe, it, expect } from "vitest";
import { targetInEffect, type TargetSegment } from "./useNutritionIntakeHistory";

/**
 * targetInEffect generalizes the phase partition to explicit [start, end) segments so goals —
 * which carry their own end_date and CAN have gaps — resolve correctly. The gap case is the
 * one that matters: a day with no covering segment must return null (→ adherence
 * not-measurable there), never borrow a neighbouring target.
 */

const day = (iso: string) => new Date(iso + "T00:00:00Z").getTime();

describe("targetInEffect — goal segments with explicit ends and gaps", () => {
  // Two goal spans with a GAP between them (goal 1 ends 03-01, goal 2 starts 04-01).
  const goals: TargetSegment[] = [
    { startMs: day("2026-01-01"), endMs: day("2026-03-01"), kcal: 1900, protein: 150, fat: 60, carbs: 190 },
    { startMs: day("2026-04-01"), endMs: null, kcal: 2100, protein: 165, fat: 65, carbs: 210 }, // active
  ];

  it("returns the goal whose [start, end) contains the day", () => {
    expect(targetInEffect(goals, day("2026-01-15"))?.kcal).toBe(1900);
    expect(targetInEffect(goals, day("2026-05-01"))?.kcal).toBe(2100);
  });

  it("end is EXCLUSIVE — the end date itself belongs to no span (unless the next covers it)", () => {
    expect(targetInEffect(goals, day("2026-02-28"))?.kcal).toBe(1900); // last day of goal 1
    expect(targetInEffect(goals, day("2026-03-01"))).toBeNull(); // goal 1 ended, gap begins
  });

  it("a day in the GAP between two goals → null (not the previous or next target)", () => {
    expect(targetInEffect(goals, day("2026-03-15"))).toBeNull();
  });

  it("before the first goal → null", () => {
    expect(targetInEffect(goals, day("2025-12-31"))).toBeNull();
  });

  it("an ended last goal → null after its end (no open span to fall through to)", () => {
    const endedOnly: TargetSegment[] = [
      { startMs: day("2026-01-01"), endMs: day("2026-02-01"), kcal: 1900, protein: 150, fat: 60, carbs: 190 },
    ];
    expect(targetInEffect(endedOnly, day("2026-03-01"))).toBeNull();
    expect(targetInEffect(endedOnly, day("2026-01-15"))?.kcal).toBe(1900);
  });

  it("an open-ended (active) last goal persists indefinitely", () => {
    expect(targetInEffect(goals, day("2027-06-01"))?.kcal).toBe(2100);
  });

  it("no segments → null", () => {
    expect(targetInEffect([], day("2026-01-15"))).toBeNull();
  });

  it("contiguous phase-style segments (endMs = next start) behave like the phase partition", () => {
    const phaseStyle: TargetSegment[] = [
      { startMs: day("2026-01-01"), endMs: day("2026-03-01"), kcal: 1800, protein: 160, fat: 50, carbs: 150 },
      { startMs: day("2026-03-01"), endMs: null, kcal: 2200, protein: 170, fat: 60, carbs: 220 },
    ];
    expect(targetInEffect(phaseStyle, day("2026-02-28"))?.kcal).toBe(1800);
    expect(targetInEffect(phaseStyle, day("2026-03-01"))?.kcal).toBe(2200); // boundary flips, no gap
    expect(targetInEffect(phaseStyle, day("2026-06-01"))?.kcal).toBe(2200);
  });
});
