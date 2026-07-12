// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProgramSummaryCard } from "./ProgramSummaryCard";
import { MuscleDistributionBars } from "./MuscleDistributionBars";
import { MUSCLE_GROUPS } from "@/types/muscle-builder";
import type { MuscleVolumeEntry } from "../muscle-builder/hooks/useMusclePlanVolume";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * PR2 render guard. The Coach Programs surface is auth-gated (no screenshots), so
 * the card + distribution bars are pinned here against a realistic adapter payload
 * and reconciled against docs/COACH_PROGRAMS_VIEW_MOCKUPS.html screens 1 + 2.
 *
 * The two contract points these exist to defend:
 *   - the card shows structure + ribbon + mono strip + status/reach + focus chips
 *   - the card shows NO landmark zones (§6.3 LOCKED — zones are detail-only)
 */

let container: HTMLDivElement;
let root: Root;

async function render(ui: React.ReactElement): Promise<string> {
  await act(async () => {
    root.render(ui);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return container.innerHTML;
}

const pecs = MUSCLE_GROUPS.find((m) => m.id === "pecs")!;
const back = MUSCLE_GROUPS.find((m) => m.id === "lats")! ?? MUSCLE_GROUPS[1];

const CARD_PROPS = {
  name: "Classic Series Strength Meso",
  level: "intermediate",
  structure: { weeks: 8, daysPerWeek: 5, sessions: 40 },
  ribbon: [
    { id: "pecs", colorHex: "#f43f5e", pct: 60 },
    { id: "shoulders", colorHex: "#f97316", pct: 40 },
  ],
  sets: 312,
  exercises: 18,
  duration: { minSeconds: 3480, maxSeconds: 3720, inferred: false },
  focus: { chips: ["Push", "Pull", "Chest focus"], overflow: 2 },
  status: "in_use" as const,
  reach: { clients: 3, teams: 1 },
  tags: ["hypertrophy"],
};

describe("ProgramSummaryCard (§2A — mockup screen 1)", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders name, structure line, mono strip, focus chips and reach", async () => {
    const html = await render(<ProgramSummaryCard {...CARD_PROPS} />);

    expect(html).toContain("Classic Series Strength Meso");
    expect(html).toContain("8 wks · 5 days/wk · 40 sessions");
    // Mono strip: sets · exercises · duration (the `exercises` prop PR1 deferred).
    expect(html).toContain("312 sets");
    expect(html).toContain("18 exercises");
    // Focus chips, capped with an overflow counter.
    expect(html).toContain("Push");
    expect(html).toContain("Chest focus");
    expect(html).toContain("+2");
    // Reach.
    expect(html).toContain("3 clients");
    expect(html).toContain("1 team");
  });

  it("renders the muscle-distribution ribbon segments with their colours", async () => {
    const html = await render(<ProgramSummaryCard {...CARD_PROPS} />);
    expect(html).toContain("width: 60%");
    expect(html).toContain("background-color: rgb(244, 63, 94)");
  });

  it("renders NO landmark zones — §6.3 LOCKED zones off the card", async () => {
    const html = await render(<ProgramSummaryCard {...CARD_PROPS} />);
    for (const zone of ["Below MV", "Maintenance", "Productive", "Near MRV", "Over MRV"]) {
      expect(html).not.toContain(zone);
    }
  });

  it("omits reach entirely for an unassigned program (no '0 clients')", async () => {
    const html = await render(
      <ProgramSummaryCard {...CARD_PROPS} status="ready" reach={{ clients: 0, teams: 0 }} />,
    );
    expect(html).not.toContain("0 clients");
    expect(html).not.toContain("0 teams");
    expect(html).toContain("Ready");
  });

  it("self-omits the strip and ribbon for an empty draft rather than showing zeroes", async () => {
    const html = await render(
      <ProgramSummaryCard
        name="Empty draft"
        structure={{ weeks: 0, daysPerWeek: 0, sessions: 0 }}
        ribbon={[]}
        sets={0}
        exercises={0}
        duration={null}
        focus={{ chips: [], overflow: 0 }}
        status="draft"
      />,
    );
    expect(html).toContain("Empty draft");
    expect(html).toContain("Draft");
    expect(html).not.toContain("0 sets");
    expect(html).not.toContain("0 exercises");
  });
});

describe("MuscleDistributionBars (§2B — mockup screen 2, detail only)", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  function entry(muscle: typeof pecs, sets: number, zone: MuscleVolumeEntry["zone"]): MuscleVolumeEntry {
    return {
      muscle,
      totalSets: sets,
      totalRepsMin: sets * 8,
      totalRepsMax: sets * 12,
      tustSecondsMin: 0,
      tustSecondsMax: 0,
      workingSets: sets,
      hasTempo: false,
      frequency: 2,
      zone,
      dayBreakdown: [],
      subdivisionBreakdown: [],
    };
  }

  it("renders per-muscle bars WITH landmark zone chips (this is where zones live)", async () => {
    const html = await render(
      <MuscleDistributionBars
        entries={[entry(pecs, 18, "productive"), entry(back, 8, "maintenance")]}
      />,
    );
    expect(html).toContain(pecs.label);
    expect(html).toContain("18");
    // Zones render HERE, unlike the card.
    expect(html).toContain("Productive");
    expect(html).toContain("Maintenance");
    // MEV / MRV legend.
    expect(html).toContain("MEV");
    expect(html).toContain("MRV");
  });

  it("shows an empty message rather than an empty chart", async () => {
    const html = await render(<MuscleDistributionBars entries={[]} />);
    expect(html).toContain("No strength volume in this program yet.");
  });
});
