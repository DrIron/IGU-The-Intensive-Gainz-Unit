// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * P5b History & Trends — assert the ABSENCE of the shaming state, and degrade-safety:
 *   - an unlogged day is a hollow dot with no red/destructive class
 *   - loggedDays===0 in the window → neutral note, never a red band
 *   - no missed/failed/off-track copy on unlogged days
 *   - a read error leaves the slice empty (charts show their calm empty state), NOT a banner
 */

let rollupRows: Array<Record<string, unknown>> = [];
let phaseRows: Array<Record<string, unknown>> = [];
let goalRows: Array<Record<string, unknown>> = [];
let failRollup = false;

function tableData(table: string) {
  if (table === "food_log_daily_rollup") {
    return failRollup ? { data: null, error: new Error("boom") } : { data: rollupRows, error: null };
  }
  if (table === "nutrition_phases") return { data: phaseRows, error: null };
  if (table === "nutrition_goals") return { data: goalRows, error: null };
  return { data: [], error: null };
}

function builder(table: string) {
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    order: () => api,
    then: (resolve: (v: unknown) => unknown) => resolve(tableData(table)),
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));

// recharts needs ResizeObserver in jsdom.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
});

const { NutritionIntakeHistory } = await import("./NutritionIntakeHistory");

const iso = (daysAgo: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<NutritionIntakeHistory clientUserId="client-1" viewerRole="coach" />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  return container;
}

