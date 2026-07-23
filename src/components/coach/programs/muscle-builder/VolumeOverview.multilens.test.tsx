// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MuscleVolumeEntry, VolumeSummary } from "./hooks/useMusclePlanVolume";
import type { MovementLens, CardioLens } from "./multiLensVolume";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * VolumeOverview multi-lens (Phase 3, 3a): the movement + cardio lenses render as sibling sections
 * only when their props are supplied (flag-ON). Props absent (flag-OFF / client-team-draft) →
 * muscle-only, byte-identical.
 */

// Radix Tooltip → passthrough (content is hover-only; not needed for assertions).
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

const { VolumeOverview } = await import("./VolumeOverview");

const ENTRY: MuscleVolumeEntry = {
  muscle: { id: "pecs", label: "Pecs", bodyRegion: "push", colorClass: "bg-rose-500", colorHex: "#f43f5e", landmarks: { MV: 6, MEV: 10, MAV: 20, MRV: 24 } },
  totalSets: 12, totalRepsMin: 96, totalRepsMax: 144, tustSecondsMin: 0, tustSecondsMax: 0,
  workingSets: 0, hasTempo: false, frequency: 2, zone: "productive",
  dayBreakdown: [{ dayIndex: 1, sets: 6 }, { dayIndex: 4, sets: 6 }],
  subdivisionBreakdown: [],
};
const SUMMARY: VolumeSummary = {
  totalSets: 12, musclesTargeted: 1, trainingDays: 2, avgSetsPerMuscle: 12,
  totalRepsMin: 96, totalRepsMax: 144, totalWorkingSets: 0, totalTustSecondsMin: 0, totalTustSecondsMax: 0,
};
const MOVEMENT: MovementLens = {
  totalSets: 3,
  rows: [
    { id: "squat", label: "Squat", sortOrder: 1, sets: 1, subGroups: [] },
    { id: "press", label: "Press", sortOrder: 2, sets: 2, subGroups: [
      { id: "press_horizontal", label: "Horizontal Press", sets: 1 },
      { id: "press_anterior", label: "Anterior Press", sets: 1 },
    ] },
  ],
};
const CARDIO: CardioLens = { totalMinutes: 30, modalities: [{ label: "Running", minutes: 30, pending: false }], hrZones: [{ zone: 2, minutes: 30 }] };

let container: HTMLDivElement;
let root: Root;
const txt = () => container.textContent ?? "";
const clickWithText = async (text: string) => {
  const el = [...container.querySelectorAll("button, span, div")].find((e) => (e.textContent ?? "").trim() === text);
  if (!el) throw new Error(`no element with text "${text}"`);
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("VolumeOverview — multi-lens", () => {
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

  it("flag-OFF (no lens props): muscle-only, no Movement/Cardio sections (byte-identical)", async () => {
    await act(async () => root.render(<VolumeOverview entries={[ENTRY]} summary={SUMMARY} />));
    expect(txt()).toContain("Pecs");
    expect(txt()).not.toContain("Movement");
    expect(txt()).not.toContain("Cardio");
  });

  it("flag-ON: shows the movement lens (S/P/H) with Press drill + the cardio minutes lens", async () => {
    await act(async () => root.render(
      <VolumeOverview entries={[ENTRY]} summary={SUMMARY} movementLens={MOVEMENT} cardioLens={CARDIO} />,
    ));
    // Muscle lens still there.
    expect(txt()).toContain("Pecs");
    // Movement lens: Squat + Press with plain set counts; Press drill collapsed by default.
    expect(txt()).toContain("Movement");
    expect(txt()).toContain("Squat");
    expect(txt()).toContain("Press");
    expect(txt()).not.toContain("Horizontal Press"); // subGroups collapsed by default

    await clickWithText("Press"); // drill into Press
    expect(txt()).toContain("Horizontal Press");
    expect(txt()).toContain("Anterior Press");

    // Cardio lens: minutes per modality.
    expect(txt()).toContain("Cardio");
    expect(txt()).toContain("Running");
    expect(txt()).toContain("30m");
  });
});
