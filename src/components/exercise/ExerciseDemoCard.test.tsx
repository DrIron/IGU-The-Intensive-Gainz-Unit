// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ExerciseDemoContent, type ExerciseDemoData } from "./ExerciseDemoCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ExerciseDemoCard content — the shared card's blocks. Tests pin the honesty + context rules:
 *  - client_name is shown (not the dense `name`) everywhere except coach context;
 *  - no video / no setup → branded "coming soon" (never a broken empty, never an iframe);
 *  - last-set only in-session; the right CTA label per context.
 */

const FULL: ExerciseDemoData = {
  name: "Sternal Pec DB Flat Press (L)", // dense internal name
  client_name: "Flat Dumbbell Press",
  primary_muscle: "Chest",
  secondary_muscles: ["Triceps", "Front Delts"],
  equipment: "DB",
  resistance_profiles: ["Lengthened"],
  laterality: "bi",
  positioning: "Flat",
  grip: "Pronated",
  setup_points: ["Set an flat bench", "Dumbbells at chest"],
  setup_instructions: null,
  description: "Press to lockout.",
  default_video_url: null, // 0 populated in prod → pending
};

let container: HTMLDivElement;
let root: Root;

async function render(ui: React.ReactElement): Promise<HTMLDivElement> {
  await act(async () => root.render(ui));
  return container;
}

describe("ExerciseDemoContent", () => {
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

  it("shows client_name (not the dense name) in library/in-session/swap contexts", async () => {
    for (const context of ["library", "in-session", "swap"] as const) {
      const el = await render(<ExerciseDemoContent exercise={FULL} context={context} />);
      expect(el.textContent, context).toContain("Flat Dumbbell Press");
      expect(el.textContent, context).not.toContain("Sternal Pec DB Flat Press (L)");
      await act(async () => root.unmount());
      root = createRoot(container);
    }
  });

  it("coach context shows the friendly name AND the dense name + descriptor detail", async () => {
    const el = await render(<ExerciseDemoContent exercise={FULL} context="coach" />);
    expect(el.textContent).toContain("Flat Dumbbell Press");
    expect(el.textContent).toContain("Sternal Pec DB Flat Press (L)");
    expect(el.textContent).toContain("Pronated"); // grip detail
  });

  it("no video → branded pending placeholder and NO YouTube iframe", async () => {
    const el = await render(<ExerciseDemoContent exercise={FULL} context="library" />);
    expect(el.textContent).toContain("Demo video coming soon");
    expect(el.querySelector("iframe")).toBeNull();
  });

  it("with a video → renders the YouTube iframe, no pending placeholder", async () => {
    const el = await render(
      <ExerciseDemoContent
        exercise={{ ...FULL, default_video_url: "https://youtu.be/abc123XYZ00" }}
        context="library"
      />,
    );
    const iframe = el.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain("youtube.com/embed/abc123XYZ00");
    expect(el.textContent).not.toContain("Demo video coming soon");
  });

  it("no setup and no description → branded 'coming soon' block, not an empty", async () => {
    const el = await render(
      <ExerciseDemoContent
        exercise={{ ...FULL, setup_points: null, setup_instructions: null, description: null }}
        context="library"
      />,
    );
    expect(el.textContent).toContain("Setup & execution coming soon");
  });

  it("Animation toggle is present but disabled (no animation_url column)", async () => {
    const el = await render(<ExerciseDemoContent exercise={FULL} context="library" />);
    const anim = [...el.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Animation"));
    expect(anim).not.toBeUndefined();
    expect((anim as HTMLButtonElement).disabled).toBe(true);
  });

  it("last set renders only in-session (from lastSet), never fabricated elsewhere", async () => {
    const inSession = await render(
      <ExerciseDemoContent exercise={FULL} context="in-session" lastSet={{ weight: 30, reps: 8, unit: "kg" }} onSwap={() => {}} />,
    );
    expect(inSession.querySelector("[data-last-set]")?.textContent).toContain("30kg × 8");

    await act(async () => root.unmount());
    root = createRoot(container);
    // Same lastSet passed to a non-in-session context must NOT render.
    const library = await render(
      <ExerciseDemoContent exercise={FULL} context="library" lastSet={{ weight: 30, reps: 8 }} onFindSimilar={() => {}} />,
    );
    expect(library.querySelector("[data-last-set]")).toBeNull();
  });

  it("renders the right CTA label per context (only when its handler is supplied)", async () => {
    const cases: [Parameters<typeof ExerciseDemoContent>[0]["context"], string, Record<string, () => void>][] = [
      ["library", "Find similar", { onFindSimilar: () => {} }],
      ["in-session", "Swap", { onSwap: () => {} }],
      ["swap", "Swap this in", { onSwap: () => {} }],
      ["coach", "Add as alternative", { onAddAlternative: () => {} }],
    ];
    for (const [context, label, handlers] of cases) {
      const el = await render(<ExerciseDemoContent exercise={FULL} context={context} {...handlers} />);
      expect(el.textContent, context).toContain(label);
      await act(async () => root.unmount());
      root = createRoot(container);
    }
    // No handler → no CTA.
    const el = await render(<ExerciseDemoContent exercise={FULL} context="library" />);
    expect(el.textContent).not.toContain("Find similar");
  });

  it("meta chips use friendly equipment + laterality label", async () => {
    const el = await render(
      <ExerciseDemoContent exercise={{ ...FULL, equipment: "C-FT", laterality: "uni" }} context="library" />,
    );
    expect(el.textContent).toContain("Cable"); // C-FT -> Cable
    expect(el.textContent).toContain("Unilateral"); // laterality !== 'bi'
  });
});
