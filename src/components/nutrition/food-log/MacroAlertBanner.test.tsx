// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * P5c banner — wellbeing under pressure. The banner is louder than a dot, so the tests pin
 * the ABSENCE of the bad state hardest:
 *   - it renders NOTHING on insufficient_data (never a nutrition warning off sparse data)
 *   - it renders NOTHING when the signal doesn't fire
 *   - its copy carries no failed/bad/poor/off-track shaming
 *   - its markup carries NO risk/destructive class — attention (amber) tone only
 */

let evaluation: unknown = null;
let rpcError = false;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string) =>
      name === "evaluate_loud_macro_alert"
        ? Promise.resolve(rpcError ? { data: null, error: new Error("boom") } : { data: evaluation, error: null })
        : Promise.resolve({ data: null, error: null }),
  },
}));
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));

const { MacroAlertBanner } = await import("./MacroAlertBanner");

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<MacroAlertBanner clientUserId="client-1" />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return container;
}

const banner = (el: HTMLElement) => el.querySelector("[data-macro-alert-banner]");

describe("MacroAlertBanner", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    evaluation = null;
    rpcError = false;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("FIRES protein_low: renders a calm banner naming the reason", async () => {
    evaluation = {
      fires: true,
      reasons: ["protein_low"],
      insufficient_data: false,
      calorie_deviation_pct: 0,
      protein_deviation_pct: -20,
    };
    const el = await mount();

    expect(banner(el)).not.toBeNull();
    expect(el.textContent).toContain("20% under target");
    expect(el.textContent?.toLowerCase()).toContain("protein");
    expect(el.textContent).toContain("check-in");
  });

  it("INSUFFICIENT DATA: renders NOTHING — no nutrition warning off sparse data", async () => {
    evaluation = {
      fires: false,
      reasons: [],
      insufficient_data: true,
      calorie_deviation_pct: null,
      protein_deviation_pct: null,
    };
    const el = await mount();
    expect(banner(el)).toBeNull();
    expect(el.textContent).toBe("");
  });

  it("does NOT fire: renders nothing", async () => {
    evaluation = {
      fires: false,
      reasons: [],
      insufficient_data: false,
      calorie_deviation_pct: 3,
      protein_deviation_pct: -2,
    };
    const el = await mount();
    expect(banner(el)).toBeNull();
  });

  it("attention tone ONLY — no risk/destructive class anywhere in the banner", async () => {
    evaluation = {
      fires: true,
      reasons: ["calories_high"],
      insufficient_data: false,
      calorie_deviation_pct: 25,
      protein_deviation_pct: 0,
    };
    const el = await mount();
    const b = banner(el) as HTMLElement;
    expect(b).not.toBeNull();
    // Loud ≠ alarming: amber attention, never red risk.
    expect(b.innerHTML).not.toMatch(/status-risk|destructive|bg-red|text-red/);
    expect(b.className).toMatch(/status-attention/);
  });

  it("copy carries no shaming vocabulary", async () => {
    evaluation = {
      fires: true,
      reasons: ["calories_low", "protein_low"],
      insufficient_data: false,
      calorie_deviation_pct: -22,
      protein_deviation_pct: -18,
    };
    const el = await mount();
    const text = (el.textContent ?? "").toLowerCase();
    for (const bad of ["failed", "fail", "bad", "poor", "off track", "off-track", "alert", "warning"]) {
      expect(text).not.toContain(bad);
    }
    // Both reasons are named, joined naturally.
    expect(text).toContain("under target");
    expect(text).toContain("and");
  });

  it("a failed evaluation renders nothing — never alarms the coach off an error", async () => {
    rpcError = true;
    const el = await mount();
    expect(banner(el)).toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});
