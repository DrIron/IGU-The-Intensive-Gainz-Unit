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
  mk({ id: "cr1", name: "Treadmill Run", category: "cardio", cardio_movement_id: "cm-run" }),
  mk({ id: "mo1", name: "Shoulder CARs", category: "mobility", target_region_id: "tr-sh" }),
];

const TAXONOMY = {
  regions: [], muscles: [{ id: "m-quad", volume_key: "quads" }], subdivisions: [],
  musclesByRegion: new Map(), subdivisionsByMuscle: new Map(),
  cardioMovements: [
    { id: "cm-run", display_name: "Run", sort_order: 1 },
    { id: "cm-walk", display_name: "Walk", sort_order: 2 },
  ],
  techniques: [],
  targetRegions: [
    { id: "tr-sh", display_name: "Shoulders", sort_order: 1 },
    { id: "tr-hip", display_name: "Hips", sort_order: 2 },
  ],
  physioPurposes: [],
};

// Keep the real filterExercises; stub only the data hook.
vi.mock("@/hooks/useExerciseLibrary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useExerciseLibrary")>()),
  useExerciseLibraryData: () => ({ data: ROWS, isLoading: false }),
}));
vi.mock("@/hooks/useExerciseTaxonomy", () => ({ useExerciseTaxonomy: () => ({ data: TAXONOMY }) }));
// 3b: movement-group config for the Powerlifting group-pick chips (always returns data; the
// component gates rendering on the enableGroupPick prop, so flag-OFF shows no chips regardless).
vi.mock("@/hooks/useMovementGroupConfig", () => ({
  useMovementGroupConfig: () => ({
    data: {
      patternMap: {},
      groups: [
        { id: "squat", label: "Squat", sortOrder: 1, variationCount: 41, subGroups: [] },
        { id: "hinge", label: "Hinge", sortOrder: 2, variationCount: 32, subGroups: [] },
        { id: "press", label: "Press", sortOrder: 3, variationCount: 70, subGroups: [] },
        // Non-powerlifting compound groups — must NOT appear as Powerlifting-tab chips (Part 1).
        { id: "pull", label: "Pull", sortOrder: 4, variationCount: 81, subGroups: [] },
        { id: "core", label: "Core", sortOrder: 5, variationCount: 37, subGroups: [] },
        { id: "carry", label: "Carry / Full-Body", sortOrder: 6, variationCount: 22, subGroups: [] },
      ],
    },
  }),
}));
// The strength tab's inner browsers aren't under test here.
vi.mock("./StrengthTaxonomyBrowse", () => ({ StrengthTaxonomyBrowse: () => null }));
vi.mock("./SessionAddPicker", () => ({ SessionAddPicker: () => null }));

const { UnifiedSessionPicker } = await import("./UnifiedSessionPicker");

let container: HTMLDivElement;
let root: Root;
const tabButton = (label: string) =>
  [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === label);
