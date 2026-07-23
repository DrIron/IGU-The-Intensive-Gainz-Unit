// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DragDropContext } from "@hello-pangea/dnd";
import type { BoardDayOption } from "@/lib/boardDates";
import { VolumeOverview } from "../../muscle-builder/VolumeOverview";
import { DayColumn } from "../../muscle-builder/DayColumn";
import { MobileDayDetail } from "../../muscle-builder/MobileDayDetail";
import { MUSCLE_GROUPS, type MuscleSlotData, type SessionData } from "@/types/muscle-builder";
import type { MuscleVolumeEntry, VolumeSummary } from "../../muscle-builder/hooks/useMusclePlanVolume";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * PR1 visual-no-op guard (§11.4).
 *
 * The shared-primitives extraction must not change a single pixel of the builder.
 * Screenshots can't prove that (and the Planning Board is auth-gated), so instead
 * we pin the *rendered DOM* of the affected components. These snapshots were
 * captured from the pre-refactor tree; if the extraction alters any class, style,
 * attribute or node order, the HTML diverges and this test fails.
 *
 * That is a strictly stronger guarantee than an eyeballed screenshot: it compares
 * markup byte-for-byte, including classes a screenshot could never reveal.
 *
 * ── SNAPSHOT RE-BLESSED 2026-07-13 (deliberate, not a silent override) ───────
 * ProgramStatStrip's docstring always said it renders "12 sets · 48-62 min", but the
 * render never emitted the middot — segments were merely gap-separated, so the
 * builder's day strip and PR2's library card shipped "312 sets 18 exercises". The
 * separator was restored, which IS a visual change to the builder (a "·" now sits
 * between the sets count and the duration). This guard correctly failed on it; the
 * baseline was updated on purpose. Everything else in these snapshots is unchanged.
 */

let container: HTMLDivElement;
let root: Root;

/**
 * Sort the tokens inside every `class="..."` attribute.
 *
 * Extracting inline JSX into a component with a `className` escape hatch changes
 * the ORDER cn() concatenates tokens in, but class order carries no meaning in
 * HTML/CSS (specificity comes from the stylesheet, not the attribute). Sorting
 * makes the comparison order-insensitive on that one axis and nothing else:
 * an added, removed or altered class — and every style, attribute, text node and
 * structural change — still diverges and fails.
 */
function normalizeClassOrder(html: string): string {
  return html.replace(/class="([^"]*)"/g, (_m, classes: string) => {
    const sorted = classes.trim().split(/\s+/).filter(Boolean).sort().join(" ");
    return `class="${sorted}"`;
  });
}

/**
 * Blank out Radix's auto-generated ids (`radix-_r_2_`, `aria-controls`, …).
 *
 * They come from a module-global counter, so they shift whenever the number of
 * Radix components mounted earlier in the file changes — i.e. merely ADDING a test
 * renumbers them. They encode no visual information; leaving them in would make
 * the guard flap for reasons unrelated to the refactor.
 */
