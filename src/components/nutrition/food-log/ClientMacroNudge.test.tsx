// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * P5c-client nudge — the most tone-sensitive copy in the arc. The tests pin the ABSENCE of the
 * harmful message hardest of all:
 *   - a calories_HIGH fire renders NOTHING (the client never gets an automated "you ate too much")
 *   - the copy carries no shaming/judgemental vocabulary
 *   - the protein line is additive, the calories line is fuel-forward
 *   - it never appears on sparse data or a past date
 */

let evaluation: unknown = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string) =>
      name === "evaluate_loud_macro_alert"
        ? Promise.resolve({ data: evaluation, error: null })
        : Promise.resolve({ data: null, error: null }),
  },
}));
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));

const { ClientMacroNudge } = await import("./ClientMacroNudge");

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<ClientMacroNudge clientUserId="client-1" />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return container;
}

const nudge = (el: HTMLElement) => el.querySelector("[data-client-macro-nudge]");
const fire = (reasons: string[]) => ({ fires: true, reasons, insufficient_data: false });

describe("ClientMacroNudge", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    evaluation = null;
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders on protein_low with the additive copy", async () => {
    evaluation = fire(["protein_low"]);
    const el = await mount();

    expect(nudge(el)).not.toBeNull();
    expect(el.textContent).toContain("protein source");
    expect(el.textContent).toContain("Adding");
    expect(el.textContent).toContain("Your coach can help you dial it in");
  });

  it("renders on calories_low with the fuel-forward copy (never praises eating less)", async () => {
    evaluation = fire(["calories_low"]);
    const el = await mount();

    expect(nudge(el)).not.toBeNull();
    expect(el.textContent?.toLowerCase()).toContain("fuel");
    // It must not congratulate a deficit.
    expect(el.textContent?.toLowerCase()).not.toContain("great job");
    expect(el.textContent?.toLowerCase()).not.toContain("well done");
  });

  it("SUPPRESSES a calories_high-only fire — the client never sees an over-eating callout", async () => {
    evaluation = fire(["calories_high"]);
    const el = await mount();

    // The load-bearing wellbeing assertion of the whole slice.
    expect(nudge(el)).toBeNull();
    expect(el.textContent).toBe("");
  });

  it("with calories_high AND protein_low, shows ONLY the protein line — never the over-eating one", async () => {
    evaluation = fire(["calories_high", "protein_low"]);
    const el = await mount();

    expect(nudge(el)).not.toBeNull();
    expect(el.textContent).toContain("protein source");
    // No over-eating language leaks in from the coach-only reason.
    const text = (el.textContent ?? "").toLowerCase();
    expect(text).not.toContain("over target");
    expect(text).not.toContain("too much");
  });

  it("leads with protein when both additive reasons fire", async () => {
    evaluation = fire(["calories_low", "protein_low"]);
    const el = await mount();
    const text = el.textContent ?? "";
    expect(text.indexOf("protein source")).toBeGreaterThan(-1);
    expect(text.indexOf("protein source")).toBeLessThan(text.indexOf("fuel"));
  });

  it("renders nothing on insufficient_data or when nothing fires", async () => {
    evaluation = { fires: false, reasons: [], insufficient_data: true };
    let el = await mount();
    expect(nudge(el)).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    evaluation = { fires: false, reasons: [], insufficient_data: false };
    el = await mount();
    expect(nudge(el)).toBeNull();
  });

  it("copy carries no shaming/judgemental vocabulary", async () => {
    evaluation = fire(["protein_low", "calories_low"]);
    const el = await mount();
    const text = (el.textContent ?? "").toLowerCase();
    for (const bad of ["failed", "fail", "bad", "poor", "off track", "off-track", "too much", "overate", "should", "warning", "alert"]) {
      expect(text).not.toContain(bad);
    }
  });

  it("supportive tone only — no destructive/risk/alarm class", async () => {
    evaluation = fire(["protein_low"]);
    const el = await mount();
    const n = nudge(el) as HTMLElement;
    expect(n.innerHTML).not.toMatch(/status-risk|status-attention|destructive|bg-red|bg-amber|text-red/);
    // Soft brand wash instead.
    expect(n.className).toMatch(/bg-primary\/5/);
  });

  it("dismiss hides it, and the dismissal persists for the day", async () => {
    evaluation = fire(["protein_low"]);
    const el = await mount();
    const btn = el.querySelector('button[aria-label="Dismiss this note"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();

    await act(async () => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(nudge(el)).toBeNull();

    // Re-mount for the same day + reason: it stays dismissed (persisted in localStorage).
    await act(async () => root.unmount());
    root = createRoot(container);
    const el2 = await mount();
    expect(nudge(el2)).toBeNull();
  });
});
