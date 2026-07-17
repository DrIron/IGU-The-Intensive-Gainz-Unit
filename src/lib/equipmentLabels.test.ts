import { describe, it, expect } from "vitest";
import { equipmentLabel } from "./equipmentLabels";

describe("equipmentLabel", () => {
  it("maps the terse codes to friendly labels", () => {
    expect(equipmentLabel("BB")).toBe("Barbell");
    expect(equipmentLabel("DB")).toBe("Dumbbell");
    expect(equipmentLabel("SM")).toBe("Smith Machine");
    expect(equipmentLabel("BW")).toBe("Bodyweight");
    expect(equipmentLabel("TB")).toBe("Trap Bar");
  });

  it("collapses every C-* cable subtype to 'Cable'", () => {
    expect(equipmentLabel("C-FT")).toBe("Cable");
    expect(equipmentLabel("C-AA")).toBe("Cable");
    expect(equipmentLabel("C-SG")).toBe("Cable");
    expect(equipmentLabel("C")).toBe("Cable");
  });

  it("passes already-friendly values through, and falls back to the raw code", () => {
    expect(equipmentLabel("Assault Bike")).toBe("Assault Bike");
    expect(equipmentLabel("Treadmill")).toBe("Treadmill");
    expect(equipmentLabel("ZZ")).toBe("ZZ");
    expect(equipmentLabel(null)).toBe("");
    expect(equipmentLabel(undefined)).toBe("");
  });
});
