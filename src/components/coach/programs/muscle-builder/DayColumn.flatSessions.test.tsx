// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flatSessionLabel, deriveSessionColorHex, ACTIVITY_TYPE_COLORS } from "@/types/muscle-builder";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Phase-2 canonical authoring: adding a session on the board creates a FLAT, auto-named session with
 * NO type picker. Legacy (flag OFF) keeps the type-picker popover, unchanged.
 */

// Heavy children aren't under test — stub them.
vi.mock("./SessionBlock", () => ({ SessionBlock: () => null }));
vi.mock("../shared/MuscleDistributionRibbon", () => ({ MuscleDistributionRibbon: () => null }));
vi.mock("../shared/ProgramStatStrip", () => ({ ProgramStatStrip: () => null }));

const { DayColumn } = await import("./DayColumn");

const noop = vi.fn();
const baseProps = () => ({
  dayIndex: 1,
  slots: [],
  sessions: [], // rest day → the "Add session" affordance is visible
  isSelected: false,
  onSelectDay: vi.fn(),
  onSetSlotDetails: noop,
  onRemove: noop,
  onAddMuscleToSession: noop,
  onAddActivityToSession: noop,
  onAddActivityGroupToSession: noop,
  onAddExerciseToSession: noop,
  onRenameSession: noop,
  onSetSessionType: noop,
  onRemoveSession: noop,
  onDuplicateSessionToDay: noop,
  onMoveSessionToDay: noop,
  onReorderSession: noop,
  dayOptions: [{ dayIndex: 1, label: "Mon", weekday: "Mon" }],
});

let container: HTMLDivElement;
let root: Root;
const clickText = async (text: string) => {
  const el = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === text);
  if (!el) throw new Error(`no button "${text}"`);
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("DayColumn — flat session add", () => {
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

  it("flag ON (flatSessions): 'Add session' creates a session directly as 'strength' — no type prompt", async () => {
    const onAddSession = vi.fn();
    await act(async () => root.render(<DayColumn {...baseProps()} onAddSession={onAddSession} flatSessions />));
    await clickText("Add session");
    expect(onAddSession).toHaveBeenCalledWith(1, "strength");
    expect(container.textContent).not.toContain("Session type");
  });

  it("flag OFF: 'Add session' opens the type picker instead of adding directly", async () => {
    const onAddSession = vi.fn();
    await act(async () => root.render(<DayColumn {...baseProps()} onAddSession={onAddSession} />));
    await clickText("Add session");
    // Legacy opens the "Session type" popover (a choice), it does NOT add straight away.
    expect(onAddSession).not.toHaveBeenCalled();
  });
});

describe("flatSessionLabel / deriveSessionColorHex", () => {
  it("auto-names sessions Session A, B, … by position, then falls back to a number", () => {
    expect(flatSessionLabel(0)).toBe("Session A");
    expect(flatSessionLabel(1)).toBe("Session B");
    expect(flatSessionLabel(25)).toBe("Session Z");
    expect(flatSessionLabel(26)).toBe("Session 27");
  });

  it("colours a session from its contents: one type → that hex; empty or mixed → null (neutral)", () => {
    expect(deriveSessionColorHex([{ activityType: "cardio" }])).toBe(ACTIVITY_TYPE_COLORS.cardio.colorHex);
    // muscle slot (undefined activityType) counts as strength
    expect(deriveSessionColorHex([{}, { activityType: "strength" }])).toBe(ACTIVITY_TYPE_COLORS.strength.colorHex);
    expect(deriveSessionColorHex([])).toBeNull(); // empty
    expect(deriveSessionColorHex([{ activityType: "strength" }, { activityType: "cardio" }])).toBeNull(); // mixed
  });
});
