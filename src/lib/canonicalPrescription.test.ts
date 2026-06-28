import { describe, it, expect } from "vitest";
import {
  buildStrengthPrescriptionSnapshot,
  buildActivityPrescriptionSnapshot,
  slotFromPrescriptionJson,
  isStrengthSlot,
} from "./canonicalPrescription";
import { resolveWeekIndexForDate } from "./canonicalSessionResolver";

describe("resolveWeekIndexForDate", () => {
  const start = "2026-06-01";
  it("week 1 on the start date", () => {
    expect(resolveWeekIndexForDate(start, "2026-06-01", 8)).toBe(1);
  });
  it("week 1 mid-week", () => {
    expect(resolveWeekIndexForDate(start, "2026-06-07", 8)).toBe(1);
  });
  it("week 2 at day 8", () => {
    expect(resolveWeekIndexForDate(start, "2026-06-08", 8)).toBe(2);
  });
  it("week 3 at day 15", () => {
    expect(resolveWeekIndexForDate(start, "2026-06-15", 8)).toBe(3);
  });
  it("clamps to week 1 before start", () => {
    expect(resolveWeekIndexForDate(start, "2026-05-20", 8)).toBe(1);
  });
  it("clamps to last week past the end", () => {
    expect(resolveWeekIndexForDate(start, "2027-01-01", 8)).toBe(8);
  });
});

describe("buildStrengthPrescriptionSnapshot — parity with ConvertToProgram", () => {
  it("uses setsDetail verbatim and derives set_count + intensity from set 1", () => {
    const slot = slotFromPrescriptionJson({
      sets: 4,
      repMin: 6,
      repMax: 8,
      tempo: "2010",
      rir: 2,
      setsDetail: [
        { set_number: 1, rep_range_min: 6, rep_range_max: 8, rir: 4, tempo: "2010", rest_seconds: 120, rest_seconds_max: 180 },
        { set_number: 2, rep_range_min: 6, rep_range_max: 8, rir: 3, tempo: "2010", rest_seconds: 120 },
      ],
    });
    const snap = buildStrengthPrescriptionSnapshot(slot, null);
    expect(snap.set_count).toBe(2);
    expect(snap.rep_range_min).toBe(6);
    expect(snap.rep_range_max).toBe(8);
    expect(snap.intensity_type).toBe("RIR");
    expect(snap.intensity_value).toBe(4);
    expect(snap.rest_seconds).toBe(120);
    expect(snap.rest_seconds_max).toBe(180);
    expect(snap.tempo).toBe("2010");
    expect(snap.sets_json).toHaveLength(2);
    expect(snap.column_config).toBeUndefined();
  });

  it("synthesizes sets_json from sets/repMin/repMax when no setsDetail", () => {
    const slot = slotFromPrescriptionJson({ sets: 3, repMin: 8, repMax: 12, rir: 2 });
    const snap = buildStrengthPrescriptionSnapshot(slot, null);
    expect(snap.set_count).toBe(3);
    expect(snap.sets_json).toHaveLength(3);
    expect(snap.sets_json[0]).toMatchObject({ set_number: 1, rep_range_min: 8, rep_range_max: 12, rir: 2, rest_seconds: 90 });
    expect(snap.intensity_type).toBe("RIR");
  });

  it("prefers RPE when rpe set and rir absent", () => {
    const slot = slotFromPrescriptionJson({ sets: 2, repMin: 5, repMax: 5, rpe: 8 });
    const snap = buildStrengthPrescriptionSnapshot(slot, null);
    expect(snap.intensity_type).toBe("RPE");
    expect(snap.intensity_value).toBe(8);
  });

  it("applies the coach column preset when provided", () => {
    const preset = [{ id: "rep_range", type: "rep_range", label: "Reps", visible: true, order: 0 }] as never;
    const slot = slotFromPrescriptionJson({ sets: 3, repMin: 8, repMax: 12, rir: 2 });
    const snap = buildStrengthPrescriptionSnapshot(slot, preset);
    expect(snap.column_config).toBe(preset);
  });
});

describe("buildActivityPrescriptionSnapshot", () => {
  it("HIIT expands one row per round with work/rest seconds", () => {
    const slot = slotFromPrescriptionJson({ activityType: "hiit", rounds: 5, workSeconds: 30, restSeconds: 15 });
    expect(isStrengthSlot(slot)).toBe(false);
    const snap = buildActivityPrescriptionSnapshot(slot);
    expect(snap.set_count).toBe(5);
    expect(snap.sets_json).toHaveLength(5);
    expect(snap.sets_json[0]).toMatchObject({ set_number: 1, time_seconds: 30, rest_seconds: 15, rounds: 5 });
  });

  it("cardio is a single row with duration -> time_seconds (minutes*60)", () => {
    const slot = slotFromPrescriptionJson({ activityType: "cardio", duration: 20, distance: 5000, pace: "5:30/km" });
    const snap = buildActivityPrescriptionSnapshot(slot);
    expect(snap.set_count).toBe(1);
    expect(snap.sets_json[0]).toMatchObject({ time_seconds: 1200, distance_meters: 5000, pace: "5:30/km" });
  });
});

describe("session build with a rest_repeat set — synchronous + bounded (load-hang regression)", () => {
  // Mirrors the resolver's per-set build: slotFromPrescriptionJson(pj) -> buildStrengthPrescriptionSnapshot.
  // Rest & Repeat must NOT generate rounds at build time, and the build must return bounded + sync.
  const pjWith = (branch: Record<string, unknown>) => ({
    sets: 1,
    repMin: 6,
    repMax: 8,
    rir: 1,
    setsDetail: [{ set_number: 1, rep_range_min: 6, rep_range_max: 8, rir: 1, branches: [branch] }],
  });

  it("capped rest_repeat builds a 1-set snapshot, branch preserved verbatim, no round expansion", () => {
    const pj = pjWith({ type: "rest_repeat", rest_seconds: 20, to_failure: true, max_rounds: 2 });
    const snap = buildStrengthPrescriptionSnapshot(slotFromPrescriptionJson(pj), null);
    expect(snap.set_count).toBe(1); // the build does NOT inflate sets with repeat rounds
    expect(snap.sets_json).toHaveLength(1);
    expect((snap.sets_json[0] as { branches?: unknown[] }).branches).toHaveLength(1);
  });

  it("open-ended (to_failure, no cap) builds a 1-set snapshot — no unbounded array", () => {
    const pj = pjWith({ type: "rest_repeat", rest_seconds: 15, to_failure: true });
    const snap = buildStrengthPrescriptionSnapshot(slotFromPrescriptionJson(pj), null);
    expect(snap.set_count).toBe(1);
    expect(snap.sets_json).toHaveLength(1);
  });
});
