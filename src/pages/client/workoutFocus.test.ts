import { describe, it, expect } from "vitest";
import { computeInitialFocus } from "./workoutFocus";

/**
 * Slice 2 — the player opens straight into the workout. computeInitialFocus decides the initial view
 * from the loaded exercises + set logs: focus the first incomplete exercise (resume / fresh → ex 1),
 * else stay on the overview (complete → Finish reachable; empty → no crash).
 */
const incomplete = () => [{ completed: false, skipped: false }, { completed: false, skipped: false }];
const complete = () => [{ completed: true, skipped: false }, { completed: true, skipped: false }];

describe("computeInitialFocus", () => {
  it("fresh session (all sets incomplete) → focus exercise 1", () => {
    const ex = [{ id: "a" }, { id: "b" }];
    expect(computeInitialFocus(ex, { a: incomplete(), b: incomplete() })).toEqual({ mode: "focus", focusIndex: 0 });
  });

  it("in-progress → focus the FIRST incomplete exercise (resume)", () => {
    const ex = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(computeInitialFocus(ex, { a: complete(), b: incomplete(), c: incomplete() })).toEqual({
      mode: "focus",
      focusIndex: 1,
    });
  });

  it("fully complete → stay on the overview (Finish reachable there), focus 0", () => {
    const ex = [{ id: "a" }, { id: "b" }];
    expect(computeInitialFocus(ex, { a: complete(), b: complete() })).toEqual({ mode: "overview", focusIndex: 0 });
  });

  it("empty module → overview, focus 0 (no exercise to focus, no crash)", () => {
    expect(computeInitialFocus([], {})).toEqual({ mode: "overview", focusIndex: 0 });
  });

  it("skips a SKIPPED first exercise → resumes at the first non-skipped incomplete", () => {
    const ex = [{ id: "a", skipped: true }, { id: "b" }];
    expect(computeInitialFocus(ex, { a: incomplete(), b: incomplete() })).toEqual({ mode: "focus", focusIndex: 1 });
  });

  it("a skipped set alone doesn't make an exercise 'incomplete'", () => {
    const ex = [{ id: "a" }];
    expect(computeInitialFocus(ex, { a: [{ completed: false, skipped: true }] })).toEqual({
      mode: "overview",
      focusIndex: 0,
    });
  });

  it("an exercise with no logs is not treated as incomplete", () => {
    const ex = [{ id: "a" }, { id: "b" }];
    expect(computeInitialFocus(ex, { a: undefined, b: incomplete() })).toEqual({ mode: "focus", focusIndex: 1 });
  });
});
