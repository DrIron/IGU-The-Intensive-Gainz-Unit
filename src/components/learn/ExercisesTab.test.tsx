// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ExercisesTab (slice 2) — the region → muscle → exercise browse. Tests pin: live region counts,
 * category swap to a flat list, the drill + breadcrumb, subdivision/resistance filter chips, the
 * UNI chip (laterality<>'bi'), client_name (not the dense name), and the empty-search copy.
 */

// --- controllable hook returns -------------------------------------------------
type Row = Record<string, unknown>;
const mk = (o: Partial<Row>): Row => ({
  category: "strength", client_name: null, primary_muscle: null, secondary_muscles: null,
  equipment: null, resistance_profiles: null, laterality: "bi", subdivision_id: null,
  default_video_url: null, setup_points: null, setup_instructions: null, description: null, ...o,
});

const ROWS: Row[] = [
  // Arms / Triceps (3) — two subdivisions, one unilateral
  mk({ id: "t1", muscle_id: "m-tri", subdivision_id: "sd-long", name: "Triceps Long M Overhead Extension (L)", client_name: "Triceps Overhead Machine Extension", equipment: "M", resistance_profiles: ["Lengthened"] }),
  mk({ id: "t2", muscle_id: "m-tri", subdivision_id: "sd-latmed", name: "Triceps Lat+Med C-FT Rope Pushdown (S)", client_name: "Triceps Rope Pushdown", equipment: "C-FT", resistance_profiles: ["Shortened"] }),
  mk({ id: "t3", muscle_id: "m-tri", subdivision_id: "sd-long", name: "Triceps Long DB Single-Arm Overhead Extension (L)", client_name: "Triceps Single-Arm Overhead Extension", equipment: "DB", resistance_profiles: ["Lengthened"], laterality: "uni" }),
  // Arms / Elbow Flexors (1)
  mk({ id: "e1", muscle_id: "m-elb", name: "Elbow Flexors DB Curl", client_name: "Dumbbell Curl", equipment: "DB", resistance_profiles: ["Mid-range"] }),
  // Legs / Quads (2)
  mk({ id: "q1", muscle_id: "m-quad", name: "Quads BB Squat", client_name: "Barbell Squat", equipment: "BB" }),
  mk({ id: "q2", muscle_id: "m-quad", name: "Quads M Leg Press", client_name: "Leg Press", equipment: "M" }),
  // Non-strength: cardio (no muscle_id → never in the region grid)
  mk({ id: "c1", category: "cardio", muscle_id: null, name: "Cardio Treadmill Running (M)", equipment: "Treadmill" }),
];

const TAXONOMY = {
  regions: [
    { id: "r-arms", slug: "arms", display_name: "Arms", sort_order: 4 },
    { id: "r-legs", slug: "legs", display_name: "Legs", sort_order: 5 },
  ],
  muscles: [
    { id: "m-elb", slug: "elbow_flexors", display_name: "Elbow Flexors", primary_region_id: "r-arms", sort_order: 1 },
    { id: "m-tri", slug: "triceps", display_name: "Triceps", primary_region_id: "r-arms", sort_order: 2 },
    { id: "m-quad", slug: "quads", display_name: "Quads", primary_region_id: "r-legs", sort_order: 1 },
  ],
  musclesByRegion: new Map([
    ["r-arms", [
      { id: "m-elb", display_name: "Elbow Flexors", primary_region_id: "r-arms", sort_order: 1 },
      { id: "m-tri", display_name: "Triceps", primary_region_id: "r-arms", sort_order: 2 },
    ]],
    ["r-legs", [{ id: "m-quad", display_name: "Quads", primary_region_id: "r-legs", sort_order: 1 }]],
  ]),
  subdivisionsByMuscle: new Map([
    ["m-tri", [
      { id: "sd-long", display_name: "Long Head", muscle_id: "m-tri", sort_order: 1 },
      { id: "sd-latmed", display_name: "Lateral & Medial Head", muscle_id: "m-tri", sort_order: 2 },
    ]],
  ]),
};

