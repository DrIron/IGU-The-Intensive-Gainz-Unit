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

  // Client workout player (WorkoutSessionV2) — every exercise headline (overview list, focus card,
  // swap dialog + candidate rows, completion/summary, and the "Switched to …" toast) routes through
  // this helper with "client", so a client sees the friendly label, never the coach shorthand.
  it("client player headlines the friendly name, and the swap-toast path falls back when null", () => {
    const rhomboidRow = { name: "Rhomboids M Close Grip Chest-Supported Row (S)", client_name: "Chest-Supported Row" };
    expect(getExerciseDisplayName(rhomboidRow, "client")).toBe("Chest-Supported Row");
    // A swapped-to row with no client_name (older cardio/mobility) still reads a real name in the toast.
    expect(getExerciseDisplayName({ name: "Cardio Rower (M)", client_name: null }, "client")).toBe("Cardio Rower (M)");
  });
});
