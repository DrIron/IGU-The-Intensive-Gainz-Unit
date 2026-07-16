import { describe, it, expect } from "vitest";
import { getLoadColor, getLoadTextColor } from "./statusUtils";

/**
 * FU1 — the coach-load colors are tokenized onto the shared status-* system (theme-aware; the
 * raw bg-green-500/amber-500 had no dark variants). Behaviour is unchanged per band; the tests
 * pin BOTH the new token AND the absence of the old raw colours.
 *
 * Bands: >100 → risk · ≥70 → attention · else ontrack · null → muted.
 */

describe("getLoadColor — status-* tokens per band", () => {
  it("maps each band to its status token", () => {
    expect(getLoadColor(null)).toBe("bg-muted");
    expect(getLoadColor(120)).toBe("bg-status-risk"); // >100 over capacity
    expect(getLoadColor(101)).toBe("bg-status-risk"); // just over
    expect(getLoadColor(100)).toBe("bg-status-attention"); // 100 is not >100 → attention
    expect(getLoadColor(70)).toBe("bg-status-attention"); // >=70
    expect(getLoadColor(69)).toBe("bg-status-ontrack");
    expect(getLoadColor(0)).toBe("bg-status-ontrack");
  });

  it("no longer returns the raw green/amber/destructive classes (theme-broken)", () => {
    for (const v of [null, 0, 50, 70, 100, 120]) {
      const c = getLoadColor(v);
      expect(c).not.toMatch(/bg-(green|amber)-\d+/);
      expect(c).not.toBe("bg-destructive");
    }
  });
});

describe("getLoadTextColor — status-* tokens per band", () => {
  it("maps each band to its status token", () => {
    expect(getLoadTextColor(null)).toBe("text-muted-foreground");
    expect(getLoadTextColor(120)).toBe("text-status-risk");
    expect(getLoadTextColor(100)).toBe("text-status-attention");
    expect(getLoadTextColor(70)).toBe("text-status-attention");
    expect(getLoadTextColor(69)).toBe("text-status-ontrack");
    expect(getLoadTextColor(0)).toBe("text-status-ontrack");
  });

  it("no longer returns the raw green/amber/destructive classes", () => {
    for (const v of [null, 0, 50, 70, 100, 120]) {
      const c = getLoadTextColor(v);
      expect(c).not.toMatch(/text-(green|amber)-\d+/);
      expect(c).not.toBe("text-destructive");
    }
  });
});
