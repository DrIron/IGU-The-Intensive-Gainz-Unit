// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * BUG13 — coach-created sessions were invisible to the client.
 *
 * `direct_calendar_sessions` is the coach's ad-hoc calendar (DirectClientCalendar writes it;
 * the coach's SessionsTab reads it). The client's /sessions page read ONLY `session_bookings`,
 * so a session the coach put on the client's calendar rendered nowhere the client could see.
 * RLS had permitted the client read the whole time — nobody ever asked for the rows.
 *
 * Two properties are pinned here:
 *   1. the client SEES a coach-created session, split Upcoming / Past
 *   2. it is READ-ONLY — no cancel/edit/delete affordance anywhere in the card
 *
 * (2) is defence in depth, not the mechanism: the RLS UPDATE/DELETE policies on this table are
 * `coach_user_id = auth.uid() OR is_admin(...)`, so the DB refuses a client write regardless.
 * The test guards the UI from ever *implying* an ability the server would reject.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let rows: unknown[] = [];
let shouldFail = false;

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown) =>
              resolve(
                shouldFail
                  ? { data: null, error: new Error("network down") }
                  : { data: rows, error: null },
              );
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  return { supabase: { from: () => builder() } };
});
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));

const { CoachScheduledSessions } = await import("./CoachScheduledSessions");

// The component splits on TODAY in Kuwait; freeze the clock so the fixtures stay meaningful.
const NOW = new Date("2026-07-14T09:00:00Z"); // 12:00 Kuwait, 2026-07-14

const UPCOMING = {
  id: "s-upcoming",
  title: "Assessment with Coach",
  session_type: "strength",
  session_timing: "morning",
  session_date: "2026-07-20",
  status: "scheduled",
  notes: "Bring your lifting shoes.",
};
const PAST = {
  id: "s-past",
  title: "Intro Session",
  session_type: "mobility",
  session_timing: "evening",
  session_date: "2026-07-02",
  status: "completed",
  notes: null,
};

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => {
    root.render(<CoachScheduledSessions clientUserId="client-1" />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return container;
}

describe("BUG13 — the client can see sessions their coach scheduled", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    rows = [];
    shouldFail = false;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders a coach-created session — the bug was that it rendered nowhere", async () => {
    rows = [UPCOMING];
    const el = await mount();

    expect(el.textContent).toContain("Assessment with Coach");
    expect(el.textContent).toContain("Scheduled by Your Coach");
    // Label maps, not .replace() — CLAUDE.md.
    expect(el.textContent).toContain("Strength Training");
    expect(el.textContent).toContain("Morning");
    expect(el.textContent).toContain("Bring your lifting shoes.");
  });

  it("is READ-ONLY — no cancel, edit or delete affordance", async () => {
    rows = [UPCOMING, PAST];
    const el = await mount();

    // The client's OWN bookings are cancellable elsewhere on the page. These are not theirs to
    // change: RLS UPDATE/DELETE are coach-or-admin, so any control here would be a lie.
    expect(el.querySelectorAll("button")).toHaveLength(0);
    expect(el.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(el.textContent).not.toMatch(/\b(Cancel|Delete|Edit|Reschedule|Remove)\b/i);
    // ...and it says who owns the change.
    expect(el.textContent).toContain("message your coach");
  });

  it("splits Upcoming from Past on the Kuwait calendar day", async () => {
    rows = [UPCOMING, PAST];
    const el = await mount();

    const text = el.textContent ?? "";
    expect(text).toContain("Upcoming");
    expect(text).toContain("Past");
    // Ordering: the Upcoming heading precedes the future session, Past precedes the old one.
    expect(text.indexOf("Upcoming")).toBeLessThan(text.indexOf("Assessment with Coach"));
    expect(text.indexOf("Past")).toBeLessThan(text.indexOf("Intro Session"));
    expect(text.indexOf("Assessment with Coach")).toBeLessThan(text.indexOf("Intro Session"));
  });

  it("a session TODAY counts as upcoming, not past", async () => {
    rows = [{ ...UPCOMING, session_date: "2026-07-14" }];
    const el = await mount();

    expect(el.textContent).toContain("Upcoming");
    expect(el.textContent).not.toContain("Past");
  });

  it("a FAILED fetch shows LoadError, never a silent 'nothing scheduled'", async () => {
    shouldFail = true;
    const el = await mount();

    // The CC10 lie this must not tell: rendering null on a failed read would say "your coach
    // hasn't scheduled anything" — a fact we never established.
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.textContent).toContain("Couldn't load");
  });

  it("genuinely empty renders nothing at all — no fabricated card", async () => {
    rows = [];
    const el = await mount();

    expect(el.textContent).toBe("");
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});
