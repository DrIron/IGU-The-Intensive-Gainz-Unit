// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ClientNutrition (1:1 landing) — the inline food diary was lifted out to /nutrition-diary (1A)
 * and replaced by the compact TodayFoodCard. The test pins that on the landing the diary's meal
 * sections (data-meal-section, from FoodLogDayView) no longer render, and TodayFoodCard does.
 * Exercised via the no-phase branch, which is the lightest to mount.
 */

let tableData: Record<string, unknown[]>;

function builder(table: string) {
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    order: () => api,
    limit: () => api,
    gte: () => api,
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

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useLocation: () => ({ pathname: "/nutrition-client" }),
}));
vi.mock("@/hooks/useAuthSession", () => ({ useAuthSession: () => session }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/layouts/ClientPageLayout", () => ({
  ClientPageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/nutrition/food-log/TodayFoodCard", () => ({
  TodayFoodCard: () => <div data-testid="today-food-card" />,
}));

const { default: ClientNutrition } = await import("./ClientNutrition");

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<ClientNutrition />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return container;
}

describe("ClientNutrition — diary lifted to TodayFoodCard", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    session = { user: { id: "client-1" }, isLoading: false };
    tableData = {
      profiles_public: [{ status: "active", first_name: "T" }],
      profiles_private: [{ gender: "male" }],
      subscriptions: [{ id: "sub-1", status: "active", service_id: "svc-1to1" }],
      services: [{ type: "one_to_one" }],
      nutrition_phases: [], // no active phase → the light no-phase branch
    };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders TodayFoodCard and NOT the inline diary meal sections", async () => {
    const el = await mount();

    expect(el.querySelector('[data-testid="today-food-card"]')).not.toBeNull();
    // The inline FoodLogDayView (its meal sections) must be gone from the landing.
    expect(el.querySelector("[data-meal-section]")).toBeNull();
    expect(el.textContent).toContain("No Active Nutrition Phase");
  });
});
