import { describe, it, expect } from "vitest";
import {
  tierOf,
  bucketByTier,
  matchDimensionChips,
  capChips,
  type SubstituteExercise,
} from "./substituteMatch";

const sub = (o: Partial<SubstituteExercise>): SubstituteExercise => ({
  id: o.id ?? "x", name: o.name ?? "X", equipment: null, primary_muscle: null,
  resistance_profiles: null, cardio_movement_id: null, technique_id: null, target_region_id: null,
  match: "close", ...o,
});

describe("tierOf / bucketByTier", () => {
  it("prefers match_tier", () => {
    expect(tierOf(sub({ match_tier: "best", match: "close" }))).toBe("best");
    expect(tierOf(sub({ match_tier: "strong", match: "exact" }))).toBe("strong");
    expect(tierOf(sub({ match_tier: "partial" }))).toBe("partial");
  });

  it("falls back to legacy match when match_tier is absent (exact→best, close→partial)", () => {
    expect(tierOf(sub({ match: "exact" }))).toBe("best");
    expect(tierOf(sub({ match: "close" }))).toBe("partial");
  });

  it("buckets into best/strong/partial and PRESERVES within-tier order", () => {
    const rows = [
      sub({ id: "b1", match_tier: "best" }),
      sub({ id: "s1", match_tier: "strong" }),
      sub({ id: "b2", match_tier: "best" }),
      sub({ id: "p1", match_tier: "partial" }),
      sub({ id: "s2", match_tier: "strong" }),
    ];
    const b = bucketByTier(rows);
    expect(b.best.map((r) => r.id)).toEqual(["b1", "b2"]);
    expect(b.strong.map((r) => r.id)).toEqual(["s1", "s2"]);
    expect(b.partial.map((r) => r.id)).toEqual(["p1"]);
  });

  it("buckets a legacy-only response via the fallback", () => {
    const b = bucketByTier([sub({ id: "e", match: "exact" }), sub({ id: "c", match: "close" })]);
    expect(b.best.map((r) => r.id)).toEqual(["e"]);
    expect(b.strong).toEqual([]);
    expect(b.partial.map((r) => r.id)).toEqual(["c"]);
  });
});

describe("matchDimensionChips", () => {
  it("maps each dimension to its copy", () => {
    const chips = matchDimensionChips(
      ["movement_pattern", "resistance", "laterality", "cardio_movement", "technique", "target_region"],
      {},
    );
    expect(chips).toEqual([
      "Same movement", "Same resistance", "Same side pattern", "Same movement", "Same technique", "Same region",
    ]);
  });

  it("equipment uses equipmentLabel (BB→Barbell, C-FT→Cable); a null equipment drops the chip", () => {
    expect(matchDimensionChips(["equipment"], { equipment: "BB" })).toEqual(["Barbell"]);
    expect(matchDimensionChips(["equipment"], { equipment: "C-FT" })).toEqual(["Cable"]);
    expect(matchDimensionChips(["equipment"], { equipment: null })).toEqual([]);
  });

  it("subdivision uses the resolved name, else the 'Same subdivision' fallback", () => {
    expect(matchDimensionChips(["subdivision"], { subdivisionName: "Costal Head" })).toEqual(["Costal Head"]);
    expect(matchDimensionChips(["subdivision"], { subdivisionName: null })).toEqual(["Same subdivision"]);
    expect(matchDimensionChips(["subdivision"], { subdivisionName: "  " })).toEqual(["Same subdivision"]);
  });

  it("drops unknown dimensions and handles null/empty input", () => {
    expect(matchDimensionChips(["totally_unknown", "movement_pattern"], {})).toEqual(["Same movement"]);
    expect(matchDimensionChips(null, {})).toEqual([]);
    expect(matchDimensionChips(undefined, {})).toEqual([]);
  });
});

describe("capChips ('+N' overflow)", () => {
  it("returns all chips when within the cap", () => {
    expect(capChips(["a", "b", "c"], 4)).toEqual({ visible: ["a", "b", "c"], overflow: 0 });
    expect(capChips(["a", "b", "c", "d"], 4)).toEqual({ visible: ["a", "b", "c", "d"], overflow: 0 });
  });

  it("caps and reports the overflow count", () => {
    expect(capChips(["a", "b", "c", "d", "e", "f"], 4)).toEqual({ visible: ["a", "b", "c", "d"], overflow: 2 });
    expect(capChips(["a", "b", "c", "d"], 3)).toEqual({ visible: ["a", "b", "c"], overflow: 1 });
  });
});
