// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * P5a adherence card — the tests pin the ABSENCE of the shaming state:
 *   - a not-logged day carries no red/destructive class
 *   - an empty week renders a neutral note, NOT an off-track band
 *   - the markup never attaches missed/failed/off-track to an unlogged day
 */

// One row per date the hook queries. Keyed by the mocked "table" the builder is asked for.
let rollupRows: Array<Record<string, unknown>> = [];
let phaseRow: Record<string, unknown> | null = null;
let goalRow: Record<string, unknown> | null = null;
let failRollup = false;

function builder(table: string) {
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    gte: () => api,
    lte: () => api,
    order: () => api, // getActiveNutritionTarget chains .order().limit() now
    limit: () => api,
    maybeSingle: () =>
      Promise.resolve({
        data: table === "nutrition_phases" ? phaseRow : table === "nutrition_goals" ? goalRow : null,
        error: null,
      }),
    then: (resolve: (v: unknown) => unknown) =>
      resolve(
        table === "food_log_daily_rollup"
          ? { data: failRollup ? null : rollupRows, error: failRollup ? new Error("boom") : null }
          : { data: [], error: null },
      ),
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));

const { FoodLogAdherenceCard } = await import("./FoodLogAdherenceCard");

const END = new Date("2026-07-15T12:00:00Z");
const d = (offsetFromEnd: number) => {
  const dt = new Date(END);
  dt.setDate(dt.getDate() - offsetFromEnd);
  return dt.toISOString().slice(0, 10);
};

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<FoodLogAdherenceCard clientUserId="client-1" endDate={END} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return container;
}

describe("FoodLogAdherenceCard", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    rollupRows = [];
    phaseRow = { daily_calories: 2000, protein_grams: 160, fat_grams: 60, carb_grams: 200 };
    goalRow = null;
    failRollup = false;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("some logged, some not: the not-logged dots carry NO red/destructive class", async () => {
    // 3 adherent logged days, 4 unlogged.
    rollupRows = [
      { log_date: d(6), total_kcal: 2000, total_protein_g: 160, total_fat_g: 60, total_carb_g: 200 },
      { log_date: d(5), total_kcal: 1950, total_protein_g: 158, total_fat_g: 61, total_carb_g: 198 },
      { log_date: d(4), total_kcal: 2050, total_protein_g: 162, total_fat_g: 59, total_carb_g: 202 },
    ];
    const el = await mount();

    const dots = [...el.querySelectorAll("[data-day-dot]")];
    expect(dots).toHaveLength(7);
    const notLogged = dots.filter((n) => n.getAttribute("data-day-dot") === "not_logged");
    expect(notLogged).toHaveLength(4);
    for (const dot of notLogged) {
      // The guardrail: an unlogged day is hollow, never a red/destructive fill.
      expect(dot.className).not.toMatch(/status-risk|destructive|bg-red|text-red/);
    }
    // "3/7 days logged" — consistency, kept separate from the headline.
    expect(el.textContent).toContain("3/7 days logged");
    // The headline is the on-target verdict for the logged days, not a red one.
    expect(el.textContent).toContain("On target");
  });

  it("an EMPTY week renders a neutral note, NOT an off-track band", async () => {
    rollupRows = [];
    const el = await mount();

    expect(el.querySelector("[data-empty-adherence]")).not.toBeNull();
    expect(el.textContent).toContain("No food logged in the last 7 days");
    // No band pill, no red anywhere.
    expect(el.textContent).not.toContain("Off track");
    expect(el.innerHTML).not.toMatch(/status-risk|destructive/);
    expect(el.querySelectorAll("[data-day-dot]")).toHaveLength(0);
  });

  it("no shaming copy is EVER attached to unlogged days", async () => {
    rollupRows = [{ log_date: d(6), total_kcal: 2000, total_protein_g: 160, total_fat_g: 60, total_carb_g: 200 }];
    const el = await mount();
    const text = (el.textContent ?? "").toLowerCase();
    expect(text).not.toContain("missed");
    expect(text).not.toContain("failed");
    expect(text).not.toContain("skipped");
    // "1/7 days logged" is the only framing of the 6 unlogged days.
    expect(el.textContent).toContain("1/7 days logged");
  });

  it("logged but NO target → neutral 'no target' note, not a verdict", async () => {
    phaseRow = null;
    goalRow = null;
    rollupRows = [
      { log_date: d(6), total_kcal: 2000, total_protein_g: 160, total_fat_g: 60, total_carb_g: 200 },
      { log_date: d(5), total_kcal: 1800, total_protein_g: 150, total_fat_g: 55, total_carb_g: 190 },
    ];
    const el = await mount();

    expect(el.querySelector("[data-no-target]")).not.toBeNull();
    expect(el.textContent).toContain("2/7 days logged"); // consistency still shown
    expect(el.textContent).not.toContain("Off track");
    // No macro chips without a target to measure against.
    expect(el.querySelectorAll("[data-macro-chip]")).toHaveLength(0);
  });

  it("a genuinely over-target week DOES read off track (the signal is real)", async () => {
    rollupRows = Array.from({ length: 5 }, (_, i) => ({
      log_date: d(i),
      total_kcal: 2800, total_protein_g: 160, total_fat_g: 90, total_carb_g: 300,
    }));
    const el = await mount();
    expect(el.textContent).toContain("Off track");
    expect(el.querySelector('[data-day-dot="off_track"]')).not.toBeNull();
  });

  it("a failed rollup read renders LoadError, never a neutral empty week", async () => {
    failRollup = true;
    const el = await mount();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.textContent).toContain("Couldn't load");
    expect(el.textContent).not.toContain("No food logged in the last 7 days");
  });
});
