import { describe, it, expect } from "vitest";
import {
  adaptCanonicalPlanToSlots,
  adaptCanonicalPlanToSessions,
  adaptLegacyProgramToSlots,
  deriveProgramStructure,
  deriveFocusChips,
  deriveMuscleRibbon,
  countExercises,
  pickRepresentativeWeek,
  type CanonicalPlanSessionRow,
  type CanonicalPlanSlotRow,
  type CanonicalPlanWeekRow,
} from "./programSummaryAdapter";


/**
 * The canonical payload below is the REAL shape of `plan_slots.prescription_json`
 * on prod (sampled 2026-07-12 from the "Prenatal Trimester 1" template plan) —
 * not an invented fixture. If the mirror's serialization changes, these fail.
 */

const WEEKS: CanonicalPlanWeekRow[] = [
  { id: "w1", week_index: 1, is_deload: false },
  { id: "w2", week_index: 2, is_deload: false },
  { id: "w3", week_index: 3, is_deload: true },
];

const SESSIONS: CanonicalPlanSessionRow[] = [
  // Named by the coach (22% of prod sessions).
  { id: "s1", plan_week_id: "w1", day_index: 1, name: "Push", activity_type: "strength", sort_order: 0 },
  // UNNAMED — the majority case on prod (78%). Must derive a focus label.
  { id: "s2", plan_week_id: "w1", day_index: 3, name: null, activity_type: "strength", sort_order: 0 },
  // Non-strength: the activity type IS the focus.
  { id: "s3", plan_week_id: "w1", day_index: 5, name: null, activity_type: "cardio", sort_order: 0 },
];

const SLOTS: CanonicalPlanSlotRow[] = [
  {
    id: "sl1",
    plan_session_id: "s1",
    sort_order: 0,
    prescription_json: {
      sets: 4,
      repMax: 12,
      repMin: 8,
      muscleId: "pecs_sternal",
      exerciseName: "Sternal Pec M Smith Flat Press (M)",
      setsDetail: [{ rir: 3, tempo: "2010", set_number: 1, rest_seconds: 120 }],
    },
  },
  {
    id: "sl2",
    plan_session_id: "s2",
    sort_order: 0,
    prescription_json: { sets: 3, repMin: 10, repMax: 15, muscleId: "lats_iliac" },
  },
  {
    id: "sl3",
    plan_session_id: "s3",
    sort_order: 0,
    prescription_json: { sets: 0 },
  },
];

describe("programSummaryAdapter — canonical (primary path)", () => {
  it("maps prescription_json straight into MuscleSlotData (muscleId + sets are already there)", () => {
    const slots = adaptCanonicalPlanToSlots(SESSIONS, SLOTS);

    expect(slots).toHaveLength(3);
    expect(slots[0]).toMatchObject({
      id: "sl1",
      dayIndex: 1,
      muscleId: "pecs_sternal",
      sets: 4,
      repMin: 8,
      repMax: 12,
      sessionId: "s1",
      activityType: "strength",
    });
    // exerciseName survives as the slot's exercise (used by the detail view).
    expect(slots[0].exercise?.name).toBe("Sternal Pec M Smith Flat Press (M)");
    // Per-set detail is preserved so the duration estimator can use real rest/tempo.
    expect(slots[0].setsDetail).toHaveLength(1);
  });

  it("inherits dayIndex and activityType from the session, not the slot", () => {
    const slots = adaptCanonicalPlanToSlots(SESSIONS, SLOTS);
    expect(slots.find((s) => s.id === "sl3")).toMatchObject({ dayIndex: 5, activityType: "cardio" });
  });

  it("drops slots whose session isn't in the passed week (per-week scoping)", () => {
    // Only week 1's sessions are passed → a slot pointing at an unknown session is dropped.
    const orphan: CanonicalPlanSlotRow = {
      id: "sl-other-week",
      plan_session_id: "s-week-2",
      sort_order: 0,
      prescription_json: { sets: 5, muscleId: "pecs" },
    };
    const slots = adaptCanonicalPlanToSlots(SESSIONS, [...SLOTS, orphan]);
    expect(slots.map((s) => s.id)).not.toContain("sl-other-week");
  });

  it("survives a malformed prescription_json without throwing", () => {
    const junk: CanonicalPlanSlotRow[] = [
      { id: "x", plan_session_id: "s1", sort_order: 0, prescription_json: null },
      { id: "y", plan_session_id: "s1", sort_order: 1, prescription_json: "not-an-object" },
      { id: "z", plan_session_id: "s1", sort_order: 2, prescription_json: { sets: "four" } },
    ];
    const slots = adaptCanonicalPlanToSlots(SESSIONS, junk);
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => s.sets === 0)).toBe(true);
    expect(slots.every((s) => s.muscleId === "")).toBe(true);
  });
});

