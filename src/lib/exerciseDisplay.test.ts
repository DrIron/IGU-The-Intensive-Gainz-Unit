import { describe, it, expect } from "vitest";
import { getExerciseDisplayName } from "./exerciseDisplay";

/**
 * The coach/client label-binding contract: coach surfaces headline the dense `name`; client surfaces
 * headline the friendly `client_name`, falling back to `name` when it's null (older cardio/mobility/
 * warmup or deactivated rows may have none) so a client row never renders blank.
 */
describe("getExerciseDisplayName", () => {
  const ex = { name: "Glute Max BB Reverse Lunge (L)", client_name: "Glute Max Barbell Reverse Lunge" };

  it("coach → the dense `name`", () => {
    expect(getExerciseDisplayName(ex, "coach")).toBe("Glute Max BB Reverse Lunge (L)");
  });

  it("client → the friendly `client_name`", () => {
    expect(getExerciseDisplayName(ex, "client")).toBe("Glute Max Barbell Reverse Lunge");
  });

  it("client falls back to `name` when client_name is null / empty / whitespace", () => {
    expect(getExerciseDisplayName({ name: "Cardio Treadmill Running (M)", client_name: null }, "client")).toBe(
      "Cardio Treadmill Running (M)",
    );
    expect(getExerciseDisplayName({ name: "X", client_name: "" }, "client")).toBe("X");
    expect(getExerciseDisplayName({ name: "X", client_name: "   " }, "client")).toBe("X");
  });

  it("coach never falls back — `name` is always present and authoritative", () => {
    expect(getExerciseDisplayName({ name: "X", client_name: null }, "coach")).toBe("X");
  });
});
