// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * D7 hybrid — the phase form must PERSIST the adherence tolerance the coach picks. This drives
 * the real control (a preset Select) and asserts the value lands in the nutrition_phases write.
 */

let capturedUpdate: Record<string, unknown> | null = null;

function builder() {
  const api: Record<string, unknown> = {
    update: (p: Record<string, unknown>) => { capturedUpdate = p; return api; },
    insert: (p: Record<string, unknown>[]) => { capturedUpdate = p[0]; return api; },
    // Both the edit path (.update().eq()) and any read resolve cleanly.
    eq: () => Promise.resolve({ error: null }),
    select: () => api,
    order: () => api,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
  };
  return api;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => builder(),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "coach-1" } }, error: null }) },
  },
}));

const stableToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: stableToast }) }));

// Demographics supply the activity level; weight comes from the phase. That's enough for the
// weight×24 macro fallback to produce a valid target, so Save passes validation.
const STABLE_DEMOGRAPHICS = {
  age: null, gender: null, heightCm: null, latestWeightKg: 80, latestWeightLoggedAt: null,
  activityLevel: "1.55", latestBodyFatPercentage: null, isLoading: false,
};
vi.mock("@/hooks/useClientDemographics", () => ({
  useClientDemographics: () => STABLE_DEMOGRAPHICS,
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
});
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};
if (typeof window.PointerEvent === "undefined") {
  class PE extends MouseEvent { constructor(type: string, params: MouseEventInit = {}) { super(type, params); } }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PE;
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PE;
}
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
window.HTMLElement.prototype.setPointerCapture = vi.fn();

const { CoachNutritionGoal } = await import("./CoachNutritionGoal");

const PHASE = {
  id: "phase-1",
  phase_name: "Cut",
  start_date: "2026-07-01T00:00:00.000Z",
  goal_type: "fat_loss",
  starting_weight_kg: 80,
  target_weight_kg: 75,
  target_body_fat_percentage: null,
  weekly_rate_percentage: 0.75,
  protein_intake_g_per_kg: 2,
  fat_intake_percentage: 30,
  protein_based_on_ffm: false,
  diet_break_enabled: false,
  diet_break_frequency_weeks: null,
  diet_break_duration_weeks: null,
  coach_notes: "",
  adherence_tolerance_pct: 10, // Standard
};

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(
    <CoachNutritionGoal clientUserId="client-1" phase={PHASE} onPhaseUpdated={vi.fn()} />,
  ));
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return container;
}
const clickText = async (t: string) => {
  const el = [...document.body.querySelectorAll("button, [role='option']")].find(
    (b) => (b.textContent ?? "").trim() === t || (b.textContent ?? "").includes(t),
  ) as HTMLElement;
  await act(async () => {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("CoachNutritionGoal — adherence tolerance", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    capturedUpdate = null;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders the tolerance control, defaulting to the phase's value (Standard)", async () => {
    const el = await mount();
    const trigger = el.querySelector('[aria-label="Adherence tolerance"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain("Standard");
  });

  it("persists the chosen tolerance to adherence_tolerance_pct on save", async () => {
    await mount();

    // Open the tolerance Select and choose Strict (±5%).
    await clickText("Standard (±10% of target)");
    await clickText("Strict (±5% of target)");
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    // Update Phase.
    await clickText("Update Phase");
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    expect(capturedUpdate).not.toBeNull();
    expect(capturedUpdate?.adherence_tolerance_pct).toBe(5);
  });

  it("an unchanged edit round-trips the phase's existing tolerance (10)", async () => {
    await mount();
    await clickText("Update Phase");
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(capturedUpdate?.adherence_tolerance_pct).toBe(10);
  });
});
