import { describe, it, expect } from "vitest";
import { applyDeloadPreset, findDeloadPreset, type Deloadable } from "./deloadPresets";
import { buildStrengthPrescriptionSnapshot, slotFromPrescriptionJson } from "@/lib/canonicalPrescription";

// applyDeloadPreset operates on the shared Deloadable shape (sets / rir / setsDetail) — the same
// math the board reducer and the canonical resolver both run.
const slot = (): Deloadable => ({
  sets: 4,
  rir: 2,
  setsDetail: [
    { set_number: 1, rir: 2, weight: 100 },
    { set_number: 2, rir: 2, weight: 100 },
    { set_number: 3, rir: 2, weight: 100 },
    { set_number: 4, rir: 2, weight: 100 },
  ],
});

describe("applyDeloadPreset", () => {
  it("volume: sets -40% (ceil), RIR +1, load unchanged", () => {
    const r = applyDeloadPreset(slot(), "volume");
    expect(r.sets).toBe(3); // ceil(4*0.6)=3
    expect(r.setsDetail).toHaveLength(3);
    expect(r.rir).toBe(3); // 2 + 1
    expect(r.setsDetail!.every((s) => s.rir === 3)).toBe(true);
    expect(r.setsDetail!.every((s) => s.weight === 100)).toBe(true); // load untouched
  });

  it("intensity: sets unchanged, load -20%, RIR +2", () => {
    const r = applyDeloadPreset(slot(), "intensity");
    expect(r.sets).toBe(4);
    expect(r.setsDetail).toHaveLength(4);
    expect(r.rir).toBe(4); // 2 + 2
    expect(r.setsDetail!.every((s) => s.weight === 80)).toBe(true); // 100*0.8
  });

  it("recovery: sets -50%, load -30%, RIR +2", () => {
    const r = applyDeloadPreset(slot(), "recovery");
    expect(r.sets).toBe(2); // ceil(4*0.5)=2
    expect(r.setsDetail).toHaveLength(2);
    expect(r.rir).toBe(4);
    expect(r.setsDetail!.every((s) => s.weight === 70)).toBe(true); // 100*0.7
  });

  it("unknown preset → unchanged (does not mutate input)", () => {
    const input = slot();
    const r = applyDeloadPreset(input, "nope");
    expect(r).toBe(input);
  });

  it("RIR clamps to [0,10]", () => {
    const r = applyDeloadPreset({ sets: 2, rir: 9, setsDetail: [{ set_number: 1, rir: 9 }] }, "intensity");
    expect(r.rir).toBe(10); // 9+2 clamped
  });

  it("findDeloadPreset still exposes metadata for the board", () => {
    expect(findDeloadPreset("volume")?.touchedTargets).toEqual(["sets", "rir"]);
    expect(findDeloadPreset("nope")).toBeNull();
  });
});

describe("resolver deload path — applyDeloadPreset on a canonical prescription, then snapshot", () => {
  it("a week-deload reduces the resolved snapshot (sets sliced, RIR raised)", () => {
    // Mirrors the resolver: slotFromPrescriptionJson(pj) -> applyDeloadPreset -> buildSnapshot.
    const pj = {
      sets: 4,
      repMin: 8,
      repMax: 12,
      rir: 2,
      setsDetail: [
        { set_number: 1, rep_range_min: 8, rep_range_max: 12, rir: 2, weight: 100 },
        { set_number: 2, rep_range_min: 8, rep_range_max: 12, rir: 2, weight: 100 },
        { set_number: 3, rep_range_min: 8, rep_range_max: 12, rir: 2, weight: 100 },
        { set_number: 4, rep_range_min: 8, rep_range_max: 12, rir: 2, weight: 100 },
      ],
    };
    const deloaded = applyDeloadPreset(slotFromPrescriptionJson(pj), "volume");
    const snap = buildStrengthPrescriptionSnapshot(deloaded, null);
    expect(snap.set_count).toBe(3); // 4 -> 3
    expect(snap.sets_json).toHaveLength(3);
    expect((snap.sets_json[0] as { rir?: number }).rir).toBe(3); // 2 + 1
  });
});
