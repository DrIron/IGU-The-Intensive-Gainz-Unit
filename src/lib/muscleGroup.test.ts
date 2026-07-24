import { describe, it, expect } from "vitest";
import { muscleGroupLabel } from "./muscleGroup";

// Mirrors the live taxonomy (STEP-0): limbs = Legs/Arms → muscle name; torso → region name.
const TAXONOMY = {
  regions: [
    { id: "r-chest", display_name: "Chest" },
    { id: "r-back", display_name: "Back" },
    { id: "r-shoulders", display_name: "Shoulders" },
    { id: "r-arms", display_name: "Arms" },
    { id: "r-legs", display_name: "Legs" },
    { id: "r-core", display_name: "Core" },
  ],
  muscles: [
    { id: "m-pec", display_name: "Pec Major", primary_region_id: "r-chest" },
    { id: "m-delts", display_name: "Deltoids", primary_region_id: "r-shoulders" },
    { id: "m-lats", display_name: "Lats", primary_region_id: "r-back" },
    { id: "m-quads", display_name: "Quads", primary_region_id: "r-legs" },
    { id: "m-tri", display_name: "Triceps", primary_region_id: "r-arms" },
    { id: "m-bi", display_name: "Elbow Flexors", primary_region_id: "r-arms" },
    { id: "m-abs", display_name: "Rectus Abdominis", primary_region_id: "r-core" },
  ],
};

describe("muscleGroupLabel", () => {
  it("torso → the body-REGION name (never the anatomical muscle or a subdivision)", () => {
    expect(muscleGroupLabel("m-pec", "x", TAXONOMY)).toBe("Chest");    // not "Pec Major"
    expect(muscleGroupLabel("m-delts", "x", TAXONOMY)).toBe("Shoulders"); // not "Deltoids"
    expect(muscleGroupLabel("m-lats", "x", TAXONOMY)).toBe("Back");
    expect(muscleGroupLabel("m-abs", "x", TAXONOMY)).toBe("Core");
  });

  it("limbs → the friendly MUSCLE name", () => {
    expect(muscleGroupLabel("m-quads", "x", TAXONOMY)).toBe("Quads");
    expect(muscleGroupLabel("m-tri", "x", TAXONOMY)).toBe("Triceps");
  });

  it("aliases the anatomical 'Elbow Flexors' → 'Biceps'", () => {
    expect(muscleGroupLabel("m-bi", "x", TAXONOMY)).toBe("Biceps");
  });

  it("falls back to primary_muscle text when muscle_id is null / unknown / taxonomy missing", () => {
    expect(muscleGroupLabel(null, "Cardio", TAXONOMY)).toBe("Cardio");
    expect(muscleGroupLabel("m-nope", "Rear Delts", TAXONOMY)).toBe("Rear Delts");
    expect(muscleGroupLabel("m-quads", "Quadriceps", undefined)).toBe("Quadriceps");
  });
});
