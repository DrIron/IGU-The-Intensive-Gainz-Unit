// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MuscleMap } from "./MuscleMap";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * MuscleMap honesty: chips ONLY, no fabricated body art. When there's no anatomy render, it must
 * show the muscle names and draw NO silhouette / SVG figure.
 */
let container: HTMLDivElement;
let root: Root;

async function render(ui: React.ReactElement): Promise<HTMLDivElement> {
  await act(async () => root.render(ui));
  return container;
}

describe("MuscleMap", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders Primary + Secondary chips and NO silhouette/SVG when renderUrl is null", async () => {
    const el = await render(<MuscleMap primary="Triceps" secondary={["Anterior Deltoid", "Chest"]} />);
    expect(el.querySelector("[data-muscle-map]")).not.toBeNull();
    expect(el.textContent).toContain("Primary");
    expect(el.textContent).toContain("Triceps");
    expect(el.textContent).toContain("Secondary");
    expect(el.textContent).toContain("Anterior Deltoid");
    // The honesty guard: no fabricated body art, and no anatomy image without a real render.
    expect(el.querySelector("svg")).toBeNull();
    expect(el.querySelector("img")).toBeNull();
  });

  it("shows the anatomy still when a renderUrl is supplied (still no drawn figure)", async () => {
    const el = await render(<MuscleMap primary="Lats" secondary={[]} renderUrl="https://x/still.png" />);
    const img = el.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://x/still.png");
    expect(el.querySelector("svg")).toBeNull();
  });

  it("degrades gracefully with no primary", async () => {
    const el = await render(<MuscleMap primary={null} secondary={[]} />);
    expect(el.textContent).toContain("Not specified");
  });
});
