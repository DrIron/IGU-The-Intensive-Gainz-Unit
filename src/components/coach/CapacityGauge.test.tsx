// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CapacityGauge, CAPACITY_WARNING_THRESHOLD } from "./EnhancedCapacityCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * CO4 guard — the capacity arc.
 *
 * Three contracts:
 *   1. The arc's fill fraction is exactly current/max (clamped at 1 when over cap) —
 *      a gauge that misreports load is worse than the text it replaced.
 *   2. It turns amber at >= 90%, and is crimson below that.
 *   3. It is a NEUTRAL load indicator: no green-as-good, no red-as-bad. A full roster
 *      is not a failing grade and an empty one is not an A.
 */

let container: HTMLDivElement;
let root: Root;

async function render(ui: React.ReactElement): Promise<HTMLDivElement> {
  await act(async () => {
    root.render(ui);
  });
  return container;
}

const arc = (el: HTMLElement) => el.querySelector('[data-testid="capacity-arc"]');
const fillOf = (el: HTMLElement) => Number(arc(el)?.getAttribute("data-fill"));

describe("CapacityGauge — CO4", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("fill fraction equals current / max", async () => {
    const el = await render(<CapacityGauge current={18} max={25} />);
    expect(fillOf(el)).toBeCloseTo(18 / 25, 4); // 0.72

    // And the arc is actually drawn to that fraction via the dash offset.
    const path = arc(el)!;
    const dashArray = Number(path.getAttribute("stroke-dasharray"));
    const dashOffset = Number(path.getAttribute("stroke-dashoffset"));
    expect(dashOffset / dashArray).toBeCloseTo(1 - 18 / 25, 4);
  });

  it("clamps the fill at 1 when a coach is OVER capacity (never overflows the arc)", async () => {
    const el = await render(<CapacityGauge current={30} max={25} />);
    expect(fillOf(el)).toBe(1);
    expect(Number(arc(el)!.getAttribute("stroke-dashoffset"))).toBe(0);
  });

  it("is crimson below the threshold and amber at/above it", async () => {
    const below = await render(<CapacityGauge current={18} max={25} />); // 72%
    expect(arc(below)!.getAttribute("class")).toContain("stroke-primary");
    expect(arc(below)!.getAttribute("class")).not.toContain("stroke-status-warning");

    await act(async () => root.unmount());
    root = createRoot(container);

    const at = await render(<CapacityGauge current={23} max={25} />); // 92% >= 90
    expect(arc(at)!.getAttribute("class")).toContain("stroke-status-warning");
    expect(arc(at)!.getAttribute("class")).not.toContain("stroke-primary");
  });

  it("flips exactly at the 90% threshold, not before", async () => {
    const justUnder = await render(<CapacityGauge current={89} max={100} />); // 89%
    expect(arc(justUnder)!.getAttribute("class")).toContain("stroke-primary");

    await act(async () => root.unmount());
    root = createRoot(container);

    const exactly = await render(<CapacityGauge current={90} max={100} />); // 90%
    expect(arc(exactly)!.getAttribute("class")).toContain("stroke-status-warning");
    expect(CAPACITY_WARNING_THRESHOLD).toBe(90);
  });

  it("plain-language read: 'spots open' under cap, 'waitlist' at/over cap", async () => {
    const under = await render(<CapacityGauge current={18} max={25} />);
    expect(under.textContent).toContain("7 spots open");
    expect(under.textContent).not.toContain("waitlist");

    await act(async () => root.unmount());
    root = createRoot(container);

    const atCap = await render(<CapacityGauge current={25} max={25} />);
    expect(atCap.textContent).toContain("At capacity");
    expect(atCap.textContent).toContain("waitlist");
    expect(atCap.textContent).not.toContain("spots open");

    await act(async () => root.unmount());
    root = createRoot(container);

    const over = await render(<CapacityGauge current={27} max={25} />);
    expect(over.textContent).toContain("waitlist");
  });

  it("singularises a single remaining spot", async () => {
    const el = await render(<CapacityGauge current={24} max={25} />);
    expect(el.textContent).toContain("1 spot open");
    expect(el.textContent).not.toContain("1 spots open");
  });

  it("renders the mono readout with every number rounded", async () => {
    const el = await render(<CapacityGauge current={18} max={25} />);
    // 18/25 = 72%
    expect(el.textContent).toContain("18 / 25");
    expect(el.textContent).toContain("72% capacity");
    // No floating-point leakage.
    expect(el.textContent).not.toMatch(/\d+\.\d/);
  });

  it("is NEUTRAL: no green-as-good or red-as-bad anywhere", async () => {
    for (const [current, max] of [
      [0, 25],
      [18, 25],
      [25, 25],
      [30, 25],
    ] as const) {
      await act(async () => root.unmount());
      root = createRoot(container);
      const el = await render(<CapacityGauge current={current} max={max} />);
      expect(el.innerHTML).not.toMatch(/green|emerald|status-ontrack|status-risk|destructive|text-red/);
    }
  });

  it("omits the arc entirely when no cap is configured — never fakes a full gauge", async () => {
    const el = await render(<CapacityGauge current={12} max={null} />);
    expect(arc(el)).toBeNull();
    expect(el.textContent).toContain("no limit set");
    expect(el.textContent).toContain("No capacity limit configured.");
  });
});
