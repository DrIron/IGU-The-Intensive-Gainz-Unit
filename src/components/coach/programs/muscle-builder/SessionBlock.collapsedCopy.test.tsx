// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DragDropContext } from "@hello-pangea/dnd";
import type { MuscleSlotData, SessionData } from "@/types/muscle-builder";
import type { BoardDayOption } from "@/lib/boardDates";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Board-v2 (LIVE) collapsed-session summary copy. A canonical session can hold pending group slots
 * (no exercise yet), so "N exercises" mislabels them — the copy is now "N item(s)". Copy-only.
 */

// Board v2 ON → session starts collapsed, showing the summary line.
vi.mock("@/lib/featureFlags", async (orig) => ({
  ...(await orig<typeof import("@/lib/featureFlags")>()),
  isBoardV2Enabled: () => true,
}));

const { SessionBlock } = await import("./SessionBlock");

const SESSION: SessionData = { id: "sess-1", dayIndex: 1, name: "Session A", type: "strength", sortOrder: 0 };
const DAY_OPTIONS: BoardDayOption[] = [{ dayIndex: 1, label: "Mon", shortLabel: "Mon" } as unknown as BoardDayOption];
const slot = (o: Partial<MuscleSlotData>): MuscleSlotData => ({
  id: o.id ?? "s", dayIndex: 1, muscleId: "quads", sets: 3, repMin: 8, repMax: 12, sortOrder: 0, ...o,
});

const noop = () => {};
const baseProps = {
  session: SESSION, sessionPosition: 0, daySessionsCount: 1, dayOptions: DAY_OPTIONS,
  onSetSlotDetails: noop, onRemove: noop,
  onAddMuscleToSession: noop, onAddActivityToSession: noop, onAddActivityGroupToSession: noop,
  onAddExerciseToSession: noop, onRenameSession: noop, onSetSessionType: noop, onRemoveSession: noop,
  onDuplicateSessionToDay: noop, onMoveSessionToDay: noop, onReorderSession: noop,
};

let container: HTMLDivElement;
let root: Root;
const txt = () => container.textContent ?? "";
async function renderBlock(slots: MuscleSlotData[]) {
  await act(async () => root.render(
    <DragDropContext onDragEnd={noop}>
      <SessionBlock {...baseProps} slots={slots} />
    </DragDropContext>,
  ));
}

describe("SessionBlock — collapsed summary copy (board_v2, live)", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("uses 'item(s)' not 'exercise(s)' so pending group slots aren't mislabeled", async () => {
    await renderBlock([slot({ id: "a" }), slot({ id: "b", activityType: "cardio", muscleId: "cm-run", activityName: "Run", duration: 0 })]);
    expect(txt()).toContain("2 items — tap to expand");
    expect(txt()).not.toContain("exercise");
  });

  it("singular reads '1 item'", async () => {
    await renderBlock([slot({ id: "a" })]);
    expect(txt()).toContain("1 item — tap to expand");
  });
});
