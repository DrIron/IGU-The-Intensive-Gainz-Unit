import { describe, it, expect } from "vitest";
import {
  roundToIncrement,
  applyBasis,
  resolveReferenceWeight,
  computeBackoffWeight,
  computeDropWeight,
  isAmrapSet,
  isBackoffSet,
  dropBranches,
  backoffBadgeLabel,
  dropBadgeLabel,
  restRepeatBranch,
  restPauseMaxRounds,
  restPauseRoundKey,
  restPauseBadgeLabel,
} from "./setInstructions";

describe("roundToIncrement", () => {
  it("rounds to 2.5 by default", () => {
    expect(roundToIncrement(61.3)).toBe(62.5);
    expect(roundToIncrement(63.7)).toBe(63.75 - 1.25); // 62.5
    expect(roundToIncrement(90)).toBe(90);
  });
  it("supports custom increments and floors at 0", () => {
    expect(roundToIncrement(11, 5)).toBe(10);
    expect(roundToIncrement(-5)).toBe(0);
    expect(roundToIncrement(0)).toBe(0);
  });
});

describe("applyBasis", () => {
  it("percent: 100 @ 90% -> 90", () => {
    expect(applyBasis(100, "percent", 90)).toBe(90);
  });
  it("percent rounds to 2.5: 100 @ 85% -> 85", () => {
    expect(applyBasis(100, "percent", 85)).toBe(85);
  });
  it("percent rounds to 2.5: 102.5 @ 90% = 92.25 -> 92.5", () => {
    expect(applyBasis(102.5, "percent", 90)).toBe(92.5);
  });
  it("drop: 100 − 20kg -> 80", () => {
    expect(applyBasis(100, "drop", 20)).toBe(80);
  });
  it("drop never goes negative", () => {
    expect(applyBasis(10, "drop", 25)).toBe(0);
  });
});

describe("resolveReferenceWeight — logged wins over prescribed", () => {
  it("uses logged when present", () => {
    expect(resolveReferenceWeight(80, 100)).toBe(80);
  });
  it("falls back to prescribed when not logged", () => {
    expect(resolveReferenceWeight(null, 100)).toBe(100);
    expect(resolveReferenceWeight(undefined, 100)).toBe(100);
  });
  it("null when neither known", () => {
    expect(resolveReferenceWeight(null, null)).toBeNull();
  });
});

describe("computeBackoffWeight", () => {
  const spec = { ref_set_index: 0, basis: "percent" as const, value: 90 };
  it("computes from logged reference weight", () => {
    expect(computeBackoffWeight(spec, 100, null)).toBe(90);
  });
  it("recomputes when the logged weight changes (live)", () => {
    expect(computeBackoffWeight(spec, 80, null)).toBe(72.5); // 72 -> 72.5
  });
  it("uses prescribed reference if no log yet, snapped to the 2.5 grid", () => {
    // 120*0.9 = 108, which isn't a 2.5 multiple -> rounds to 107.5.
    expect(computeBackoffWeight(spec, null, 120)).toBe(107.5);
  });
  it("null until the reference is known", () => {
    expect(computeBackoffWeight(spec, null, null)).toBeNull();
  });
  it("drop basis with custom rounding", () => {
    expect(computeBackoffWeight({ ref_set_index: 0, basis: "drop", value: 10, rounding: 5 }, 100, null)).toBe(90);
  });
});

describe("computeDropWeight", () => {
  it("80% off the parent's logged weight", () => {
    expect(computeDropWeight({ type: "drop", basis: "percent", value: 80 }, 100, null)).toBe(80);
  });
  it("−10kg off prescribed when not logged", () => {
    expect(computeDropWeight({ type: "drop", basis: "drop", value: 10 }, null, 50)).toBe(40);
  });
  it("null when parent weight unknown", () => {
    expect(computeDropWeight({ type: "drop", basis: "percent", value: 80 }, null, null)).toBeNull();
  });
});

describe("flags + parsing", () => {
  it("isAmrapSet", () => {
    expect(isAmrapSet({ amrap: true })).toBe(true);
    expect(isAmrapSet({})).toBe(false);
    expect(isAmrapSet({ amrap: false })).toBe(false);
  });
  it("isBackoffSet requires mode + spec", () => {
    expect(isBackoffSet({ weight_mode: "backoff", backoff: { ref_set_index: 0 } })).toBe(true);
    expect(isBackoffSet({ weight_mode: "backoff" })).toBe(false);
    expect(isBackoffSet({ weight_mode: "absolute" })).toBe(false);
  });
  it("dropBranches filters to drops only (ignores rest_repeat)", () => {
    const branches = [
      { type: "drop", basis: "percent", value: 80 },
      { type: "rest_repeat", rest_seconds: 15, to_failure: true },
    ];
    const drops = dropBranches({ branches } as never);
    expect(drops).toHaveLength(1);
    expect(drops[0].value).toBe(80);
  });
});

describe("rest & repeat (rest-pause)", () => {
  const capped = { type: "rest_repeat", rest_seconds: 20, to_failure: true, max_rounds: 3 } as const;
  const openEnded = { type: "rest_repeat", rest_seconds: 15, to_failure: true } as const;

  it("restRepeatBranch finds the branch (ignores drops)", () => {
    const set = { branches: [{ type: "drop", basis: "percent", value: 80 }, capped] };
    expect(restRepeatBranch(set as never)).toEqual(capped);
    expect(restRepeatBranch({ branches: [] } as never)).toBeNull();
    expect(restRepeatBranch({} as never)).toBeNull();
  });
  it("restPauseMaxRounds: cap vs open-ended", () => {
    expect(restPauseMaxRounds(capped)).toBe(3);
    expect(restPauseMaxRounds(openEnded)).toBeNull();
    expect(restPauseMaxRounds({ type: "rest_repeat", rest_seconds: 20, to_failure: true, max_rounds: 0 })).toBeNull();
  });
  it("restPauseRoundKey is per-round (round 1 = main set)", () => {
    expect(restPauseRoundKey(2)).toBe("rp_round_2");
    expect(restPauseRoundKey(3)).toBe("rp_round_3");
  });
  it("badge label: with and without cap", () => {
    expect(restPauseBadgeLabel(capped)).toBe("rest-pause 20s · ×3");
    expect(restPauseBadgeLabel(openEnded)).toBe("rest-pause 15s");
  });
});

describe("badge labels", () => {
  it("back-off percent + drop kg", () => {
    expect(backoffBadgeLabel({ ref_set_index: 0, basis: "percent", value: 90 })).toBe("back-off 90% · S1");
    expect(backoffBadgeLabel({ ref_set_index: 2, basis: "drop", value: 10 })).toBe("back-off −10kg · S3");
  });
  it("drop labels", () => {
    expect(dropBadgeLabel({ type: "drop", basis: "percent", value: 80 })).toBe("drop 80%");
    expect(dropBadgeLabel({ type: "drop", basis: "drop", value: 10 })).toBe("drop −10kg");
  });
});
