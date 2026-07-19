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
];

const TAXONOMY = {
  regions: [{ id: "r-arms", slug: "arms", display_name: "Arms", sort_order: 4 }],
  muscles: [{ id: "m-tri", slug: "triceps", display_name: "Triceps", primary_region_id: "r-arms", sort_order: 2, volume_key: "triceps" }],
  musclesByRegion: new Map([["r-arms", [{ id: "m-tri", display_name: "Triceps", primary_region_id: "r-arms", sort_order: 2 }]]]),
  subdivisionsByMuscle: new Map(),
};

let libState: { data: Row[]; isLoading: boolean; isError: boolean; error: unknown };
vi.mock("@/hooks/useExerciseLibrary", () => ({ useExerciseLibraryData: () => libState }));
vi.mock("@/hooks/useExerciseTaxonomy", () => ({ useExerciseTaxonomy: () => ({ data: TAXONOMY }) }));
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
});
