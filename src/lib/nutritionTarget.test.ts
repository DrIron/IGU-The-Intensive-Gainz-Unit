import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * getActiveNutritionTarget — the single TS home of the phase-first-then-goals coalesce.
 * #215 was one copy of this drifting; these tests pin the precedence and the resilience so a
 * future edit can't quietly reintroduce that bug.
 */

let phaseRow: Record<string, unknown> | null = null;
let goalRow: Record<string, unknown> | null = null;
let phaseError = false;

vi.mock("@/integrations/supabase/client", () => {
  const build = (table: string) => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: () =>
        Promise.resolve(
          table === "nutrition_phases"
            ? { data: phaseRow, error: phaseError ? new Error("boom") : null }
            : { data: goalRow, error: null },
        ),
    };
    return api;
  };
  return { supabase: { from: (t: string) => build(t) } };
});
const captureException = vi.fn();
vi.mock("@/lib/errorLogging", () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

const { getActiveNutritionTarget } = await import("./nutritionTarget");

const phase = { daily_calories: 2700, protein_grams: 135, fat_grams: 75, carb_grams: 371, goal_type: "muscle_gain" };
const goal = { daily_calories: 1900, protein_grams: 150, fat_grams: 60, carb_grams: 180, goal_type: "fat_loss" };

describe("getActiveNutritionTarget", () => {
  beforeEach(() => {
    phaseRow = null;
    goalRow = null;
    phaseError = false;
    captureException.mockClear();
  });

  it("PHASE WINS when both an active phase and an active goal exist", async () => {
    phaseRow = phase;
    goalRow = goal;
    const t = await getActiveNutritionTarget("u1");
    expect(t).toMatchObject({ kcal: 2700, protein: 135, fat: 75, carbs: 371, goalType: "muscle_gain", source: "phase" });
    expect(t?.raw).toBe(phase); // the untouched row, for callers that need more
  });

  it("uses the GOAL when there is no active phase", async () => {
    phaseRow = null;
    goalRow = goal;
    const t = await getActiveNutritionTarget("u1");
    expect(t).toMatchObject({ kcal: 1900, source: "goal", goalType: "fat_loss" });
  });

  it("null when neither source exists", async () => {
    expect(await getActiveNutritionTarget("u1")).toBeNull();
  });

  it("null when the phase has a non-positive daily_calories — and it does NOT swallow a valid goal", async () => {
    phaseRow = { ...phase, daily_calories: 0 };
    goalRow = goal;
    const t = await getActiveNutritionTarget("u1");
    // A zero-calorie phase is not a usable target; fall through to the goal rather than return it.
    expect(t?.source).toBe("goal");
    expect(t?.kcal).toBe(1900);
  });

  it("null when the goal's daily_calories is non-positive too", async () => {
    phaseRow = null;
    goalRow = { ...goal, daily_calories: null };
    expect(await getActiveNutritionTarget("u1")).toBeNull();
  });

  it("NEVER throws — a query error resolves to null and is logged", async () => {
    phaseError = true;
    const t = await getActiveNutritionTarget("u1");
    expect(t).toBeNull();
    expect(captureException).toHaveBeenCalledWith(expect.anything(), { source: "getActiveNutritionTarget" });
  });
});
