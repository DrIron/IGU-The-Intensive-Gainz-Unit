// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * TeamNutrition — the food-diary entry card (1A) now sits above NutritionProgress on the team
 * landing. The test pins that an active team member sees the TodayFoodCard.
 */

// Per-table rows. maybeSingle → first row; awaiting the builder → the whole array.
let tableData: Record<string, unknown[]>;

function builder(table: string) {
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    order: () => api,
    limit: () => api,
    maybeSingle: () => Promise.resolve({ data: (tableData[table] ?? [])[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: tableData[table] ?? [], error: null }),
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

const navigateMock = vi.fn();
let session: { user: { id: string } | null; isLoading: boolean };

vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));
vi.mock("@/hooks/useAuthSession", () => ({ useAuthSession: () => session }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/layouts/ClientPageLayout", () => ({
  ClientPageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/nutrition/NutritionProgress", () => ({
  NutritionProgress: () => <div data-testid="nutrition-progress" />,
}));
vi.mock("@/components/nutrition/food-log/TodayFoodCard", () => ({
  TodayFoodCard: ({ clientUserId }: { clientUserId: string }) => (
    <div data-testid="today-food-card">{clientUserId}</div>
  ),
}));

const { default: TeamNutrition } = await import("./TeamNutrition");

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<TeamNutrition />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return container;
}

describe("TeamNutrition — food-diary entry card", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    session = { user: { id: "team-client-1" }, isLoading: false };
    tableData = {
      profiles_public: [{ status: "active" }],
      subscriptions: [{ id: "sub-1", status: "active", service_id: "svc-team" }],
      user_roles: [],
      services: [{ type: "team" }],
    };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders TodayFoodCard for an active team member", async () => {
    const el = await mount();

    const card = el.querySelector('[data-testid="today-food-card"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toBe("team-client-1");
    expect(el.querySelector('[data-testid="nutrition-progress"]')).not.toBeNull();
  });
});
