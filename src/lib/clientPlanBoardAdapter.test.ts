import { describe, it, expect } from "vitest";
import { prescriptionDiff, muscleSlotToCanonicalPj } from "./clientPlanBoardAdapter";
import type { MuscleSlotData } from "@/types/muscle-builder";

describe("prescriptionDiff — field-level slot override (changed keys only)", () => {
  const base = { muscleId: "pecs", sets: 4, repMin: 8, repMax: 12, tempo: "3010", rir: 2 };

  it("returns only the changed key (template still flows for the rest)", () => {
    const cur = { ...base, sets: 6 };
    expect(prescriptionDiff(cur, base)).toEqual({ sets: 6 });
  });

  it("empty diff when nothing changed", () => {
    expect(prescriptionDiff({ ...base }, base)).toEqual({});
  });

  it("tombstones a field the coach cleared (present in base, absent now)", () => {
    const { tempo: _omit, ...cur } = base; // coach removed tempo
    expect(prescriptionDiff(cur, base)).toEqual({ tempo: null });
  });

  it("includes a brand-new key the coach added", () => {
    const cur = { ...base, rpe: 8 };
    expect(prescriptionDiff(cur, base)).toEqual({ rpe: 8 });
  });

  it("captures multiple changed keys but not unchanged ones", () => {
    const cur = { ...base, sets: 5, repMax: 10 };
    expect(prescriptionDiff(cur, base)).toEqual({ sets: 5, repMax: 10 });
  });

  it("deep-compares array fields (setsDetail) as a single key", () => {
    const baseArr = { ...base, setsDetail: [{ set_number: 1, rir: 2 }] };
    const curArr = { ...base, setsDetail: [{ set_number: 1, rir: 1 }] };
    expect(prescriptionDiff(curArr, baseArr)).toEqual({ setsDetail: [{ set_number: 1, rir: 1 }] });
  });
});

describe("muscleSlotToCanonicalPj — round-trips clean (no false-positive diff vs template)", () => {
  const slot: MuscleSlotData = {
    id: "s1",
    dayIndex: 1,
    muscleId: "pecs",
    sets: 4,
    repMin: 8,
    repMax: 12,
    tempo: "3010",
    rir: 2,
    sortOrder: 0,
    sessionId: "sess1",
    exercise: { exerciseId: "ex1", name: "Bench" },
    prescriptionColumns: ["rep_range", "tempo", "rir"],
  };
  const gpc = ["rep_range", "tempo", "rir", "rpe", "rest"];
  const gci = ["performed_weight", "performed_reps", "performed_rpe"];

  it("an unedited slot diffs to empty against its own serialized template pj", () => {
    const pj = muscleSlotToCanonicalPj(slot, gpc, gci);
    expect(prescriptionDiff(pj, pj)).toEqual({});
  });

  it("editing sets yields a single-key diff", () => {
    const basePj = muscleSlotToCanonicalPj(slot, gpc, gci);
    const curPj = muscleSlotToCanonicalPj({ ...slot, sets: 6 }, gpc, gci);
    expect(prescriptionDiff(curPj, basePj)).toEqual({ sets: 6 });
  });
});
