import { describe, it, expect } from "vitest";
import {
  dayCalorieBand,
  rollingAdherence,
  macroDeviation,
  BAND_STATUS,
  MACRO_TIER,
  type DayInput,
} from "./adherence";

/**
 * P5a adherence — the tests exist to pin the ABSENCE of the shaming state as much as the
 * presence of the correct one: an unlogged day must never read as off_track, and the headline
 * must never be dragged down by days that simply weren't logged.
 */

describe("dayCalorieBand — the ±10 / ±20 bands", () => {
  it("bands at the exact boundaries", () => {
    expect(dayCalorieBand(2000, 2000)).toBe("adherent"); // 0%
    expect(dayCalorieBand(2200, 2000)).toBe("adherent"); // +10% (inclusive)
    expect(dayCalorieBand(1800, 2000)).toBe("adherent"); // −10%
    expect(dayCalorieBand(2201, 2000)).toBe("slightly_off"); // just past 10%
    expect(dayCalorieBand(2400, 2000)).toBe("slightly_off"); // +20% (inclusive)
    expect(dayCalorieBand(1600, 2000)).toBe("slightly_off"); // −20%
    expect(dayCalorieBand(2401, 2000)).toBe("off_track"); // just past 20%
    expect(dayCalorieBand(1000, 2000)).toBe("off_track"); // −50%
  });

  it("an UNLOGGED day is not_logged — and is emphatically NOT off_track", () => {
    const band = dayCalorieBand(null, 2000);
    expect(band).toBe("not_logged");
    expect(band).not.toBe("off_track"); // the guardrail, stated as its own assertion
  });

  it("no target to measure against → not_logged, never a band", () => {
    expect(dayCalorieBand(2000, null)).toBe("not_logged");
    expect(dayCalorieBand(2000, 0)).toBe("not_logged");
    expect(dayCalorieBand(2000, -100)).toBe("not_logged");
  });
});

describe("rollingAdherence — logged days only, consistency kept separate", () => {
  it("4 perfect logged days + 3 unlogged: 100% adherent over 4 logged, headline NOT red", () => {
    const days: DayInput[] = [
      { consumedKcal: 2000, targetKcal: 2000 },
      { consumedKcal: 1950, targetKcal: 2000 },
      { consumedKcal: 2050, targetKcal: 2000 },
      { consumedKcal: 2000, targetKcal: 2000 },
      { consumedKcal: null, targetKcal: 2000 }, // unlogged
      { consumedKcal: null, targetKcal: 2000 }, // unlogged
      { consumedKcal: null, targetKcal: 2000 }, // unlogged
    ];
    const r = rollingAdherence(days);

    expect(r.loggedDays).toBe(4);
    expect(r.totalDays).toBe(7);
    expect(r.adherentPct).toBe(100);
    expect(r.headlineBand).toBe("adherent");
    // The three unlogged days did NOT drag the headline to off_track/red.
    expect(r.headlineBand).not.toBe("off_track");
    expect(r.headlineBand).not.toBe("slightly_off");
    // The unlogged days show as not_logged in the strip, not as a red dot.
    expect(r.perDay.filter((b) => b === "not_logged")).toHaveLength(3);
    expect(r.perDay).not.toContain("off_track");
  });

  it("nothing logged → not_logged headline, null percentages, never a verdict", () => {
    const days: DayInput[] = Array.from({ length: 7 }, () => ({ consumedKcal: null, targetKcal: 2000 }));
    const r = rollingAdherence(days);

    expect(r.loggedDays).toBe(0);
    expect(r.headlineBand).toBe("not_logged");
    expect(r.avgDeviationPct).toBeNull();
    expect(r.adherentPct).toBeNull();
    // Not a red day in sight — an empty week is empty, not failed.
    expect(r.perDay.every((b) => b === "not_logged")).toBe(true);
  });

  it("headline is the LOGGED-day average, not a per-day mix; deviation is signed", () => {
    // Logged days average 1,880 vs 2,000 → −6%, within ±10% → adherent. One unlogged day.
    const days: DayInput[] = [
      { consumedKcal: 1760, targetKcal: 2000 },
      { consumedKcal: 2000, targetKcal: 2000 },
      { consumedKcal: null, targetKcal: 2000 },
    ];
    const r = rollingAdherence(days);
    expect(r.avgDeviationPct).toBe(-6); // (1880-2000)/2000
    expect(r.headlineBand).toBe("adherent");
    expect(r.loggedDays).toBe(2);
  });

  it("logged but NO target anywhere → consistency counts, quality is not judged", () => {
    const days: DayInput[] = [
      { consumedKcal: 2000, targetKcal: null },
      { consumedKcal: 1800, targetKcal: null },
    ];
    const r = rollingAdherence(days);
    expect(r.loggedDays).toBe(2); // they logged
    expect(r.headlineBand).toBe("not_logged"); // ...but nothing to measure → no red verdict
    expect(r.avgDeviationPct).toBeNull();
    expect(r.headlineBand).not.toBe("off_track");
  });

  it("a genuinely over-target logged week reads off_track (the signal still works)", () => {
    const days: DayInput[] = Array.from({ length: 5 }, () => ({ consumedKcal: 2800, targetKcal: 2000 }));
    const r = rollingAdherence(days);
    expect(r.headlineBand).toBe("off_track"); // +40% — a real miss, correctly surfaced
    expect(r.avgDeviationPct).toBe(40);
  });
});

describe("macroDeviation — ±15% two-way", () => {
  it("within ±15% is on target, beyond is off", () => {
    expect(macroDeviation(172, 172)).toBe("adherent");
    expect(macroDeviation(197, 172)).toBe("adherent"); // +14.5%
    expect(macroDeviation(210, 172)).toBe("off_track"); // +22%
  });
  it("null either side → not_logged", () => {
    expect(macroDeviation(null, 172)).toBe("not_logged");
    expect(macroDeviation(172, null)).toBe("not_logged");
    expect(macroDeviation(172, 0)).toBe("not_logged");
  });
});

describe("mappings", () => {
  it("not_logged maps to the neutral status, never risk", () => {
    expect(BAND_STATUS.not_logged).toBe("neutral");
    expect(BAND_STATUS.not_logged).not.toBe("risk");
    expect(BAND_STATUS.adherent).toBe("ontrack");
    expect(BAND_STATUS.off_track).toBe("risk");
  });
  it("calories + protein are loud; fat + carbs quiet", () => {
    expect(MACRO_TIER.kcal).toBe("loud");
    expect(MACRO_TIER.protein).toBe("loud");
    expect(MACRO_TIER.fat).toBe("quiet");
    expect(MACRO_TIER.carbs).toBe("quiet");
  });
});
