import { describe, it, expect } from "vitest";
import { computeMovementLens, computeCardioLens, computeAffinityLens, computeMobilityLens } from "./multiLensVolume";
import type { MovementGroupConfig } from "@/hooks/useMovementGroupConfig";
import type { ExerciseMovement } from "@/hooks/useExerciseMovementMap";
import type { MuscleSlotData } from "@/types/muscle-builder";

const slot = (o: Partial<MuscleSlotData>): MuscleSlotData => ({
  id: o.id ?? "s", dayIndex: 1, muscleId: "", sets: 1, repMin: 8, repMax: 12, sortOrder: 0, ...o,
});

const CONFIG: MovementGroupConfig = {
  patternMap: {},
  groups: [
    { id: "squat", label: "Squat", sortOrder: 1, variationCount: 41, subGroups: [] },
    {
      id: "press", label: "Press", sortOrder: 2, variationCount: 70, subGroups: [
        { id: "press_horizontal", label: "Horizontal Press", sortOrder: 1, variationCount: 52 },
        { id: "press_anterior", label: "Anterior Press", sortOrder: 2, variationCount: 18 },
      ],
    },
    { id: "hinge", label: "Hinge", sortOrder: 3, variationCount: 48, subGroups: [] },
    {
      id: "pull", label: "Pull", sortOrder: 4, variationCount: 81, subGroups: [
        { id: "pull_horizontal", label: "Horizontal Pull", sortOrder: 1, variationCount: 70 },
        { id: "pull_vertical", label: "Vertical Pull", sortOrder: 2, variationCount: 11 },
      ],
    },
    { id: "core", label: "Core", sortOrder: 5, variationCount: 37, subGroups: [] },
  ],
};
const MAP = new Map<string, ExerciseMovement>([
  ["bench", { groupId: "press", leafId: "press_horizontal", isolation: false, affinity: "push" }],
  ["ohp", { groupId: "press", leafId: "press_anterior", isolation: false, affinity: "push" }],
  ["squat", { groupId: "squat", leafId: "squat", isolation: false, affinity: "legs" }],
  ["row", { groupId: "pull", leafId: "pull_horizontal", isolation: false, affinity: "pull" }],
  // Isolation/accessory: no compound group, but carries an affinity (counts only in the PPL view).
  ["curl", { groupId: null, leafId: null, isolation: true, affinity: "pull" }],
  ["latraise", { groupId: null, leafId: null, isolation: true, affinity: "push" }],
]);

