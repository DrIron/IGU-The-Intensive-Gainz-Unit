// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ClickableCard } from "./clickable-card";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * CC9 — the a11y contract a bare <Card onClick> lacked. Every converted card gets these for
 * free via ClickableCard: role="button", tab focusability, an accessible name, keyboard
 * activation (Enter/Space), and a proper disabled state.
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

const card = () => container.querySelector('[role="button"]') as HTMLElement;
const key = async (k: string) => {
  await act(async () => {
    card().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
};

describe("ClickableCard", () => {
  it("exposes role=button, is focusable, and carries the accessible name", async () => {
    const onClick = vi.fn();
    await act(async () => root.render(<ClickableCard ariaLabel="Open widgets" onClick={onClick}>x</ClickableCard>));

    const el = card();
    expect(el).not.toBeNull();
    expect(el.getAttribute("role")).toBe("button");
    expect(el.getAttribute("tabindex")).toBe("0");
    expect(el.getAttribute("aria-label")).toBe("Open widgets");
  });

  it("activates on Enter and on Space (keyboard operability)", async () => {
    const onClick = vi.fn();
    await act(async () => root.render(<ClickableCard ariaLabel="Go" onClick={onClick}>x</ClickableCard>));

    await key("Enter");
    expect(onClick).toHaveBeenCalledTimes(1);
    await key(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("activates on click too", async () => {
    const onClick = vi.fn();
    await act(async () => root.render(<ClickableCard ariaLabel="Go" onClick={onClick}>x</ClickableCard>));
    await act(async () => card().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled: not focusable, aria-disabled, and neither click nor key fires onClick", async () => {
    const onClick = vi.fn();
    await act(async () => root.render(<ClickableCard ariaLabel="Locked" disabled onClick={onClick}>x</ClickableCard>));

    const el = card();
    expect(el.getAttribute("tabindex")).toBe("-1");
    expect(el.getAttribute("aria-disabled")).toBe("true");
    await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await key("Enter");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("hover is FLAT — no shadow utility, a border/background shift instead (DS3)", async () => {
    await act(async () => root.render(<ClickableCard ariaLabel="Go" onClick={vi.fn()}>x</ClickableCard>));
    const cls = card().className;
    expect(cls).not.toMatch(/hover:shadow/);
    expect(cls).toMatch(/hover:border-primary/);
  });
});
