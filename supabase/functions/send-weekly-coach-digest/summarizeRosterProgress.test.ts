import { describe, it, expect } from "vitest";
import { summarizeRosterProgress } from "./summarizeRosterProgress.ts";

/**
 * AD3 — the digest's progress numbers. The load-bearing rule is honesty: a client with no
 * weigh-in/check-in isn't counted, and a zero-data roster yields all zeros (never null/NaN),
 * so the coach never sees a fabricated number.
 */

const ROSTER = ["a", "b", "c", "d"];

describe("summarizeRosterProgress", () => {
  it("counts distinct clients per metric + non-skipped sets from sample rows", () => {
    const r = summarizeRosterProgress({
      rosterUserIds: ROSTER,
      // a + b weighed in (b twice → still distinct 2).
      weighInRows: [{ user_id: "a" }, { user_id: "b" }, { user_id: "b" }],
      // a, b, c checked in; a + c followed calories → on track 2.
      checkInRows: [
        { user_id: "a", followed_calories: true },
        { user_id: "b", followed_calories: false },
        { user_id: "c", followed_calories: true },
      ],
      // a logged 3 sets (1 skipped), b logged 2 (0 skipped) → active {a,b}, sets 4.
      setLogRows: [
        { created_by_user_id: "a", skipped: false },
        { created_by_user_id: "a", skipped: true },
        { created_by_user_id: "a", skipped: false },
        { created_by_user_id: "b", skipped: false },
        { created_by_user_id: "b", skipped: false },
      ],
    });

    expect(r.total).toBe(4);
    expect(r.weighIns).toBe(2); // a, b
    expect(r.checkIns).toBe(3); // a, b, c
    expect(r.onTrack).toBe(2); // a, c
    expect(r.setsLogged).toBe(4); // 5 rows − 1 skipped
    expect([...r.activeClientIds].sort()).toEqual(["a", "b"]);
  });

  it("a client with no weigh-in / no check-in is NOT counted", () => {
    const r = summarizeRosterProgress({
      rosterUserIds: ROSTER,
      weighInRows: [{ user_id: "a" }], // b, c, d never weighed in
      checkInRows: [{ user_id: "a", followed_calories: true }], // only a checked in
      setLogRows: [],
    });
    expect(r.weighIns).toBe(1);
    expect(r.checkIns).toBe(1);
    expect(r.onTrack).toBe(1);
  });

  it("rows for users OUTSIDE the roster are ignored (defensive intersect)", () => {
    const r = summarizeRosterProgress({
      rosterUserIds: ["a"],
      weighInRows: [{ user_id: "a" }, { user_id: "stranger" }],
      checkInRows: [{ user_id: "stranger", followed_calories: true }],
      setLogRows: [{ created_by_user_id: "stranger", skipped: false }],
    });
    expect(r.weighIns).toBe(1);
    expect(r.checkIns).toBe(0);
    expect(r.onTrack).toBe(0);
    expect(r.setsLogged).toBe(0);
    expect(r.activeClientIds).toEqual([]);
  });

  it("a zero-data roster → ALL zeros, never null/NaN", () => {
    const r = summarizeRosterProgress({
      rosterUserIds: ROSTER,
      weighInRows: [],
      checkInRows: [],
      setLogRows: [],
    });
    expect(r).toMatchObject({ total: 4, weighIns: 0, checkIns: 0, onTrack: 0, setsLogged: 0 });
    expect(r.activeClientIds).toEqual([]);
    for (const v of [r.weighIns, r.checkIns, r.onTrack, r.setsLogged]) {
      expect(Number.isNaN(v)).toBe(false);
    }
  });

  it("an empty roster → total 0, all zeros", () => {
    const r = summarizeRosterProgress({ rosterUserIds: [], weighInRows: [{ user_id: "x" }], checkInRows: [], setLogRows: [] });
    expect(r.total).toBe(0);
    expect(r.weighIns).toBe(0);
  });
});
