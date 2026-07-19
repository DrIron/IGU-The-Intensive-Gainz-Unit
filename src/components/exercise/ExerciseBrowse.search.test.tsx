// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ExerciseBrowse search predicate — token-AND over a per-row haystack (name + client_name + muscle
 * group/display/subdivision + equipment code & friendly word + movement pattern + category). Pins:
 * order-independence, multi-word AND, muscle-name reach ("quadriceps"), equipment synonyms, and the
 * category chip ANDing with the search. NOT fuzzy — every term must be a substring.
 */

type Row = Record<string, unknown>;
const mk = (o: Partial<Row>): Row => ({
  category: "strength", client_name: null, primary_muscle: null, secondary_muscles: null,
  equipment: null, resistance_profiles: null, laterality: "bi", muscle_id: null, subdivision_id: null,
  subdivision: null, muscle_group: null, anatomical_name: null, movement_pattern: null, is_global: true,
  ...o,
});

const ROWS: Row[] = [
  // Chest incline-press variants (strength)
  mk({ id: "c1", muscle_id: "m-pec", muscle_group: "Chest", name: "Sternal Pec BB Incline Press (M)", client_name: "Barbell Incline Bench Press", equipment: "BB", movement_pattern: "horizontal press" }),
  mk({ id: "c2", muscle_id: "m-pec", muscle_group: "Chest", name: "Sternal Pec SM Incline Press (M)", client_name: "Smith Incline Press", equipment: "SM", movement_pattern: "horizontal press" }),
  mk({ id: "c3", muscle_id: "m-pec", muscle_group: "Chest", name: "Sternal Pec DB Incline Press", client_name: "Incline Dumbbell Press", equipment: "DB", movement_pattern: "horizontal press" }),
  // Quads — press + squat variants; muscle_group "Quadriceps" is what "quadriceps" hits
  mk({ id: "q1", muscle_id: "m-quad", muscle_group: "Quadriceps", name: "Quads BB Back Squat", client_name: "Barbell Back Squat", equipment: "BB", movement_pattern: "squat" }),
  mk({ id: "q2", muscle_id: "m-quad", muscle_group: "Quadriceps", name: "Quads M Leg Press", client_name: "Leg Press", equipment: "M", movement_pattern: "press" }),
  mk({ id: "q3", muscle_id: "m-quad", muscle_group: "Quadriceps", name: "Quads SM Hack Squat", client_name: "Smith Hack Squat", equipment: "SM", movement_pattern: "squat" }),
  // Biceps curls
  mk({ id: "e1", muscle_id: "m-elb", muscle_group: "Biceps", name: "Elbow Flexors DB Curl", client_name: "Dumbbell Curl", equipment: "DB", movement_pattern: "curl" }),
  mk({ id: "e2", muscle_id: "m-elb", muscle_group: "Biceps", name: "Elbow Flexors C-FT Curl", client_name: "Cable Curl", equipment: "C-FT", movement_pattern: "curl" }),
  // Triceps overhead (strength) + a mobility row sharing the "overhead" term → category-AND test
  mk({ id: "t1", muscle_id: "m-tri", muscle_group: "Triceps", name: "Triceps Long M Overhead Extension (L)", client_name: "Triceps Overhead Extension", equipment: "M", movement_pattern: "extension" }),
  mk({ id: "mob1", category: "mobility", name: "Overhead Shoulder Mobility Reach", client_name: "Overhead Reach", equipment: "BW" }),
];

