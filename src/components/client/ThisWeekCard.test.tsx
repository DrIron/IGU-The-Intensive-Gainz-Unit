// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ThisWeekCard (1B) — the merged weekly card. Tests pin the composition and, hardest, the
 * honesty guards carried from the three retired cards:
 *   - adherence % + consistency dots + stat row render from the hooks;
 *   - NO 0% ring when nothing is scheduled (the empty copy shows, the big % is absent);
 *   - the dots render nothing while the consistency read is loading OR errored (no fake week);
 *   - the weight-trend stat is hidden when there's no real weigh-in.
 */

// Controllable hook returns.
let adherence: {
  weeklyCompleted: number;
  weeklyScheduled: number;
  weeklyCompletionPct: number | null;
  modules: unknown[];
  loading: boolean;
};
let consistency: {
  loading: boolean;
  loadError: boolean;
  weekDates: string[];
  activeDates: Set<string>;
  activeCount: number;
};

// weight_logs rows for the internal useWeeklyBodyStats read. The trend query selects
// "weight_kg, log_date"; the nutrition-days query selects "log_date" — branch on that.
let weightRows: Array<{ weight_kg: number; log_date: string }> = [];
let dayRows: Array<{ log_date: string }> = [];

function builder() {
  let cols = "";
  const api: Record<string, unknown> = {
    select: (c: string) => {
      cols = c;
      return api;
    },
    eq: () => api,
    gte: () => api,
    lte: () => api,
    order: () => api,
    then: (resolve: (v: unknown) => unknown) =>
      resolve({ data: cols.includes("weight_kg") ? weightRows : dayRows, error: null }),
  };
  return api;
}

const navigateMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => builder() } }));
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));
vi.mock("@/hooks/useCanonicalWeeklyAdherence", () => ({
  useCanonicalWeeklyAdherence: () => adherence,
}));
vi.mock("@/hooks/useWeeklyConsistency", () => ({ useWeeklyConsistency: () => consistency }));

const { ThisWeekCard } = await import("./ThisWeekCard");

const WEEK = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12"];

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<ThisWeekCard userId="client-1" />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return container;
}

const dots = (el: HTMLElement) => el.querySelector('[role="list"]');

describe("ThisWeekCard", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    weightRows = [];
    dayRows = [];
    adherence = {
      weeklyCompleted: 3,
      weeklyScheduled: 4,
      weeklyCompletionPct: 75,
      modules: [],
      loading: false,
    };
    consistency = {
      loading: false,
      loadError: false,
      weekDates: WEEK,
      activeDates: new Set([WEEK[0], WEEK[2], WEEK[4]]),
      activeCount: 3,
    };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders the adherence %, the consistency dots, and the stat row", async () => {
    const el = await mount();

    expect(el.textContent).toContain("75%");
    expect(el.textContent).toContain("adherence");

    // 7 dots, 3 of them filled crimson; caption counts what happened.
    const list = dots(el)!;
    expect(list).not.toBeNull();
    const rendered = [...list.querySelectorAll('[role="listitem"] span[aria-hidden]')];
    expect(rendered).toHaveLength(7);
    expect(rendered.filter((d) => d.className.includes("bg-primary"))).toHaveLength(3);
    expect(el.textContent).toContain("3 active days this week");

    // Stat row. No weigh-in seeded -> the Weight stat is silent (honesty).
    expect(el.textContent).toContain("Workouts");
    expect(el.textContent).toContain("3/4");
    expect(el.textContent).toContain("Nutrition");
    expect(el.textContent).toContain("0/7");
    expect(el.textContent).not.toContain("Weight");
  });

  it("shows NO 0% ring when nothing is scheduled — the empty copy replaces it", async () => {
    adherence = { ...adherence, weeklyCompleted: 0, weeklyScheduled: 0, weeklyCompletionPct: null };
    const el = await mount();

    expect(el.textContent).toContain("No workouts scheduled this week yet");
    // The punishing headline never appears, and neither does a Workouts 0/0 line.
    expect(el.textContent).not.toContain("%");
    expect(el.textContent).not.toContain("Workouts");
    // Nutrition still shows; dots still render (that read succeeded).
    expect(el.textContent).toContain("Nutrition");
    expect(dots(el)).not.toBeNull();
  });

  it("renders NO consistency dots while the read is loading (no fabricated week)", async () => {
    consistency = { ...consistency, loading: true };
    const el = await mount();

    expect(dots(el)).toBeNull();
    // The rest of the card still renders — only the dots are withheld.
    expect(el.textContent).toContain("75%");
  });

  it("renders NO consistency dots on a read error (no fabricated week)", async () => {
    consistency = { ...consistency, loadError: true };
    const el = await mount();

    expect(dots(el)).toBeNull();
    expect(el.textContent).toContain("75%");
  });

  it("hides the weight-trend stat when there is no real weigh-in", async () => {
    // Empty weight rows -> computeSmoothedWeeklyTrend returns null -> the stat is omitted.
    weightRows = [];
    const el = await mount();
    expect(el.textContent).not.toContain("Weight");
  });
});