describe("pickRepresentativeWeek", () => {
  it("picks the first NON-deload week (a deload would under-report weekly volume)", () => {
    const deloadFirst: CanonicalPlanWeekRow[] = [
      { id: "d", week_index: 1, is_deload: true },
      { id: "n", week_index: 2, is_deload: false },
    ];
    expect(pickRepresentativeWeek(deloadFirst)?.id).toBe("n");
  });

  it("falls back to the lowest week_index when every week is a deload", () => {
    const allDeload: CanonicalPlanWeekRow[] = [
      { id: "b", week_index: 2, is_deload: true },
      { id: "a", week_index: 1, is_deload: true },
    ];
    expect(pickRepresentativeWeek(allDeload)?.id).toBe("a");
  });

  it("returns null for a plan with no weeks", () => {
    expect(pickRepresentativeWeek([])).toBeNull();
  });

  it("ignores deload weeks when choosing (WEEKS fixture: w3 is the deload)", () => {
    expect(pickRepresentativeWeek(WEEKS)?.id).toBe("w1");
  });
});

describe("deriveFocusChips — the fallback is the MAIN path (78% of prod sessions are unnamed)", () => {
  it("uses the coach's session name when present", () => {
    const slots = adaptCanonicalPlanToSlots(SESSIONS, SLOTS);
    const sessions = adaptCanonicalPlanToSessions(SESSIONS);
    const { chips } = deriveFocusChips(sessions, slots);
    expect(chips).toContain("Push");
  });

  it("derives '<Muscle> focus' for an UNNAMED strength session", () => {
    const slots = adaptCanonicalPlanToSlots(SESSIONS, SLOTS);
    const sessions = adaptCanonicalPlanToSessions(SESSIONS);
    const { chips } = deriveFocusChips(sessions, slots);
    // s2 is unnamed, dominated by lats_iliac -> parent "lats"/"Back" family.
    expect(chips.some((c) => c.endsWith(" focus"))).toBe(true);
  });

  it("labels an unnamed NON-strength session by its activity type", () => {
    const slots = adaptCanonicalPlanToSlots(SESSIONS, SLOTS);
    const sessions = adaptCanonicalPlanToSessions(SESSIONS);
    const { chips } = deriveFocusChips(sessions, slots);
    expect(chips).toContain("Cardio");
  });

  it("caps at N chips and reports the overflow, ranked by volume", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      plan_week_id: "w1",
      day_index: i + 1,
      name: `Session ${i}`,
      activity_type: "strength",
      sort_order: 0,
    })) satisfies CanonicalPlanSessionRow[];
    const manySlots = many.map((s, i) => ({
      id: `sl${i}`,
      plan_session_id: s.id,
      sort_order: 0,
      // Ascending volume → the highest-volume sessions must survive the cap.
      prescription_json: { sets: i + 1, muscleId: "pecs" },
    })) satisfies CanonicalPlanSlotRow[];

    const slots = adaptCanonicalPlanToSlots(many, manySlots);
    const sessions = adaptCanonicalPlanToSessions(many);
    const { chips, overflow } = deriveFocusChips(sessions, slots, 3);

    expect(chips).toHaveLength(3);
    expect(overflow).toBe(3);
    // Ranked by volume, so the biggest session leads — NOT alphabetical order.
    expect(chips[0]).toBe("Session 5");
  });
});

