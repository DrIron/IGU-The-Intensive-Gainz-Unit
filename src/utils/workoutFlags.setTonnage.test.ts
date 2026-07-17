import { describe, it, expect } from "vitest";
import { setTonnage } from "./workoutFlags";
import type { LoggedSet } from "./prEngine";

// setTonnage is plain load × reps for any completed set. (The WK5 warm-up exclusion was
// removed — the client-facing per-set type marker is gone, so every completed set counts.)

function set(load: number | null = 100, reps: number | null = 5): LoggedSet {
  return {
    performedLoad: load,
    performedReps: reps,
    performedRir: null,
    performedRpe: null,
    performedTime: null,
    performedDistance: null,
    performedPace: null,
    performedRounds: null,
    performedCalories: null,
    performedSide: null,
  };
}

describe("setTonnage", () => {
  it("is load × reps for a completed set", () => {
    expect(setTonnage(set(100, 5))).toBe(500);
    expect(setTonnage(set(60, 12))).toBe(720);
    expect(setTonnage(set(80, 8))).toBe(640);
  });

  it("returns 0 when load or reps are missing", () => {
    expect(setTonnage(set(null, 5))).toBe(0);
    expect(setTonnage(set(100, null))).toBe(0);
  });
});
