// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * NewClientOverview (1B) — the consolidated dashboard. Tests pin that the six feature cards render
 * for an active client in the mobile order (nutrition → log today → this week → your team), that
 * the Explore + Account sections are present, and that the retired cards are gone.
 */

const navigateMock = vi.fn();

function builder() {
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    gte: () => api,
    maybeSingle: () => Promise.resolve({ data: { user_id: "coach-1", first_name: "Sara", last_name: "Ali", profile_picture_url: null }, error: null }),
  };
  return api;
}

vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => builder() } }));
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/nutritionTarget", () => ({ getActiveNutritionTarget: () => Promise.resolve(null) }));
vi.mock("@/lib/canonicalScheduleAdapter", () => ({ resolveActiveAssignment: () => Promise.resolve({ id: "asg-1" }) }));
vi.mock("@/lib/weekUtils", () => ({ startOfIguWeek: () => new Date("2026-07-06T00:00:00Z") }));

// Child cards → sentinels so we assert composition/order, not their internals.
vi.mock("./PaymentAttentionBanner", () => ({ PaymentAttentionBanner: () => <div data-testid="payment-banner" /> }));
vi.mock("./AlertsCard", () => ({ AlertsCard: () => <div data-testid="alerts" /> }));
vi.mock("./TodaysWorkoutHero", () => ({ TodaysWorkoutHero: () => <div data-testid="workout-hero" /> }));
vi.mock("@/components/nutrition/food-log/TodayFoodCard", () => ({ TodayFoodCard: () => <div data-testid="today-food" /> }));
vi.mock("./LogTodayCard", () => ({ LogTodayCard: () => <div data-testid="log-today" /> }));
vi.mock("./ThisWeekCard", () => ({ ThisWeekCard: () => <div data-testid="this-week" /> }));
vi.mock("./MyCareTeamCard", () => ({ MyCareTeamCard: () => <div data-testid="your-team">Your team</div> }));
vi.mock("./QuickActionsGrid", () => ({ QuickActionsGrid: () => <div data-testid="quick-actions" /> }));
vi.mock("./PlanBillingCard", () => ({ PlanBillingCard: () => <div data-testid="plan-billing" /> }));

const { NewClientOverview } = await import("./NewClientOverview");

const PROPS = {
  user: { id: "client-1" },
  profile: { status: "active", first_name: "T" },
  subscription: { id: "sub-1", status: "active", coach_id: "coach-1" },
};

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<NewClientOverview {...PROPS} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return container;
}

describe("NewClientOverview — 1B consolidated dashboard", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders the six feature cards + Explore/Account sections for an active client", async () => {
    const el = await mount();

    for (const id of ["payment-banner", "alerts", "workout-hero", "today-food", "log-today", "this-week", "your-team", "quick-actions", "plan-billing"]) {
      expect(el.querySelector(`[data-testid="${id}"]`), id).not.toBeNull();
    }
    expect(el.textContent).toContain("Explore");
    expect(el.textContent).toContain("Account");
  });

  it("orders the feature grid nutrition → log today → this week → your team (mobile stack)", async () => {
    const el = await mount();

    const order = [...el.querySelectorAll("[data-testid]")]
      .map((n) => n.getAttribute("data-testid"))
      .filter((id) => ["today-food", "log-today", "this-week", "your-team"].includes(id!));
    expect(order).toEqual(["today-food", "log-today", "this-week", "your-team"]);
  });

  it("no longer renders the retired cards", async () => {
    const el = await mount();

    // Distinctive text from the retired cards must be gone.
    expect(el.textContent).not.toContain("Your Coach"); // CoachCard title
    expect(el.textContent).not.toContain("Weekly Adherence"); // AdherenceSummaryCard title
    // NutritionTargetsCard was unwired from the dashboard (kept for the team page).
    expect(el.querySelector('[data-testid="nutrition-targets"]')).toBeNull();
  });
});