describe("deriveMuscleRibbon / structure / counts", () => {
  it("builds volume-sorted parent-muscle segments summing to 100%", () => {
    const slots = adaptCanonicalPlanToSlots(SESSIONS, SLOTS);
    const ribbon = deriveMuscleRibbon(slots);

    expect(ribbon.length).toBeGreaterThan(0);
    const total = ribbon.reduce((sum, seg) => sum + seg.pct, 0);
    expect(total).toBeCloseTo(100, 5);
    // Volume-sorted: pecs (4 sets) ahead of lats (3 sets).
    expect(ribbon[0].pct).toBeGreaterThanOrEqual(ribbon[ribbon.length - 1].pct);
    expect(ribbon.every((s) => s.colorHex.startsWith("#"))).toBe(true);
  });

  it("excludes non-strength slots from the ribbon", () => {
    const slots = adaptCanonicalPlanToSlots(SESSIONS, SLOTS);
    // sl3 is the cardio slot — it must not appear as a muscle segment.
    expect(deriveMuscleRibbon(slots)).toHaveLength(2);
  });

  it("counts only strength slots as exercises", () => {
    const slots = adaptCanonicalPlanToSlots(SESSIONS, SLOTS);
    expect(countExercises(slots)).toBe(2);
  });

  it("derives the structure line inputs (weeks from plan_weeks, days from the rep week)", () => {
    const sessions = adaptCanonicalPlanToSessions(SESSIONS);
    const structure = deriveProgramStructure(WEEKS.length, sessions, 24);
    expect(structure).toEqual({ weeks: 3, daysPerWeek: 3, sessions: 24 });
  });
});

describe("adaptLegacyProgramToSlots — transitional shim", () => {
  it("takes muscle from day_modules.source_muscle_id and sets from the prescription", () => {
    const slots = adaptLegacyProgramToSlots(
      [{ id: "d1", day_index: 1 }],
      [
        {
          id: "m1",
          program_template_day_id: "d1",
          title: "Push",
          session_type: "strength",
          sort_order: 0,
          source_muscle_id: "pecs",
        },
      ],
      [{ id: "me1", day_module_id: "m1", sort_order: 0 }],
      [{ module_exercise_id: "me1", set_count: 4, rep_range_min: 8, rep_range_max: 12, tempo: "2010" }],
    );

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ muscleId: "pecs", sets: 4, repMin: 8, repMax: 12, dayIndex: 1 });
  });

  it("folds the legacy ABSOLUTE day_index back to 1-7 (W2 day 1 = day_index 8)", () => {
    const slots = adaptLegacyProgramToSlots(
      [{ id: "d8", day_index: 8 }],
      [
        {
          id: "m1",
          program_template_day_id: "d8",
          title: null,
          session_type: "strength",
          sort_order: 0,
          source_muscle_id: "pecs",
        },
      ],
      [{ id: "me1", day_module_id: "m1", sort_order: 0 }],
      [{ module_exercise_id: "me1", set_count: 3, rep_range_min: 8, rep_range_max: 12, tempo: null }],
    );
    expect(slots[0].dayIndex).toBe(1);
  });

  it("does not throw when a module has no prescription", () => {
    const slots = adaptLegacyProgramToSlots(
      [{ id: "d1", day_index: 1 }],
      [
        {
          id: "m1",
          program_template_day_id: "d1",
          title: null,
          session_type: "strength",
          sort_order: 0,
          source_muscle_id: null,
        },
      ],
      [{ id: "me1", day_module_id: "m1", sort_order: 0 }],
      [],
    );
    expect(slots[0]).toMatchObject({ sets: 0, muscleId: "" });
  });
});
