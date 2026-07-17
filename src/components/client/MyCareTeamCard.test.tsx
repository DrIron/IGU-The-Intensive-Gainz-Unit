// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * MyCareTeamCard — now titled "Your team" (1B) with the retired CoachCard's Message action folded
 * onto the primary-coach row. Tests pin: the WhatsApp deep-link when the coach has a number, the
 * "will reach out" note when they don't, and no specialist rows when none are assigned.
 */

let assignments: unknown[];
let whatsappNumber: string | null;

function builder(table: string) {
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    in: () => api,
    order: () => api,
    then: (resolve: (v: unknown) => unknown) =>
      resolve({ data: table === "care_team_assignments" ? assignments : [], error: null }),
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: () => Promise.resolve({ data: whatsappNumber, error: null }),
  },
}));
vi.mock("./EndAddonDialog", () => ({ EndAddonDialog: () => null }));

const { MyCareTeamCard } = await import("./MyCareTeamCard");

const COACH = {
  user_id: "coach-1",
  first_name: "Sara",
  last_name: "Ali",
  profile_picture_url: null,
};

let container: HTMLDivElement;
let root: Root;

async function mount(primaryCoach = COACH): Promise<HTMLDivElement> {
  await act(async () => root.render(<MyCareTeamCard subscriptionId="sub-1" primaryCoach={primaryCoach} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return container;
}

describe("MyCareTeamCard — 'Your team'", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    assignments = [];
    whatsappNumber = null;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("is titled 'Your team' and shows a WhatsApp Message link when the coach has a number", async () => {
    whatsappNumber = "+965 9999 1234";
    const el = await mount();

    expect(el.textContent).toContain("Your team");
    const wa = el.querySelector('a[aria-label="Message Sara on WhatsApp"]') as HTMLAnchorElement;
    expect(wa).not.toBeNull();
    // Deep-links to the digits-only wa.me number.
    expect(wa.getAttribute("href")).toContain("https://wa.me/96599991234");
    // The fallback note is not shown when there's a real link.
    expect(el.textContent).not.toContain("Your coach will reach out");
  });

  it("falls back to the 'will reach out' note when the coach has no number", async () => {
    whatsappNumber = null;
    const el = await mount();

    expect(el.textContent).toContain("Your coach will reach out to you directly.");
    expect(el.querySelector('a[href^="https://wa.me/"]')).toBeNull();
  });

  it("shows the no-specialists empty state when none are assigned", async () => {
    assignments = [];
    const el = await mount();

    expect(el.textContent).toContain("No additional specialists assigned yet");
    // Primary coach still renders (degrades gracefully).
    expect(el.textContent).toContain("Sara Ali");
    expect(el.textContent).toContain("Primary Coach");
  });
});
