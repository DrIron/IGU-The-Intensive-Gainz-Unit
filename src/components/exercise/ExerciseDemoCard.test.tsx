// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ExerciseDemoContent, derivePrimaryMuscle, type ExerciseDemoData } from "./ExerciseDemoCard";

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

  it("coach context HEADLINES the dense name, with client_name as the subline + descriptor detail", async () => {
    const el = await render(<ExerciseDemoContent exercise={FULL} context="coach" />);
    // Contract: coach headline (h2) is the dense `name`; the friendly client_name is the subline.
    expect(el.querySelector("h2")?.textContent).toBe("Sternal Pec DB Flat Press (L)");
    expect(el.textContent).toContain("Flat Dumbbell Press"); // client_name subline
    expect(el.textContent).toContain("Pronated"); // grip detail
  });

  it("client-facing contexts HEADLINE the friendly client_name (never the dense name)", async () => {
    for (const context of ["library", "in-session", "swap"] as const) {
      const el = await render(<ExerciseDemoContent exercise={FULL} context={context} />);
      expect(el.querySelector("h2")?.textContent, context).toBe("Flat Dumbbell Press");
      expect(el.textContent, context).not.toContain("Sternal Pec DB Flat Press (L)");
      await act(async () => root.unmount());
      root = createRoot(container);
    }
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

  // MuscleMap PRIMARY is derived from the muscle_id FK — the canonical rebuild leaves the legacy
  // `primary_muscle` text NULL, so the old text-only read showed "Not specified" everywhere.
  it("MuscleMap PRIMARY shows the FK muscle for a canonical row (primary_muscle NULL, muscle_id set)", async () => {
    const canonical: ExerciseDemoData = { ...FULL, primary_muscle: null, secondary_muscles: [], muscle_id: "m-pec", subdivision_id: null };
    const el = await render(<ExerciseDemoContent exercise={canonical} context="library" primaryMuscle="Pec Major" />);
    const map = el.querySelector("[data-muscle-map]");
    expect(map?.textContent).toContain("Pec Major");
    expect(map?.textContent).not.toContain("Not specified");
  });

  it("MuscleMap renders NO secondary chips when secondary_muscles is empty (no fabrication)", async () => {
    const canonical: ExerciseDemoData = { ...FULL, primary_muscle: null, secondary_muscles: [], muscle_id: "m-pec" };
    const el = await render(<ExerciseDemoContent exercise={canonical} context="library" primaryMuscle="Pec Major" />);
    const map = el.querySelector("[data-muscle-map]");
    expect(map?.textContent).not.toContain("Secondary");
    expect(map?.textContent).not.toContain("Not specified");
  });
});

describe("derivePrimaryMuscle", () => {
  const TAX = {
    muscles: [{ id: "m-pec", display_name: "Pec Major" }, { id: "m-tri", display_name: "Triceps" }],
    subdivisions: [{ id: "s-costal", display_name: "Costal Head" }],
  };

  it("resolves the FK muscle_id → display_name (canonical row, primary_muscle NULL)", () => {
    expect(derivePrimaryMuscle({ muscle_id: "m-pec", subdivision_id: null, primary_muscle: null }, TAX)).toBe("Pec Major");
  });

  it("qualifies with the subdivision when subdivision_id is set", () => {
    expect(derivePrimaryMuscle({ muscle_id: "m-pec", subdivision_id: "s-costal", primary_muscle: null }, TAX)).toBe(
      "Pec Major · Costal Head",
    );
  });

  it("falls back to legacy primary_muscle text when muscle_id is NULL", () => {
    expect(derivePrimaryMuscle({ muscle_id: null, subdivision_id: null, primary_muscle: "Chest" }, TAX)).toBe("Chest");
  });

  it("returns null when neither an FK muscle nor legacy text exists (→ 'Not specified')", () => {
    expect(derivePrimaryMuscle({ muscle_id: null, subdivision_id: null, primary_muscle: null }, TAX)).toBeNull();
  });

  it("falls back to text when the muscle_id has no taxonomy match (or taxonomy not loaded)", () => {
    expect(derivePrimaryMuscle({ muscle_id: "m-unknown", subdivision_id: null, primary_muscle: "Chest" }, TAX)).toBe("Chest");
    expect(derivePrimaryMuscle({ muscle_id: "m-pec", subdivision_id: null, primary_muscle: "Chest" }, null)).toBe("Chest");
  });
});