// Non-strength rows now render via the shared ExerciseBrowse (mode="picker") — a ClickableCard
// (div[role=button]) labelled "Select <name>", not a bespoke <button>.
const clickAria = async (label: string) => {
  const el = container.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no element aria-label="${label}"`);
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
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

  it("non-strength tab renders shared ExerciseBrowse picker rows; picking one adds an ActivityType 'strength' slot", async () => {
    const onAddExercise = await mount();
    // Started on the Powerlifting tab → the shared ExerciseBrowse (picker mode) lists its comp lifts
    // as "Select <name>" rows; other categories are filtered out by the locked category.
    expect(container.querySelector('[aria-label="Select Competition Back Squat"]')).toBeTruthy();
    expect(container.textContent).toContain("Competition Deadlift");
    expect(container.textContent).not.toContain("Sled Push"); // systemic
    expect(container.textContent).not.toContain("Barbell Back Squat"); // strength

    await clickAria("Select Competition Back Squat");
    expect(onAddExercise).toHaveBeenCalledTimes(1);
    expect(onAddExercise.mock.calls[0]).toEqual([{ exerciseId: "p1", name: "Competition Back Squat" }, "strength"]);
  });

  it("search inside a non-strength tab filters the shared browse (haystack: name/equipment)", async () => {
    await mount();
    const input = container.querySelector("input") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "deadlift");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[aria-label="Select Competition Deadlift"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Select Competition Back Squat"]')).toBeNull();
  });

  // 3b — volume-first group-pick. Flag lives on the enableGroupPick prop (= canonical template
  // authoring). OFF is the shipped add-flow; ON leads the Powerlifting tab with lift-group chips.
  it("flag-OFF (default): Powerlifting tab shows NO group-pick chips — add-flow byte-identical", async () => {
    await mount(); // enableGroupPick defaults to false
    expect(container.textContent).not.toContain("Add a lift group");
    expect(container.textContent).not.toContain("Squat ·");
    // The plain exercise browse is unchanged.
    expect(container.querySelector('[aria-label="Select Competition Back Squat"]')).toBeTruthy();
  });

  it("flag-ON: Powerlifting tab leads with Squat/Press/Hinge chips; picking one calls onAddMuscle(groupId)", async () => {
    const onAddMuscle = vi.fn();
    await act(async () => {
      root.render(
        <UnifiedSessionPicker
          onAddMuscle={onAddMuscle}
          onAddExercise={vi.fn()}
          variant="roomy"
          initialCategory="powerlifting"
          enableGroupPick
        />,
      );
    });
    expect(container.textContent).toContain("Add a lift group");
    const squatChip = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Squat"));
    expect(squatChip).toBeTruthy();
    // Part 1: only the three barbell lifts are powerlifting — Pull/Core/Carry are NOT chips here.
    const chipTexts = [...container.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());
    expect(chipTexts.some((t) => t.startsWith("Squat"))).toBe(true);
    expect(chipTexts.some((t) => t.startsWith("Press"))).toBe(true);
    expect(chipTexts.some((t) => t.startsWith("Hinge"))).toBe(true);
    expect(chipTexts.some((t) => t.startsWith("Pull"))).toBe(false);
    expect(chipTexts.some((t) => t.startsWith("Core"))).toBe(false);
    expect(chipTexts.some((t) => t.startsWith("Carry"))).toBe(false);
    // The plain exercise browse remains below for direct lift add (fill-later is optional, not forced).
    expect(container.querySelector('[aria-label="Select Competition Back Squat"]')).toBeTruthy();

    await act(async () => squatChip!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAddMuscle).toHaveBeenCalledWith("squat");
  });

  // 3c — cardio modality group-pick.
  it("flag-OFF: Cardio tab shows NO modality chips — add-flow byte-identical", async () => {
    await act(async () => {
      root.render(
        <UnifiedSessionPicker onAddMuscle={vi.fn()} onAddExercise={vi.fn()} variant="roomy" initialCategory="cardio" />,
      );
    });
    expect(container.textContent).not.toContain("Add a cardio modality");
    expect(container.querySelector('[aria-label="Select Treadmill Run"]')).toBeTruthy(); // plain browse unchanged
  });

  it("flag-ON: Cardio tab leads with modality chips; picking one calls onAddActivityGroup(id,label,'cardio')", async () => {
    const onAddActivityGroup = vi.fn();
    await act(async () => {
      root.render(
        <UnifiedSessionPicker
          onAddMuscle={vi.fn()}
          onAddExercise={vi.fn()}
          onAddActivityGroup={onAddActivityGroup}
          variant="roomy"
          initialCategory="cardio"
          enableGroupPick
        />,
      );
    });
    expect(container.textContent).toContain("Add a cardio modality");
    const runChip = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Run"));
    expect(runChip).toBeTruthy();
    expect(runChip!.textContent).toContain("· 1"); // Run has one library exercise (count shown)

    await act(async () => runChip!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAddActivityGroup).toHaveBeenCalledWith("cm-run", "Run", "cardio");
  });

  // 3e — mobility/warm-up region group-pick.
  it("flag-OFF: Mobility tab shows NO region chips (byte-identical)", async () => {
    await act(async () => {
      root.render(
        <UnifiedSessionPicker onAddMuscle={vi.fn()} onAddExercise={vi.fn()} variant="roomy" initialCategory="mobility" />,
      );
    });
    expect(container.textContent).not.toContain("Add a region");
    expect(container.querySelector('[aria-label="Select Shoulder CARs"]')).toBeTruthy(); // plain browse unchanged
  });

  it("flag-ON: Mobility tab leads with region chips; picking one drops a yoga_mobility group slot", async () => {
    const onAddActivityGroup = vi.fn();
    await act(async () => {
      root.render(
        <UnifiedSessionPicker
          onAddMuscle={vi.fn()}
          onAddExercise={vi.fn()}
          onAddActivityGroup={onAddActivityGroup}
          variant="roomy"
          initialCategory="mobility"
          enableGroupPick
        />,
      );
    });
    expect(container.textContent).toContain("Add a region");
    const shoulderChip = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Shoulders"));
    expect(shoulderChip).toBeTruthy();
    expect(shoulderChip!.textContent).toContain("· 1"); // one mobility exercise in Shoulders

    await act(async () => shoulderChip!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAddActivityGroup).toHaveBeenCalledWith("tr-sh", "Shoulders", "yoga_mobility");
  });

  it("flag-ON: Warm-up tab also leads with region chips (unified on region)", async () => {
    const onAddActivityGroup = vi.fn();
    await act(async () => {
      root.render(
        <UnifiedSessionPicker
          onAddMuscle={vi.fn()}
          onAddExercise={vi.fn()}
          onAddActivityGroup={onAddActivityGroup}
          variant="roomy"
          initialCategory="warmup"
          enableGroupPick
        />,
      );
    });
    expect(container.textContent).toContain("Add a region");
    const hipsChip = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Hips"));
    await act(async () => hipsChip!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAddActivityGroup).toHaveBeenCalledWith("tr-hip", "Hips", "yoga_mobility");
  });
});
