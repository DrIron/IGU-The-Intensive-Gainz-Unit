// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * P1 GATE (the interactive half) — the donut and the macro legend must update LIVE on
 * add / edit / delete, and a custom food must log correctly.
 *
 * The arithmetic gate ("same food by grams and by serving") is proven in
 * src/lib/foodLog.test.ts against the pure functions. THIS test proves the wiring: that the
 * numbers the client sees on the hero actually move when they log something, through the real
 * components (day view -> add drawer -> detail drawer -> write -> re-read -> re-render), over
 * an in-memory stand-in for Postgres.
 *
 * It drives the UI rather than calling the hooks, because "the total updated" is only true if
 * the click path reaches the write and the read comes back. A hook-level test would pass even
 * if the Add button were wired to nothing.
 */

// ---------------------------------------------------------------------------
// An in-memory stand-in for the tables this surface touches. Enough of the PostgREST
// builder to be honest: filters actually filter, inserts actually land, and the trigger's
// job (rollup) is irrelevant here because the UI sums the entries it holds.
// ---------------------------------------------------------------------------
interface Row { [k: string]: unknown }

const CHICKEN_ID = "food-chicken";
const db: Record<string, Row[]> = {};

function reset() {
  db.food_log_entries = [];
  // No active phase by default — the base tests exercise the goals-fallback path. Tests that
  // need a coached target seed db.nutrition_phases explicitly. Reset it so it can't leak.
  db.nutrition_phases = [];
  db.nutrition_goals = [
    { user_id: "client-1", is_active: true, daily_calories: 2050, protein_grams: 172, fat_grams: 68, carb_grams: 205 },
  ];
  db.foods_search = [
    {
      id: CHICKEN_ID,
      name: "Chicken breast, skinless, raw",
      brand: null,
      source: "usda_sr",
      owner_user_id: null,
      category_id: "cat-poultry",
      serving_default_g: 120,
      is_verified: true,
      kcal_100g: 120,
      protein_100g: 22.5,
      fat_100g: 2.6,
      carb_100g: 0,
    },
  ];
  db.food_portions = [
    { id: "p-breast", food_id: CHICKEN_ID, label: "1 breast", gram_weight: 174, unit_kind: "serving", ml_equiv: null, sort_order: 1 },
  ];
  db.food_nutrients = [];
  db.food_categories = [
    { id: "cat-protein", name: "Protein", parent_id: null, sort_order: 1 },
    { id: "cat-poultry", name: "Poultry", parent_id: "cat-protein", sort_order: 1 },
  ];
  db.nutrients = [
    { id: "n-energy", key: "energy" }, { id: "n-protein", key: "protein" },
    { id: "n-fat", key: "fat" }, { id: "n-carb", key: "carb" },
  ];
  db.foods = [];
}

let idSeq = 0;

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | Row[] | null = null;

  const run = (): { data: unknown; error: null } => {
    const rows = db[table] ?? [];
    const match = (r: Row) => filters.every((f) => f(r));

    if (op === "insert") {
      const items = (Array.isArray(payload) ? payload : [payload]) as Row[];
      const created = items.map((p) => ({ id: `row-${++idSeq}`, ...p }));
      db[table] = [...rows, ...created];
      return { data: created, error: null };
    }
    if (op === "update") {
      db[table] = rows.map((r) => (match(r) ? { ...r, ...(payload as Row) } : r));
      return { data: db[table].filter(match), error: null };
    }
    if (op === "delete") {
      db[table] = rows.filter((r) => !match(r));
      return { data: [], error: null };
    }
    return { data: rows.filter(match), error: null };
  };

  const api: Record<string, unknown> = {
    select: () => api,
    insert: (p: Row | Row[]) => { op = "insert"; payload = p; return api; },
    update: (p: Row) => { op = "update"; payload = p; return api; },
    delete: () => { op = "delete"; return api; },
    eq: (c: string, v: unknown) => { filters.push((r) => String(r[c]) === String(v)); return api; },
    in: (c: string, vs: unknown[]) => { filters.push((r) => vs.map(String).includes(String(r[c]))); return api; },
    ilike: (c: string, pat: string) => {
      const needle = pat.replace(/%/g, "").toLowerCase();
      filters.push((r) => String(r[c] ?? "").toLowerCase().includes(needle));
      return api;
    },
    not: (c: string, _op: string, _v: unknown) => { filters.push((r) => r[c] != null); return api; },
    order: () => api,
    limit: () => api,
    maybeSingle: () => Promise.resolve({ data: (run().data as Row[])[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: (run().data as Row[])[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve(run()),
  };
  return api;
}

// Food search now goes through the search_foods RPC (P0-ingest ranking), not a from().ilike().
// The mock runs the same name-contains / category filter the real function does, over the
// seeded foods_search rows, so the add-food path still resolves the chicken row.
function searchFoods(args: { p_query?: string; p_category?: string | null; p_limit?: number }) {
  const q = (args.p_query ?? "").trim().toLowerCase();
  const rows = (db.foods_search ?? []).filter((r) => {
    const nameOk = q === "" || String((r as Row).name ?? "").toLowerCase().includes(q);
    const catOk = !args.p_category || (r as Row).category_id === args.p_category;
    return nameOk && catOk;
  });
  return Promise.resolve({ data: rows.slice(0, args.p_limit ?? 50), error: null });
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: (name: string, args: Record<string, unknown>) =>
      name === "search_foods"
        ? searchFoods(args)
        : Promise.resolve({ data: [], error: null }),
  },
}));
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
});
// Radix needs these in jsdom. jsdom has no PointerEvent at all, and Radix's menus open on
// pointerdown — so without this the dropdown never opens and "delete" is untestable.
if (typeof window.PointerEvent === "undefined") {
  class PE extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params);
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PE;
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PE;
}
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
window.HTMLElement.prototype.setPointerCapture = vi.fn();

