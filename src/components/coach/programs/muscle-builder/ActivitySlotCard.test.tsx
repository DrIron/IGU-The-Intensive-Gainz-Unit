// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import { ActivitySlotCard } from "./ActivitySlotCard";
import type { MuscleSlotData } from "@/types/muscle-builder";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 3e fix — an UNFILLED cardio/mobility group slot (duration 0) must show its group LABEL on the card,
 * not just "set duration". Regression: inline, the wide "set duration" metric (shrink-0) squeezed the
 * truncatable label to nothing in a narrow day column. Fix = stack label as title + secondary line.
 */

const slot = (o: Partial<MuscleSlotData>): MuscleSlotData => ({
  id: o.id ?? "s", dayIndex: 1, muscleId: "", sets: 1, repMin: 0, repMax: 0, sortOrder: 0, ...o,
});

let container: HTMLDivElement;
let root: Root;
const txt = () => container.textContent ?? "";

async function renderCard(s: MuscleSlotData) {
  await act(async () => root.render(
    <DragDropContext onDragEnd={() => {}}>
      <Droppable droppableId="d">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            <ActivitySlotCard slot={s} draggableIndex={0} onRemove={() => {}} />
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>,
  ));
}

describe("ActivitySlotCard — unfilled group slot shows its label", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("pending mobility group slot shows the region label AND 'set duration'", async () => {
    await renderCard(slot({ activityType: "yoga_mobility", muscleId: "tr-sh", activityName: "Shoulders", duration: 0 }));
    expect(txt()).toContain("Shoulders");     // the label, not swallowed by the metric
    expect(txt()).toContain("set duration");  // secondary pending line
  });

  it("pending label wraps (line-clamp-2, not truncate) and 'set duration' reads interactive", async () => {
    await renderCard(slot({ activityType: "yoga_mobility", muscleId: "tr-add", activityName: "Adductors", duration: 0 }));
    const labelEl = [...container.querySelectorAll("span")].find(s => s.textContent === "Adductors");
    expect(labelEl?.className).toContain("line-clamp-2");
    expect(labelEl?.className).not.toContain("truncate");
    // affordance: dotted underline on the "set duration" text + a pencil glyph.
    const underline = container.querySelector("span.decoration-dotted");
    expect(underline?.textContent).toBe("set duration");
    expect(container.querySelector("svg.lucide-pencil")).toBeTruthy();
  });

  it("a filled slot label stays truncate (byte-identical), no pencil", async () => {
    await renderCard(slot({ activityType: "cardio", activityName: "Treadmill", duration: 20 }));
    const labelEl = [...container.querySelectorAll("span")].find(s => s.textContent === "Treadmill");
    expect(labelEl?.className).toContain("truncate");
    expect(labelEl?.className).not.toContain("line-clamp-2");
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });

  it("pending cardio group slot shows the modality label AND 'set duration'", async () => {
    await renderCard(slot({ activityType: "cardio", muscleId: "cm-run", activityName: "Run", duration: 0 }));
    expect(txt()).toContain("Run");
    expect(txt()).toContain("set duration");
  });

  it("a filled/timed activity slot still shows its name + the minutes metric (unchanged)", async () => {
    await renderCard(slot({ activityType: "cardio", activityName: "Treadmill", duration: 20 }));
    expect(txt()).toContain("Treadmill");
    expect(txt()).toContain("20min");
    expect(txt()).not.toContain("set duration");
  });
});
