// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * TodayFoodCard — the compact diary entry card. The tests pin the three things that matter:
 *   (a) it renders today's totals through the shared NutritionSummary,
 *   (b) on a load ERROR it shows a retry and renders NO NutritionSummary / no "0 kcal" summary
 *       (a failed read is not an empty day — the LoadError contract), and
 *   (c) tapping the card navigates to /nutrition-diary.
 */

// Controllable return for the hook the card reads. Reset per test.
let foodLog: {
  totals: { kcal: number; protein: number; fat: number; carbs: number };
  target: { kcal: number; protein: number; fat: number; carbs: number } | null;
  goalType: string | null;
  loading: boolean;
  loadError: boolean;
  reload: () => void;
};

const reloadMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("./useFoodLog", () => ({
  useFoodLog: () => foodLog,
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

const { TodayFoodCard } = await import("./TodayFoodCard");

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => root.render(<TodayFoodCard clientUserId="client-1" />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return container;
}

const byText = (el: HTMLElement, t: string) =>
  [...el.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(t));

describe("TodayFoodCard", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    foodLog = {
      totals: { kcal: 1500, protein: 120, fat: 50, carbs: 150 },
      target: null,
      goalType: null,
      loading: false,
      loadError: false,
      reload: reloadMock,
    };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders today's totals through NutritionSummary", async () => {
    const el = await mount();

    expect(el.textContent).toContain("Today's food");
    expect(el.textContent).toContain("Open diary");
    // NutritionSummary is present — its kcal number and macro legend both render.
    expect(el.textContent).toContain("1,500");
    expect(el.querySelector('[data-macro-grams="protein"]')?.textContent).toContain("120");
  });

  it("renders the goal-type pill from the hook's goalType (DB + form vocab both mapped)", async () => {
    foodLog = { ...foodLog, goalType: "muscle_gain" };
    let el = await mount();
    expect(el.textContent).toContain("Muscle gain");

    // The short (form) vocab maps too.
    await act(async () => root.unmount());
    root = createRoot(container);
    foodLog = { ...foodLog, goalType: "fat_loss" };
    el = await mount();
    expect(el.textContent).toContain("Fat loss");
  });

  it("renders no goal pill when there is no active target", async () => {
    foodLog = { ...foodLog, goalType: null };
    const el = await mount();
    expect(el.textContent).not.toContain("Fat loss");
    expect(el.textContent).not.toContain("Muscle gain");
    expect(el.textContent).not.toContain("Maintenance");
  });

  it("on loadError shows a retry and renders NO summary / no 0-kcal 'nothing logged' card", async () => {
    foodLog = { ...foodLog, loadError: true, totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 } };
    const el = await mount();

    // The error surface, with a working retry.
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    const retry = byText(el, "Retry");
    expect(retry).not.toBeUndefined();

    // Crucially: NO NutritionSummary rendered — no macro legend, no progress bar, no "0".
    expect(el.querySelector("[data-macro-grams]")).toBeNull();
    expect(el.querySelector('[role="progressbar"]')).toBeNull();

    // Retry calls reload and does NOT navigate away (propagation is stopped).
    await act(async () => retry!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(reloadMock).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("navigates to /nutrition-diary when the card is activated", async () => {
    const el = await mount();
    const card = el.querySelector('[role="button"]') as HTMLElement;
    expect(card).not.toBeNull();

    await act(async () => card.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(navigateMock).toHaveBeenCalledWith("/nutrition-diary");
  });
});
