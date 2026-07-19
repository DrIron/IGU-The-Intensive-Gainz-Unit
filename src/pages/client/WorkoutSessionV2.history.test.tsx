// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ExerciseCard, type Exercise, type HistorySet } from "./WorkoutSessionV2";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// ExerciseCard mounts the shared ExerciseDemoCard, which resolves the PRIMARY muscle via
// useExerciseTaxonomy (react-query). These tests render ExerciseCard bare (no QueryClient) and
// don't assert muscle labels — stub the taxonomy so the card's hook has no provider dependency.
vi.mock("@/hooks/useExerciseTaxonomy", () => ({ useExerciseTaxonomy: () => ({ data: undefined }) }));

/**
 * BUG A — the workout logger showed REVERSED previous-set values.
 *
 * `history.sets` is built from logs ordered `created_at DESC`, so sets[0] is the LAST set
 * of the previous session. The set rows were fed `history.sets[i]` — by ARRAY POSITION — so
 * set 1 was prefilled with set 4's weight, set 2 with set 3's, and so on. On a top-set-first
 * or ramping scheme those numbers are wildly wrong, and a client working off the "last 100"
 * hint would load the wrong bar. It never threw: every number looked plausible.
 *
 * The fix matches on set_number — identity, not position. These tests feed history in
 * DESCENDING set order (the real production order) and assert each row shows its OWN set's
 * numbers. Order-independence is the property under test, so the fixtures are deliberately
 * shuffled: if anyone reintroduces positional indexing, the descending case fails loudly.
 */

const RAMP: HistorySet[] = [
  // Newest-log-first, exactly as loadCrossInstanceHistory returns it.
  { set_number: 4, weight: 100, reps: 5, rir: 0 },
  { set_number: 3, weight: 90, reps: 6, rir: 1 },
  { set_number: 2, weight: 80, reps: 8, rir: 2 },
  { set_number: 1, weight: 70, reps: 10, rir: 3 },
];

function makeExercise(sets: HistorySet[]): Exercise {
  return {
    id: "slot-1",
    exercise_id: "ex-1",
    section: "main",
    sort_order: 1,
    instructions: null,
    prescription_snapshot_json: { set_count: 4 },
    sets_json: [1, 2, 3, 4].map((n) => ({ set_number: n, rep_range_min: 8, rep_range_max: 10 })),
    input_columns: [],
    is_activity: false,
    exercise: {
      name: "Back Squat",
      default_video_url: null,
      primary_muscle: "quads",
      description: null,
      setup_instructions: null,
      setup_points: null,
      equipment: null,
      secondary_muscles: null,
    },
    history: { date: "2026-07-07T10:00:00Z", sets },
  } as Exercise;
}

const emptyLogs = [1, 2, 3, 4].map((n) => ({
  set_index: n,
  performed_reps: null,
  performed_load: null,
  performed_rir: null,
  performed_rpe: null,
  performed_extra: {},
  notes: "",
  completed: false,
  skipped: false,
}));

let container: HTMLDivElement;
let root: Root;

async function mountCard(exercise: Exercise): Promise<HTMLDivElement> {
  await act(async () => {
    root.render(
      <ExerciseCard
        exercise={exercise}
        exerciseIndex={0}
        logs={emptyLogs as never}
        onUpdateLog={vi.fn()}
        onUpdateLogExtra={vi.fn()}
        onCompleteSet={vi.fn()}
        onSwapExercise={vi.fn()}
        onSkipExercise={vi.fn()}
        onSkipSet={vi.fn()}
        isExpanded
        onToggle={vi.fn()}
        activeSuggestionForSet={new Map()}
        onDismissSuggestion={vi.fn()}
        unit="kg"
      />,
    );
  });
  return container;
}

/**
 * The rendered set rows, in DOM order. Each row carries a "Set N" label and a "last <weight>"
 * hint; we pair them up so an assertion can say "the row labelled Set 1 shows last 70".
 */
function rowsBySetNumber(el: HTMLElement): Map<number, string> {
  const out = new Map<number, string>();
  for (const row of el.querySelectorAll<HTMLElement>("[data-set-row]")) {
    const n = Number(row.getAttribute("data-set-row"));
    out.set(n, row.textContent ?? "");
  }
  return out;
}

describe("BUG A — per-set history matches by set_number, never by array index", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("a DESCENDING history array does not reverse the display", async () => {
    const el = await mountCard(makeExercise(RAMP));
    const rows = rowsBySetNumber(el);

    expect(rows.size).toBe(4);

    // Each row shows ITS OWN set's numbers.
    expect(rows.get(1)).toContain("last 70");
    expect(rows.get(2)).toContain("last 80");
    expect(rows.get(3)).toContain("last 90");
    expect(rows.get(4)).toContain("last 100");

    // The exact lie the bug told: set 1 prefilled with set 4's 100 kg.
    expect(rows.get(1)).not.toContain("last 100");
    expect(rows.get(4)).not.toContain("last 70");
  });

  it("is order-INDEPENDENT — a shuffled array renders identically", async () => {
    const shuffled = [RAMP[2], RAMP[0], RAMP[3], RAMP[1]]; // 2, 4, 1, 3
    const el = await mountCard(makeExercise(shuffled));
    const rows = rowsBySetNumber(el);

    expect(rows.get(1)).toContain("last 70");
    expect(rows.get(2)).toContain("last 80");
    expect(rows.get(3)).toContain("last 90");
    expect(rows.get(4)).toContain("last 100");
  });

  it("reps follow the same set, not the same position", async () => {
    const el = await mountCard(makeExercise(RAMP));
    const rows = rowsBySetNumber(el);

    // Set 1 was 10 reps at 70; set 4 was 5 reps at 100. Positional indexing swapped them.
    expect(rows.get(1)).toContain("last 10");
    expect(rows.get(4)).toContain("last 5");
  });

  it("a set with NO history for its number shows nothing, rather than borrowing another set's", async () => {
    // Last session was cut short at 2 sets; today prescribes 4.
    const partial: HistorySet[] = [
      { set_number: 2, weight: 80, reps: 8 },
      { set_number: 1, weight: 70, reps: 10 },
    ];
    const el = await mountCard(makeExercise(partial));
    const rows = rowsBySetNumber(el);

    expect(rows.get(1)).toContain("last 70");
    expect(rows.get(2)).toContain("last 80");
    // Sets 3 and 4 were never performed. Silence is the honest answer; the old code would
    // have handed them whatever happened to sit at sets[2] / sets[3].
    expect(rows.get(3)).not.toContain("last");
    expect(rows.get(4)).not.toContain("last");
  });

  it('the "Last" summary is the highest set_number, not sets[0]', async () => {
    // Ascending input: sets[0] is set 1. The summary must still report set 4 (100x5) —
    // the final set of the session — not set 1's 70.
    const ascending = [...RAMP].reverse();
    const el = await mountCard(makeExercise(ascending));
    const summary = el.querySelector("[data-history-summary]")?.textContent ?? "";

    expect(summary).toContain("100");
    expect(summary).not.toContain("70");
  });
});
