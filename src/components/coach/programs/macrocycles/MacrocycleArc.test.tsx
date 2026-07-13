// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MacrocycleArc, buildArcBlocks, type ArcBlock } from "./MacrocycleArc";
import type { ProgramSummary } from "../useProgramSummaries";
import type { MacrocycleBlock } from "@/types/macrocycle";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * PR4 guard — the macrocycle arc, fixtured on the REAL seed.
 *
 * macrocycle 3e93a96c-42bc-40fd-9ea9-998b966b8b0e ("Test Arc — Strength to Prenatal"),
 * verified against prod 2026-07-13:
 *
 *   block 1  Classic Series Strength Meso (Copy)  plan dd516335  8 wks  5 days/wk  33 ex  112 sets/wk
 *   block 2  Prenatal Trimester 1 (3 Day)         plan b7730e07  8 wks  3 days/wk  17 ex   53 sets/wk
 *   → 16 weeks · 2 blocks, trend 112 → 53
 *
 * What this locks down:
 *   - the arc span and per-block meta match the real mesocycles
 *   - the trend line plots sets/week (112 → 53), not an invented metric
 *   - NO phase chip is ever rendered (there is no column to read one from, so any
 *     chip would be fabricated intent)
 *   - a block with no canonical mirror shows metadata and OMITS volume/ribbon
 */

const PROGRAM_1 = "d1e35f86-9766-438b-bf23-75710e39cb2c";
const PROGRAM_2 = "98255134-d214-4a27-9bff-1d1e384d4112";

const BLOCKS: MacrocycleBlock[] = [
  {
    macrocycleId: "3e93a96c-42bc-40fd-9ea9-998b966b8b0e",
    programTemplateId: PROGRAM_1,
    sequence: 1,
    title: "Classic Series (C with a T) Strength Meso (Copy)",
    description: null,
    weeks: 8,
  },
  {
    macrocycleId: "3e93a96c-42bc-40fd-9ea9-998b966b8b0e",
    programTemplateId: PROGRAM_2,
    sequence: 2,
    title: "Prenatal Trimester 1 (3 Day)",
    description: null,
    weeks: 8,
  },
];

function summary(over: Partial<ProgramSummary>): ProgramSummary {
  return {
    programId: "x",
    source: "canonical",
    slots: [],
    sessions: [],
    structure: { weeks: 8, daysPerWeek: 5, sessions: 40 },
    ribbon: [{ id: "quads", colorHex: "#f43f5e", pct: 100 }],
    focus: { chips: [], overflow: 0 },
    sets: 112,
    exercises: 33,
    duration: null,
    reach: { clients: 0, teams: 0 },
    muscleTemplateId: null,
    meta: { title: "", description: null, level: null, tags: [] },
    tree: { weeks: [], sessions: [], slots: [] },
    ...over,
  } as ProgramSummary;
}

const SUMMARIES = new Map<string, ProgramSummary>([
  [PROGRAM_1, summary({ programId: PROGRAM_1, sets: 112, exercises: 33, structure: { weeks: 8, daysPerWeek: 5, sessions: 40 } })],
  [PROGRAM_2, summary({ programId: PROGRAM_2, sets: 53, exercises: 17, structure: { weeks: 8, daysPerWeek: 3, sessions: 24 } })],
]);

let container: HTMLDivElement;
let root: Root;

async function render(arcBlocks: ArcBlock[], isMobile = false): Promise<HTMLDivElement> {
  await act(async () => {
    root.render(
      <MacrocycleArc
        arcBlocks={arcBlocks}
        isMobile={isMobile}
        onOpenProgram={() => {}}
        onMove={() => {}}
        onRemove={() => {}}
      />,
    );
  });
  return container;
}

