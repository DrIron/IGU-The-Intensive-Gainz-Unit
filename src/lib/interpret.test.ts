import { describe, it, expect } from "vitest";
import {
  classifyPhaseStatus,
  interpretPhaseStatus,
  interpretWeeklyHabit,
  interpretCheckIns,
  interpretWeighInRecency,
  interpretMacroTargets,
  interpretRepMaxTrend,
  interpretAdjustment,
} from "./interpret";

describe("classifyPhaseStatus (fat loss, rate 0.6)", () => {
  const base = { isActive: true, weeklyRatePercentage: 0.6, goalType: "fat_loss" as const };
  it("on_track inside the ±30% band", () =>
    expect(classifyPhaseStatus({ ...base, latestActualChangePercent: -0.6 })).toBe("on_track"));
  it("ahead when losing too fast", () =>
    expect(classifyPhaseStatus({ ...base, latestActualChangePercent: -1.2 })).toBe("ahead"));
  it("behind when too slow", () =>
    expect(classifyPhaseStatus({ ...base, latestActualChangePercent: -0.2 })).toBe("behind"));
  it("no_data when null", () =>
    expect(classifyPhaseStatus({ ...base, latestActualChangePercent: null })).toBe("no_data"));
  it("completed when inactive", () =>
    expect(classifyPhaseStatus({ ...base, isActive: false, latestActualChangePercent: -0.6 })).toBe("completed"));
});

describe("classifyPhaseStatus (muscle gain + maintenance)", () => {
  it("muscle_gain ahead when gaining too fast", () =>
    expect(
      classifyPhaseStatus({ isActive: true, weeklyRatePercentage: 0.5, goalType: "muscle_gain", latestActualChangePercent: 1.0 }),
    ).toBe("ahead"));
  it("muscle_gain behind when gaining too slow", () =>
    expect(
      classifyPhaseStatus({ isActive: true, weeklyRatePercentage: 0.5, goalType: "muscle_gain", latestActualChangePercent: 0.1 }),
    ).toBe("behind"));
  it("maintenance on_track within ±0.25%", () =>
    expect(
      classifyPhaseStatus({ isActive: true, weeklyRatePercentage: 0, goalType: "maintenance", latestActualChangePercent: -0.2 }),
    ).toBe("on_track"));
  it("maintenance behind when drifting", () =>
    expect(
      classifyPhaseStatus({ isActive: true, weeklyRatePercentage: 0, goalType: "maintenance", latestActualChangePercent: 0.5 }),
    ).toBe("behind"));
});

describe("interpretPhaseStatus tone mapping", () => {
  const args = { latestActualChangePercent: -1.2, weeklyRatePercentage: 0.6, goalType: "fat_loss" as const };
  it("ahead → attention tone", () =>
    expect(interpretPhaseStatus({ ...args, status: "ahead" }).tone).toBe("attention"));
  it("behind → risk tone", () =>
    expect(interpretPhaseStatus({ ...args, status: "behind" }).tone).toBe("risk"));
  it("on_track → on_track tone + sentence", () => {
    const r = interpretPhaseStatus({ ...args, status: "on_track", latestActualChangePercent: -0.6 });
    expect(r.tone).toBe("on_track");
    expect(r.sentence).toContain("target band");
  });
});

describe("interpretPhaseStatus subject (viewer-aware copy)", () => {
  const base = { latestActualChangePercent: -0.6, weeklyRatePercentage: 0.6, goalType: "fat_loss" as const };

  it("default (self) keeps second-person 'your' copy", () => {
    expect(interpretPhaseStatus({ ...base, status: "on_track" }).sentence).toContain("your 0.6% target band");
    expect(interpretPhaseStatus({ ...base, status: "ahead" }).sentence).toContain("faster than your");
    expect(interpretPhaseStatus({ ...base, status: "behind" }).sentence).toContain("short of your");
    expect(interpretPhaseStatus({ ...base, status: "no_data" }).sentence).toBe("Log a couple more weigh-ins to see your trend.");
  });

  it("coach → 'their' + neutral empty state, never 'your'", () => {
    const onTrack = interpretPhaseStatus({ ...base, status: "on_track", subject: "coach" });
    expect(onTrack.sentence).toContain("their 0.6% target band");
    expect(onTrack.sentence).not.toContain("your");
    expect(interpretPhaseStatus({ ...base, status: "ahead", subject: "coach" }).sentence).toContain("faster than their");
    expect(interpretPhaseStatus({ ...base, status: "behind", subject: "coach" }).sentence).toContain("short of their");
    expect(interpretPhaseStatus({ ...base, status: "no_data", subject: "coach" }).sentence).toBe("Not enough weigh-ins yet to show a trend.");
  });

  it("subject does not change tone/label, only copy", () => {
    const self = interpretPhaseStatus({ ...base, status: "behind" });
    const coach = interpretPhaseStatus({ ...base, status: "behind", subject: "coach" });
    expect(coach.tone).toBe(self.tone);
    expect(coach.label).toBe(self.label);
  });
});

