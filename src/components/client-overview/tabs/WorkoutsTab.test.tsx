// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * WK10-a — the "Assign program" button must stay in-context:
 *   - clicking it opens the in-tab picker, NOT a route change to /coach/programs
 *   - picking a template opens AssignFromLibraryDialog with that programId + mode="client"
 *   - the dialog's onAssigned refreshes the client's program list
 *   - the button is disabled when the client has no active subscription
 *
 * Heavy children are stubbed; the picker + assign dialog are stubbed to record
 * props (their own behaviour is covered by AssignProgramPicker.test.tsx and the
 * dialog's own suite).
 */

const navigateSpy = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateSpy }));

const reloadPrograms = vi.fn();
let programs: unknown[] = [];
vi.mock("../workouts/useClientWorkouts", () => ({
  useClientPrograms: () => ({ programs, loading: false, reload: reloadPrograms }),
  useAdherencePulse: () => ({ pulse: null, loading: false }),
}));

vi.mock("@/lib/featureFlags", () => ({ isBoardV2Enabled: () => false }));
vi.mock("@/lib/canonicalScheduleAdapter", () => ({
  loadCanonicalSchedule: () => Promise.resolve(null),
  canonicalDrilldownDays: () => [],
}));

// Chainable supabase: auth.getUser → coach-1; client_plan_assignment → no row.
const asgBuilder = {
  select: () => asgBuilder, eq: () => asgBuilder, order: () => asgBuilder, limit: () => asgBuilder,
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "coach-1" } } }) },
    from: () => asgBuilder,
  },
}));

// Presentational stubs — render nothing meaningful.
const Stub = () => null;
vi.mock("@/components/coach/programs/DirectClientCalendar", () => ({ DirectClientCalendar: Stub }));
vi.mock("@/components/coach/VolumeChart", () => ({ VolumeChart: Stub }));
vi.mock("../workouts/WorkoutAdherencePulse", () => ({ WorkoutAdherencePulse: Stub }));
vi.mock("../workouts/ClientProgramList", () => ({ ClientProgramList: Stub }));
vi.mock("../workouts/ClientProgramDrilldown", () => ({ ClientProgramDrilldown: Stub }));
vi.mock("@/components/coach/programs/muscle-builder/MuscleBuilderPage", () => ({ MuscleBuilderPage: Stub }));
vi.mock("@/components/workouts/TakeDeloadCard", () => ({ TakeDeloadCard: Stub }));
vi.mock("../workouts/SessionLogViewer", () => ({ SessionLogViewer: Stub }));
vi.mock("../workouts/ClientScheduleCalendar", () => ({ ClientScheduleCalendar: Stub }));
vi.mock("../workouts/WorkoutPulse", () => ({ WorkoutPulse: Stub }));
vi.mock("../workouts/WorkoutTrendCards", () => ({ WorkoutTrendCards: Stub }));
vi.mock("../workouts/WorkoutHistoryTrends", () => ({ WorkoutHistoryTrends: Stub }));

// Picker stub — exposes open state + a button that drives onPick.
vi.mock("../workouts/AssignProgramPicker", () => ({
  AssignProgramPicker: ({ open, onPick }: { open: boolean; onPick: (id: string, title: string) => void }) => (
    <div data-picker data-picker-open={String(open)}>
      <button type="button" onClick={() => onPick("prog-1", "Prog 1")}>
        pick-template
      </button>
    </div>
  ),
}));

// Assign dialog stub — records the props it was handed + a button that fires onAssigned.
let lastAssignProps: { open: boolean; programId: string; mode: string } | null = null;
vi.mock("@/components/coach/programs/AssignFromLibraryDialog", () => ({
  AssignFromLibraryDialog: (props: { open: boolean; programId: string; mode: string; onAssigned?: () => void }) => {
    lastAssignProps = { open: props.open, programId: props.programId, mode: props.mode };
    return (
      <div data-assign-dialog data-assign-open={String(props.open)} data-assign-program={props.programId} data-assign-mode={props.mode}>
        <button type="button" onClick={() => props.onAssigned?.()}>fire-assigned</button>
      </div>
    );
  },
}));

(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};

const { WorkoutsTab } = await import("./WorkoutsTab");

const makeContext = (subscription: unknown) => ({
  clientUserId: "client-1",
  profile: {
    id: "client-1", firstName: "Sam", lastName: null, displayName: "Sam", avatarUrl: null, status: "active",
  },
  subscription,
  viewerRole: "coach" as const,
});
const activeSub = { id: "sub-1", status: "active", serviceType: "one_to_one_online", serviceName: "1:1 Online" };

let container: HTMLDivElement;
let root: Root;

async function mount(subscription: unknown): Promise<void> {
  await act(async () => {
    root.render(<WorkoutsTab context={makeContext(subscription) as never} />);
  });
  // let auth.getUser + assignment effects settle (coachUserId resolves here).
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

const findByText = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

async function openProgramsTab(): Promise<void> {
  const trigger = [...container.querySelectorAll('[role="tab"]')].find(
    (t) => t.textContent?.trim() === "Programs",
  ) as HTMLElement;
  // Radix Tabs (automatic activation) switches on focus; also click for good measure.
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("WorkoutsTab — WK10-a in-context assign", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    programs = [];
    navigateSpy.mockClear();
    reloadPrograms.mockClear();
    lastAssignProps = null;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("'Assign program' opens the in-tab picker and never navigates to /coach/programs", async () => {
    await mount(activeSub);
    await openProgramsTab();

    expect(container.querySelector("[data-picker]")?.getAttribute("data-picker-open")).toBe("false");

    const assignBtn = findByText("Assign program");
    expect(assignBtn).toBeTruthy();
    await act(async () => assignBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.querySelector("[data-picker]")?.getAttribute("data-picker-open")).toBe("true");
    // The whole point of the slice: no route change.
    expect(navigateSpy).not.toHaveBeenCalled();
    for (const call of navigateSpy.mock.calls) {
      expect(String(call[0])).not.toContain("/coach/programs");
    }
  });

  it("picking a template opens AssignFromLibraryDialog with that programId + mode='client'", async () => {
    await mount(activeSub);
    await openProgramsTab();

    // Dialog is unmounted until a template is chosen.
    expect(container.querySelector("[data-assign-dialog]")).toBeNull();

    await act(async () => findByText("pick-template")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const dialog = container.querySelector("[data-assign-dialog]");
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("data-assign-open")).toBe("true");
    expect(dialog!.getAttribute("data-assign-program")).toBe("prog-1");
    expect(dialog!.getAttribute("data-assign-mode")).toBe("client");
    expect(lastAssignProps).toMatchObject({ programId: "prog-1", mode: "client" });
  });

  it("the dialog's onAssigned refreshes the client's program list", async () => {
    await mount(activeSub);
    await openProgramsTab();
    await act(async () => findByText("pick-template")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await act(async () => findByText("fire-assigned")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(reloadPrograms).toHaveBeenCalled();
  });

  it("'Assign program' is disabled when the client has no active subscription", async () => {
    await mount(null);
    await openProgramsTab();

    const assignBtn = findByText("Assign program");
    expect(assignBtn).toBeTruthy();
    expect(assignBtn!.disabled).toBe(true);
  });
});
