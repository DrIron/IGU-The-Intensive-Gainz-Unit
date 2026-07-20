import { describe, it, expect } from "vitest";
import { exerciseCategoryToActivityType, ACTIVITY_TYPE_COLORS, type ActivityType } from "./muscle-builder";
import { EXERCISE_CATEGORIES } from "@/lib/exerciseCategories";

/**
 * exerciseCategoryToActivityType maps every exercise_library.category onto the planning-board slot's
 * ActivityType (for the field editor + colour). Powerlifting → strength and systemic → cardio were
 * added so a picked powerlifting/systemic exercise no longer falls through to the default.
 */
describe("exerciseCategoryToActivityType", () => {
  it("maps powerlifting → strength and systemic → cardio", () => {
    expect(exerciseCategoryToActivityType("powerlifting")).toBe("strength");
    expect(exerciseCategoryToActivityType("systemic")).toBe("cardio");
  });

  it("maps the existing categories as before", () => {
    expect(exerciseCategoryToActivityType("strength")).toBe("strength");
    expect(exerciseCategoryToActivityType("cardio")).toBe("cardio");
    expect(exerciseCategoryToActivityType("mobility")).toBe("yoga_mobility");
    expect(exerciseCategoryToActivityType("warmup")).toBe("yoga_mobility");
    expect(exerciseCategoryToActivityType("cooldown")).toBe("recovery");
    expect(exerciseCategoryToActivityType("physio")).toBe("recovery");
    expect(exerciseCategoryToActivityType("sport_specific")).toBe("sport_specific");
  });

  it("every category in the shared source resolves to a real, colour-mapped ActivityType", () => {
    for (const { value } of EXERCISE_CATEGORIES) {
      const type: ActivityType = exerciseCategoryToActivityType(value);
      expect(ACTIVITY_TYPE_COLORS[type], value).toBeDefined();
    }
  });
});
