import { describe, it, expect } from "vitest";
import { resolveDeloadTargetWeekIndex } from "./deloadAutoApply";

describe("resolveDeloadTargetWeekIndex", () => {
  const start = "2026-06-01";

  it("uses the explicit week number (absolute 1-based) when provided", () => {
    expect(resolveDeloadTargetWeekIndex(4, start, "2026-06-02", 8)).toBe(4);
  });

  it("clamps an out-of-range week to the plan's bounds", () => {
    expect(resolveDeloadTargetWeekIndex(10, start, "2026-06-02", 8)).toBe(8);
    expect(resolveDeloadTargetWeekIndex(0, start, "2026-06-02", 8)).toBe(1);
    expect(resolveDeloadTargetWeekIndex(-3, start, "2026-06-02", 8)).toBe(1);
  });

  it("defaults to the client's current week by date when omitted", () => {
    expect(resolveDeloadTargetWeekIndex(undefined, start, "2026-06-01", 8)).toBe(1); // week 1
    expect(resolveDeloadTargetWeekIndex(undefined, start, "2026-06-15", 8)).toBe(3); // day 15 -> week 3
    expect(resolveDeloadTargetWeekIndex(null, start, "2026-06-08", 8)).toBe(2); // day 8 -> week 2
  });

  it("default current-week is clamped to the last week past program end", () => {
    expect(resolveDeloadTargetWeekIndex(undefined, start, "2027-01-01", 8)).toBe(8);
  });

  it("floors a fractional explicit week", () => {
    expect(resolveDeloadTargetWeekIndex(3.9, start, "2026-06-02", 8)).toBe(3);
  });
});
