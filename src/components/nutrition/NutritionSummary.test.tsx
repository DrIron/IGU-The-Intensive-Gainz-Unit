// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NutritionSummary } from "./NutritionSummary";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * NutritionSummary — the ONE canonical calories+macros display (Part IV, non-negotiable).
 *
 * Two things are pinned:
 *   1. the SAME component renders with and without a target (no second "way")
 *   2. it carries NO verdict — over-target is stated, never coloured as a failure. A client
 *      in a muscle-gain phase who exceeds their calories did what they were asked to do.
 */

let container: HTMLDivElement;
let root: Root;

async function mount(ui: React.ReactElement): Promise<HTMLDivElement> {
  await act(async () => root.render(ui));
  return container;
}

const TOTALS = { kcal: 1480, protein: 124, fat: 48, carbs: 150 };
const TARGET = { kcal: 2050, protein: 172, fat: 68, carbs: 205 };

describe("NutritionSummary", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("with a target: kcal reads 'N of M', grams read 'N / M g', and the bar appears", async () => {
    const el = await mount(<NutritionSummary totals={TOTALS} target={TARGET} size="lg" />);

    expect(el.textContent).toContain("1,480");
    expect(el.textContent).toContain("of 2,050");
    expect(el.textContent).toContain("124");
    expect(el.textContent).toContain("/ 172");
    expect(el.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(el.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("72");
    expect(el.querySelector("[data-remaining]")?.textContent).toBe("570 kcal left");
  });

  it("without a target: SAME component, minus the target text and the bar", async () => {
    const el = await mount(<NutritionSummary totals={{ kcal: 209, protein: 39, fat: 5, carbs: 0 }} />);

    expect(el.textContent).toContain("209");
    // No target -> no "of N", no "/ N g", no bar, no "left".
    expect(el.textContent).not.toContain("of ");
    expect(el.textContent).not.toContain("/");
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
    expect(el.querySelector("[data-remaining]")).toBeNull();
    // ...but the macro split is still there. It is the same object.
    expect(el.textContent).toContain("Protein");
    expect(el.textContent).toContain("Carbs");
  });

  it("splits the donut by CALORIE contribution, not by grams", async () => {
    // 100g P (400 kcal) + 100g C (400 kcal) + 0 F. By grams that's 50/50; by calories it is
    // also 50/50 — so use a case where they DIFFER: 100g P (400) vs 100g F (900).
    const el = await mount(
      <NutritionSummary totals={{ kcal: 1300, protein: 100, fat: 100, carbs: 0 }} />,
    );
    const text = el.textContent ?? "";
    // 400 / 1300 = 31%; 900 / 1300 = 69%. If it split by grams both would read 50%.
    expect(text).toContain("31%");
    expect(text).toContain("69%");
    expect(text).not.toContain("50%");
  });

  it("over target is STATED, never scolded", async () => {
    const over = { kcal: 2400, protein: 190, fat: 80, carbs: 230 };
    const el = await mount(<NutritionSummary totals={over} target={TARGET} />);

    expect(el.querySelector("[data-remaining]")?.textContent).toBe("350 kcal over");
    // Gaining is the GOAL in a muscle-gain phase. No red, no destructive, no warning.
    expect(el.innerHTML).not.toMatch(/text-red|text-destructive|bg-destructive|status-risk|text-orange/);
    // The bar clamps rather than overflowing its track.
    const bar = el.querySelector('[role="progressbar"] > div') as HTMLElement;
    expect(bar.style.width).toBe("100%");
  });

  it("an empty day renders zeroes, not NaN", async () => {
    const el = await mount(
      <NutritionSummary totals={{ kcal: 0, protein: 0, fat: 0, carbs: 0 }} target={TARGET} />,
    );
    expect(el.textContent).not.toContain("NaN");
    expect(el.textContent).toContain("0");
    expect(el.querySelector("[data-remaining]")?.textContent).toBe("2,050 kcal left");
  });

  it("centerLabel disambiguates a PLAN TARGET from consumed calories", async () => {
    // The coach cards render a target, not intake. A bare "kcal" under the number is
    // ambiguous there — is that what they ate, or what they're aiming for?
    const el = await mount(
      <NutritionSummary totals={TOTALS} centerLabel="kcal · daily target" size="md" />,
    );
    expect(el.textContent).toContain("kcal · daily target");
    expect(el.querySelector('[role="progressbar"]')).toBeNull(); // no target -> no bar
  });

  it("centerLabel is IGNORED when a target exists — the centre already reads 'N of M'", async () => {
    const el = await mount(
      <NutritionSummary totals={TOTALS} target={TARGET} centerLabel="kcal · daily target" />,
    );
    expect(el.textContent).toContain("of 2,050");
    expect(el.textContent).not.toContain("daily target");
  });

  it("defaults to a bare 'kcal' when no centerLabel is given (unchanged behaviour)", async () => {
    const el = await mount(<NutritionSummary totals={TOTALS} />);
    expect(el.textContent).toContain("kcal");
    expect(el.textContent).not.toContain("daily target");
  });

  it("the calorie number is the crimson font-display hero, not a progress ring", async () => {
    const el = await mount(<NutritionSummary totals={TOTALS} target={TARGET} size="lg" />);
    const hero = [...el.querySelectorAll("span")].find((s) => s.textContent === "1,480");

    expect(hero?.className).toContain("font-display");
    expect(hero?.className).toContain("text-primary");
  });
});
