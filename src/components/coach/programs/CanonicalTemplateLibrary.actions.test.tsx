// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * CanonicalTemplateLibrary — the two wired actions: "Assign to Client" opens the shared picker
 * (canonical plan path), and "Delete" archives via delete_template_plan and drops the card.
 */

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

// Shared client picker → marker exposing the canonical plan path.
vi.mock("./AssignFromLibraryDialog", () => ({
  AssignFromLibraryDialog: ({ mode, canonicalPlanId }: { mode: string; canonicalPlanId?: string }) => (
    <div>ASSIGN-DIALOG mode={mode} plan={String(canonicalPlanId)}</div>
  ),
}));
// Render Radix dropdown + dialog inline (no portals/pointer events) so items/buttons are clickable.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  DropdownMenuSeparator: () => null,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ROW = { id: "plan-1", name: "Push Pull Legs", description: null, level: null, tags: null, week_count: 4, session_count: 6, exercise_count: 30 };

const { CanonicalTemplateLibrary } = await import("./CanonicalTemplateLibrary");

let container: HTMLDivElement;
let root: Root;
const buttons = (text: string) => [...container.querySelectorAll("button")].filter((b) => (b.textContent ?? "").trim() === text);
const click = async (el: Element) => {
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

describe("CanonicalTemplateLibrary — wired actions", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockImplementation((fn: string) => {
      if (fn === "list_coach_template_plans") return Promise.resolve({ data: [ROW], error: null });
      if (fn === "delete_template_plan") return Promise.resolve({ data: { archived: true, active_client_copies: 0 }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  async function mount() {
    await act(async () => { root.render(<CanonicalTemplateLibrary coachUserId="c1" onCreate={vi.fn()} onEditPlan={vi.fn()} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); // let the list load
  }

  it("Assign to Client is enabled and opens the shared picker on the canonical plan path", async () => {
    await mount();
    const [assign] = buttons("Assign to Client");
    expect(assign).toBeTruthy();
    expect((assign as HTMLButtonElement).disabled).toBe(false);
    await click(assign);
    expect(container.textContent).toContain("ASSIGN-DIALOG mode=client plan=plan-1");
  });

  it("Delete archives via delete_template_plan and removes the card", async () => {
    await mount();
    expect(container.textContent).toContain("Push Pull Legs");
    // Open the confirm (menu "Delete"), then confirm (the second "Delete" — in the dialog).
    await click(buttons("Delete")[0]);
    const confirm = buttons("Delete");
    await click(confirm[confirm.length - 1]);
    expect(rpc).toHaveBeenCalledWith("delete_template_plan", { p_plan_id: "plan-1" });
    expect(container.textContent).not.toContain("Push Pull Legs"); // card dropped
  });
});
