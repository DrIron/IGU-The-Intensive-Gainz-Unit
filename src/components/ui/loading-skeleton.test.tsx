// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MetricCardGridSkeleton,
  RosterRowSkeleton,
  TabShellSkeleton,
} from "./loading-skeleton";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * CC6 — the three layout-shaped loading shells. They exist so a loading surface holds the SHAPE
 * of the loaded layout (no centred spinner, no layout shift). These pin their structure so the
 * shape can't silently drift from the real components they mirror.
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = async (node: React.ReactElement) => {
  await act(async () => root.render(node));
  return container;
};

describe("CC6 loading shells", () => {
  it("MetricCardGridSkeleton renders N flat, animated tiles (label · number · sparkline)", async () => {
    const el = await render(<MetricCardGridSkeleton count={4} />);
    const grid = el.querySelector(".grid") as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.children).toHaveLength(4); // one tile per metric
    // Flat + animated, never a spinner.
    expect(el.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(el.querySelector(".animate-spin")).toBeNull();
  });

  it("RosterRowSkeleton renders N rows (avatar · two bars · pill)", async () => {
    const el = await render(<RosterRowSkeleton count={5} />);
    const list = el.querySelector(".space-y-2") as HTMLElement;
    expect(list).not.toBeNull();
    expect(list.children).toHaveLength(5);
    // Each row has an avatar circle + a trailing pill, both rounded-full → 2 per row.
    expect(el.querySelectorAll(".rounded-full").length).toBe(10);
    expect(el.querySelector(".animate-spin")).toBeNull();
  });

  it("TabShellSkeleton renders a header bar + N stacked cards", async () => {
    const el = await render(<TabShellSkeleton cards={3} />);
    const shell = el.querySelector(".space-y-4") as HTMLElement;
    expect(shell).not.toBeNull();
    // 1 header row + 3 cards.
    expect(shell.children).toHaveLength(4);
    expect(el.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(el.querySelector(".animate-spin")).toBeNull();
  });

  it("counts are configurable and default sensibly", async () => {
    const g = await render(<MetricCardGridSkeleton />);
    expect((g.querySelector(".grid") as HTMLElement).children).toHaveLength(4);
    await act(async () => root.unmount());
    root = createRoot(container);
    const r = await render(<RosterRowSkeleton count={2} />);
    expect((r.querySelector(".space-y-2") as HTMLElement).children).toHaveLength(2);
  });
});
