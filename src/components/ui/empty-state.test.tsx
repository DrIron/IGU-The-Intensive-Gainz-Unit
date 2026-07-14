// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmptyState } from "./empty-state";
import { LoadError } from "./load-error";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no matchMedia; useIsMobile needs it.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

/**
 * CC8 + RO5 guard.
 *
 * The load-bearing assertion here is the SPLIT: `EmptyState` means "there is genuinely
 * nothing", `LoadError` means "we failed to find out". Conflating them is the CC10 lie
 * — and converting an error fallback into a prettier EmptyState would have made that
 * lie MORE convincing, not less.
 *
 * Both learn tabs conflated them before this PR:
 *   - ExercisesTab destructured only { data, isLoading }, so a query error rendered
 *     rows=[] -> the empty state ("No exercises found").
 *   - VideosTab caught the error, logged it, and fell into `videos.length === 0` ->
 *     "Videos are coming soon" — telling a client a fact we never established.
 */

let rows: unknown[] = [];
let shouldFail = false;

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown) =>
              resolve(
                shouldFail
                  ? { data: null, error: new Error("network down") }
                  : { data: rows, error: null },
              );
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  return { supabase: { from: () => builder() } };
});
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));

let container: HTMLDivElement;
let root: Root;

async function mount(ui: React.ReactElement): Promise<HTMLDivElement> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return container;
}

/** EmptyState renders an icon + title; LoadError renders role="alert" + "Couldn't load". */
const isEmptyState = (el: HTMLElement) =>
  el.querySelector('[role="alert"]') === null && (el.textContent ?? "").length > 0;
const isLoadError = (el: HTMLElement) =>
  el.querySelector('[role="alert"]') !== null && (el.textContent ?? "").includes("Couldn't load");

describe("EmptyState vs LoadError — they must NOT collapse", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    rows = [];
    shouldFail = false;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("they are structurally distinct components", async () => {
    const empty = await mount(<EmptyState title="No clients yet" description="They'll appear here." />);
    expect(isEmptyState(empty)).toBe(true);
    expect(isLoadError(empty)).toBe(false);
    expect(empty.textContent).toContain("No clients yet");
    // An empty state must never claim something failed.
    expect(empty.textContent).not.toContain("Couldn't load");

    await act(async () => root.unmount());
    root = createRoot(container);

    const err = await mount(<LoadError message="We couldn't load your clients." />);
    expect(isLoadError(err)).toBe(true);
    // ...and an error must never present itself as "there's nothing here".
    expect(err.textContent).not.toContain("No clients yet");
  });

  it("ExercisesTab: EMPTY library renders EmptyState", async () => {
    rows = [];
    shouldFail = false;
    const { ExercisesTab } = await import("@/components/learn/ExercisesTab");
    const el = await mount(<ExercisesTab search="" />);

    expect(el.textContent).toContain("No exercises found");
    expect(isLoadError(el)).toBe(false);
  });

  it("ExercisesTab: FAILED fetch renders LoadError, NOT the empty state", async () => {
    shouldFail = true;
    const { ExercisesTab } = await import("@/components/learn/ExercisesTab");
    const el = await mount(<ExercisesTab search="" />);

    expect(isLoadError(el)).toBe(true);
    // The lie this PR had to avoid making prettier.
    expect(el.textContent).not.toContain("No exercises found");
  });

  it("empty-search guard: never renders `matching \"\"`", async () => {
    rows = [];
    const { ExercisesTab } = await import("@/components/learn/ExercisesTab");

    const blank = await mount(<ExercisesTab search="" />);
    expect(blank.textContent).not.toContain('matching ""');
    expect(blank.textContent).toContain("No exercises found");

    await act(async () => root.unmount());
    root = createRoot(container);

    const searched = await mount(<ExercisesTab search="squat" />);
    expect(searched.textContent).toContain('No exercises matching "squat"');
  });
});

describe("RO5 — the roster all-clear", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("says the true, good thing rather than showing a row of muted zeroes", async () => {
    // The exact copy RO5 specifies, rendered through the EmptyState primitive.
    const el = await mount(
      <EmptyState
        title="No clients need attention — nice."
        description="Everyone's logged, paid up and on track."
      />,
    );

    expect(el.textContent).toContain("No clients need attention — nice.");
    // Calm, not alarming: an all-clear must not look like a fault.
    expect(el.innerHTML).not.toMatch(/destructive|text-red|status-risk|AlertTriangle/);
    expect(isLoadError(el)).toBe(false);
  });
});
