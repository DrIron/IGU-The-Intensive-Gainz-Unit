// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProgramStatStrip } from "./ProgramStatStrip";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The middot must sit BETWEEN segments and never dangle. ProgramStatStrip is
 * self-omitting, so the naive `{sets} · {exercises} · {duration}` would leave a
 * trailing "·" whenever a segment omits itself.
 */
let container: HTMLDivElement;
let root: Root;

async function render(ui: React.ReactElement) {
  await act(async () => root.render(ui));
  return (container.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("ProgramStatStrip — middot separator", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  // NOTE: the visual gap around the middot comes from `gap-x-2` (flex), not from
  // whitespace, so textContent reads "312 sets·18 exercises" while it DISPLAYS as
  // "312 sets · 18 exercises". Assert on the separator + order, not raw spacing.
  it("separates sets and exercises with a middot", async () => {
    expect(await render(<ProgramStatStrip sets={312} exercises={18} />)).toBe("312 sets·18 exercises");
  });

  it("separates sets and duration with a middot", async () => {
    const text = await render(
      <ProgramStatStrip sets={12} duration={{ minSeconds: 2880, maxSeconds: 3720, inferred: false }} />,
    );
    expect(text).toContain("12 sets·");
  });

  it("does NOT dangle a middot when a segment self-omits", async () => {
    const setsOnly = await render(<ProgramStatStrip sets={12} />);
    expect(setsOnly).toBe("12 sets");
    expect(setsOnly).not.toContain("·");

    await act(async () => root.unmount());
    root = createRoot(container);

    const exercisesOnly = await render(<ProgramStatStrip sets={0} exercises={5} />);
    expect(exercisesOnly).toBe("5 exercises");
    expect(exercisesOnly).not.toContain("·");
  });

  it("renders all three with two middots, none leading or trailing", async () => {
    const text = await render(
      <ProgramStatStrip sets={312} exercises={18} duration={{ minSeconds: 3480, maxSeconds: 3480, inferred: true }} />,
    );
    expect((text.match(/·/g) ?? [])).toHaveLength(2);
    expect(text.startsWith("·")).toBe(false);
    expect(text.endsWith("·")).toBe(false);
  });
});