describe("computeMovementLens", () => {
  it("sums plain sets per group + splits Press into Horizontal/Anterior; unresolved exercises are excluded", () => {
    const slots = [
      slot({ id: "a", exercise: { exerciseId: "bench", name: "Bench" }, sets: 1 }),
      slot({ id: "b", exercise: { exerciseId: "ohp", name: "OHP" }, sets: 1 }),
      slot({ id: "c", exercise: { exerciseId: "squat", name: "Squat" }, sets: 1 }),
      slot({ id: "d", exercise: { exerciseId: "curl", name: "Curl" }, sets: 3 }), // isolation (null group) → excluded from compound
      slot({ id: "e", muscleId: "pecs", sets: 4 }),                               // unfilled muscle slot → no exercise
    ];
    const lens = computeMovementLens(slots, MAP, CONFIG);
    expect(lens.totalSets).toBe(3); // bench 1 + ohp 1 + squat 1; curl (3) + unfilled (4) excluded
    expect(lens.rows.map((r) => [r.id, r.sets])).toEqual([["squat", 1], ["press", 2]]); // hinge (0) dropped, sortOrder order
    const press = lens.rows.find((r) => r.id === "press")!;
    expect(press.subGroups).toEqual([
      { id: "press_horizontal", label: "Horizontal Press", sets: 1 },
      { id: "press_anterior", label: "Anterior Press", sets: 1 },
    ]);
    expect(lens.rows.find((r) => r.id === "squat")!.subGroups).toEqual([]); // no subGroups for squat
  });

  it("stays empty (no crash) when nothing resolves", () => {
    const lens = computeMovementLens([slot({ exercise: { exerciseId: "curl", name: "Curl" }, sets: 2 })], MAP, CONFIG);
    expect(lens.rows).toEqual([]);
    expect(lens.totalSets).toBe(0);
  });

  // 3b — volume-first: an UNFILLED lift-group slot (muscleId is a movement-group id, no exercise)
  // counts its sets in the movement lens immediately, contributing to the GROUP total only.
  it("counts an unfilled lift-group slot in its group (no exercise → no leaf)", () => {
    const lens = computeMovementLens([slot({ muscleId: "squat", sets: 3 })], MAP, CONFIG);
    expect(lens.totalSets).toBe(3);
    expect(lens.rows.map((r) => [r.id, r.sets])).toEqual([["squat", 3]]);
    expect(lens.rows[0].subGroups).toEqual([]); // variation unknown → no Horizontal/Anterior split yet
  });

  it("filling an unfilled group slot keeps the group total stable and resolves the Press leaf", () => {
    const unfilled = computeMovementLens([slot({ muscleId: "press", sets: 1 })], MAP, CONFIG);
    expect(unfilled.rows.find((r) => r.id === "press")!.sets).toBe(1);
    expect(unfilled.rows.find((r) => r.id === "press")!.subGroups).toEqual([]);

    // Same slot, now filled with a horizontal-press exercise (muscleId is retained but the exercise
    // takes over resolution). Group total unchanged; the leaf now populates. No double-count.
    const filled = computeMovementLens(
      [slot({ muscleId: "press", exercise: { exerciseId: "bench", name: "Bench" }, sets: 1 })],
      MAP,
      CONFIG,
    );
    expect(filled.totalSets).toBe(1); // stable across fill
    expect(filled.rows.find((r) => r.id === "press")!.sets).toBe(1);
    expect(filled.rows.find((r) => r.id === "press")!.subGroups).toEqual([
      { id: "press_horizontal", label: "Horizontal Press", sets: 1 },
    ]);
  });

  it("sums filled + unfilled slots in the same group without double-counting", () => {
    const lens = computeMovementLens(
      [
        slot({ id: "u", muscleId: "squat", sets: 2 }),                                     // unfilled group slot
        slot({ id: "f", muscleId: "squat", exercise: { exerciseId: "squat", name: "Squat" }, sets: 1 }), // filled
      ],
      MAP,
      CONFIG,
    );
    expect(lens.rows.find((r) => r.id === "squat")!.sets).toBe(3); // 2 unfilled + 1 filled, counted once each
    expect(lens.totalSets).toBe(3);
  });

  it("is data-driven off config: renders Pull with its H/V drill (not hardcoded to Press)", () => {
    const lens = computeMovementLens(
      [slot({ exercise: { exerciseId: "row", name: "Row" }, sets: 4 })], // resolves to pull / pull_horizontal
      MAP,
      CONFIG,
    );
    const pull = lens.rows.find((r) => r.id === "pull")!;
    expect(pull.sets).toBe(4);
    expect(pull.subGroups).toEqual([{ id: "pull_horizontal", label: "Horizontal Pull", sets: 4 }]); // leaf drills
    expect(lens.totalSets).toBe(4);
  });
});

describe("computeAffinityLens (PPL)", () => {
  it("rolls up weekly sets per affinity — INCLUDING isolation — ordered push/pull/legs…", () => {
    const slots = [
      slot({ id: "b", exercise: { exerciseId: "bench", name: "Bench" }, sets: 3 }),   // push compound
      slot({ id: "l", exercise: { exerciseId: "latraise", name: "Lat Raise" }, sets: 2 }), // push isolation
      slot({ id: "r", exercise: { exerciseId: "row", name: "Row" }, sets: 4 }),       // pull compound
      slot({ id: "c", exercise: { exerciseId: "curl", name: "Curl" }, sets: 2 }),     // pull isolation (accessory)
      slot({ id: "sq", muscleId: "squat", sets: 5 }),                                  // unfilled Squat group → legs
    ];
    const lens = computeAffinityLens(slots, MAP);
    expect(lens.rows.map((r) => [r.affinity, r.sets, r.compoundSets, r.isolationSets])).toEqual([
      ["push", 5, 3, 2], // bench 3 compound + lat raise 2 iso
      ["pull", 6, 4, 2], // row 4 compound + curl 2 iso — the accessory shows up here
      ["legs", 5, 5, 0], // unfilled squat group slot
    ]);
    expect(lens.totalSets).toBe(16);
  });

  it("an isolation exercise contributes to NO compound group but DOES appear in its PPL affinity", () => {
    const slots = [slot({ exercise: { exerciseId: "curl", name: "Curl" }, sets: 4 })];
    expect(computeMovementLens(slots, MAP, CONFIG).rows).toEqual([]); // compound: nothing
    expect(computeAffinityLens(slots, MAP).rows).toEqual([
      { affinity: "pull", label: "Pull", sets: 4, compoundSets: 0, isolationSets: 4 },
    ]);
  });
});

