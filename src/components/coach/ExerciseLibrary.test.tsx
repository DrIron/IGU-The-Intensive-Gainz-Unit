// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Coach Exercise Library (slice 2c) — now the shared ExerciseBrowse + coach ExerciseDemoCard. Tests:
 * the region drill replaces the old facet dropdowns + detail Dialog; ⓘ opens the coach-context demo
 * card (dense name); coach scoping (is_global || own) + Custom badge hold.
 */

// jsdom shims for the demo card's Dialog/Drawer.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (q: string) => ({ matches: false, media: q, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }),
});
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
if (typeof window.PointerEvent === "undefined") (window as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {};
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn();
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();

type Row = Record<string, unknown>;
const mk = (o: Partial<Row>): Row => ({
  category: "strength", client_name: null, primary_muscle: null, secondary_muscles: null,
  equipment: null, resistance_profiles: null, laterality: "bi", subdivision_id: null,
  positioning: null, grip: null, setup_points: null, setup_instructions: null, description: null,
  default_video_url: null, is_global: true, created_by_coach_id: null, ...o,
});

const ROWS: Row[] = [
  mk({ id: "t1", muscle_id: "m-tri", name: "Triceps Lat+Med C-FT Rope Pushdown (S)", client_name: "Triceps Rope Pushdown", equipment: "C-FT", resistance_profiles: ["Shortened"], positioning: "Standing" }),
  mk({ id: "tc", muscle_id: "m-tri", name: "Coach-1 Custom Move", client_name: null, equipment: "DB", is_global: false, created_by_coach_id: "coach-1" }),
  mk({ id: "tf", muscle_id: "m-tri", name: "Foreign Coach Move", client_name: null, equipment: "DB", is_global: false, created_by_coach_id: "coach-2" }),
];

const TAXONOMY = {
  regions: [{ id: "r-arms", slug: "arms", display_name: "Arms", sort_order: 4 }],
  muscles: [{ id: "m-tri", slug: "triceps", display_name: "Triceps", primary_region_id: "r-arms", sort_order: 2, volume_key: "triceps" }],
  musclesByRegion: new Map([["r-arms", [{ id: "m-tri", display_name: "Triceps", primary_region_id: "r-arms", sort_order: 2 }]]]),
  subdivisionsByMuscle: new Map(),
};

let libState: { data: Row[]; isLoading: boolean; isError: boolean; refetch: () => void };
vi.mock("@/hooks/useExerciseLibrary", () => ({ useExerciseLibraryData: () => libState }));
vi.mock("@/hooks/useExerciseTaxonomy", () => ({ useExerciseTaxonomy: () => ({ data: TAXONOMY }) }));

const { ExerciseLibrary } = await import("./ExerciseLibrary");

let container: HTMLDivElement;
let root: Root;
const doc = () => document.body;
async function mount(): Promise<void> {
  await act(async () => root.render(<ExerciseLibrary coachUserId="coach-1" />));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}
const clickLabel = async (label: string) => {
  const el = doc().querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no element aria-label="${label}"`);
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("Coach ExerciseLibrary — shared browse", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    libState = { data: ROWS, isLoading: false, isError: false, refetch: vi.fn() };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders the region drill (not the old facet dropdowns or detail Dialog)", async () => {
    await mount();
    // Region grid, live count (t1 global + tc own = 2; foreign excluded).
    expect(doc().querySelector('[aria-label="Browse Arms exercises"]')).not.toBeNull();
    expect(doc().textContent).toContain("2 exercises");
    // The old facet dropdowns + bespoke-Dialog labels are gone.
    expect(doc().textContent).not.toContain("All Muscles");
    expect(doc().textContent).not.toContain("All Categories");
    expect(doc().textContent).not.toContain("Also targets:");
    expect(doc().textContent).not.toContain("Primary Muscle:");
  });

  it("coach scoping: own custom row shows with a Custom badge; a foreign coach's row is absent", async () => {
    await mount();
    await clickLabel("Browse Arms exercises");
    await clickLabel("Browse Triceps exercises");
    expect(doc().textContent).toContain("Coach-1 Custom Move");
    expect(doc().textContent).toContain("Custom");
    expect(doc().textContent).not.toContain("Foreign Coach Move");
  });

  it("coach rows headline the dense `name`; ⓘ opens the coach demo card (name + client_name subline)", async () => {
    await mount();
    await clickLabel("Browse Arms exercises");
    await clickLabel("Browse Triceps exercises");
    // COACH surface: rows headline the dense `name`, NOT the friendly client_name.
    expect(doc().textContent).toContain("Triceps Lat+Med C-FT Rope Pushdown (S)");
    expect(doc().textContent).not.toContain("Triceps Rope Pushdown");
    await clickLabel("View Triceps Lat+Med C-FT Rope Pushdown (S)");
    // The coach demo card headlines the dense name and surfaces client_name as the subline + descriptor.
    expect(doc().textContent).toContain("Triceps Rope Pushdown"); // client_name subline
    expect(doc().textContent).toContain("Standing"); // positioning detail (coach context)
  });
});