describe("interpretPhaseStatus direction follows the ACTUAL sign, not the goal", () => {
  it("fat-loss client who GAINED reads 'up', never 'Losing'", () => {
    const r = interpretPhaseStatus({
      status: "behind",
      latestActualChangePercent: 20.94,
      weeklyRatePercentage: 0.75,
      goalType: "fat_loss",
    });
    expect(r.sentence).toContain("up 20.9%/wk");
    expect(r.sentence.toLowerCase()).not.toContain("losing");
    expect(r.sentence).toContain("0.75%"); // target matches the card's strip, not 0.8
  });
  it("fat-loss losing slowly reads 'down'", () => {
    const r = interpretPhaseStatus({
      status: "behind",
      latestActualChangePercent: -0.2,
      weeklyRatePercentage: 0.6,
      goalType: "fat_loss",
    });
    expect(r.sentence).toContain("down 0.2%/wk");
  });
  it("near-zero change reads 'flat'", () => {
    const r = interpretPhaseStatus({
      status: "on_track",
      latestActualChangePercent: 0.02,
      weeklyRatePercentage: 0.6,
      goalType: "fat_loss",
    });
    expect(r.sentence).toContain("flat");
  });
});

describe("coach signals", () => {
  it("overdue check-in is risk", () => expect(interpretCheckIns(3, 9).tone).toBe("risk"));
  it("recently-due check-in is attention", () => expect(interpretCheckIns(1, 2).tone).toBe("attention"));
  it("no check-ins is on_track", () => expect(interpretCheckIns(0, null).tone).toBe("on_track"));
  it("7d+ since weigh-in drifts", () => expect(interpretWeighInRecency(8).label).toBe("Drifting"));
  it("4-6d since weigh-in slows", () => expect(interpretWeighInRecency(5).tone).toBe("attention"));
  it("null weigh-in is neutral", () => expect(interpretWeighInRecency(null).tone).toBe("neutral"));
});

describe("interpretWeeklyHabit", () => {
  it("complete is on_track", () => expect(interpretWeeklyHabit(3, 3, "weigh-ins").tone).toBe("on_track"));
  it("none started is attention", () => expect(interpretWeeklyHabit(0, 3, "weigh-ins").label).toBe("Not started"));
  it("partial shows remaining", () =>
    expect(interpretWeeklyHabit(1, 3, "weigh-ins").sentence).toContain("2 to go"));
});

describe("interpretMacroTargets (CL2)", () => {
  it("fat-loss split labels %s and reads protein-forward", () => {
    const r = interpretMacroTargets({ calories: 2000, protein: 180, carbs: 150, fat: 60, goalType: "fat_loss" });
    expect(r.tone).toBe("neutral");
    expect(r.label).toBe("36P/30C/27F");
    expect(r.sentence).toContain("protein-forward");
    expect(r.sentence).toContain("lose fat");
  });
  it("no calories → empty interpretation", () =>
    expect(interpretMacroTargets({ calories: 0, protein: 0, carbs: 0, fat: 0, goalType: "maintenance" }).sentence).toBe(""));
});

describe("interpretRepMaxTrend (HX1)", () => {
  it("rising best-load-at-reps is on_track and names the rep count", () => {
    const r = interpretRepMaxTrend(5, 6, 5);
    expect(r.tone).toBe("on_track");
    expect(r.label).toBe("Getting stronger");
    expect(r.sentence).toContain("Best load at 5 reps up 5 kg over 6 sessions");
  });
  it("falling best-load-at-reps is attention and mentions a deload", () => {
    const r = interpretRepMaxTrend(-5, 6, 3);
    expect(r.tone).toBe("attention");
    expect(r.sentence).toContain("Best load at 3 reps down 5 kg");
    expect(r.sentence).toContain("deload");
  });
  it("steady best-load-at-reps is neutral and holding", () => {
    const r = interpretRepMaxTrend(0, 4, 8);
    expect(r.tone).toBe("neutral");
    expect(r.label).toBe("Holding");
    expect(r.sentence).toContain("Best load at 8 reps steady over 4 sessions");
  });
  it("single session is neutral and prompts another logged set at that rep", () => {
    const r = interpretRepMaxTrend(0, 1, 5);
    expect(r.tone).toBe("neutral");
    expect(r.label).toBe("");
    expect(r.sentence).toContain("Log another set at 5 reps");
  });
});

describe("interpretAdjustment (NU3)", () => {
  it("increase reads up + the why line", () => {
    const r = interpretAdjustment({ calorieDelta: 120, newCalories: 2120, expectedPct: -0.6, actualPct: -0.8, isDietBreak: false });
    expect(r.tone).toBe("on_track");
    expect(r.label).toBe("New target");
    expect(r.sentence).toContain("up 120 kcal to 2,120 kcal");
    expect(r.sentence).toContain("-0.8% vs your -0.6%");
  });
  it("decrease reads down", () => {
    const r = interpretAdjustment({ calorieDelta: -150, newCalories: 1850, expectedPct: -0.6, actualPct: -0.3, isDietBreak: false });
    expect(r.sentence).toContain("down 150 kcal to 1,850 kcal");
  });
  it("diet break is neutral maintenance", () => {
    const r = interpretAdjustment({ calorieDelta: 0, newCalories: 2400, expectedPct: null, actualPct: null, isDietBreak: true });
    expect(r.tone).toBe("neutral");
    expect(r.label).toBe("Diet break");
    expect(r.sentence).toContain("maintenance");
  });
  it("held with null pcts has no why line", () => {
    const r = interpretAdjustment({ calorieDelta: 0, newCalories: 2000, expectedPct: null, actualPct: null, isDietBreak: false });
    expect(r.sentence).toContain("held at 2,000 kcal");
    expect(r.sentence).not.toContain("vs your");
  });
});
