import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeSmoothedWeeklyTrend } from "./WeeklyProgressCard";

/**
 * BUG B (FU4) — the "This Week" weight trend was a raw endpoint subtraction.
 *
 * The old math was `weights[0] - weights[weights.length - 1]` over the last 14 log rows: the
 * newest reading minus the oldest, with nothing in between contributing anything. A single
 * bad row at either end WAS the answer, so a mis-typed `0` reported a double-digit gain on a
 * client's own dashboard, and ordinary day-to-day noise (water, food, time of day) was
 * presented as trend.
 *
 * The fix compares the mean of the last 7 days against the mean of the 7 before it, dropping
 * zero/invalid rows first. The property under test is that ONE bad reading can no longer
 * dominate: averaging demotes it from "the answer" to "one of n".
 */

// Fixed anchor so the 7-day windows are exact:
//   this week  = [2026-07-08 .. 2026-07-14]
//   prior week = [2026-07-01 .. 2026-07-07]
const TODAY = new Date("2026-07-14T12:00:00Z");

/** The old, broken math — kept here so the tests can show what it WOULD have said. */
function oldNaiveTrend(logs: Array<{ log_date: string; weight_kg: number }>): number {
  const desc = [...logs].sort((a, b) => b.log_date.localeCompare(a.log_date));
  return Number((desc[0].weight_kg - desc[desc.length - 1].weight_kg).toFixed(1));
}

