import { describe, it, expect } from "vitest";
import {
  resolveParentMuscleId,
  VOLUME_KEY_ALIASES,
  MUSCLE_MAP,
  SUBDIVISION_MAP,
} from "./muscle-builder";

/**
 * Exercise-library rebuild (2026-07) — the new taxonomy's volume_keys must resolve to an existing
 * MEV/MRV landmark, or their sets count toward Total Sets but vanish from per-muscle volume (the
 * live-smoke gap: "Upper/Mid Back — Total Sets 6, Muscles=1"). These lock the aliasing.
 */
describe("volume_key aliasing (library rebuild)", () => {
  it("every alias target is a real MUSCLE_GROUPS landmark (so attribution actually lands)", () => {
    for (const [key, target] of Object.entries(VOLUME_KEY_ALIASES)) {
      expect(MUSCLE_MAP.has(target), `${key} -> ${target} must be a landmark`).toBe(true);
    }
  });

  it("the 4 rebuild volume_keys resolve to their nearest existing landmark", () => {
    expect(resolveParentMuscleId("upper_back")).toBe("upper_mid_back");
    expect(resolveParentMuscleId("biceps")).toBe("elbow_flexors");
    expect(resolveParentMuscleId("rectus_abdominis")).toBe("core");
    expect(resolveParentMuscleId("abs")).toBe("core");
    // and each of those targets is a landmark the volume loop will match
    for (const k of ["upper_back", "biceps", "rectus_abdominis", "abs"]) {
      expect(MUSCLE_MAP.has(resolveParentMuscleId(k))).toBe(true);
    }
  });

  it("existing landmark ids and real subdivisions are unchanged by the alias", () => {
    expect(resolveParentMuscleId("lats")).toBe("lats");
    expect(resolveParentMuscleId("core")).toBe("core");
    expect(resolveParentMuscleId("obliques")).toBe("obliques");
    expect(resolveParentMuscleId("elbow_flexors")).toBe("elbow_flexors");
    // a genuine subdivision still resolves to its parent
    expect(resolveParentMuscleId("pecs_sternal")).toBe("pecs");
    expect(resolveParentMuscleId("elbow_flexors_biceps_long")).toBe("elbow_flexors");
    expect(SUBDIVISION_MAP.has("pecs_sternal")).toBe(true);
  });

  it("multi-target Systemic/Powerlifting (NULL volume_key) stay OUT of per-muscle volume", () => {
    // Their muscles carry volume_key NULL; whatever id reaches the resolver, it must not land on a
    // landmark (so the volume loop skips it) while Total Sets still counts the slot elsewhere.
    for (const k of ["systemic", "powerlifting"]) {
      expect(resolveParentMuscleId(k)).toBe(k); // passthrough
      expect(MUSCLE_MAP.has(resolveParentMuscleId(k))).toBe(false); // not attributed
    }
  });
});