const TAXONOMY = {
  regions: [
    { id: "r-arms", slug: "arms", display_name: "Arms", sort_order: 4 },
    { id: "r-chest", slug: "chest", display_name: "Chest", sort_order: 1 },
    { id: "r-legs", slug: "legs", display_name: "Legs", sort_order: 5 },
  ],
  muscles: [
    { id: "m-pec", slug: "pec", display_name: "Pec Major", primary_region_id: "r-chest", sort_order: 1, volume_key: "chest" },
    { id: "m-quad", slug: "quads", display_name: "Quads", primary_region_id: "r-legs", sort_order: 1, volume_key: "quads" },
    { id: "m-elb", slug: "elbow_flexors", display_name: "Biceps", primary_region_id: "r-arms", sort_order: 1, volume_key: "elbow_flexors" },
    { id: "m-tri", slug: "triceps", display_name: "Triceps", primary_region_id: "r-arms", sort_order: 2, volume_key: "triceps" },
  ],
  subdivisions: [],
  musclesByRegion: new Map(),
  subdivisionsByMuscle: new Map(),
};

vi.mock("@/hooks/useExerciseTaxonomy", () => ({ useExerciseTaxonomy: () => ({ data: TAXONOMY }) }));

const { ExerciseBrowse } = await import("./ExerciseBrowse");

let container: HTMLDivElement;
let root: Root;
async function render(search: string): Promise<void> {
  await act(async () => root.render(<ExerciseBrowse rows={ROWS as never} mode="browse" showInfo search={search} />));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
/** The client_name headline of every flat-list row currently shown, sorted for stable comparison. */
const shownRows = (): string[] =>
  [...container.querySelectorAll('[aria-label^="View "]')]
    .map((el) => el.getAttribute("aria-label")!.replace(/^View /, ""))
    .sort();
const clickText = async (text: string) => {
  const btn = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === text);
  if (!btn) throw new Error(`no button "${text}"`);
  await act(async () => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("ExerciseBrowse — token-AND search", () => {
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

  it("is order-independent: 'incline press' and 'press incline' return the SAME set", async () => {
    await render("incline press");
    const a = shownRows();
    await render("press incline");
    const b = shownRows();
    expect(a).toEqual(b);
    // The three incline-press variants, nothing else.
    expect(a).toEqual(["Barbell Incline Bench Press", "Incline Dumbbell Press", "Smith Incline Press"]);
  });

  it("multi-word AND across fields: 'quads press' → quad press variants (non-zero, no squats/chest)", async () => {
    await render("quads press");
    expect(shownRows()).toEqual(["Leg Press"]);
  });

  it("muscle name reaches the whole group: 'quadriceps' → the full quad set (not just one)", async () => {
    await render("quadriceps");
    expect(shownRows()).toEqual(["Barbell Back Squat", "Leg Press", "Smith Hack Squat"]);
  });

  it("equipment synonyms: 'smith incline' and 'cable curl' resolve via the friendly word", async () => {
    await render("smith incline");
    expect(shownRows()).toEqual(["Smith Incline Press"]); // SM → smith; not the Smith Hack Squat
    await render("cable curl");
    expect(shownRows()).toEqual(["Cable Curl"]); // C-FT → cable; not the Dumbbell Curl
  });

  it("de-hyphenated equipment code matches: 'cft' → the C-FT row", async () => {
    await render("cft");
    expect(shownRows()).toEqual(["Cable Curl"]);
  });

  it("single-term searches are unchanged: 'curl' → both curls, 'bench' → the one with Bench in a label", async () => {
    await render("curl");
    expect(shownRows()).toEqual(["Cable Curl", "Dumbbell Curl"]);
    await render("bench");
    expect(shownRows()).toEqual(["Barbell Incline Bench Press"]);
  });

  it("empty query shows the region grid (no flat rows)", async () => {
    await render("");
    expect(container.querySelectorAll('[aria-label^="View "]').length).toBe(0);
    expect(container.querySelector('[aria-label^="Browse "]')).not.toBeNull();
  });

  it("the category chip still narrows: 'overhead' spans strength+mobility; Mobility chip keeps only mobility", async () => {
    await render("overhead");
    // Default category is Strength → only the strength overhead row.
    expect(shownRows()).toEqual(["Triceps Overhead Extension"]);
    // Switch to Mobility → the search still applies, now ANDed with the category.
    await clickText("Mobility");
    expect(shownRows()).toEqual(["Overhead Reach"]);
  });
});
