// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * P4 — the coach/dietitian read view.
 *
 * The load-bearing assertion is the SAME one the RPC enforces server-side, restated at the UI:
 * a coach's rendered day carries NO micronutrient a coach may not see. The component does no
 * filtering of its own — it renders whatever `get_client_daily_nutrition` returned — so this
 * test drives the two shapes the RPC actually produces (coach vs dietitian payload) and pins
 * that the UI reflects each faithfully, plus that a failed read is NOT rendered as an empty day.
 */

let payload: unknown = null;
let shouldFail = false;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string) =>
      name === "get_client_daily_nutrition"
        ? Promise.resolve(shouldFail ? { data: null, error: new Error("boom") } : { data: payload, error: null })
        : Promise.resolve({ data: null, error: null }),
    // The day view now renders the P5a adherence card, which reads rollups + the target via
    // from(). This test is about the DAY view, not adherence — so return an empty week: the
    // card falls to its neutral "no food logged" note and adds no buttons of its own.
    from: () => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        gte: () => api,
        lte: () => api,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
      };
      return api;
    },
  },
}));
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
});

const { CoachFoodLogDay } = await import("./CoachFoodLogDay");

// What the RPC returns to a COACH: macros only, micros already stripped to coach-visible.
const COACH_PAYLOAD = {
  log_date: "2026-07-15",
  micros_included: false,
  totals: { kcal: 209, protein_g: 39, fat_g: 5, carb_g: 0 },
  target: { kcal: 2050, protein_g: 172, fat_g: 68, carb_g: 205 },
  entries: [
    {
      id: "e1", meal_slot: "lunch", food_name: "Chicken breast", quantity: 1, unit: "serving",
      quantity_g: 174, kcal: 209, protein_g: 39, fat_g: 5, carb_g: 0, portion_label: "1 breast",
      micros: { fiber: 0 },
    },
  ],
  day_micros: {}, // a coach's day_micros: fibre only, and here it's zero so nothing to show
};

// What the RPC returns to a DIETITIAN: the hidden micros are present.
const DIETITIAN_PAYLOAD = {
  ...COACH_PAYLOAD,
  micros_included: true,
  day_micros: { fiber: 8, sodium: 500, sugar: 12, iron: 2 },
};

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<CoachFoodLogDay clientUserId="client-1" />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return container;
}

describe("CoachFoodLogDay — role-shaped read", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    shouldFail = false;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("COACH payload: renders macros, and NO micronutrient panel / no hidden-nutrient text", async () => {
    payload = COACH_PAYLOAD;
    const el = await mount();

    // Macros are there.
    expect(el.textContent).toContain("Chicken breast");
    expect(el.textContent).toContain("209");

    // The micro panel is absent, and no hidden nutrient name appears ANYWHERE in the DOM.
    expect(el.querySelector("[data-micro-panel]")).toBeNull();
    expect(el.textContent).not.toContain("Micronutrients");
    for (const hidden of ["Sodium", "Sugars", "Iron", "Saturated fat", "Potassium", "Calcium", "Vitamin"]) {
      expect(el.textContent).not.toContain(hidden);
    }
  });

  it("DIETITIAN payload: renders the Micronutrients panel with the micros the RPC returned", async () => {
    payload = DIETITIAN_PAYLOAD;
    const el = await mount();

    const panel = el.querySelector("[data-micro-panel]");
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Micronutrients");
    expect(panel?.textContent).toContain("Sodium");
    expect(panel?.textContent).toContain("500");
    expect(panel?.textContent).toContain("Iron");
  });

  it("is READ-ONLY — no add/edit/delete affordance", async () => {
    payload = COACH_PAYLOAD;
    const el = await mount();

    // Only the date-nav arrows are buttons; there is no Add / kebab / options control.
    const labels = [...el.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(labels.every((l) => l === "Previous day" || l === "Next day" || l === "")).toBe(true);
    expect(el.textContent).not.toMatch(/\bAdd food\b/);
    expect(el.querySelector('[aria-label^="Options"]')).toBeNull();
  });

  it("a FAILED read renders LoadError, NEVER an empty day", async () => {
    shouldFail = true;
    const el = await mount();

    // The lie a coach could act on: "this client logged nothing today" when the read broke.
    // Scoped to the DAY view's own empty copy ("No food logged on <date>") — the sibling
    // adherence card legitimately uses "No food logged in the last 7 days" for its own week.
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.textContent).toContain("Couldn't load");
    expect(el.textContent).not.toContain("No food logged on");
  });

  it("a genuinely empty day says so — and it is NOT the error copy", async () => {
    payload = { ...COACH_PAYLOAD, entries: [], totals: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 }, day_micros: {} };
    const el = await mount();

    expect(el.textContent).toContain("No food logged");
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});
