// Tests for the "copy progression" pure layer:
//  - mergeDeltaRules (weeklyDeltaEngine) — MERGE conflict semantics + invariants
//  - scope resolvers (progressionClipboard) — strength-only target resolution
//
// Run: npm test -- progressionClipboard

import { describe, it, expect } from "vitest";
import type { MuscleSlotData, WeekData } from "@/types/muscle-builder";
import { mergeDeltaRules, type WeeklyDeltaRule } from "./weeklyDeltaEngine";
import {
  resolvePlanScopeTargetIds,
  resolveSessionScopeTargetIds,
  resolvePickedScopeTargetIds,
} from "./progressionClipboard";

let idc = 0;
function slot(overrides: Partial<MuscleSlotData> = {}): MuscleSlotData {
  idc += 1;
  return {
    id: `slot-${idc}`,
    dayIndex: 1,
    muscleId: "chest",
    sets: 3,
    repMin: 8,
    repMax: 12,
    sortOrder: 0,
    ...overrides,
  };
}

const setsRule = (amount: number, extra: Partial<WeeklyDeltaRule> = {}): WeeklyDeltaRule =>
  ({ id: `r-${idc++}`, target: "sets", op: "add", amount, ...extra }) as WeeklyDeltaRule;
const rirRule = (amount: number): WeeklyDeltaRule =>
  ({ id: `r-${idc++}`, target: "rir", op: "add", amount, scope: { kind: "all" } }) as WeeklyDeltaRule;
const repMinRule = (amount: number): WeeklyDeltaRule =>
  ({ id: `r-${idc++}`, target: "repMin", op: "add", amount }) as WeeklyDeltaRule;

describe("mergeDeltaRules — MERGE conflict semantics", () => {
  it("overwrites the target's rule for a target the source touches", () => {
    const target = [setsRule(1)]; // sets +1
    const source = [setsRule(3)]; // sets +3
    const merged = mergeDeltaRules(target, source);
    const setsRules = merged.filter((r) => r.target === "sets");
    expect(setsRules).toHaveLength(1);
    expect((setsRules[0] as { amount: number }).amount).toBe(3);
  });

  it("keeps the target's rules for targets the source does NOT touch", () => {
    const target = [setsRule(1), rirRule(-1)]; // sets + rir
    const source = [setsRule(3)]; // only sets
    const merged = mergeDeltaRules(target, source);
    expect(merged.filter((r) => r.target === "rir")).toHaveLength(1);
    expect((merged.find((r) => r.target === "rir") as { amount: number }).amount).toBe(-1);
    expect((merged.find((r) => r.target === "sets") as { amount: number }).amount).toBe(3);
  });

  it("carries ALL source rules for a multi-window target, replacing the target's single rule (single-rule-per-target preserved)", () => {
    const target = [setsRule(1, { activeWeekStart: 2 })]; // one open-ended sets rule
    // Two non-overlapping windows on the source for the same target.
    const source = [
      setsRule(1, { activeWeekStart: 2, activeWeekEnd: 4 }),
      setsRule(2, { activeWeekStart: 5, activeWeekEnd: 6 }),
    ];
    const merged = mergeDeltaRules(target, source);
    const setsRules = merged.filter((r) => r.target === "sets");
    // Exactly the source's two windows — the target's own sets rule is gone.
    expect(setsRules).toHaveLength(2);
    expect(setsRules.map((r) => (r as { amount: number }).amount).sort()).toEqual([1, 2]);
  });

  it("stamps fresh ids on pasted rules (no id collision with the source)", () => {
    const source = [setsRule(3), rirRule(-1)];
    const merged = mergeDeltaRules([], source);
    const mergedIds = merged.map((r) => r.id);
    for (const id of mergedIds) {
      expect(source.map((s) => s.id)).not.toContain(id);
    }
    // ids are unique among themselves too
    expect(new Set(mergedIds).size).toBe(mergedIds.length);
  });

  it("does not mutate the inputs", () => {
    const target = [setsRule(1)];
    const source = [setsRule(3)];
    const targetSnapshot = JSON.parse(JSON.stringify(target));
    const sourceSnapshot = JSON.parse(JSON.stringify(source));
    mergeDeltaRules(target, source);
    expect(target).toEqual(targetSnapshot);
    expect(source).toEqual(sourceSnapshot);
  });

  it("a no-touch target keeps multiple of its own non-overlapping rules", () => {
    const target = [repMinRule(1), setsRule(1)];
    const source = [setsRule(3)];
    const merged = mergeDeltaRules(target, source);
    expect(merged.filter((r) => r.target === "repMin")).toHaveLength(1);
  });
});

describe("scope resolvers — strength-only target resolution", () => {
  // W1 with a strength session (S1: two strength slots) and a cardio session (S2).
  function buildW1(): WeekData {
    idc = 0; // deterministic ids per build
    return {
      slots: [
        slot({ id: "a", sessionId: "S1", dayIndex: 1, sortOrder: 0 }), // strength (source)
        slot({ id: "b", sessionId: "S1", dayIndex: 1, sortOrder: 1 }), // strength
        slot({ id: "c", sessionId: "S2", dayIndex: 1, sortOrder: 2, activityType: "cardio", muscleId: "" }), // non-strength
        slot({ id: "d", sessionId: "S3", dayIndex: 2, sortOrder: 0 }), // strength, other session
      ],
      sessions: [],
    };
  }

  it("plan scope returns all strength W1 slot ids, excluding the source and non-strength", () => {
    const w1 = buildW1();
    expect(resolvePlanScopeTargetIds(w1, "a").sort()).toEqual(["b", "d"]);
    // 'c' (cardio) is never a target.
    expect(resolvePlanScopeTargetIds(w1, "a")).not.toContain("c");
  });

  it("plan scope without an exclusion still drops non-strength slots", () => {
    const w1 = buildW1();
    expect(resolvePlanScopeTargetIds(w1).sort()).toEqual(["a", "b", "d"]);
  });

  it("session scope returns same-session strength slots, excluding the source", () => {
    const w1 = buildW1();
    expect(resolveSessionScopeTargetIds(w1, "a")).toEqual(["b"]);
  });

  it("session scope is empty when the source has no sessionId", () => {
    const w1: WeekData = { slots: [slot({ id: "x", sessionId: undefined })], sessions: [] };
    expect(resolveSessionScopeTargetIds(w1, "x")).toEqual([]);
  });

  it("picked scope filters coach selection down to strength slots", () => {
    const w1 = buildW1();
    // Coach ticks b, c (cardio), d — only the strength ones survive.
    expect(resolvePickedScopeTargetIds(w1, ["b", "c", "d"]).sort()).toEqual(["b", "d"]);
  });

  it("resolvers are safe on an undefined week", () => {
    expect(resolvePlanScopeTargetIds(undefined)).toEqual([]);
    expect(resolveSessionScopeTargetIds(undefined, "a")).toEqual([]);
    expect(resolvePickedScopeTargetIds(undefined, ["a"])).toEqual([]);
  });
});
