import { describe, it, expect } from "vitest";
import { EXERCISE_CATEGORIES, ALL_CATEGORY } from "./exerciseCategories";

/**
 * The single source of truth for exercise_library.category. Both the library browse (ExerciseBrowse)
 * and the planning-board picker (UnifiedSessionPicker) derive their category lists from this, so the
 * F2 drift (powerlifting/systemic missing from muscle-plan creation) can't recur.
 */
describe("EXERCISE_CATEGORIES", () => {
  const values = EXERCISE_CATEGORIES.map((c) => c.value);

  it("includes powerlifting and systemic (the categories that had drifted out of the picker)", () => {
    expect(values).toContain("powerlifting");
    expect(values).toContain("systemic");
  });

  it("is the full enum in display order", () => {
    expect(values).toEqual([
      "strength", "cardio", "mobility", "physio", "warmup",
      "cooldown", "sport_specific", "systemic", "powerlifting",
    ]);
  });

  it("ALL_CATEGORY is the 'all' pseudo-category (browse-only, not part of the real list)", () => {
    expect(ALL_CATEGORY.value).toBe("all");
    expect(values).not.toContain("all");
  });
});
