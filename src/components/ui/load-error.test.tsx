// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoadError } from "./load-error";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * CC10 regression guard — THE POINT OF THE PR.
 *
 * Four surfaces used to answer a failed fetch with a confident lie:
 *   CoachAlerts        -> "0 alerts"                       (all-clear on an alerting surface)
 *   MeetOurTeam        -> "team is being assembled"        (public page: IGU has no coaches)
 *   TestimonialsList   -> three FABRICATED 5-star reviews  (public homepage)
 *   CoachPublicPage    -> "Coach not found"                (a network blip = a 404)
 *
 * These tests reject the fetch and assert each surface now renders LoadError —
 * and, critically, that it does NOT render its old lie. If someone reintroduces the
 * fall-through, the "does not contain" assertions fail.
 *
 * The surfaces are auth-gated / network-bound, so Supabase is mocked at the module
 * boundary rather than faking a login.
 */

const rejectingQuery = () => {
  const err = new Error("network down");
  const chain: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(chain, {
    get(_t, prop) {
      if (prop === "then") {
        // Awaiting the builder resolves to a PostgREST-shaped error result.
        return (resolve: (v: unknown) => unknown) => resolve({ data: null, error: err });
      }
      return () => proxy;
    },
  });
  return proxy;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => rejectingQuery(),
    rpc: () => Promise.resolve({ data: null, error: new Error("network down") }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } }, error: null }) },
  },
}));

vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));

let container: HTMLDivElement;
let root: Root;

async function mount(ui: React.ReactElement): Promise<string> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>,
    );
  });
  // let the fetch effects reject and flush
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return document.body.textContent ?? "";
}

describe("LoadError primitive", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  it("is semantically an alert, and is NOT an EmptyState", async () => {
    const text = await mount(<LoadError message="We couldn't load your clients." />);
    expect(text).toContain("Couldn't load");
    expect(text).toContain("We couldn't load your clients.");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("renders a Retry that calls back", async () => {
    const onRetry = vi.fn();
    await mount(<LoadError onRetry={onRetry} />);
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Retry"));
    expect(btn).toBeTruthy();
    await act(async () => {
      btn!.click();
    });
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits Retry when there is nothing to retry", async () => {
    const text = await mount(<LoadError />);
    expect(text).toContain("Couldn't load");
    expect(text).not.toContain("Retry");
  });
});

describe("CC10 — the four liars render LoadError on a rejected fetch", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("CoachAlerts: shows LoadError, NOT a false '0 alerts' all-clear", async () => {
    const { CoachAlerts } = await import("@/components/coach/CoachAlerts");
    const text = await mount(<CoachAlerts coachUserId="c1" onNavigateToClients={() => {}} />);

    expect(text).toContain("Couldn't load");
    // The old lie: three cards reading 0 / 0 / 0 on an alerting surface.
    expect(text).not.toContain("Missed Logs");
    expect(text).not.toContain("Payment Issues");
  });

  it("TestimonialsList: shows LoadError, NOT three fabricated 5-star reviews", async () => {
    const { TestimonialsList } = await import("@/components/marketing/TestimonialsList");
    const text = await mount(<TestimonialsList limit={3} />);

    expect(text).toContain("Couldn't load");
    // The old lie: fake marketing placeholders published as real social proof.
    expect(text).not.toContain("Client Name");
    expect(text).not.toContain("Program Type");
    expect(text).not.toContain("Coming soon");
  });

  it("MeetOurTeam: shows LoadError, NOT 'our team is being assembled'", async () => {
    const { default: MeetOurTeam } = await import("@/pages/MeetOurTeam");
    const text = await mount(<MeetOurTeam />);

    expect(text).toContain("Couldn't load");
    expect(text).not.toContain("being assembled");
  });

  it("CoachPublicPage: a fetch FAILURE shows LoadError, not a bogus 'Coach not found'", async () => {
    const { default: CoachPublicPage } = await import("@/pages/CoachPublicPage");

    // Must mount under a real :slug route — with no slug the page 404s legitimately,
    // and we are specifically testing that a FAILED FETCH no longer looks like a 404.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/coaches/some-coach"]}>
            <Routes>
              <Route path="/coaches/:slug" element={<CoachPublicPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const text = document.body.textContent ?? "";

    expect(text).toContain("Couldn't load");
    // The old lie: a network blip told the visitor the coach doesn't exist.
    expect(text).not.toContain("Coach not found");
  });
});
