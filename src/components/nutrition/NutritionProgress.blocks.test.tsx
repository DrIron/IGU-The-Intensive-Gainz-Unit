// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

/**
 * NOTE: act() is deliberately NOT used in this file.
 *
 * `act()` waits for the render tree to fully quiesce, and NutritionProgress's first mount in
 * jsdom never gets there — it hangs indefinitely, while every mount after it settles in
 * ~120ms. Chasing that down (it is not module-import cost, and not withTimeout) is a rabbit
 * hole that has nothing to do with what this test is for.
 *
 * So: render, then POLL the DOM until the content we care about is on screen, with a real
 * deadline. That asserts against exactly the same rendered output — it just doesn't require
 * the tree to go completely quiet first.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

/**
 * PARITY — NutritionProgress after the Part IV donut conversion (surface 4/4).
 *
 * This file is the ONLY one where the two rulings live side by side, and the whole point of
 * the test is that they must NOT drift into each other:
 *
 *   BLOCK A — "Your plan just updated" (the adjustment nudge)   -> KEEPS the ribbon.
 *             A transient notification. A donut turns a nudge into a panel and pushes the
 *             plain-language sentence — the actual payload — down the card.
 *
 *   BLOCK B — the goal-summary card                              -> CONVERTS to the donut.
 *             It was a 4-col Calories/Protein/Fat/Carbs grid with a ribbon underneath: the
 *             same fact stated twice, once as numbers and once as a bar. The identical
 *             redundancy NutritionTargetsCard was convicted of.
 *
 * The failure mode this guards is a later pass "finishing the job" and converting Block A
 * too — or a careless edit deleting Block A's ribbon along with Block B's. Both blocks are
 * asserted to be exactly what they are, in the same render.
 */

const GOAL = {
  id: "g1",
  phase_name: "Summer Cut",
  daily_calories: 2000,
  protein_grams: 170,
  fat_grams: 60,
  carb_grams: 200,
  protein_intake_g_per_kg: 2,
  fat_intake_percentage: 30,
  protein_based_on_ffm: false,
  starting_weight_kg: 85,
  target_weight_kg: 78,
  body_fat_percentage: 20,
  goal_type: "fat_loss",
  weekly_rate_percentage: 0.75,
  estimated_duration_weeks: 12,
  start_date: "2026-06-23",
  is_active: true,
};

// One weekly_progress row => Block A ("Your plan just updated") renders.
const PROGRESS = [
  {
    id: "w1",
    goal_id: "g1",
    week_number: 3,
    new_daily_calories: 1950,
    is_diet_break_week: false,
    average_weight_kg: 82.1,
    actual_change_percentage: -0.9,
  },
];

vi.mock("@/integrations/supabase/client", () => {
  const table = (name: string) => {
    const rows = name === "nutrition_goals" ? [GOAL] : name === "weekly_progress" ? PROGRESS : [];
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "maybeSingle")
            return () => Promise.resolve({ data: rows[0] ?? null, error: null });
          if (prop === "then") return (r: (v: unknown) => unknown) => r({ data: rows, error: null });
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  return { supabase: { from: (n: string) => table(n) } };
});
vi.mock("@/hooks/useAuthSession", () => ({
  useAuthSession: () => ({ user: { id: "client-1" }, isLoading: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
});
window.HTMLElement.prototype.scrollIntoView = vi.fn();
// The trend graphs below the two blocks are recharts, which needs ResizeObserver; jsdom has none.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { NutritionProgress } = await import("./NutritionProgress");

let container: HTMLDivElement;
let root: Root;

/** Render, then wait until the goal-summary card has actually painted. */
async function mount(): Promise<HTMLDivElement> {
  root.render(<NutritionProgress />);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
    // Both blocks are downstream of the same load, so the donut is a sound "ready" signal.
    if (container.querySelector('[aria-label="Macro calorie split"]')) break;
  }
  return container;
}

describe("NutritionProgress — the two blocks are ruled differently, and must stay that way", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    root.unmount();
    container.remove();
    vi.clearAllMocks();
  });

  it("BLOCK A keeps its ribbon — the nudge stays a nudge", async () => {
    const el = await mount();
    const text = el.textContent ?? "";

    expect(text.includes("Your plan just updated")).toBe(true);
    // The ribbon renders role="img" with a "Macro split: …" label. It must still be here.
    expect(el.querySelectorAll('[aria-label^="Macro split"]').length).toBe(1);

    // ...and the plain-language sentence — the payload — is still visible with it.
    expect(/calories|protein|muscle|planned/i.test(text)).toBe(true);
  });

  it("BLOCK B converted — one donut, and the redundant 4-col grid is gone", async () => {
    const el = await mount();

    // The summary's ring.
    const donuts = el.querySelectorAll('[aria-label="Macro calorie split"]');
    expect(donuts.length).toBe(1);

    // The grid it replaced.
    expect(el.querySelector(".grid.grid-cols-2.md\\:grid-cols-4")).toBeNull();

    // Grams AND % — neither the grid nor the ribbon ever showed the %.
    expect(el.querySelector('[data-macro-grams="protein"]')).not.toBeNull();
    expect(el.textContent).toMatch(/\d+%/);
    expect(el.textContent).toContain("kcal · daily target");
  });

  it("EXACTLY one ribbon and EXACTLY one donut — the blocks did not converge", async () => {
    const el = await mount();

    // If a later pass "finishes the job" on Block A, this goes to 0 ribbons / 2 donuts.
    // If someone deletes Block A's ribbon with Block B's, this goes to 0 / 1.
    expect(el.querySelectorAll('[aria-label^="Macro split"]').length).toBe(1);
    expect(el.querySelectorAll('[aria-label="Macro calorie split"]').length).toBe(1);
  });

  it("KEEPS the goal-summary chrome around the converted block", async () => {
    const el = await mount();

    expect(el.textContent).toContain("Summer Cut"); // phase header
    expect(el.textContent).toContain("Edit targets"); // the action
    expect(el.textContent).toMatch(/Week \d+ of \d+/); // week counter
    expect(el.textContent).toContain("Weight Progress"); // the progress bars below
  });

  it("Block B shows the CURRENT (adjusted) calories, not the original goal", async () => {
    const el = await mount();
    // latestProgress.new_daily_calories = 1950 supersedes goal.daily_calories = 2000.
    // The conversion must not have quietly re-pointed the summary at the stale figure.
    expect(el.textContent).toContain("1,950");
  });
});
