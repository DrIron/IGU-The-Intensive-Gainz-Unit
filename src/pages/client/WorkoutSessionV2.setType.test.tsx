// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ExerciseCard, type Exercise } from "./WorkoutSessionV2";

// WK5 — the per-set type affordance inside the logger. These assert the UI is
// ADDITIVE: the selector reads/writes performed_json.set_type, a completed set
// shows its chip, and a normal set shows none. The core log/save/resume/complete
// flow is covered by WorkoutSessionV2.history.test.tsx — here we only add.

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

function makeExercise(): Exercise {
  return {
    id: "slot-1",
    exercise_id: "ex-1",
    section: "main",
    sort_order: 1,
    instructions: null,
    prescription_snapshot_json: { set_count: 3 },
    sets_json: [1, 2, 3].map((n) => ({ set_number: n, rep_range_min: 8, rep_range_max: 10 })),
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
    history: null,
  } as Exercise;
}

function logs(overrides: Record<number, Record<string, unknown>> = {}) {
  return [1, 2, 3].map((n) => ({
    set_index: n,
    performed_reps: null,
    performed_load: null,
    performed_rir: null,
    performed_rpe: null,
    performed_extra: {},
    notes: "",
    completed: false,
    skipped: false,
    ...(overrides[n] ?? {}),
  }));
}

let container: HTMLDivElement;
let root: Root;
let onUpdateLogExtra: ReturnType<typeof vi.fn>;

async function mount(logRows: ReturnType<typeof logs>) {
  onUpdateLogExtra = vi.fn();
  await act(async () => {
    root.render(
      <ExerciseCard
        exercise={makeExercise()}
        exerciseIndex={0}
        logs={logRows as never}
        onUpdateLog={vi.fn()}
        onUpdateLogExtra={onUpdateLogExtra}
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
}

describe("WK5 — set-type affordance in the logger", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("offers a set-type selector on each open set row (default value 'normal')", async () => {
    await mount(logs());
    const selects = container.querySelectorAll<HTMLSelectElement>(
      "select[aria-label$='type']",
    );
    expect(selects.length).toBe(3);
    expect(selects[0].value).toBe("normal");
  });

  it("writes the chosen type to performed_json.set_type, and CLEARS it back to normal", async () => {
    await mount(logs());
    const select = container.querySelector<HTMLSelectElement>("select[aria-label$='type']")!;

    select.value = "drop";
    await act(async () => select.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onUpdateLogExtra).toHaveBeenCalledWith(0, "set_type", "drop");

    onUpdateLogExtra.mockClear();
    select.value = "normal";
    await act(async () => select.dispatchEvent(new Event("change", { bubbles: true })));
    // 'normal' clears the key rather than storing a redundant default.
    expect(onUpdateLogExtra).toHaveBeenCalledWith(0, "set_type", null);
  });

  it("a normal completed set shows NO chip", async () => {
    await mount(logs({ 1: { completed: true, performed_load: 100, performed_reps: 5 } }));
    expect(container.querySelector("[data-set-type-chip]")).toBeNull();
  });

  it("a completed set with a marked type shows its chip", async () => {
    await mount(
      logs({
        1: {
          completed: true,
          performed_load: 60,
          performed_reps: 12,
          performed_extra: { set_type: "drop" },
        },
      }),
    );
    expect(container.querySelector("[data-set-type-chip='drop']")).not.toBeNull();
  });
});
