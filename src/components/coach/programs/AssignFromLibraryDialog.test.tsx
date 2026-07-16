// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * WK10-a follow-up — when opened from a specific client's surface the dialog must
 * pre-select AND lock that client:
 *   - matching preselectedClientUserId → locked line, no selectable dropdown, and
 *     assign uses that client's subscription
 *   - no prop (the global ProgramLibrary path) → the dropdown stays selectable
 *   - a preselect id NOT in the coach's active clients → falls back to selectable
 *     (never a locked-empty state)
 */

let subsRows: Array<{ id: string; user_id: string }> = [];
let profilesById: Record<string, { first_name: string; last_name: string | null }> = {};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "subscriptions") {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          then: (res: (v: unknown) => unknown) => res({ data: subsRows, error: null }),
        };
        return b;
      }
      if (table === "profiles") {
        let id: string | null = null;
        const b: Record<string, unknown> = {
          select: () => b,
          eq: (_col: string, val: string) => {
            id = val;
            return b;
          },
          maybeSingle: () => Promise.resolve({ data: id ? profilesById[id] ?? null : null, error: null }),
        };
        return b;
      }
      const b: Record<string, unknown> = {
        select: () => b, eq: () => b, in: () => b, order: () => b,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (res: (v: unknown) => unknown) => res({ data: [], error: null }),
      };
      return b;
    },
  },
}));

const assignSpy = vi.fn((_args: Record<string, unknown>) => Promise.resolve({ success: true }));
vi.mock("@/lib/assignProgram", () => ({
  assignProgramToClient: (args: Record<string, unknown>) => assignSpy(args),
}));
const stableToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: stableToast }) }));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
});
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};

const { AssignFromLibraryDialog } = await import("./AssignFromLibraryDialog");

let container: HTMLDivElement;
let root: Root;

async function mount(extra: Record<string, unknown> = {}): Promise<void> {
  await act(async () => {
    root.render(
      <AssignFromLibraryDialog
        open
        onOpenChange={vi.fn()}
        programId="prog-1"
        programTitle="Hypertrophy Block"
        coachUserId="coach-1"
        mode="client"
        onAssigned={vi.fn()}
        {...extra}
      />,
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
}

const findButton = (text: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

describe("AssignFromLibraryDialog — preselect + lock", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    subsRows = [
      { id: "sub-A", user_id: "user-A" },
      { id: "sub-B", user_id: "user-B" },
    ];
    profilesById = {
      "user-A": { first_name: "Alice", last_name: "Anders" },
      "user-B": { first_name: "Bob", last_name: null },
    };
    assignSpy.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("matching preselect → client locked (no dropdown) and assign targets that subscription", async () => {
    await mount({ preselectedClientUserId: "user-B" });

    // Locked static line, not a selectable dropdown.
    const locked = document.body.querySelector('[data-locked-client="user-B"]');
    expect(locked).not.toBeNull();
    expect(locked!.textContent).toContain("Assigning to Bob");
    expect(document.body.querySelector('[role="combobox"]')).toBeNull();

    // Assign is enabled (pre-selected) and uses Bob's subscription.
    const assignBtn = findButton("Assign");
    expect(assignBtn).toBeTruthy();
    expect(assignBtn!.disabled).toBe(false);
    await act(async () => assignBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(assignSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy.mock.calls[0][0]).toMatchObject({
      subscriptionId: "sub-B",
      clientUserId: "user-B",
      programTemplateId: "prog-1",
    });
  });

  it("no prop (global ProgramLibrary path) → selectable dropdown, not locked", async () => {
    await mount();

    expect(document.body.querySelector("[data-locked-client]")).toBeNull();
    expect(document.body.querySelector('[role="combobox"]')).not.toBeNull();
    // Nothing pre-selected → Assign disabled until the coach picks.
    expect(findButton("Assign")!.disabled).toBe(true);
  });

  it("preselect not in the coach's client list → falls back to selectable, never locked-empty", async () => {
    await mount({ preselectedClientUserId: "user-ghost" });

    expect(document.body.querySelector("[data-locked-client]")).toBeNull();
    expect(document.body.querySelector('[role="combobox"]')).not.toBeNull();
    expect(findButton("Assign")!.disabled).toBe(true); // no phantom selection
  });
});