// 3c modality resolver mirroring MuscleBuilderPage: unfilled group slot keyed by muscleId (cardio_movement
// id), filled slot keyed by its exercise's cardio_movement — BOTH resolve to the same modality key.
const CM = new Map([["run", "Run"], ["cycle", "Cycle"]]);       // cardio_movement id → label
const EX2CM = new Map([["ex-run", "run"], ["ex-cyc", "cycle"]]); // exercise id → cardio_movement id
const cardioModalityOf = (s: MuscleSlotData): { key: string; label: string } | null => {
  if (s.activityType !== "cardio") return null;
  if (!s.exercise && s.muscleId && CM.has(s.muscleId)) return { key: s.muscleId, label: CM.get(s.muscleId)! };
  const cm = s.exercise ? EX2CM.get(s.exercise.exerciseId) : undefined;
  if (cm && CM.has(cm)) return { key: cm, label: CM.get(cm)! };
  const name = s.activityName || "Cardio";
  return { key: `name:${name}`, label: name };
};

describe("computeCardioLens", () => {
  it("sums minutes per modality by key (+ HR zones); ignores non-cardio", () => {
    const slots = [
      slot({ id: "r1", activityType: "cardio", muscleId: "run", duration: 20, exercise: { exerciseId: "ex-run", name: "Treadmill" }, targetHrZone: 2 }),
      slot({ id: "r2", activityType: "cardio", muscleId: "run", duration: 10, exercise: { exerciseId: "ex-run", name: "Treadmill" }, targetHrZone: 3 }),
      slot({ id: "c1", activityType: "cardio", muscleId: "cycle", duration: 15, exercise: { exerciseId: "ex-cyc", name: "Bike" } }),
      slot({ id: "st", muscleId: "pecs", sets: 3 }), // non-cardio → ignored
    ];
    const lens = computeCardioLens(slots, cardioModalityOf);
    expect(lens.totalMinutes).toBe(45);
    expect(lens.modalities).toEqual([
      { label: "Run", minutes: 30, pending: false },
      { label: "Cycle", minutes: 15, pending: false },
    ]); // desc
    expect(lens.hrZones).toEqual([{ zone: 2, minutes: 20 }, { zone: 3, minutes: 10 }]);
  });

  // 3c volume-first: an unfilled cardio group slot (modality on muscleId, duration 0, no exercise)
  // surfaces its modality at 0 min as a PENDING bucket the moment it's picked.
  it("surfaces an unfilled cardio group slot as a 0-min pending bucket", () => {
    const lens = computeCardioLens([slot({ activityType: "cardio", muscleId: "run", duration: 0 })], cardioModalityOf);
    expect(lens.modalities).toEqual([{ label: "Run", minutes: 0, pending: true }]);
    expect(lens.totalMinutes).toBe(0);
  });

  it("filling / setting a duration keeps the same modality bucket (stable, not pending)", () => {
    // Unfilled Run (pending) → same slot now filled with a Run exercise + 25 min.
    const pending = computeCardioLens([slot({ activityType: "cardio", muscleId: "run", duration: 0 })], cardioModalityOf);
    expect(pending.modalities[0]).toEqual({ label: "Run", minutes: 0, pending: true });

    const filled = computeCardioLens(
      [slot({ activityType: "cardio", muscleId: "run", duration: 25, exercise: { exerciseId: "ex-run", name: "Treadmill" } })],
      cardioModalityOf,
    );
    expect(filled.modalities).toEqual([{ label: "Run", minutes: 25, pending: false }]); // same "Run" bucket, real minutes
    expect(filled.totalMinutes).toBe(25);
  });

  it("sums an unfilled + a filled slot in the same modality without double-counting", () => {
    const lens = computeCardioLens(
      [
        slot({ id: "u", activityType: "cardio", muscleId: "run", duration: 0 }),                                              // unfilled Run
        slot({ id: "f", activityType: "cardio", muscleId: "run", duration: 20, exercise: { exerciseId: "ex-run", name: "T" } }), // filled Run
      ],
      cardioModalityOf,
    );
    expect(lens.modalities).toEqual([{ label: "Run", minutes: 20, pending: false }]); // one bucket, 0 + 20 = 20
  });
});

