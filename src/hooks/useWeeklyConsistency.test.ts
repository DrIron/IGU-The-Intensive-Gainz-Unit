import { describe, it, expect } from "vitest";
import { currentIguWeekDates, kuwaitDateIso } from "./useWeeklyConsistency";

/**
 * useWeeklyConsistency — week/timezone maths (moved out of WeekConsistencyDots.test.tsx when
 * that presentational component was folded into ThisWeekCard in 1B). The pure date functions
 * are the load-bearing part: a Sunday-first week or a UTC-bucketed workout would put activity
 * on the wrong dot / the wrong week.
 */

describe("useWeeklyConsistency — week/timezone maths", () => {
  it("returns 7 consecutive dates starting on MONDAY (the IGU week, not Sunday)", () => {
    // 2026-07-12 is a Sunday.
    const dates = currentIguWeekDates(new Date("2026-07-12T09:00:00Z"));
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-07-06"); // Monday
    expect(dates[6]).toBe("2026-07-12"); // Sunday
    expect(new Date(`${dates[0]}T00:00:00Z`).getUTCDay()).toBe(1); // Monday
  });

  it("a Sunday stays in the week that STARTED on Monday (not a new week)", () => {
    const sunday = currentIguWeekDates(new Date("2026-07-12T20:00:00Z"));
    const saturday = currentIguWeekDates(new Date("2026-07-11T20:00:00Z"));
    expect(sunday).toEqual(saturday);
  });

  it("buckets a late-night Kuwait workout onto the RIGHT day", () => {
    // 2026-07-09 21:30 UTC == 2026-07-10 00:30 Kuwait (UTC+3).
    // Bucketing by UTC date would put this on the 9th — the wrong dot.
    expect(kuwaitDateIso(new Date("2026-07-09T21:30:00Z"))).toBe("2026-07-10");
    // And an early-evening one stays put.
    expect(kuwaitDateIso(new Date("2026-07-09T15:00:00Z"))).toBe("2026-07-09");
  });
});
