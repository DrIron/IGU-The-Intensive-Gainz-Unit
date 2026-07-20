// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MatchTierBadge, MatchChips } from "./MatchIndicators";
import { TIER_META } from "@/lib/substituteMatch";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const render = async (ui: React.ReactElement) => {
  await act(async () => root.render(ui));
  return container;
};

describe("MatchIndicators", () => {
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

  it("MatchTierBadge renders the tier label", async () => {
    for (const tier of ["best", "strong", "partial"] as const) {
      const el = await render(<MatchTierBadge tier={tier} />);
      expect(el.textContent).toContain(TIER_META[tier].label);
      await act(async () => root.unmount());
      root = createRoot(container);
    }
  });

  it("MatchChips renders mapped copy (equipment via equipmentLabel, subdivision name)", async () => {
    const el = await render(
      <MatchChips dimensions={["subdivision", "movement_pattern", "equipment"]} equipment="BB" subdivisionName="Costal Head" />,
    );
    expect(el.textContent).toContain("Costal Head");
    expect(el.textContent).toContain("Same movement");
    expect(el.textContent).toContain("Barbell"); // BB → Barbell
  });

  it("MatchChips caps at `max` and shows a '+N' overflow pill", async () => {
    const el = await render(
      <MatchChips
        dimensions={["movement_pattern", "resistance", "laterality", "technique", "target_region"]}
        max={3}
      />,
    );
    // 5 chips, max 3 → 3 visible + "+2".
    expect(el.textContent).toContain("+2");
    expect(el.textContent).toContain("Same movement");
    expect(el.textContent).not.toContain("Same region"); // 5th, collapsed into +2
  });

  it("MatchChips renders nothing when there are no (mappable) dimensions", async () => {
    const el = await render(<MatchChips dimensions={[]} />);
    expect(el.textContent).toBe("");
    const el2 = await render(<MatchChips dimensions={["equipment"]} equipment={null} />);
    expect(el2.textContent).toBe("");
  });
});