// 3e mobility/warm-up region resolver: unfilled group slot via muscleId=region id, filled via the
// exercise's target_region — both bucket by region. yoga_mobility only.
const REGIONS = new Map([["shoulders", "Shoulders"], ["hips", "Hips"]]);
const EX2REGION = new Map([["ex-sh", "shoulders"]]);
const regionOf = (s: MuscleSlotData): { key: string; label: string } | null => {
  if (s.activityType !== "yoga_mobility") return null;
  if (!s.exercise && s.muscleId && REGIONS.has(s.muscleId)) return { key: s.muscleId, label: REGIONS.get(s.muscleId)! };
  const rid = s.exercise ? EX2REGION.get(s.exercise.exerciseId) : undefined;
  if (rid && REGIONS.has(rid)) return { key: rid, label: REGIONS.get(rid)! };
  const name = s.activityName || "Mobility";
  return { key: `name:${name}`, label: name };
};

describe("computeMobilityLens (region + count-fallback)", () => {
  it("an unfilled region group slot appears as pending/count — never blank (0 min → a drill count)", () => {
    const lens = computeMobilityLens([slot({ activityType: "yoga_mobility", muscleId: "shoulders", duration: 0 })], regionOf);
    expect(lens.rows).toEqual([
      { label: "Shoulders", minutes: 0, timedCount: 0, untimedCount: 1, countMode: true },
    ]);
    expect(lens.totalMinutes).toBe(0);
  });

  it("a TIMED entry shows minutes; a rep-based (untimed) entry falls back to a count — same group, not mixed into a wrong number", () => {
    const lens = computeMobilityLens(
      [
        slot({ id: "t", activityType: "yoga_mobility", muscleId: "shoulders", duration: 10 }),                                  // timed
        slot({ id: "u", activityType: "yoga_mobility", exercise: { exerciseId: "ex-sh", name: "CARs" } }),                       // rep-based (no duration) → untimed
      ],
      regionOf,
    );
    // One Shoulders bucket: 10 timed minutes + 1 untimed drill counted separately (minutes not inflated).
    expect(lens.rows).toEqual([
      { label: "Shoulders", minutes: 10, timedCount: 1, untimedCount: 1, countMode: false },
    ]);
    expect(lens.totalMinutes).toBe(10);
  });

  it("filling a pending group slot with a duration keeps the same region bucket (stable, no double-count)", () => {
    const pending = computeMobilityLens([slot({ activityType: "yoga_mobility", muscleId: "shoulders", duration: 0 })], regionOf);
    expect(pending.rows[0]).toMatchObject({ label: "Shoulders", minutes: 0, countMode: true });

    const filled = computeMobilityLens([slot({ activityType: "yoga_mobility", muscleId: "shoulders", duration: 12 })], regionOf);
    expect(filled.rows).toEqual([
      { label: "Shoulders", minutes: 12, timedCount: 1, untimedCount: 0, countMode: false },
    ]);
    expect(filled.totalMinutes).toBe(12);
  });

  it("ignores non-mobility slots", () => {
    const lens = computeMobilityLens([slot({ muscleId: "pecs", sets: 3 }), slot({ activityType: "cardio", duration: 20 })], regionOf);
    expect(lens.rows).toEqual([]);
  });
});
