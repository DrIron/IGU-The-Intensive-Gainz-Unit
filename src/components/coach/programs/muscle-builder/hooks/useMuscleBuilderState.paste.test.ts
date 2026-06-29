// Tests for pasteDeltaRulesToSlots — the reducer-level "copy progression" paste.
//
// Asserts the three-step contract: MERGE rules onto target W1 slots, CLEAR
// manualOverrides on their downstream siblings, and RECOMPUTE W2..WN. Non-target
// lineages keep their overrides.
//
// Run: npm test -- useMuscleBuilderState.paste

import { describe, it, expect, vi } from "vitest";
import type { MusclePlanState, MuscleSlotData, WeekData } from "@/types/muscle-builder";
import type { WeeklyDeltaRule } from "../weeklyDeltaEngine";

// pasteDeltaRulesToSlots is pure, but its module transitively imports the
// Supabase client. Stub it so the import never touches env/network.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { pasteDeltaRulesToSlots } = await import("./useMuscleBuilderState");

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

const setsRule = (amount: number, id = `r-${idc++}`): WeeklyDeltaRule =>
  ({ id, target: "sets", op: "add", amount }) as WeeklyDeltaRule;
const rirRule = (amount: number, id = `r-${idc++}`): WeeklyDeltaRule =>
  ({ id, target: "rir", op: "add", amount, scope: { kind: "all" } }) as WeeklyDeltaRule;

function wrap(weeks: WeekData[]): MusclePlanState {
  return {
    templateId: null,
    name: "",
    description: "",
    weeks,
    currentWeekIndex: 0,
    selectedDayIndex: 1,
    isDirty: false,
    isSaving: false,
    globalClientInputs: [],
    globalPrescriptionColumns: [],
  };
}

/**
 * W1: A(day1,sort0) + B(day1,sort1, sets+1 rule). W2/W3 siblings start stale
 * (99). W2 siblings carry a `sets` override.
 */
function buildState(aRules?: WeeklyDeltaRule[]): MusclePlanState {
  idc = 0;
  const w1: WeekData = {
    slots: [
      slot({ id: "A", dayIndex: 1, sortOrder: 0, sets: 3, deltaRules: aRules }),
      slot({ id: "B", dayIndex: 1, sortOrder: 1, sets: 3, deltaRules: [setsRule(1, "b-rule")] }),
    ],
  };
  const w2: WeekData = {
    slots: [
      slot({ id: "A2", dayIndex: 1, sortOrder: 0, sets: 99, manualOverrides: ["sets"] }),
      slot({ id: "B2", dayIndex: 1, sortOrder: 1, sets: 99, manualOverrides: ["sets"] }),
    ],
  };
  const w3: WeekData = {
    slots: [
      slot({ id: "A3", dayIndex: 1, sortOrder: 0, sets: 99 }),
      slot({ id: "B3", dayIndex: 1, sortOrder: 1, sets: 99 }),
    ],
  };
  return wrap([w1, w2, w3]);
}

function findSlot(state: MusclePlanState, weekIndex: number, id: string): MuscleSlotData {
  const s = state.weeks[weekIndex].slots.find((x) => x.id === id);
  if (!s) throw new Error(`slot ${id} not found in week ${weekIndex}`);
  return s;
}

describe("pasteDeltaRulesToSlots", () => {
  it("merges the copied rules onto the target W1 slot", () => {
    const state = buildState();
    const result = pasteDeltaRulesToSlots(state, [setsRule(2, "src")], ["A"]);
    const a = findSlot(result, 0, "A");
    expect(a.deltaRules).toHaveLength(1);
    expect((a.deltaRules![0] as { amount: number }).amount).toBe(2);
    // Fresh id — not the source rule's id.
    expect(a.deltaRules![0].id).not.toBe("src");
  });

  it("clears manualOverrides on the pasted-to lineage and recomputes downstream", () => {
    const state = buildState();
    const result = pasteDeltaRulesToSlots(state, [setsRule(1)], ["A"]);
    const a2 = findSlot(result, 1, "A2");
    const a3 = findSlot(result, 2, "A3");
    // Override cleared → the stale 99 recomputes from base 3: W2 = 4, W3 = 5.
    expect(a2.manualOverrides).toBeUndefined();
    expect(a2.sets).toBe(4);
    expect(a3.sets).toBe(5);
  });

  it("leaves non-target lineages' overrides intact (they are still respected)", () => {
    const state = buildState();
    const result = pasteDeltaRulesToSlots(state, [setsRule(1)], ["A"]);
    // B was NOT pasted to → B2 keeps its sets override, so recompute skips it.
    const b2 = findSlot(result, 1, "B2");
    expect(b2.manualOverrides).toEqual(["sets"]);
    expect(b2.sets).toBe(99);
    // B3 had no override → it recomputes from B's own (pre-existing) rule.
    const b3 = findSlot(result, 2, "B3");
    expect(b3.sets).toBe(5);
  });

  it("overwrites an existing rule for the same target (single-rule-per-target preserved)", () => {
    const state = buildState([setsRule(1, "a-old")]); // A already has sets +1
    const result = pasteDeltaRulesToSlots(state, [setsRule(5, "src")], ["A"]);
    const a = findSlot(result, 0, "A");
    const setsRules = (a.deltaRules ?? []).filter((r) => r.target === "sets");
    expect(setsRules).toHaveLength(1);
    expect((setsRules[0] as { amount: number }).amount).toBe(5);
    // Downstream reflects the new amount: W2 = 3 + 5 = 8.
    expect(findSlot(result, 1, "A2").sets).toBe(8);
  });

  it("keeps the target slot's rules for metrics the paste doesn't touch", () => {
    const state = buildState([rirRule(-1, "a-rir")]); // A has an rir rule
    const result = pasteDeltaRulesToSlots(state, [setsRule(1, "src")], ["A"]);
    const a = findSlot(result, 0, "A");
    const targets = (a.deltaRules ?? []).map((r) => r.target).sort();
    expect(targets).toEqual(["rir", "sets"]);
  });

  it("is a no-op for an empty source or empty targets", () => {
    const state = buildState();
    expect(pasteDeltaRulesToSlots(state, [], ["A"])).toBe(state);
    expect(pasteDeltaRulesToSlots(state, [setsRule(1)], [])).toBe(state);
  });

  it("pastes to multiple targets in one call", () => {
    const state = buildState();
    const result = pasteDeltaRulesToSlots(state, [setsRule(2)], ["A", "B"]);
    // Both lineages' W2 overrides cleared and recomputed: 3 + 2 = 5.
    expect(findSlot(result, 1, "A2").sets).toBe(5);
    expect(findSlot(result, 1, "B2").sets).toBe(5);
    expect(findSlot(result, 1, "B2").manualOverrides).toBeUndefined();
  });
});
