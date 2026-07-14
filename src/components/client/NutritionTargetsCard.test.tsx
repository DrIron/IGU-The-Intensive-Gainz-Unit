// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * PARITY — NutritionTargetsCard after the Part IV donut conversion (surface 2/3).
 *
 * This is a shipped, prod-verified client-dashboard card. The conversion deleted THREE things
 * (the crimson kcal box, the ribbon, and the 3-col grams/% grid) and added one. What must NOT
 * have gone with them is everything else: the header, the goal pill, the CC2 interpretation
 * line, and the tap-through to /nutrition.
 *
 * The whole risk of a "batch restyle" is that some of the chrome quietly leaves with the
 * visual it was sitting next to. So the kept elements are asserted by name, not eyeballed.
 */

const phase = {
  daily_calories: 2100,
  protein_grams: 170,
  carb_grams: 210,
  fat_grams: 60,
  goal_type: "fat_loss",
};

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "maybeSingle") return () => Promise.resolve({ data: phase, error: null });
          if (prop === "then") return (r: (v: unknown) => unknown) => r({ data: phase, error: null });
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  return { supabase: { from: () => builder() } };
});

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  const { NutritionTargetsCard } = await import("./NutritionTargetsCard");
  await act(async () => {
    root.render(
      <MemoryRouter>
        <NutritionTargetsCard userId="client-1" />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return container;
}

describe("NutritionTargetsCard — donut conversion parity", () => {
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

  it("KEEPS the header, the goal pill, the CC2 line and the tap-through", async () => {
    const el = await mount();

    expect(el.textContent).toContain("Daily Targets"); // header
    expect(el.textContent).toContain("Fat Loss"); // goal pill
    expect(el.textContent).toContain("Weekly Check-in"); // tap-through to /nutrition
    // CC2 interpretation line — the plain-language sentence, with its tone dot.
    expect(el.querySelector("p.flex.items-start")).not.toBeNull();
  });

  it("renders ONE macro visual — the summary — and shows grams AND %", async () => {
    const el = await mount();

    // The donut is NutritionSummary's ring.
    expect(el.querySelector('[aria-label="Macro calorie split"]')).not.toBeNull();

    // Legend carries grams...
    expect(el.querySelector('[data-macro-grams="protein"]')?.textContent).toContain("170");
    expect(el.querySelector('[data-macro-grams="fat"]')?.textContent).toContain("60");
    expect(el.querySelector('[data-macro-grams="carbs"]')?.textContent).toContain("210");
    // ...and %.
    expect(el.textContent).toMatch(/\d+%/);

    // The calorie number survived the box it used to sit in.
    expect(el.textContent).toContain("2,100");
    expect(el.textContent).toContain("kcal · daily target");
  });

  it("the two visuals it replaced are GONE — no crimson kcal box, no 3-col grid", async () => {
    const el = await mount();

    // The old kcal box: a bg-primary/5 rounded panel with a bare "calories" label.
    expect(el.innerHTML).not.toContain("bg-primary/5");
    // The old 3-col grams/% grid.
    expect(el.querySelector(".grid.grid-cols-3")).toBeNull();
    // ...and it must not have left a duplicate ribbon behind either.
    expect(el.querySelectorAll('[aria-label^="Macro split"]').length).toBe(0);
  });

  it("no target is passed — this is a PLAN, not consumed-vs-target", async () => {
    const el = await mount();

    // A progress bar here would assert the client has EATEN 2,100 kcal today. They haven't;
    // this card states the goal. The bar belongs to the food log, not to the targets card.
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
    expect(el.textContent).not.toContain("kcal left");
    expect(el.textContent).not.toContain(" of ");
  });
});