function normalizeRadixIds(html: string): string {
  return html.replace(/radix-[^"\s]*/g, "radix-ID");
}

async function render(ui: React.ReactElement): Promise<string> {
  await act(async () => {
    root.render(ui);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return normalizeRadixIds(normalizeClassOrder(container.innerHTML));
}

// MuscleVolumeEntry.muscle is a full MuscleGroupDef (it needs `landmarks`),
// which getMuscleDisplay() does not return — source it from MUSCLE_GROUPS.
const pecs = MUSCLE_GROUPS.find((m) => m.id === "pecs")!;
const shoulders = MUSCLE_GROUPS.find((m) => m.id === "shoulders")!;

function entry(muscle: typeof pecs, sets: number, zone: MuscleVolumeEntry["zone"]): MuscleVolumeEntry {
  return {
    muscle,
    totalSets: sets,
    totalRepsMin: sets * 8,
    totalRepsMax: sets * 12,
    tustSecondsMin: 0,
    tustSecondsMax: 0,
    workingSets: sets,
    hasTempo: false,
    frequency: 2,
    zone,
    dayBreakdown: [{ dayIndex: 1, sets }],
    subdivisionBreakdown: [],
  };
}

const SUMMARY: VolumeSummary = {
  totalSets: 26,
  musclesTargeted: 2,
  trainingDays: 3,
  avgSetsPerMuscle: 13,
  totalRepsMin: 208,
  totalRepsMax: 312,
  totalWorkingSets: 26,
  totalTustSecondsMin: 0,
  totalTustSecondsMax: 0,
};

const ENTRIES: MuscleVolumeEntry[] = [entry(pecs, 14, "productive"), entry(shoulders, 12, "maintenance")];

const noop = () => {};

const DAY_OPTIONS: BoardDayOption[] = [
  { dayIndex: 1, label: "Mon", weekday: "Mon" },
  { dayIndex: 2, label: "Tue", weekday: "Tue" },
  { dayIndex: 3, label: "Wed", weekday: "Wed" },
];

/** Two strength slots on day 1 → non-empty muscle-distribution ribbon + stat strip. */
const SLOTS: MuscleSlotData[] = [
  {
    id: "slot-1",
    dayIndex: 1,
    muscleId: "pecs",
    sets: 4,
    repMin: 8,
    repMax: 12,
    sortOrder: 0,
    sessionId: "sess-1",
    activityType: "strength",
  },
  {
    id: "slot-2",
    dayIndex: 1,
    muscleId: "shoulders",
    sets: 3,
    repMin: 10,
    repMax: 15,
    sortOrder: 1,
    sessionId: "sess-1",
    activityType: "strength",
  },
] as MuscleSlotData[];

const SESSIONS: SessionData[] = [
  { id: "sess-1", dayIndex: 1, name: "Push", type: "strength", sortOrder: 0 },
] as SessionData[];

describe("PR1 — shared-primitives extraction is a visual no-op", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("VolumeOverview: tiles + zone chips + bars render identically", async () => {
    const html = await render(<VolumeOverview entries={ENTRIES} summary={SUMMARY} />);
    expect(html).toMatchSnapshot();
  });

  it("VolumeOverview: empty state renders identically", async () => {
    const html = await render(<VolumeOverview entries={[]} summary={SUMMARY} />);
    expect(html).toMatchSnapshot();
  });

  // DayColumn renders SessionBlock, so this one snapshot pins BOTH the
  // muscle-distribution ribbon + stat strip (DayColumn) and the session-type
  // left bar (SessionBlock) in a single tree.
  it("DayColumn + SessionBlock: ribbon, stat strip and type bar render identically", async () => {
    const html = await render(
      <DragDropContext onDragEnd={() => {}}>
        <DayColumn
          dayIndex={1}
          slots={SLOTS}
          sessions={SESSIONS}
          isSelected={false}
          dayOptions={DAY_OPTIONS}
          onSelectDay={noop}
          onSetSlotDetails={noop}
          onRemove={noop}
          onAddMuscleToSession={noop}
          onAddActivityToSession={noop}

          onAddActivityGroupToSession={noop}
          onAddExerciseToSession={noop}
          onAddSession={noop}
          onRenameSession={noop}
          onSetSessionType={noop}
          onRemoveSession={noop}
          onDuplicateSessionToDay={noop}
          onMoveSessionToDay={noop}
          onReorderSession={noop}
        />
      </DragDropContext>,
    );
    expect(html).toMatchSnapshot();
  });

  // Mobile renders its OWN copy of the session-type bar and stat strip. §11.5
  // requires phone + desktop to share the primitives so they can't drift — but
  // they had ALREADY drifted (space-y-1.5 vs space-y-1; no mt-1 on the strip), so
  // this pins mobile's current output to prove the extraction preserves it rather
  // than silently snapping mobile to desktop's spacing.
  it("MobileDayDetail: type bar + stat strip render identically", async () => {
    const html = await render(
      <MobileDayDetail
        slots={SLOTS}
        sessions={SESSIONS}
        selectedDayIndex={1}
        dayOptions={DAY_OPTIONS}
        onSetSlotDetails={noop}
        onRemove={noop}
        onAddMuscleToSession={noop}
        onAddActivityToSession={noop}

        onAddActivityGroupToSession={noop}
        onAddExerciseToSession={noop}
        onAddSession={noop}
        onRenameSession={noop}
        onSetSessionType={noop}
        onRemoveSession={noop}
        onDuplicateSessionToDay={noop}
        onMoveSessionToDay={noop}
      />,
    );
    expect(html).toMatchSnapshot();
  });

  // Rest day exercises the no-sessions branch (no ribbon, no stat strip).
  it("DayColumn: rest-day (empty) state renders identically", async () => {
    const html = await render(
      <DragDropContext onDragEnd={() => {}}>
        <DayColumn
          dayIndex={3}
          slots={[]}
          sessions={[]}
          isSelected={false}
          dayOptions={DAY_OPTIONS}
          onSelectDay={noop}
          onSetSlotDetails={noop}
          onRemove={noop}
          onAddMuscleToSession={noop}
          onAddActivityToSession={noop}

          onAddActivityGroupToSession={noop}
          onAddExerciseToSession={noop}
          onAddSession={noop}
          onRenameSession={noop}
          onSetSessionType={noop}
          onRemoveSession={noop}
          onDuplicateSessionToDay={noop}
          onMoveSessionToDay={noop}
          onReorderSession={noop}
        />
      </DragDropContext>,
    );
    expect(html).toMatchSnapshot();
  });
});
