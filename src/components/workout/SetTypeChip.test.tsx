// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SetTypeChip } from "./SetTypeChip";
import { SET_TYPE_LABEL } from "@/lib/setType";

// WK5 — the single chip reused by the logger (completed sets) and the history rows.
// A 'normal' set is the implicit default and must render NOTHING; each non-normal
// type renders one labelled, data-tagged chip.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

describe("SetTypeChip", () => {
  it("renders NOTHING for a normal set (default is implicit)", async () => {
    await act(async () => root.render(<SetTypeChip type="normal" />));
    expect(container.querySelector("[data-set-type-chip]")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it.each(["warmup", "drop", "failure"] as const)(
    "renders a labelled chip tagged with the type for %s",
    async (type) => {
      await act(async () => root.render(<SetTypeChip type={type} />));
      const chip = container.querySelector(`[data-set-type-chip="${type}"]`);
      expect(chip).not.toBeNull();
      expect(chip?.textContent).toBe(SET_TYPE_LABEL[type]);
    },
  );
});
