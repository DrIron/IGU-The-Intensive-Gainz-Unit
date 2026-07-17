import { describe, it, expect } from "vitest";
import { setTonnage } from "./workoutFlags";
import type { LoggedSet } from "./prEngine";
import type { SetType } from "@/lib/setType";

// WK5 — a warm-up set is marked, not counted. It carries real load × reps but is
// preparatory volume, so it must not inflate tonnage. drop/failure ARE working sets
// and still count (they just aren't "normal"). This locks the one analytics touch.

function set(setType: SetType, load = 100, reps = 5): LoggedSet {
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
    setType,
  };
}

describe("setTonnage — WK5 set-type exclusion", () => {
  it("a warm-up set contributes ZERO tonnage even with real load × reps", () => {
    expect(setTonnage(set("warmup", 100, 5))).toBe(0);
  });

  it("normal / drop / failure sets all count as load × reps", () => {
    expect(setTonnage(set("normal", 100, 5))).toBe(500);
    expect(setTonnage(set("drop", 60, 12))).toBe(720);
    expect(setTonnage(set("failure", 80, 8))).toBe(640);
  });

  it("an absent setType (legacy row) is treated as normal and counts", () => {
    const legacy = set("normal", 90, 10);
    delete (legacy as { setType?: SetType }).setType;
    expect(setTonnage(legacy)).toBe(900);
  });

  it("still returns 0 when load or reps are missing, regardless of type", () => {
    expect(setTonnage({ ...set("normal"), performedLoad: null })).toBe(0);
    expect(setTonnage({ ...set("drop"), performedReps: null })).toBe(0);
  });
});
