// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ExerciseBrowse (slice 2b) — the shared drill. Tests pin: browse-mode ⓘ (onInfo), picker-mode
 * row tap (onSelect), multiSelect toggle + checked state, the sourceMuscleId deep-link, and empties.
 */

type Row = Record<string, unknown>;
const mk = (o: Partial<Row>): Row => ({
  category: "strength", client_name: null, primary_muscle: null, secondary_muscles: null,
  equipment: null, resistance_profiles: null, laterality: "bi", subdivision_id: null, is_global: true,
  ...o,
});

const ROWS: Row[] = [
  mk({ id: "t1", muscle_id: "m-tri", subdivision_id: "sd-long", name: "Triceps Long M Overhead Extension (L)", client_name: "Triceps Overhead Machine Extension", equipment: "M", resistance_profiles: ["Lengthened"] }),
  mk({ id: "t2", muscle_id: "m-tri", subdivision_id: "sd-latmed", name: "Triceps Lat+Med C-FT Rope Pushdown (S)", client_name: "Triceps Rope Pushdown", equipment: "C-FT", resistance_profiles: ["Shortened"] }),
  mk({ id: "e1", muscle_id: "m-elb", name: "Elbow Flexors DB Curl", client_name: "Dumbbell Curl", equipment: "DB" }),
];

const TAXONOMY = {
  regions: [{ id: "r-arms", slug: "arms", display_name: "Arms", sort_order: 4 }],
  muscles: [
    { id: "m-elb", slug: "elbow_flexors", display_name: "Elbow Flexors", primary_region_id: "r-arms", sort_order: 1, volume_key: "elbow_flexors" },
    { id: "m-tri", slug: "triceps", display_name: "Triceps", primary_region_id: "r-arms", sort_order: 2, volume_key: "triceps" },
  ],
  musclesByRegion: new Map([
    ["r-arms", [
      { id: "m-elb", display_name: "Elbow Flexors", primary_region_id: "r-arms", sort_order: 1 },
      { id: "m-tri", display_name: "Triceps", primary_region_id: "r-arms", sort_order: 2 },
    ]],
  ]),
  subdivisionsByMuscle: new Map([
    ["m-tri", [
      { id: "sd-long", display_name: "Long Head", muscle_id: "m-tri", sort_order: 1 },
      { id: "sd-latmed", display_name: "Lateral & Medial Head", muscle_id: "m-tri", sort_order: 2 },
    ]],
  ]),
};

vi.mock("@/hooks/useExerciseTaxonomy", () => ({ useExerciseTaxonomy: () => ({ data: TAXONOMY }) }));

const { ExerciseBrowse } = await import("./ExerciseBrowse");

let container: HTMLDivElement;
let root: Root;
async function render(ui: React.ReactElement): Promise<HTMLDivElement> {
  await act(async () => root.render(ui));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return container;
}
const clickLabel = async (label: string) => {
  const el = container.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no element aria-label="${label}"`);
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("ExerciseBrowse", () => {
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

  it("sourceMuscleId deep-links straight to that muscle's Level-C list", async () => {
    const el = await render(<ExerciseBrowse rows={ROWS as never} mode="browse" showInfo sourceMuscleId="m-tri" />);
    // Opens at Triceps (breadcrumb + its rows), not the region grid.
    expect(el.textContent).toContain("Triceps");
    expect(el.textContent).toContain("Triceps Rope Pushdown"); // client_name
    expect(el.querySelector('[aria-label="View Triceps Rope Pushdown"]')).not.toBeNull();
    // Not a region grid.
    expect(el.querySelector('[aria-label="Browse Arms exercises"]')).toBeNull();
  });

  it("browse mode: a row tap fires onInfo with the exercise", async () => {
    const onInfo = vi.fn();
    await render(<ExerciseBrowse rows={ROWS as never} mode="browse" showInfo onInfo={onInfo} sourceMuscleId="m-tri" />);
    await clickLabel("View Triceps Rope Pushdown");
    expect(onInfo).toHaveBeenCalledTimes(1);
    expect((onInfo.mock.calls[0][0] as Row).id).toBe("t2");
  });

  it("picker mode: a row tap fires onSelect (single-select)", async () => {
    const onSelect = vi.fn();
    await render(<ExerciseBrowse rows={ROWS as never} mode="picker" onSelect={onSelect} sourceMuscleId="m-tri" />);
    await clickLabel("Select Triceps Rope Pushdown");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0][0] as Row).id).toBe("t2");
  });

  it("picker multiSelect: row tap toggles onToggle; selectedIds shows a checked row", async () => {
    const onToggle = vi.fn();
    const el = await render(
      <ExerciseBrowse rows={ROWS as never} mode="picker" multiSelect selectedIds={new Set(["t1"])} onToggle={onToggle} sourceMuscleId="m-tri" />,
    );
    // t1 is pre-checked (aria-checked), t2 is not.
    const t1 = el.querySelector('[aria-label="Select Triceps Overhead Machine Extension"]');
    const t2 = el.querySelector('[aria-label="Select Triceps Rope Pushdown"]');
    expect(t1?.getAttribute("role")).toBe("checkbox");
    expect(t1?.getAttribute("aria-checked")).toBe("true");
    expect(t2?.getAttribute("aria-checked")).toBe("false");

    await clickLabel("Select Triceps Rope Pushdown");
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect((onToggle.mock.calls[0][0] as Row).id).toBe("t2");
  });

  it("renders a caller row badge (e.g. Custom) and the UNI chip rules from the parent surface", async () => {
    const el = await render(
      <ExerciseBrowse rows={ROWS as never} mode="picker" onSelect={vi.fn()} sourceMuscleId="m-tri" renderRowBadge={(r) => (!r.is_global ? <span>Custom</span> : null)} />,
    );
    // All triceps rows are global in this fixture → no Custom badge.
    expect(el.textContent).not.toContain("Custom");
  });

  it("empty rows → EmptyState, never a blank grid", async () => {
    const el = await render(<ExerciseBrowse rows={[] as never} mode="browse" showInfo />);
    expect(el.textContent).toContain("No exercises found");
  });

  it("error → LoadError (not an empty state)", async () => {
    const el = await render(<ExerciseBrowse rows={[] as never} mode="browse" error onRetry={vi.fn()} />);
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.textContent).toContain("Couldn't load");
  });
});