const { FoodLogDayView } = await import("./FoodLogDayView");

let container: HTMLDivElement;
let root: Root;

const settle = async (ms = 260) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
};

/** The whole document — Radix portals its dialogs outside the container. */
const doc = () => document.body;
const text = () => doc().textContent ?? "";
/** Radix renders menu items as div[role=menuitem], not <button> — search both. */
const byText = (t: string) =>
  [...doc().querySelectorAll('button, [role="menuitem"]')].find((b) =>
    (b.textContent ?? "").includes(t),
  );

/** Walk the add -> search -> pick -> "Add to log" path a client actually walks. */
async function logChicken() {
  await click(byText("Add food")!); // breakfast section
  await settle();

  const search = doc().querySelector('input[aria-label="Search foods"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(search, "chicken");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle(); // debounce + fetch

  await click(doc().querySelector(`[data-food-row="${CHICKEN_ID}"]`)!);
  await settle();

  await click(byText("Add to log")!);
  await settle();
}

describe("P1 GATE — the hero updates live on add / edit / delete", () => {
  beforeEach(() => {
    reset();
    idSeq = 0;
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

  it("ADD: logging a food moves the calories, the macros and the remaining", async () => {
    await act(async () => root.render(<FoodLogDayView clientUserId="client-1" />));
    await settle();

    // An empty day, measured against the coach's target.
    expect(text()).toContain("2,050 kcal left");
    expect(text()).toContain("Nothing logged yet.");

    await logChicken();

    // Defaults to "1 breast" = 174 g -> 120 kcal/100g * 1.74 = 208.8 -> 209.
    expect(db.food_log_entries).toHaveLength(1);
    const e = db.food_log_entries[0];
    expect(e.quantity_g).toBe(174);
    expect(e.kcal).toBe(208.8);
    expect(e.food_name).toBe("Chicken breast, skinless, raw");
    expect(e.unit).toBe("serving");
    // The shared write path still attributes a self-logged entry to the client (no regression
    // from generalizing insertEntry for staff authoring).
    expect(e.created_by_role).toBe("client");
    expect(e.created_by_user_id).toBeNull();

    // ...and the HERO moved. This is the gate.
    expect(text()).toContain("209");          // kcal centred in the donut
    expect(text()).toContain("1,841 kcal left"); // 2050 - 209
    expect(text()).toContain("1 breast (174 g)");

    // The macro legend moved with it: 39 g protein of a 172 g target.
    const legend = doc().querySelector('[data-macro-grams="protein"]');
    expect(legend?.textContent).toContain("39");
    expect(legend?.textContent).toContain("/ 172");
  });

  it("EDIT: re-portioning an entry re-costs the day", async () => {
    await act(async () => root.render(<FoodLogDayView clientUserId="client-1" />));
    await settle();
    await logChicken();
    expect(text()).toContain("1,841 kcal left");

    // Tap the entry to edit it, then change 1 breast -> 2.
    await click(doc().querySelector('[data-entry] button')!);
    await settle();

    const qty = doc().querySelector("#fd-qty") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(qty, "2");
      qty.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle(50);

    // The drawer previews the resolved grams BEFORE saving — 2 x 174.
    expect(doc().querySelector("[data-resolved-grams]")?.textContent).toBe("= 348 g");

    await click(byText("Save changes")!);
    await settle();

    expect(db.food_log_entries).toHaveLength(1); // edited, not duplicated
    expect(db.food_log_entries[0].quantity_g).toBe(348);
    expect(text()).toContain("418");             // 208.8 * 2 = 417.6
    expect(text()).toContain("1,632 kcal left"); // 2050 - 417.6
  });

  it("DELETE: removing an entry gives the calories back", async () => {
    await act(async () => root.render(<FoodLogDayView clientUserId="client-1" />));
    await settle();
    await logChicken();
    expect(db.food_log_entries).toHaveLength(1);

    // Delete straight through the row's menu.
    const menu = doc().querySelector('[data-entry] button[aria-label^="Options"]')!;
    await act(async () => {
      menu.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      menu.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    await click(byText("Delete")!);
    await settle();

    expect(db.food_log_entries).toHaveLength(0);
    // Back to an empty day — the hero reset, it didn't keep the stale total.
    expect(text()).toContain("2,050 kcal left");
    expect(text()).toContain("Nothing logged yet.");
  });

  it("CUSTOM FOOD: a client's own food is created, then logs like any other", async () => {
    await act(async () => root.render(<FoodLogDayView clientUserId="client-1" />));
    await settle();

    await click(byText("Add food")!);
    await settle();
    await click(byText("Create a custom food")!);
    await settle();

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    const type = async (sel: string, v: string) => {
      const el = doc().querySelector(sel) as HTMLInputElement;
      await act(async () => {
        setter.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await type("#cf-name", "Mum's machboos");
    await type("#cf-kcal", "180");
    await type("#cf-protein", "12");
    await type("#cf-fat", "6");
    await type("#cf-carb", "20");
    await type("#cf-serving", "250");

    await click(byText("Save food")!);
    await settle();

    // It is CUSTOM and OWNED — never a global row the rest of the platform can see.
    expect(db.foods).toHaveLength(1);
    expect(db.foods[0].source).toBe("custom");
    expect(db.foods[0].owner_user_id).toBe("client-1");
    // Its nutrition lands in the SAME normalized table as a USDA food — no special case.
    expect(db.food_nutrients).toHaveLength(4);

    // ...and it drops straight into the detail drawer, ready to log.
    await click(byText("Add to log")!);
    await settle();

    expect(db.food_log_entries).toHaveLength(1);
    const e = db.food_log_entries[0];
    expect(e.food_name).toBe("Mum's machboos");
    expect(e.quantity_g).toBe(250);   // its typical serving, in grams (no portions -> mass)
    expect(e.unit).toBe("g");
    expect(e.kcal).toBe(450);         // 180 kcal/100g * 2.5
    expect(e.protein_g).toBe(30);     // 12 * 2.5

    // The hero moved for a custom food exactly as it does for a seeded one.
    expect(text()).toContain("450");
    expect(text()).toContain("1,600 kcal left"); // 2050 - 450
  });

  it("a client with NO coach target can still log — the diary just has nothing to measure against", async () => {
    db.nutrition_goals = [];   // team-plan self-service target: none
    db.nutrition_phases = [];  // coached target: none either
    await act(async () => root.render(<FoodLogDayView clientUserId="client-1" />));
    await settle();

    expect(text()).toContain("No coach target set");
    expect(doc().querySelector('[role="progressbar"]')).toBeNull();

    await logChicken();

    expect(db.food_log_entries).toHaveLength(1);
    expect(text()).toContain("209");        // the food still logs, and still totals
    expect(text()).not.toContain("kcal left"); // ...but nothing is invented to compare it to
  });

  // ── The regression this PR fixes ─────────────────────────────────────────────
  // A coached (1:1) client's target lives on nutrition_PHASES, not nutrition_goals.
  // The old code read only nutrition_goals, so every coached client — who is exactly the
  // client with a coach-set target to show — saw "no target". Verified live: 5 active phases
  // carry a target, nutrition_goals had 1 active row total.

  it("PHASE TARGET: a coached client with an active phase (and NO goals row) shows the target", async () => {
    db.nutrition_goals = []; // the coached client has none — the old bug blanked the target here
    db.nutrition_phases = [
      { user_id: "client-1", is_active: true, daily_calories: 1950, protein_grams: 160, fat_grams: 60, carb_grams: 180 },
    ];
    await act(async () => root.render(<FoodLogDayView clientUserId="client-1" />));
    await settle();

    // The target renders — the exact thing that was null before the fix.
    expect(text()).toContain("1,950 kcal left");
    expect(text()).not.toContain("No coach target set");
    expect(doc().querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it("ATTRIBUTION: a staff-added entry is visibly marked on the client's OWN diary", async () => {
    // The client must be able to tell a coach-inserted entry from one they logged themselves.
    db.food_log_entries = [
      {
        id: "staff-entry-1",
        client_id: "client-1",
        food_id: CHICKEN_ID,
        food_name: "Chicken breast, skinless, raw",
        meal_slot: "breakfast",
        quantity: 1,
        unit: "serving",
        quantity_g: 174,
        kcal: 208.8,
        protein_g: 39,
        fat_g: 5,
        carb_g: 0,
        log_date: new Date().toISOString().slice(0, 10),
        source_note: "1 breast",
        created_by_role: "coach",
      },
    ];
    await act(async () => root.render(<FoodLogDayView clientUserId="client-1" />));
    await settle();

    const chip = doc().querySelector('[data-entry-attribution="coach"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("Added by your coach");
  });

  it("PHASE WINS when both a phase and a goals row exist", async () => {
    // The phase is the coach's live target; goals is a stale self-service leftover. Phase wins.
    db.nutrition_goals = [
      { user_id: "client-1", is_active: true, daily_calories: 2050, protein_grams: 172, fat_grams: 68, carb_grams: 205 },
    ];
    db.nutrition_phases = [
      { user_id: "client-1", is_active: true, daily_calories: 1950, protein_grams: 160, fat_grams: 60, carb_grams: 180 },
    ];
    await act(async () => root.render(<FoodLogDayView clientUserId="client-1" />));
    await settle();

    expect(text()).toContain("1,950 kcal left");   // phase
    expect(text()).not.toContain("2,050 kcal left"); // not the goals row
  });
});
