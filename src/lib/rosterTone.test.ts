import { describe, it, expect } from "vitest";
import { rosterTone } from "./rosterTone";

const base = {
  profileStatus: "active",
  subscriptionStatus: "active",
  paymentFailedAt: null as string | null,
  daysSinceCheckIn: 1 as number | null,
};

describe("rosterTone (RO1/CO5 §2c)", () => {
  it("payment failure => risk (recovery-cleared, so safe to key on)", () =>
    expect(rosterTone({ ...base, paymentFailedAt: "2026-01-01T00:00:00Z" })).toBe("risk"));
  it("inactive subscription => risk", () =>
    expect(rosterTone({ ...base, subscriptionStatus: "inactive" })).toBe("risk"));
  it("inactive profile => risk", () =>
    expect(rosterTone({ ...base, profileStatus: "inactive" })).toBe("risk"));
  it("7d+ quiet => risk", () => expect(rosterTone({ ...base, daysSinceCheckIn: 9 })).toBe("risk"));
  it("4-6d quiet => attention", () => expect(rosterTone({ ...base, daysSinceCheckIn: 5 })).toBe("attention"));
  it("pending approval => attention", () =>
    expect(rosterTone({ ...base, profileStatus: "pending_coach_approval" })).toBe("attention"));
  it("recent check-in => on_track", () => expect(rosterTone({ ...base, daysSinceCheckIn: 2 })).toBe("on_track"));
  it("active but never checked in => neutral", () =>
    expect(rosterTone({ ...base, daysSinceCheckIn: null })).toBe("neutral"));
  it("status precedence: pending beats a recent check-in", () =>
    expect(rosterTone({ ...base, profileStatus: "pending_payment", daysSinceCheckIn: 1 })).toBe("attention"));
  it("risk precedence: payment failure beats a recent check-in", () =>
    expect(rosterTone({ ...base, paymentFailedAt: "2026-01-01T00:00:00Z", daysSinceCheckIn: 1 })).toBe("risk"));
});
