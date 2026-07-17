import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeSmoothedWeeklyTrend } from "./ThisWeekCard";

/**
 * BUG B (FU4) — the "This week" weight trend was once a raw endpoint subtraction. Moved here
 * with the function when WeeklyProgressCard was merged into ThisWeekCard (1B). A single bad row
 * could once BE the answer, reporting a double-digit gain from a mis-typed 0. The fix compares
 * the mean of the last 7 days against the mean of the 7 before it, dropping zero/invalid rows.
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
      { log_date: "2026-07-01", weight_kg: 0 },
      { log_date: "2026-07-03", weight_kg: 80.2 },
      { log_date: "2026-07-05", weight_kg: 80.0 },
      { log_date: "2026-07-09", weight_kg: 79.8 },
      { log_date: "2026-07-11", weight_kg: 79.6 },
      { log_date: "2026-07-14", weight_kg: 79.4 },
    ];

    expect(oldNaiveTrend(logs)).toBe(79.4);

    const { weightTrend, weightChange } = computeSmoothedWeeklyTrend(logs, TODAY);

    // this week = 79.6, prior week = 80.1 (the 0 is excluded, not averaged in).
    expect(weightChange).toBe(-0.5);
    expect(weightTrend).toBe("down");
    expect(weightTrend).not.toBe("up");
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
      { log_date: "2026-07-11", weight_kg: 84.5 }, // a bad reading
      { log_date: "2026-07-14", weight_kg: 79.4 },
    ];

    expect(Math.abs(oldNaiveTrend(logs))).toBeGreaterThan(0.5);

    const { weightChange } = computeSmoothedWeeklyTrend(logs, TODAY);
    // this week = 81.23 -> +1.1 against 80.1. The bad reading moves the number but is now one
    // third of one week, not the whole answer.
    expect(weightChange).toBe(1.1);
    expect(Math.abs(weightChange!)).toBeLessThanOrEqual(1.5);
  });

  it("says NOTHING rather than inventing a trend when a week has no real weigh-in", () => {
    const onlyThisWeek = [
      { log_date: "2026-07-09", weight_kg: 79.8 },
      { log_date: "2026-07-14", weight_kg: 79.4 },
    ];
    expect(computeSmoothedWeeklyTrend(onlyThisWeek, TODAY)).toEqual({
      weightTrend: null,
      weightChange: null,
    });

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
    const src = readFileSync(join(process.cwd(), "src/components/client/ThisWeekCard.tsx"), "utf8");
    // The getTrendIcon block only — the adherence % legitimately uses green/amber/red, so scope
    // the assertion to the weight-trend icons.
    const icons = src.slice(src.indexOf("const getTrendIcon"), src.indexOf("const loading ="));
    expect(icons.length).toBeGreaterThan(0);

    // Gaining is the GOAL in a muscle-gain phase. Direction is already in the arrow + sign; the
    // colour would only add a verdict. Same rule NU6 / PUB6 / CL5 / CO4 enforce.
    expect(icons).not.toMatch(/text-(green|orange|red|emerald|amber)-/);
    expect(icons).toContain("text-muted-foreground");
  });
});
