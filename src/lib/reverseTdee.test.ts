import { describe, it, expect } from "vitest";
import { computeReverseTdeeSeries, type LoggedKcalDay, type WeighIn } from "./reverseTdee";
import { calculateReverseTDEE } from "@/utils/nutritionCalculations";

/**
 * NU2 — the load-bearing rule is the ABSENCE of a fabricated TDEE off sparse logging: no point is
 * emitted unless the window has enough logged calorie days AND enough weigh-ins spanning enough
 * time. The rest pins that a valid window's value matches calculateReverseTDEE with the SMOOTHED
 * (not raw-endpoint) weight change.
 */

const iso = (day: number) => `2026-06-${String(day).padStart(2, "0")}`;

// 14 consecutive logged days at 2,000 kcal.
const fullLog = (): LoggedKcalDay[] =>
  Array.from({ length: 14 }, (_, i) => ({ date: iso(i + 1), kcal: 2000 }));

describe("computeReverseTdeeSeries — value", () => {
  it("a valid window's TDEE matches calculateReverseTDEE with the SMOOTHED weight change", () => {
    // Start group (first 3): 81, 80, 80 → 80.333. End group (last 3): 79, 79, 79 → 79.0.
    const weighIns: WeighIn[] = [
      { date: iso(1), kg: 81 }, { date: iso(2), kg: 80 }, { date: iso(3), kg: 80 },
      { date: iso(12), kg: 79 }, { date: iso(13), kg: 79 }, { date: iso(14), kg: 79 },
    ];
    const series = computeReverseTdeeSeries(fullLog(), weighIns);
    expect(series.length).toBeGreaterThan(0);

    const startAvg = (81 + 80 + 80) / 3;
    const endAvg = (79 + 79 + 79) / 3;
    const expected = Math.round(calculateReverseTDEE(2000, endAvg - startAvg, 14));

    // The anchor at the last logged day (June 14) has the full window.
    const last = series[series.length - 1];
    expect(last.value).toBe(expected);
    // Losing weight → measured TDEE is ABOVE intake (you're burning more than you ate).
    expect(last.value).toBeGreaterThan(2000);
  });

  it("smoothing averages the end GROUPS, not two raw daily points (noise-resistant)", () => {
    // A single noisy first weigh-in (85) is diluted by its group; raw endpoints would over-swing.
    const smoothed: WeighIn[] = [
      { date: iso(1), kg: 85 }, { date: iso(2), kg: 80 }, { date: iso(3), kg: 80 }, // avg 81.667
      { date: iso(12), kg: 79 }, { date: iso(13), kg: 79 }, { date: iso(14), kg: 79 }, // avg 79
    ];
    const series = computeReverseTdeeSeries(fullLog(), smoothed);
    const expected = Math.round(calculateReverseTDEE(2000, 79 - 81.6666667, 14));
    expect(series[series.length - 1].value).toBe(expected);
    // Raw-endpoint change would be 79-85 = -6; assert we did NOT use that.
    expect(series[series.length - 1].value).not.toBe(Math.round(calculateReverseTDEE(2000, 79 - 85, 14)));
  });

  it("with exactly 2 weigh-ins, uses start=first / end=last (n collapses to 1, no overlap)", () => {
    const two: WeighIn[] = [{ date: iso(1), kg: 80 }, { date: iso(14), kg: 78 }];
    const series = computeReverseTdeeSeries(fullLog(), two);
    expect(series[series.length - 1].value).toBe(Math.round(calculateReverseTDEE(2000, 78 - 80, 14)));
  });
});

describe("computeReverseTdeeSeries — the sparse-data gate (never a TDEE off noise)", () => {
  const goodWeighIns: WeighIn[] = [
    { date: iso(1), kg: 80 }, { date: iso(2), kg: 80 }, { date: iso(3), kg: 80 },
    { date: iso(12), kg: 79 }, { date: iso(13), kg: 79 }, { date: iso(14), kg: 79 },
  ];

  it("< 7 logged calorie days in the window → NO point", () => {
    const sparseLog: LoggedKcalDay[] = [1, 2, 3, 12, 13].map((d) => ({ date: iso(d), kcal: 2000 })); // 5 days
    expect(computeReverseTdeeSeries(sparseLog, goodWeighIns)).toEqual([]);
  });

  it("weigh-ins spanning < 10 days → NO point (even with plenty of logging)", () => {
    const clustered: WeighIn[] = [
      { date: iso(1), kg: 80 }, { date: iso(2), kg: 80 }, { date: iso(3), kg: 79 }, // span 2 days
    ];
    expect(computeReverseTdeeSeries(fullLog(), clustered)).toEqual([]);
  });

  it("< 2 weigh-ins → NO point", () => {
    expect(computeReverseTdeeSeries(fullLog(), [{ date: iso(1), kg: 80 }])).toEqual([]);
  });

  it("no logs at all → empty (no crash)", () => {
    expect(computeReverseTdeeSeries([], goodWeighIns)).toEqual([]);
  });
});