describe("NutritionIntakeHistory", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    rollupRows = [];
    phaseRows = [{ start_date: iso(60), phase_name: "Cut", daily_calories: 2000, protein_grams: 160, fat_grams: 60, carb_grams: 200 }];
    goalRows = [];
    failRollup = false;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("some logged, most not: unlogged dots carry NO red/destructive class", async () => {
    // 3 adherent days within the 56-day window; the rest of the 56 are unlogged.
    rollupRows = [
      { log_date: iso(5), total_kcal: 2000, total_protein_g: 160, total_fat_g: 60, total_carb_g: 200 },
      { log_date: iso(4), total_kcal: 1950, total_protein_g: 158, total_fat_g: 61, total_carb_g: 198 },
      { log_date: iso(3), total_kcal: 2050, total_protein_g: 162, total_fat_g: 59, total_carb_g: 202 },
    ];
    const el = await mount();

    const dots = [...el.querySelectorAll("[data-day-dot]")];
    expect(dots).toHaveLength(56);
    const notLogged = dots.filter((n) => n.getAttribute("data-day-dot") === "not_logged");
    expect(notLogged.length).toBe(53);
    for (const dot of notLogged) {
      expect(dot.className).not.toMatch(/status-risk|destructive|bg-red|text-red/);
    }
    expect(el.textContent).toContain("3/56 days logged");
    expect(el.textContent).toContain("100% on target when logged");
  });

  it("nothing logged in the window → neutral note, NOT a red band", async () => {
    rollupRows = [];
    const el = await mount();

    expect(el.querySelector("[data-empty-adherence]")).not.toBeNull();
    expect(el.textContent).toContain("No food logged in the last 8 weeks");
    expect(el.querySelectorAll("[data-day-dot]")).toHaveLength(0);
    expect(el.innerHTML).not.toMatch(/status-risk|destructive/);
  });

  it("no shaming copy is attached to unlogged days", async () => {
    rollupRows = [{ log_date: iso(2), total_kcal: 2000, total_protein_g: 160, total_fat_g: 60, total_carb_g: 200 }];
    const el = await mount();
    const text = (el.textContent ?? "").toLowerCase();
    expect(text).not.toContain("missed");
    expect(text).not.toContain("failed");
    expect(text).not.toContain("off track");
  });

  it("NEITHER phases nor goals → intake shown, adherence is neutral 'no target' (unchanged)", async () => {
    phaseRows = [];
    goalRows = [];
    rollupRows = [
      { log_date: iso(2), total_kcal: 2000, total_protein_g: 160, total_fat_g: 60, total_carb_g: 200 },
      { log_date: iso(1), total_kcal: 1900, total_protein_g: 150, total_fat_g: 55, total_carb_g: 190 },
    ];
    const el = await mount();

    expect(el.querySelector("[data-no-target]")).not.toBeNull();
    expect(el.textContent).toContain("2/56 days logged"); // logging still counted
    expect(el.textContent).not.toContain("on target when logged"); // no % without a target
    expect(el.textContent).not.toContain("Off track");
  });

  // ── The gap this PR closes ───────────────────────────────────────────────────
  it("REGRESSION: a goals-only client now gets a target + adherence (was neutral before)", async () => {
    phaseRows = []; // team-plan self-service: no coach phases
    goalRows = [{ start_date: iso(60), end_date: null, daily_calories: 2000, protein_grams: 160, fat_grams: 60, carb_grams: 200 }];
    rollupRows = [
      { log_date: iso(3), total_kcal: 2000, total_protein_g: 160, total_fat_g: 60, total_carb_g: 200 },
      { log_date: iso(2), total_kcal: 1980, total_protein_g: 158, total_fat_g: 61, total_carb_g: 198 },
      { log_date: iso(1), total_kcal: 2020, total_protein_g: 162, total_fat_g: 59, total_carb_g: 202 },
    ];
    const el = await mount();

    // The gap: it went from a neutral "no target" note to a real adherence readout.
    expect(el.querySelector("[data-no-target]")).toBeNull();
    expect(el.textContent).toContain("on target when logged");
    expect(el.textContent).toContain("3/56 days logged");
  });

  it("goals path renders NO phase bands (goals aren't phases)", async () => {
    phaseRows = [];
    goalRows = [{ start_date: iso(60), end_date: null, daily_calories: 2000, protein_grams: 160, fat_grams: 60, carb_grams: 200 }];
    rollupRows = [
      { log_date: iso(2), total_kcal: 2000, total_protein_g: 160, total_fat_g: 60, total_carb_g: 200 },
      { log_date: iso(1), total_kcal: 1950, total_protein_g: 158, total_fat_g: 61, total_carb_g: 198 },
    ];
    const el = await mount();
    // The chart's phase-legend swatches only render when phases are passed; a goals client
    // has none. (The phase name "Cut" from the default seed must not appear — we cleared it.)
    expect(el.textContent).not.toContain("Cut");
  });

  it("PRECEDENCE: a client with BOTH phases and goals uses the PHASE target, ignoring goals", async () => {
    // Phase says 2,000; goal says 1,500. If the phase wins, on-target logging reads 100%.
    phaseRows = [{ start_date: iso(60), phase_name: "Cut", daily_calories: 2000, protein_grams: 160, fat_grams: 60, carb_grams: 200 }];
    goalRows = [{ start_date: iso(60), end_date: null, daily_calories: 1500, protein_grams: 120, fat_grams: 45, carb_grams: 150 }];
    rollupRows = Array.from({ length: 5 }, (_, i) => ({
      log_date: iso(i + 1), total_kcal: 2000, total_protein_g: 160, total_fat_g: 60, total_carb_g: 200,
    }));
    const el = await mount();

    // On-target vs the 2,000 PHASE target → 100%. Against the 1,500 goal it'd read off-track.
    expect(el.textContent).toContain("100% on target when logged");
  });

  it("a failed rollup read degrades safely — charts show their empty state, NO error banner", async () => {
    failRollup = true;
    const el = await mount();

    // No alert/error banner anywhere.
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).not.toContain("Couldn't load");
    // The charts render their calm empty copy (< 2 points).
    expect(el.textContent).toMatch(/Not enough logged days yet/);
    // And the adherence panel is its neutral empty note, not a red band.
    expect(el.querySelector("[data-empty-adherence]")).not.toBeNull();
  });

  it("renders the two trend chart titles regardless (calories + macros)", async () => {
    rollupRows = [
      { log_date: iso(2), total_kcal: 2000, total_protein_g: 160, total_fat_g: 60, total_carb_g: 200 },
      { log_date: iso(1), total_kcal: 1900, total_protein_g: 150, total_fat_g: 55, total_carb_g: 190 },
    ];
    const el = await mount();
    expect(el.textContent).toContain("Calorie intake vs target");
    expect(el.textContent).toContain("Macro trends");
  });
});
