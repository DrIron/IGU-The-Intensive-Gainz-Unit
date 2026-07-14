// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NutritionPhaseCard } from "./NutritionPhaseCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * PARITY — NutritionPhaseCard after the Part IV donut conversion (surface 3/3, the flagship).
 *
 * This card is on TWO shipped surfaces (client /nutrition and the coach's Client Overview
 * nutrition tab) and it carries far more than a macro block: a status rail, a goal badge, a
 * StatusBadge, the CC2 interpretation sentence, an expected-vs-actual rate strip, and two
 * actions. The conversion replaced exactly one thing — the kcal hero + gram line + ribbon.
 *
 * Everything else is asserted here BY NAME. That is the entire point: the failure mode of a
 * "batch restyle" is not that the new visual looks wrong, it's that some piece of chrome
 * quietly leaves with the visual it happened to be sitting next to, and nobody notices for a
 * month because nothing throws.
 *
 * (The status CLASSIFIER itself is proven in NutritionPhaseCard.status.test.ts against
 * interpret.ts — not re-tested here. This is about what survives the render.)
 */

const PHASE = {
  id: "p1",
  phase_name: "Summer Cut",
  goal_type: "fat_loss",
  start_date: "2026-06-23",
  daily_calories: 1850,
  protein_grams: 165,
  fat_grams: 55,
  carb_grams: 165,
  weekly_rate_percentage: 0.75,
  target_weight_kg: 74,
  starting_weight_kg: 82,
  is_active: true,
};

let container: HTMLDivElement;
let root: Root;

async function mount(props: Partial<Parameters<typeof NutritionPhaseCard>[0]> = {}) {
  await act(async () => {
    root.render(
      <NutritionPhaseCard
        phase={PHASE}
        latestAverageWeight={78.4}
        latestActualChangePercent={-0.68}
        weeksElapsed={3}
        onEditPhase={() => {}}
        onScrollToAdjustments={() => {}}
        {...props}
      />,
    );
  });
  return container;
}

describe("NutritionPhaseCard — donut conversion parity", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("KEEPS the status rail colour", async () => {
    const el = await mount();
    // on_track (-0.68 vs -0.75 expected) -> the green rail. The rail is the card's fastest
    // signal; losing it to a layout change would be silent.
    expect(el.querySelector(".bg-status-ontrack")).not.toBeNull();
  });

  it("KEEPS the StatusBadge, the goal badge and the phase name", async () => {
    const el = await mount();
    expect(el.textContent).toContain("Summer Cut");
    expect(el.textContent).toContain("Fat Loss");
    expect(el.textContent).toContain("On Track");
  });

  it("KEEPS the CC2 interpretation sentence", async () => {
    const el = await mount();
    // Single source: interpret.ts. Any non-empty sentence with its tone dot must survive.
    const line = [...el.querySelectorAll("p")].find((p) => p.className.includes("items-start"));
    expect(line).toBeDefined();
    expect((line?.textContent ?? "").length).toBeGreaterThan(10);
  });

  it("KEEPS the expected/actual figures", async () => {
    const el = await mount();
    expect(el.textContent).toContain("-0.75%");
    expect(el.textContent).toContain("-0.68%");
    expect(el.textContent).toContain("expected");
    expect(el.textContent).toContain("actual");
  });

  it("KEEPS both actions", async () => {
    const el = await mount();
    const labels = [...el.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels.some((l) => l?.includes("Edit phase"))).toBe(true);
    expect(labels.some((l) => l?.includes("Review weeks"))).toBe(true);
  });

  it("FOLDS avg + ~wks out of the header and into the rate strip — the data is not lost", async () => {
    const el = await mount();
    const header = el.querySelector("p.font-mono");

    // The header meta line keeps only what identifies the phase.
    expect(header?.textContent).toContain("Week 3");
    expect(header?.textContent).toContain("target 74.0 kg");
    expect(header?.textContent).not.toContain("avg");
    expect(header?.textContent).not.toContain("wks");

    // ...but the numbers themselves still render, in the strip.
    expect(el.textContent).toContain("78.4 kg");
    expect(el.textContent).toMatch(/~\d+ wks?/);
  });

  it("renders ONE macro visual — the summary — with grams AND %", async () => {
    const el = await mount();

    expect(el.querySelector('[aria-label="Macro calorie split"]')).not.toBeNull();
    expect(el.querySelector('[data-macro-grams="protein"]')?.textContent).toContain("165");
    expect(el.querySelector('[data-macro-grams="fat"]')?.textContent).toContain("55");
    expect(el.textContent).toContain("1,850");
    expect(el.textContent).toContain("kcal · daily target");
    // The % — the thing the ribbon never showed, and the donut's whole argument.
    expect(el.textContent).toMatch(/\d+%/);

    // The old ribbon is gone, not merely hidden.
    expect(el.querySelectorAll('[aria-label^="Macro split"]').length).toBe(0);
  });

  it("passes NO target — this is the coach's PLAN, not the client's intake", async () => {
    const el = await mount();
    // A progress bar here would claim the client has eaten 1,850 kcal. They haven't.
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
    expect(el.textContent).not.toContain("kcal left");
  });

  it("a MAINTENANCE phase still shows its avg weight (it has no rate strip to hide in)", async () => {
    // Regression guard for the fold: maintenance never rendered a rate strip, and `avg` used
    // to live in the header. Moving `avg` into the strip could have silently deleted it for
    // every maintenance client.
    const el = await mount({
      phase: { ...PHASE, goal_type: "maintenance", weekly_rate_percentage: 0 },
    });
    expect(el.textContent).toContain("78.4 kg");
    expect(el.textContent).not.toContain("expected"); // ...without inventing a rate strip
  });

  it("renders cleanly with no weigh-ins at all", async () => {
    const el = await mount({ latestAverageWeight: null, latestActualChangePercent: null });
    expect(el.textContent).toContain("Summer Cut");
    expect(el.textContent).not.toContain("NaN");
    expect(el.textContent).toContain("No data yet");
  });
});
