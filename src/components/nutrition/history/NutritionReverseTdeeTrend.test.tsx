// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * NU2 component — degrade-safety, matching the rest of the History surface:
 *   - < 2 charted points → the chart's calm empty state (the ~2-weeks copy), never a spinner/banner
 *   - a failed read → empty, NOT an error banner
 * (The value + gate correctness live in reverseTdee.test.ts against the pure module.)
 */

let rollupRows: Array<Record<string, unknown>> = [];
let weightRows: Array<Record<string, unknown>> = [];
let failRead = false;

function tableData(table: string) {
  if (failRead) return { data: null, error: new Error("boom") };
  if (table === "food_log_daily_rollup") return { data: rollupRows, error: null };
  if (table === "weight_logs") return { data: weightRows, error: null };
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
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));

(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
});

const { NutritionReverseTdeeTrend } = await import("./NutritionReverseTdeeTrend");

const iso = (day: number) => `2026-06-${String(day).padStart(2, "0")}`;

let container: HTMLDivElement;
let root: Root;
async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<NutritionReverseTdeeTrend clientUserId="client-1" phases={[]} />));
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return container;
}

describe("NutritionReverseTdeeTrend", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    rollupRows = [];
    weightRows = [];
    failRead = false;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders the panel title always", async () => {
    const el = await mount();
    expect(el.textContent).toContain("Real energy expenditure (TDEE)");
  });

  it("sparse data (<2 charted points) → the calm ~2-weeks empty state, no spinner", async () => {
    // Only 3 logged days + clustered weigh-ins → gated out → 0 points.
    rollupRows = [1, 2, 3].map((d) => ({ log_date: iso(d), total_kcal: 2000 }));
    weightRows = [{ log_date: iso(1), weight_kg: 80 }, { log_date: iso(2), weight_kg: 80 }];
    const el = await mount();
    expect(el.textContent).toContain("Log calories and weigh-ins consistently for ~2 weeks");
    expect(el.querySelector(".animate-spin")).toBeNull();
  });

  it("a failed read → empty state, NEVER an error banner", async () => {
    failRead = true;
    const el = await mount();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).not.toContain("Couldn't load");
    expect(el.textContent).toContain("Log calories and weigh-ins consistently for ~2 weeks");
  });

  it("enough logged calories + weigh-ins → charts the trend (no empty copy)", async () => {
    rollupRows = Array.from({ length: 14 }, (_, i) => ({ log_date: iso(i + 1), total_kcal: 2000 }));
    weightRows = [
      { log_date: iso(1), weight_kg: 81 }, { log_date: iso(2), weight_kg: 80 }, { log_date: iso(3), weight_kg: 80 },
      { log_date: iso(12), weight_kg: 79 }, { log_date: iso(13), weight_kg: 79 }, { log_date: iso(14), weight_kg: 79 },
    ];
    const el = await mount();
    expect(el.textContent).not.toContain("Log calories and weigh-ins consistently for ~2 weeks");
  });
});
