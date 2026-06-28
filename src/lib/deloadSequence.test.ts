import { describe, it, expect } from "vitest";
import {
  baseRunningWeeks,
  buildRunningSequence,
  insertPositionForDate,
  type SequencePlanWeek,
  type SequenceInsert,
} from "./deloadSequence";
import { resolveWeekIndexForDate } from "./canonicalSessionResolver";

const wk = (
  week_index: number,
  opts: { deload?: boolean; placement?: "pinned" | "on_demand" } = {},
): SequencePlanWeek => ({
  id: `w${week_index}`,
  week_index,
  is_deload: !!opts.deload,
  deload_placement: opts.placement ?? null,
});

const ins = (position: number, source: string, preset: string | null = null): SequenceInsert => ({
  id: `i-${position}-${source}`,
  position_week_index: position,
  source_plan_week_id: source,
  preset_id: preset,
});

const FOUR = [wk(1), wk(2), wk(3), wk(4)];
const ids = (seq: ReturnType<typeof buildRunningSequence>) => seq.map((s) => s.contentPlanWeekId);
const kinds = (seq: ReturnType<typeof buildRunningSequence>) => seq.map((s) => s.kind);

describe("baseRunningWeeks — on-demand deload templates excluded, pinned kept", () => {
  it("excludes only on_demand deload weeks, sorts by week_index", () => {
    const weeks = [wk(4, { deload: true, placement: "on_demand" }), wk(1), wk(2, { deload: true, placement: "pinned" }), wk(3)];
    const base = baseRunningWeeks(weeks);
    expect(base.map((w) => w.id)).toEqual(["w1", "w2", "w3"]); // w4 (on_demand) dropped
    expect(base.find((w) => w.id === "w2")?.is_deload).toBe(true); // pinned stays
  });
});

describe("buildRunningSequence — splice inserts into the running sequence", () => {
  it("no inserts → base weeks in order, all 'base'", () => {
    const seq = buildRunningSequence(FOUR, []);
    expect(kinds(seq)).toEqual(["base", "base", "base", "base"]);
    expect(ids(seq)).toEqual(["w1", "w2", "w3", "w4"]);
    expect(seq.map((s) => s.runningIndex)).toEqual([1, 2, 3, 4]);
    expect(seq.map((s) => s.baseWeekIndex)).toEqual([1, 2, 3, 4]);
  });

  it("single insert at position 2 → [w1, D, w2, w3, w4], later weeks shift", () => {
    const seq = buildRunningSequence(FOUR, [ins(2, "dl", "standard")]);
    expect(kinds(seq)).toEqual(["base", "inserted", "base", "base", "base"]);
    expect(ids(seq)).toEqual(["w1", "dl", "w2", "w3", "w4"]);
    const inserted = seq[1];
    expect(inserted.isDeload).toBe(true);
    expect(inserted.presetId).toBe("standard");
    expect(inserted.baseWeekIndex).toBeNull();
    expect(seq.map((s) => s.runningIndex)).toEqual([1, 2, 3, 4, 5]);
  });

  it("multiple inserts at the same position stack", () => {
    const seq = buildRunningSequence(FOUR, [ins(2, "a"), ins(2, "b")]);
    expect(ids(seq)).toEqual(["w1", "a", "b", "w2", "w3", "w4"]);
    expect(kinds(seq)).toEqual(["base", "inserted", "inserted", "base", "base", "base"]);
  });

  it("inserts at different positions splice independently", () => {
    const seq = buildRunningSequence(FOUR, [ins(3, "y"), ins(1, "x")]); // unsorted input
    expect(ids(seq)).toEqual(["x", "w1", "w2", "y", "w3", "w4"]);
  });

  it("insert positioned past the last base week clamps to the end", () => {
    const seq = buildRunningSequence(FOUR, [ins(9, "z")]);
    expect(ids(seq)).toEqual(["w1", "w2", "w3", "w4", "z"]);
  });

  it("pinned-vs-on-demand: on_demand template excluded from sequence but usable as an insert source", () => {
    const weeks = [wk(1), wk(2, { deload: true, placement: "pinned" }), wk(3), wk(4, { deload: true, placement: "on_demand" })];
    const noInserts = buildRunningSequence(weeks, []);
    expect(ids(noInserts)).toEqual(["w1", "w2", "w3"]); // w4 (on_demand) never auto-runs
    expect(noInserts[1].isDeload).toBe(true); // pinned w2 runs in place as a deload

    const withInsert = buildRunningSequence(weeks, [ins(2, "w4", "standard")]); // splice the on_demand template
    expect(ids(withInsert)).toEqual(["w1", "w4", "w2", "w3"]);
    expect(withInsert[1]).toMatchObject({ kind: "inserted", contentPlanWeekId: "w4", isDeload: true });
  });
});

describe("insertPositionForDate — where 'take a deload this week' splices", () => {
  const start = "2026-06-01";
  it("inserts before the client's current base week (deload runs now)", () => {
    expect(insertPositionForDate(start, "2026-06-01", FOUR, [])).toBe(1); // week 1
    expect(insertPositionForDate(start, "2026-06-08", FOUR, [])).toBe(2); // week 2
    expect(insertPositionForDate(start, "2026-06-15", FOUR, [])).toBe(3); // week 3
  });
  it("before start clamps to position 1", () => {
    expect(insertPositionForDate(start, "2026-05-20", FOUR, [])).toBe(1);
  });
  it("when already inside an inserted deload, stacks before the next base week", () => {
    // 1 insert at pos 2 → running seq [w1, D, w2, w3, w4]; today lands on the inserted D (week 2).
    expect(insertPositionForDate(start, "2026-06-08", FOUR, [ins(2, "dl")])).toBe(2);
  });
});

describe("resolveWeekIndexForDate — date shift against the spliced sequence", () => {
  const start = "2026-06-01"; // running week 1 = the start_date week

  it("no inserts: week math + clamp unchanged from pre-Deload-v2", () => {
    expect(resolveWeekIndexForDate(start, "2026-06-01", 4)).toBe(1);
    expect(resolveWeekIndexForDate(start, "2026-06-08", 4)).toBe(2);
    expect(resolveWeekIndexForDate(start, "2026-05-25", 4)).toBe(1); // before start clamps
    expect(resolveWeekIndexForDate(start, "2026-07-20", 4)).toBe(4); // far future clamps to weekCount
  });

  it("each insert extends the running timeline by one week (clamp ceiling rises)", () => {
    // 4 base weeks + 1 insert = 5 running weeks. Week-5 date no longer clamps to 4.
    expect(resolveWeekIndexForDate(start, "2026-06-29", 4, [{ position: 2 }])).toBe(5);
    // 2 inserts → ceiling 6.
    expect(resolveWeekIndexForDate(start, "2026-08-01", 4, [{ position: 2 }, { position: 3 }])).toBe(6);
  });
});
