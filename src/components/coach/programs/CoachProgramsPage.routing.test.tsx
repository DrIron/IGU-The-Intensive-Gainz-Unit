// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * CoachProgramsPage routing — the canonical_template_authoring flag flips the Mesocycles tab between
 * the canonical board path (flag ON) and the legacy ProgramCalendarBuilder path (flag OFF).
 */

let flagOn = false;
vi.mock("@/lib/featureFlags", () => ({
  isCanonicalTemplateAuthoringEnabled: () => flagOn,
}));

// Hooks the page needs, stubbed.
vi.mock("@/hooks/useMacrocycles", () => ({ useMacrocycleList: () => ({ macrocycles: [], reload: vi.fn() }) }));
vi.mock("@/hooks/useSubrolePermissions", () => ({ useSubrolePermissions: () => ({ canBuildPrograms: true, isLoading: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useParams: () => ({}) }));

// Child surfaces stubbed to markers + routing triggers.
vi.mock("./ProgramLibrary", () => ({
  ProgramLibrary: ({ onEditProgram }: { onEditProgram: (id: string) => void }) => (
    <div><span>ProgramLibrary</span><button onClick={() => onEditProgram("p1")}>legacy-edit</button></div>
  ),
}));
vi.mock("./CanonicalTemplateLibrary", () => ({
  CanonicalTemplateLibrary: ({ onEditPlan }: { onEditPlan: (id: string) => void }) => (
    <div><span>CanonicalTemplateLibrary</span><button onClick={() => onEditPlan("plan1")}>canonical-edit</button></div>
  ),
}));
vi.mock("./muscle-builder/MuscleBuilderPage", () => ({
  MuscleBuilderPage: ({ existingTemplateId, canonical }: { existingTemplateId?: string; canonical?: boolean }) => (
    <div>MB canonical={String(!!canonical)} id={String(existingTemplateId)}</div>
  ),
}));
vi.mock("./ProgramCalendarBuilder", () => ({
  ProgramCalendarBuilder: ({ programId }: { programId: string }) => <div>PCB id={programId}</div>,
}));
vi.mock("./ProgramDetailView", () => ({ ProgramDetailView: () => <div>PDV</div> }));
vi.mock("./muscle-builder/MusclePlanLibrary", () => ({ MusclePlanLibrary: () => <div>Drafts</div> }));
vi.mock("./macrocycles/MacrocycleLibrary", () => ({ MacrocycleLibrary: () => <div>Macros</div> }));
vi.mock("./macrocycles/MacrocycleEditor", () => ({ MacrocycleEditor: () => <div>MacroEditor</div> }));

const { CoachProgramsPage } = await import("./CoachProgramsPage");

let container: HTMLDivElement;
let root: Root;
const clickText = async (text: string) => {
  const btn = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === text);
  if (!btn) throw new Error(`no button "${text}"`);
  await act(async () => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("CoachProgramsPage — Mesocycles routing by flag", () => {
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

  it("flag OFF: Mesocycles shows the legacy ProgramLibrary; Edit → ProgramCalendarBuilder", async () => {
    flagOn = false;
    await act(async () => root.render(<CoachProgramsPage coachUserId="c1" />));
    expect(container.textContent).toContain("ProgramLibrary");
    expect(container.textContent).not.toContain("CanonicalTemplateLibrary");
    await clickText("legacy-edit");
    expect(container.textContent).toContain("PCB id=p1"); // legacy calendar builder
    expect(container.textContent).not.toContain("MB canonical");
  });

  it("flag ON: Mesocycles shows CanonicalTemplateLibrary; Edit → the canonical board", async () => {
    flagOn = true;
    await act(async () => root.render(<CoachProgramsPage coachUserId="c1" />));
    expect(container.textContent).toContain("CanonicalTemplateLibrary");
    expect(container.textContent).not.toContain("ProgramLibrary");
    await clickText("canonical-edit");
    // Routes to MuscleBuilderPage as a canonical template (canonical=true, plan id passed through).
    expect(container.textContent).toContain("MB canonical=true id=plan1");
    expect(container.textContent).not.toContain("PCB");
  });
});