let libState: { data: Row[]; isLoading: boolean; isError: boolean; refetch: () => void };
vi.mock("@/hooks/useExerciseLibrary", () => ({ useExerciseLibraryData: () => libState }));
vi.mock("@/hooks/useExerciseTaxonomy", () => ({ useExerciseTaxonomy: () => ({ data: TAXONOMY }) }));
vi.mock("@/components/exercise/ExerciseDemoCard", () => ({
  ExerciseDemoCard: ({ exercise, open }: { exercise: Row; open: boolean }) =>
    open ? <div data-testid="demo-card">{(exercise.client_name as string) ?? (exercise.name as string)}</div> : null,
}));
vi.mock("@/components/coach/programs/SwapExerciseDialog", () => ({ SwapExerciseDialog: () => null }));

const { ExercisesTab } = await import("./ExercisesTab");

let container: HTMLDivElement;
let root: Root;

async function render(search = ""): Promise<HTMLDivElement> {
  await act(async () => root.render(<ExercisesTab search={search} />));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return container;
}
const txt = () => container.textContent ?? "";
const clickText = async (t: string) => {
  const el = [...container.querySelectorAll("button, [role='button']")].find((b) => (b.textContent ?? "").trim() === t)
    ?? [...container.querySelectorAll("button, [role='button']")].find((b) => (b.textContent ?? "").includes(t));
  if (!el) throw new Error(`no clickable with text "${t}"`);
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};
const clickLabel = async (label: string) => {
  const el = container.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no element with aria-label "${label}"`);
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("ExercisesTab — by-muscle browse", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    libState = { data: ROWS, isLoading: false, isError: false, refetch: vi.fn() };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("Level A: region grid shows live counts (strength only; cardio/systemic excluded)", async () => {
    const el = await render();
    expect(el.textContent).toContain("Arms");
    expect(el.textContent).toContain("4 exercises"); // triceps 3 + elbow 1
    expect(el.textContent).toContain("Legs");
    expect(el.textContent).toContain("2 exercises"); // quads
    // The cardio row is not surfaced in the strength region grid.
    expect(el.textContent).not.toContain("Treadmill Running");
  });

  it("selecting a non-strength category swaps to a flat list (no region grid)", async () => {
    await render();
    await clickText("Cardio");
    expect(txt()).toContain("Cardio Treadmill Running (M)"); // flat row (no client_name → dense name)
    expect(txt()).not.toContain("exercises"); // region-count cards gone (flat list says "1 exercise")
    expect(txt()).toContain("1 exercise");
  });

  it("drills region → muscle → exercise, updating the breadcrumb and showing client_name", async () => {
    await render();
    await clickLabel("Browse Arms exercises");
    expect(txt()).toContain("Regions"); // breadcrumb
    expect(txt()).toContain("Elbow Flexors");
    expect(txt()).toContain("Triceps");

    await clickLabel("Browse Triceps exercises");
    expect(txt()).toContain("Triceps"); // breadcrumb tail
    // Rows show the friendly client_name, never the dense internal name.
    expect(txt()).toContain("Triceps Rope Pushdown");
    expect(txt()).not.toContain("Triceps Lat+Med C-FT Rope Pushdown (S)");
    // Friendly equipment: C-FT → Cable.
    expect(txt()).toContain("Cable");
  });

  it("subdivision + resistance filter chips narrow the list; UNI chip only on laterality<>'bi'", async () => {
    await render();
    await clickLabel("Browse Arms exercises");
    await clickLabel("Browse Triceps exercises");

    // All 3 triceps rows; exactly one is unilateral (t3).
    expect(txt().match(/UNI/g)?.length).toBe(1);

    // Subdivision chip "Long Head" → t1 + t3 (2 rows), drops the Lat+Med pushdown.
    await clickText("Long Head");
    expect(txt()).toContain("Triceps Overhead Machine Extension");
    expect(txt()).toContain("Triceps Single-Arm Overhead Extension");
    expect(txt()).not.toContain("Triceps Rope Pushdown");

    // Clear head, filter by resistance "Shortened" → only the Rope Pushdown.
    await clickText("Long Head"); // toggle off
    await clickText("Shortened");
    expect(txt()).toContain("Triceps Rope Pushdown");
    expect(txt()).not.toContain("Triceps Overhead Machine Extension");
  });

  it("empty search shows the no-search copy, never 'matching \"\"'", async () => {
    await render();
    // A category with no rows + empty search: the flat-list empty state.
    await clickText("Physio");
    expect(txt()).toContain("No exercises found");
    expect(txt()).not.toContain('matching ""');
  });

  it("a real search that misses shows the matching-term copy", async () => {
    const el = await render("zznope");
    expect(el.textContent).toContain('No exercises matching "zznope"');
  });
});