describe("MacrocycleArc — PR4 (real seed 3e93a96c)", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("buildArcBlocks takes the CANONICAL week count, not the legacy one", () => {
    // The legacy MacrocycleBlock.weeks comes from program_template_days
    // (ceil(max(day_index)/7)). Feed a block whose legacy figure DISAGREES with
    // canonical and prove canonical wins.
    const legacyLies: MacrocycleBlock[] = [{ ...BLOCKS[0], weeks: 4 }];
    const arc = buildArcBlocks(legacyLies, SUMMARIES);
    expect(arc[0].weeks).toBe(8); // canonical structure.weeks, not the legacy 4
    expect(arc[0].setsPerWeek).toBe(112);
  });

  it("renders the arc span: 16 weeks · 2 blocks", async () => {
    const el = await render(buildArcBlocks(BLOCKS, SUMMARIES));
    expect(el.textContent).toContain("16 weeks · 2 blocks");
  });

  it("per-block meta matches the real mesocycles", async () => {
    const el = await render(buildArcBlocks(BLOCKS, SUMMARIES));
    const text = el.textContent ?? "";

    expect(text).toContain("Classic Series (C with a T) Strength Meso (Copy)");
    expect(text).toContain("Prenatal Trimester 1 (3 Day)");

    // Block 1: 8 wks · 5 days/wk · 112 sets · 33 exercises
    expect(text).toContain("8 wks · 5 days/wk");
    expect(text).toContain("112 sets");
    expect(text).toContain("33 exercises");
    // Block 2: 8 wks · 3 days/wk · 53 sets · 17 exercises
    expect(text).toContain("8 wks · 3 days/wk");
    expect(text).toContain("53 sets");
    expect(text).toContain("17 exercises");

    // Week ranges run consecutively across the arc.
    expect(text).toContain("Wk 1–8");
    expect(text).toContain("Wk 9–16");
  });

  it("the trend line plots sets/week: 112 → 53", async () => {
    const el = await render(buildArcBlocks(BLOCKS, SUMMARIES));

    expect(el.textContent).toContain("Sets / week");
    const svg = el.querySelector("svg[role='img']");
    expect(svg?.getAttribute("aria-label")).toBe("Sets per week across blocks: 112, 53");

    // Two plotted points, positioned as HTML (an SVG <circle> under a stretched
    // viewBox would render as a squashed ellipse), and the line DESCENDS.
    const dots = [...el.querySelectorAll("div[style*='left']")].filter((d) =>
      d.querySelector("span.rounded-full"),
    );
    expect(dots).toHaveLength(2);

    const topOf = (el: Element) => Number(/top:\s*([\d.]+)%/.exec(el.getAttribute("style") ?? "")?.[1]);
    // top% grows downward → the 53-sets point must sit BELOW the 112-sets point.
    expect(topOf(dots[1])).toBeGreaterThan(topOf(dots[0]));

    // The two labels carry the real values.
    expect(el.textContent).toContain("112");
    expect(el.textContent).toContain("53");

    // The path descends too (second Y greater than first).
    const d = el.querySelector("path")?.getAttribute("d") ?? "";
    const ys = [...d.matchAll(/[ML]\s[\d.]+\s([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys).toHaveLength(2);
    expect(ys[1]).toBeGreaterThan(ys[0]);
  });

  it("sizes each block by its week count (equal here → equal flex)", async () => {
    const el = await render(buildArcBlocks(BLOCKS, SUMMARIES));
    const segs = [...el.querySelectorAll("[style*='flex-grow']")];
    expect(segs).toHaveLength(2);
    expect(segs[0].getAttribute("style")).toContain("flex-grow: 8");
    expect(segs[1].getAttribute("style")).toContain("flex-grow: 8");
  });

  it("renders NO phase chip — the intent would be fabricated", async () => {
    const el = await render(buildArcBlocks(BLOCKS, SUMMARIES));
    const text = (el.textContent ?? "").toLowerCase();
    for (const invented of ["hypertrophy", "strength phase", "peak", "accumulation", "intensification"]) {
      expect(text).not.toContain(invented);
    }
  });

  it("a block with NO canonical mirror shows metadata but OMITS volume + ribbon", async () => {
    const partial = new Map(SUMMARIES);
    partial.set(PROGRAM_2, summary({ programId: PROGRAM_2, source: "legacy", sets: 999, exercises: 99 }));

    const arc = buildArcBlocks(BLOCKS, partial);
    expect(arc[1].setsPerWeek).toBeNull();
    expect(arc[1].daysPerWeek).toBeNull();
    expect(arc[1].weeks).toBe(8); // falls back to the block's own metadata

    const el = await render(arc);
    const text = el.textContent ?? "";
    expect(text).toContain("Prenatal Trimester 1 (3 Day)"); // name still shown
    expect(text).not.toContain("999"); // legacy volume never surfaces
    // The trend needs 2+ canonical points; with only one it draws nothing rather
    // than a misleading flat line.
    expect(el.querySelector("svg[role='img']")).toBeNull();
  });

  it("stacks blocks on mobile with 44px controls", async () => {
    const el = await render(buildArcBlocks(BLOCKS, SUMMARIES), true);
    expect(el.textContent).toContain("16 weeks · 2 blocks");
    expect(el.textContent).toContain("Classic Series (C with a T) Strength Meso (Copy)");
    // Reorder/remove controls are 44px touch targets on mobile.
    const btns = [...el.querySelectorAll("button")].filter((b) => b.className.includes("h-11"));
    expect(btns.length).toBeGreaterThanOrEqual(4);
  });

  it("renders nothing for an empty macrocycle", async () => {
    const el = await render([]);
    expect(el.textContent).toBe("");
  });
});
