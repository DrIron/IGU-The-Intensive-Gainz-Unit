// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * WK10-a picker — the pick step in isolation. It must:
 *   - list the coach's own templates
 *   - filter by the search box once the library is long
 *   - fire onPick(programId, programTitle) and close on a pick (NO assignment here)
 */

let templateRows: Array<Record<string, unknown>> = [];

// Chain: from().select().eq().order()  → resolves. Only .order() is awaited.
const builder = {
  select: () => builder,
  eq: () => builder,
  order: () => Promise.resolve({ data: templateRows, error: null }),
};
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => builder } }));
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));

// Radix Dialog needs matchMedia (via useIsMobile) — default to desktop (Dialog, not Drawer).
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
});
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};

const { AssignProgramPicker } = await import("./AssignProgramPicker");

let container: HTMLDivElement;
let root: Root;
const onPick = vi.fn();
const onOpenChange = vi.fn();

async function mount(open = true): Promise<void> {
  await act(async () => {
    root.render(
      <AssignProgramPicker open={open} onOpenChange={onOpenChange} coachUserId="coach-1" onPick={onPick} />,
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

// Radix Dialog portals to document.body, so query there.
const byLabel = (label: string) => document.body.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;

describe("AssignProgramPicker", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    templateRows = [];
    onPick.mockClear();
    onOpenChange.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("lists the coach's templates", async () => {
    templateRows = [
      { id: "p1", title: "Hypertrophy Block", level: "intermediate", tags: ["push", "pull"] },
      { id: "p2", title: "Strength Base", level: null, tags: [] },
    ];
    await mount();
    expect(document.body.textContent).toContain("Hypertrophy Block");
    expect(document.body.textContent).toContain("Strength Base");
  });

  it("picking a template fires onPick(id, title) and closes — it does NOT assign", async () => {
    templateRows = [{ id: "p1", title: "Hypertrophy Block", level: "advanced", tags: [] }];
    await mount();

    const card = byLabel("Assign Hypertrophy Block");
    expect(card).not.toBeNull();
    await act(async () => card!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onPick).toHaveBeenCalledWith("p1", "Hypertrophy Block");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a search box only once the library is long, and it filters", async () => {
    templateRows = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`, title: i === 0 ? "Hypertrophy Block" : `Program ${i}`, level: null, tags: [],
    }));
    await mount();

    const search = document.body.querySelector('input[placeholder="Search programs..."]') as HTMLInputElement;
    expect(search).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "hyper");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(byLabel("Assign Hypertrophy Block")).not.toBeNull();
    expect(byLabel("Assign Program 1")).toBeNull();
  });

  it("empty library shows the calm empty note, no cards", async () => {
    templateRows = [];
    await mount();
    expect(document.body.textContent).toContain("no program templates yet");
    expect(document.body.querySelector('[aria-label^="Assign "]')).toBeNull();
  });
});
