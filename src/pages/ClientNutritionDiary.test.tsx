// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ClientNutritionDiary — the plan-AGNOSTIC access gate (1A). The diary is open to every active
 * member on any plan, so the gate must NOT check service.type. The tests pin:
 *   - an active member (here a team member, the plan that was locked out before) renders the
 *     diary and is NOT redirected;
 *   - an inactive member is redirected to /dashboard and the diary never mounts.
 */

// Per-table rows the mocked PostgREST builder resolves. Reset per test.
let tableData: Record<string, unknown>;

function builder(table: string) {
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    order: () => api,
    limit: () => api,
    maybeSingle: () => Promise.resolve({ data: tableData[table] ?? null, error: null }),
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

const navigateMock = vi.fn();
const toastMock = vi.fn();
let session: { user: { id: string } | null; isLoading: boolean };

vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));
vi.mock("@/hooks/useAuthSession", () => ({ useAuthSession: () => session }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock("@/components/layouts/ClientPageLayout", () => ({
  ClientPageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/nutrition/food-log/FoodLogDayView", () => ({
  FoodLogDayView: () => <div data-testid="food-log-day-view" />,
}));

const { default: ClientNutritionDiary } = await import("./ClientNutritionDiary");

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<ClientNutritionDiary />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return container;
}

describe("ClientNutritionDiary — plan-agnostic gate", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    session = { user: { id: "client-1" }, isLoading: false };
    tableData = {};
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders the diary for an active TEAM member (no service-type restriction)", async () => {
    tableData = {
      profiles_public: { status: "active" },
      // A team subscription — the gate must NOT care about the plan, only that it's active.
      subscriptions: { id: "sub-1", status: "active" },
    };
    const el = await mount();

    expect(el.querySelector('[data-testid="food-log-day-view"]')).not.toBeNull();
    expect(navigateMock).not.toHaveBeenCalledWith("/dashboard");
  });

  it("redirects an INACTIVE member to /dashboard and never mounts the diary", async () => {
    tableData = {
      profiles_public: { status: "inactive" },
      subscriptions: { id: "sub-1", status: "active" },
    };
    const el = await mount();

    expect(navigateMock).toHaveBeenCalledWith("/dashboard");
    expect(el.querySelector('[data-testid="food-log-day-view"]')).toBeNull();
  });
});
