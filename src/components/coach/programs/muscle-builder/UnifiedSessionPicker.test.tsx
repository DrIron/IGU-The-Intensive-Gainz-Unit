// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * UnifiedSessionPicker category tabs now come from the shared lib/exerciseCategories source, so the
 * planning-board picker exposes EVERY library category — including Powerlifting + Systemic, which had
 * drifted out (F2). A powerlifting exercise adds as an ActivityType 'strength' slot.
 */

type Row = Record<string, unknown>;
const mk = (o: Partial<Row>): Row => ({
  client_name: null, primary_muscle: null, equipment: null, muscle_id: null, subdivision_id: null,
  cardio_movement_id: null, technique_id: null, target_region_id: null, physio_purpose_id: null,
  resistance_profiles: null, is_active: true, is_global: true, ...o,
});

const ROWS: Row[] = [
  mk({ id: "p1", name: "Competition Back Squat", category: "powerlifting", equipment: "BB" }),
  mk({ id: "p2", name: "Competition Bench Press", category: "powerlifting", equipment: "BB" }),
  mk({ id: "p3", name: "Competition Deadlift", category: "powerlifting", equipment: "BB" }),
  mk({ id: "sys1", name: "Sled Push", category: "systemic", equipment: "Sled" }),
  mk({ id: "s1", name: "Barbell Back Squat", category: "strength", equipment: "BB", muscle_id: "m-quad" }),
];

const TAXONOMY = {
  muscles: [{ id: "m-quad", volume_key: "quads" }],
  cardioMovements: [], techniques: [], targetRegions: [], physioPurposes: [],
};

// Keep the real filterExercises; stub only the data hook.
vi.mock("@/hooks/useExerciseLibrary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useExerciseLibrary")>()),
  useExerciseLibraryData: () => ({ data: ROWS, isLoading: false }),
}));
vi.mock("@/hooks/useExerciseTaxonomy", () => ({ useExerciseTaxonomy: () => ({ data: TAXONOMY }) }));
// The strength tab's inner browsers aren't under test here.
vi.mock("./StrengthTaxonomyBrowse", () => ({ StrengthTaxonomyBrowse: () => null }));
vi.mock("./SessionAddPicker", () => ({ SessionAddPicker: () => null }));

const { UnifiedSessionPicker } = await import("./UnifiedSessionPicker");

let container: HTMLDivElement;
let root: Root;
const tabButton = (label: string) =>
  [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === label);
// List-item buttons carry the name PLUS an equipment span, so match by substring.
const clickContains = async (label: string) => {
  const btn = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(label));
  if (!btn) throw new Error(`no button containing "${label}"`);
  await act(async () => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("UnifiedSessionPicker — category tabs from the shared source", () => {
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

  async function mount(onAddExercise = vi.fn()) {
    await act(async () => {
      root.render(
        <UnifiedSessionPicker
          onAddMuscle={vi.fn()}
          onAddExercise={onAddExercise}
          variant="roomy"
          initialCategory="powerlifting"
        />,
      );
    });
    return onAddExercise;
  }

  it("exposes Powerlifting + Systemic tabs (previously missing from the picker)", async () => {
    await mount();
    expect(tabButton("Powerlifting")).toBeTruthy();
    expect(tabButton("Systemic")).toBeTruthy();
  });

  it("the Powerlifting tab lists powerlifting exercises; picking one adds an ActivityType 'strength' slot", async () => {
    const onAddExercise = await mount();
    // Started on the Powerlifting tab → its three comp lifts are listed, other categories are not.
    expect(container.textContent).toContain("Competition Back Squat");
    expect(container.textContent).toContain("Competition Deadlift");
    expect(container.textContent).not.toContain("Sled Push"); // systemic
    expect(container.textContent).not.toContain("Barbell Back Squat"); // strength

    await clickContains("Competition Back Squat");
    expect(onAddExercise).toHaveBeenCalledTimes(1);
    expect(onAddExercise.mock.calls[0]).toEqual([{ exerciseId: "p1", name: "Competition Back Squat" }, "strength"]);
  });
});
