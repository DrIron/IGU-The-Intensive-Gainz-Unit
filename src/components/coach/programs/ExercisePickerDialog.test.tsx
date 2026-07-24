// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ExercisePickerDialog (slice 2b) — now backed by ExerciseBrowse in picker mode. Tests pin the
 * contract that must survive the rewire: single-select returns (id, section, DENSE name); multiSelect
 * batch-commits the checked rows; sourceMuscleId deep-links; the "Custom" badge + coach (is_global||own)
 * scoping still hold.
 */

// jsdom shims for Radix Dialog + Select.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (q: string) => ({ matches: false, media: q, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }),
});
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
if (typeof window.PointerEvent === "undefined") {
  (window as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {};
}
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn();
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();

type Row = Record<string, unknown>;
const mk = (o: Partial<Row>): Row => ({
  category: "strength", client_name: null, primary_muscle: null, secondary_muscles: null,
  equipment: null, resistance_profiles: null, laterality: "bi", subdivision_id: null, is_global: true, created_by_coach_id: null,
  ...o,
});

const ROWS: Row[] = [
  mk({ id: "t1", muscle_id: "m-tri", name: "Triceps Long M Overhead Extension (L)", client_name: "Triceps Overhead Machine Extension", equipment: "M" }),
  mk({ id: "t2", muscle_id: "m-tri", name: "Triceps Lat+Med C-FT Rope Pushdown (S)", client_name: "Triceps Rope Pushdown", equipment: "C-FT" }),
  mk({ id: "tc", muscle_id: "m-tri", name: "Coach-1 Custom Triceps Move", client_name: null, equipment: "DB", is_global: false, created_by_coach_id: "coach-1" }),
  mk({ id: "tf", muscle_id: "m-tri", name: "Foreign Coach Triceps Move", client_name: null, equipment: "DB", is_global: false, created_by_coach_id: "coach-2" }),
  mk({ id: "cr1", category: "cardio", name: "Treadmill Run", cardio_movement_id: "cm-run" }),
  mk({ id: "mo1", category: "mobility", name: "Shoulder CARs", target_region_id: "tr-sh" }),
];

const TAXONOMY = {
  regions: [{ id: "r-arms", slug: "arms", display_name: "Arms", sort_order: 4 }],
  muscles: [{ id: "m-tri", slug: "triceps", display_name: "Triceps", primary_region_id: "r-arms", sort_order: 2, volume_key: "triceps" }],
  musclesByRegion: new Map([["r-arms", [{ id: "m-tri", display_name: "Triceps", primary_region_id: "r-arms", sort_order: 2 }]]]),
  subdivisionsByMuscle: new Map(),
  cardioMovements: [{ id: "cm-run", display_name: "Run", sort_order: 1 }],
  targetRegions: [{ id: "tr-sh", display_name: "Shoulders", sort_order: 1 }],
};

let libState: { data: Row[]; isLoading: boolean; isError: boolean; error: unknown };
// 3b: the dialog reads the movement map to group-filter fills for lift-group slots. Mutable so a test
// can supply a group map (muscle-source tests leave it undefined → no group filter, avoids bare useQuery).
let movementMapState: { data: Map<string, { groupId: string; leafId: string }> | undefined };
vi.mock("@/hooks/useExerciseLibrary", () => ({ useExerciseLibraryData: () => libState }));
vi.mock("@/hooks/useExerciseTaxonomy", () => ({ useExerciseTaxonomy: () => ({ data: TAXONOMY }) }));
vi.mock("@/hooks/useExerciseMovementMap", () => ({ useExerciseMovementMap: () => movementMapState }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { ExercisePickerDialog } = await import("./ExercisePickerDialog");

let container: HTMLDivElement;
let root: Root;
const doc = () => document.body;
async function mount(props: Record<string, unknown>): Promise<void> {
  const all = { open: true, onOpenChange: vi.fn(), coachUserId: "coach-1", ...props } as unknown as React.ComponentProps<
    typeof ExercisePickerDialog
  >;
  await act(async () => root.render(<ExercisePickerDialog {...all} />));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}
const clickLabel = async (label: string) => {
  const el = doc().querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no element aria-label="${label}"`);
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};
const clickText = async (t: string) => {
  const el = [...doc().querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(t));
  if (!el) throw new Error(`no button "${t}"`);
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("ExercisePickerDialog — backed by ExerciseBrowse", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    libState = { data: ROWS, isLoading: false, isError: false, error: null };
    movementMapState = { data: undefined };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("single-select returns (id, section, DENSE name); deep-links via sourceMuscleId; Custom badge + scoping hold", async () => {
    const onSelectExercise = vi.fn();
    await mount({ onSelectExercise, sourceMuscleId: "triceps" }); // builder id → translates to m-tri

    // Deep-linked to Triceps: this is a COACH surface, so rows headline the dense `name`.
    expect(doc().textContent).toContain("Triceps Lat+Med C-FT Rope Pushdown (S)");
    expect(doc().textContent).not.toContain("Triceps Rope Pushdown");
    // Coach's own custom row is in scope + carries a Custom badge; the foreign coach's is filtered out.
    expect(doc().textContent).toContain("Coach-1 Custom Triceps Move");
    expect(doc().textContent).toContain("Custom");
    expect(doc().textContent).not.toContain("Foreign Coach Triceps Move");

    // Tap a row → single select with the DENSE name and the default "main" section.
    await clickLabel("Select Triceps Lat+Med C-FT Rope Pushdown (S)");
    expect(onSelectExercise).toHaveBeenCalledTimes(1);
    expect(onSelectExercise.mock.calls[0]).toEqual(["t2", "main", "Triceps Lat+Med C-FT Rope Pushdown (S)"]);
  });

  it("multiSelect batch-commits the checked rows via onSelectMany", async () => {
    const onSelectMany = vi.fn();
    await mount({ onSelectExercise: vi.fn(), onSelectMany, multiSelect: true, sourceMuscleId: "triceps" });

    await clickLabel("Select Triceps Long M Overhead Extension (L)"); // check t1 (dense name)
    await clickLabel("Select Triceps Lat+Med C-FT Rope Pushdown (S)"); // check t2 (dense name)
    await clickText("Add 2 replacements");

    expect(onSelectMany).toHaveBeenCalledTimes(1);
    const picks = onSelectMany.mock.calls[0][0] as { exerciseId: string; section: string; exerciseName: string }[];
    expect(picks.map((p) => p.exerciseId).sort()).toEqual(["t1", "t2"]);
    expect(picks.every((p) => p.section === "main")).toBe(true);
    // Dense names captured (not client_name).
    expect(picks.find((p) => p.exerciseId === "t2")?.exerciseName).toBe("Triceps Lat+Med C-FT Rope Pushdown (S)");
  });

  // ── 3b fill-later fixes (PR #265 follow-up) ────────────────────────────────────────
  // A canonical fill of a lift-group slot must show ONLY that group's variations, as a flat list, and
  // must NOT render the "Add to Section" selector (canonical sessions are flat).
  it("Fix 1 — canonical fill of a lift-group slot: flat list of ONLY that group's variations", async () => {
    // t1 + tc are Squat variations; t2 is Press. (tf is a foreign coach's row → out of scope anyway.)
    movementMapState = {
      data: new Map([
        ["t1", { groupId: "squat", leafId: "squat" }],
        ["tc", { groupId: "squat", leafId: "squat" }],
        ["t2", { groupId: "press", leafId: "press_horizontal" }],
      ]),
    };
    await mount({ onSelectExercise: vi.fn(), sourceMuscleId: "squat", canonicalContext: true });

    // Only Squat-group rows in scope (t1 + own custom tc); the Press row (t2) and foreign (tf) are gone.
    expect(doc().textContent).toContain("Triceps Long M Overhead Extension (L)"); // t1 (squat)
    expect(doc().textContent).toContain("Coach-1 Custom Triceps Move"); // tc (squat, own)
    expect(doc().textContent).not.toContain("Triceps Lat+Med C-FT Rope Pushdown (S)"); // t2 (press) excluded
    expect(doc().textContent).not.toContain("Foreign Coach Triceps Move"); // out of scope

    // Flat list (count line), NOT the region→muscle tree (no "Regions" breadcrumb / region strip).
    expect(doc().textContent).toContain("2 exercises");
    expect(doc().textContent).not.toContain("Regions");
  });

  it("canonical fill of a CARDIO modality slot: flat list scoped by cardio_movement", async () => {
    await mount({ onSelectExercise: vi.fn(), sourceMuscleId: "cm-run", canonicalContext: true });
    expect(doc().textContent).toContain("Treadmill Run");        // the Run-modality exercise
    expect(doc().textContent).not.toContain("Shoulder CARs");    // a mobility row, different group
    expect(doc().textContent).not.toContain("Triceps");          // strength rows out of scope
    expect(doc().textContent).toContain("1 exercise");
    expect(doc().textContent).not.toContain("Regions");
  });

  it("canonical fill of a MOBILITY region slot: flat list scoped by target_region", async () => {
    await mount({ onSelectExercise: vi.fn(), sourceMuscleId: "tr-sh", canonicalContext: true });
    expect(doc().textContent).toContain("Shoulder CARs");        // the Shoulders-region exercise
    expect(doc().textContent).not.toContain("Treadmill Run");    // a cardio row, different group
    expect(doc().textContent).not.toContain("Triceps");
    expect(doc().textContent).toContain("1 exercise");
  });

  it("legacy (canonicalContext=false): a cardio_movement id is NOT treated as a group filter", async () => {
    await mount({ onSelectExercise: vi.fn(), sourceMuscleId: "cm-run" }); // no canonicalContext
    // No scoped flat list — the full browse renders (cardio row present, and NOT collapsed to 1).
    expect(doc().textContent).not.toContain("1 exercise");
  });

  it("Fix 2 — 'Add to Section' selector is hidden under canonical, shown for legacy callers", async () => {
    // Canonical: no section selector.
    await mount({ onSelectExercise: vi.fn(), sourceMuscleId: "triceps", canonicalContext: true });
    expect(doc().textContent).not.toContain("Add to Section");

    // Reset + legacy (default canonicalContext=false): selector present (byte-identical to before).
    await act(async () => root.unmount());
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await mount({ onSelectExercise: vi.fn(), sourceMuscleId: "triceps" });
    expect(doc().textContent).toContain("Add to Section");
  });
});