describe("BUG B — smoothed weekly weight trend", () => {
  it("a ZERO weigh-in does not produce a wild number", () => {
    const logs = [
      // Prior week — one row was fat-fingered to 0.
      { log_date: "2026-07-01", weight_kg: 0 },
      { log_date: "2026-07-03", weight_kg: 80.2 },
      { log_date: "2026-07-05", weight_kg: 80.0 },
      // This week — a real, modest loss.
      { log_date: "2026-07-09", weight_kg: 79.8 },
      { log_date: "2026-07-11", weight_kg: 79.6 },
      { log_date: "2026-07-14", weight_kg: 79.4 },
    ];

    // What the client used to see: newest (79.4) minus oldest (0).
    expect(oldNaiveTrend(logs)).toBe(79.4);

    const { weightTrend, weightChange } = computeSmoothedWeeklyTrend(logs, TODAY);

    // this week  = (79.8 + 79.6 + 79.4) / 3 = 79.6
    // prior week = (80.2 + 80.0) / 2        = 80.1   <- the 0 is excluded, not averaged in
    expect(weightChange).toBe(-0.5);
    expect(weightTrend).toBe("down");

    // The two ways this could still have been wrong:
    // - counting the 0 would drag the prior mean to 53.4 and report a ~+26 kg GAIN
    expect(weightTrend).not.toBe("up");
    // - and in no case may a single bad row still be the headline
    expect(Math.abs(weightChange!)).toBeLessThan(2);
  });

  it("the trend equals the smoothed weekly average, computed by hand", () => {
    const logs = [
      { log_date: "2026-07-02", weight_kg: 90.0 },
      { log_date: "2026-07-04", weight_kg: 90.6 },
      { log_date: "2026-07-06", weight_kg: 90.3 }, // prior mean = 90.3
      { log_date: "2026-07-09", weight_kg: 91.0 },
      { log_date: "2026-07-12", weight_kg: 91.4 },
      { log_date: "2026-07-14", weight_kg: 91.2 }, // this mean  = 91.2
    ];

    const { weightTrend, weightChange } = computeSmoothedWeeklyTrend(logs, TODAY);

    expect(weightChange).toBe(0.9); // 91.2 - 90.3
    expect(weightTrend).toBe("up");
  });

  it("a single high outlier is DAMPED, not amplified into the headline", () => {
    const logs = [
      { log_date: "2026-07-02", weight_kg: 80.2 },
      { log_date: "2026-07-04", weight_kg: 80.0 },
      { log_date: "2026-07-06", weight_kg: 80.1 }, // prior mean = 80.1
      { log_date: "2026-07-09", weight_kg: 79.8 },
      { log_date: "2026-07-11", weight_kg: 84.5 }, // a bad reading -- wrong scale, post-meal
      { log_date: "2026-07-14", weight_kg: 79.4 },
    ];

    // Old math: the outlier isn't even the endpoint here, yet the raw endpoints still
    // disagree by nearly a kilo of pure noise.
    expect(Math.abs(oldNaiveTrend(logs))).toBeGreaterThan(0.5);

    const { weightChange } = computeSmoothedWeeklyTrend(logs, TODAY);

    // this week = (79.8 + 84.5 + 79.4) / 3 = 81.23 -> +1.1 against 80.1.
    // The bad reading moves the number, but it is now one third of one week, not the whole
    // answer. NOTE: smoothing damps a plausible-but-wrong value; it cannot remove it. A gross
    // typo (e.g. 180 kg) would still skew this. See the PR -- true outlier rejection is a
    // separate call, deliberately not made here.
    expect(weightChange).toBe(1.1);
    expect(Math.abs(weightChange!)).toBeLessThanOrEqual(1.5);
  });

  it("says NOTHING rather than inventing a trend when a week has no real weigh-in", () => {
    // Only this week has data -- there is no prior week to compare against.
    const onlyThisWeek = [
      { log_date: "2026-07-09", weight_kg: 79.8 },
      { log_date: "2026-07-14", weight_kg: 79.4 },
    ];
    expect(computeSmoothedWeeklyTrend(onlyThisWeek, TODAY)).toEqual({
      weightTrend: null,
      weightChange: null,
    });

    // A prior week whose ONLY row is a zero is an empty week, not a 0 kg week.
    const zeroedPriorWeek = [
      { log_date: "2026-07-03", weight_kg: 0 },
      { log_date: "2026-07-09", weight_kg: 79.8 },
      { log_date: "2026-07-14", weight_kg: 79.4 },
    ];
    expect(computeSmoothedWeeklyTrend(zeroedPriorWeek, TODAY).weightChange).toBeNull();
  });

  it("negative and non-finite readings are treated as invalid too", () => {
    const logs = [
      { log_date: "2026-07-03", weight_kg: -80 },
      { log_date: "2026-07-05", weight_kg: NaN },
      { log_date: "2026-07-06", weight_kg: 80.0 },
      { log_date: "2026-07-14", weight_kg: 79.6 },
    ];
    const { weightChange } = computeSmoothedWeeklyTrend(logs, TODAY);
    expect(weightChange).toBe(-0.4); // 79.6 - 80.0, the junk rows simply absent
  });

  it("sub-0.3 kg movement reads as stable, not as a direction", () => {
    const logs = [
      { log_date: "2026-07-04", weight_kg: 80.0 },
      { log_date: "2026-07-06", weight_kg: 80.0 },
      { log_date: "2026-07-11", weight_kg: 80.1 },
      { log_date: "2026-07-14", weight_kg: 80.1 },
    ];
    expect(computeSmoothedWeeklyTrend(logs, TODAY).weightTrend).toBe("stable");
  });
});

describe("BUG B — the trend arrow carries no verdict", () => {
  it("does not colour weight direction green/orange/red", () => {
    const src = readFileSync(join(process.cwd(), "src/components/client/WeeklyProgressCard.tsx"), "utf8");
    const icons = src.slice(src.indexOf("const getTrendIcon"), src.indexOf("const loading ="));

    // Gaining is the GOAL in a muscle-gain phase. An orange up-arrow and a green down-arrow
    // tell that client their progress is a warning. Direction is already in the arrow and the
    // sign -- the colour only added a judgement. Same rule NU6 / PUB6 / CL5 / CO4 enforce.
    expect(icons).not.toMatch(/text-(green|orange|red|emerald|amber)-/);
    expect(icons).toContain("text-muted-foreground");
  });
});
