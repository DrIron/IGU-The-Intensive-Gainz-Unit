import { describe, it, expect } from "vitest";
import { computeMovementLens, computeCardioLens } from "./multiLensVolume";
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
  ],
};
const MAP = new Map<string, ExerciseMovement>([
  ["bench", { groupId: "press", leafId: "press_horizontal" }],
  ["ohp", { groupId: "press", leafId: "press_anterior" }],
  ["squat", { groupId: "squat", leafId: "squat" }],
]);

describe("computeMovementLens", () => {
  it("sums plain sets per group + splits Press into Horizontal/Anterior; unresolved exercises are excluded", () => {
    const slots = [
      slot({ id: "a", exercise: { exerciseId: "bench", name: "Bench" }, sets: 1 }),
      slot({ id: "b", exercise: { exerciseId: "ohp", name: "OHP" }, sets: 1 }),
      slot({ id: "c", exercise: { exerciseId: "squat", name: "Squat" }, sets: 1 }),
      slot({ id: "d", exercise: { exerciseId: "curl", name: "Curl" }, sets: 3 }), // NOT in MAP → excluded, no guess
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
});

describe("computeCardioLens", () => {
  it("sums minutes per modality (+ HR zones); skips non-cardio and zero-duration slots", () => {
    const slots = [
      slot({ id: "r1", activityType: "cardio", duration: 20, activityName: "Running", targetHrZone: 2 }),
      slot({ id: "r2", activityType: "cardio", duration: 10, activityName: "Running", targetHrZone: 3 }),
      slot({ id: "c1", activityType: "cardio", duration: 15, activityName: "Cycling" }),
      slot({ id: "z0", activityType: "cardio", duration: 0, activityName: "Rowing" }), // no minutes → skipped
      slot({ id: "st", muscleId: "pecs", sets: 3 }),                                   // non-cardio → ignored
    ];
    const lens = computeCardioLens(slots, (s) => s.activityName || "Cardio");
    expect(lens.totalMinutes).toBe(45);
    expect(lens.modalities).toEqual([{ label: "Running", minutes: 30 }, { label: "Cycling", minutes: 15 }]); // desc
    expect(lens.hrZones).toEqual([{ zone: 2, minutes: 20 }, { zone: 3, minutes: 10 }]);
  });
});
