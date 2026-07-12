// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { CoachDetailDialog } from "./CoachDetailDialog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ON2 regression guard.
 *
 * The onboarding coach dialog used to hard-null location / qualifications / gyms /
 * socials / intro video / headline / years, justified by a comment claiming those
 * fields were "RLS-gated pre-subscription". That was false — they are served to
 * anonymous visitors on /coaches/:slug. ON2 enriched
 * `list_active_coaches_for_service` to project them and removed the null block.
 *
 * This test pins the render so nobody re-lites the dialog: the coach object below
 * is the real shape the enriched RPC returns (verified against prod 2026-07-12,
 * coach "theflexibledieter"), mapped exactly as CoachPreferenceSection maps it.
 */

// jsdom has no matchMedia; useIsMobile needs it. Width drives the Dialog/Drawer branch.
function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: width < 768,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

/** Exactly what CoachPreferenceSection now passes, from the enriched RPC row. */
const ENRICHED_COACH = {
  firstName: "Fahad",
  lastName: "Alrefai",
  nickname: "theflexibledieter",
  avatarUrl: null,
  bio: "",
  shortBio: "Powerlifting Coach",
  specializations: ["Powerlifting", "Nutrition Coaching"],
  headline: "Head Coach · Powerlifing",
  location: "Kuwait City",
  qualifications: ["Kuwait Powerlifting National Team Coach, Menno Henselman CPT, N1 Education CPT"],
  gyms: [{ id: "g1", name: "Olympia Gym" }],
  socials: { instagram: "https://www.instagram.com/theflexibledieter/" },
  introVideoUrl: null,
  yearsExperience: null,
  clientCount: null,
};

let container: HTMLDivElement;
let root: Root;

async function mount(ui: React.ReactElement) {
  await act(async () => {
    root.render(<MemoryRouter>{ui}</MemoryRouter>);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Radix portals outside the container, so assert against the whole document. */
const body = () => document.body.textContent ?? "";

describe("CoachDetailDialog — ON2 enriched onboarding profile", () => {
  beforeEach(() => {
    setViewport(1280);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  it("renders the fields the lite object used to null out", async () => {
    await mount(<CoachDetailDialog coach={ENRICHED_COACH} open onOpenChange={() => {}} />);

    // The four that were hard-nulled and are the point of ON2.
    expect(body()).toContain("Kuwait City");
    expect(body()).toContain("Menno Henselman CPT");
    expect(body()).toContain("Head Coach · Powerlifing");
    expect(body()).toContain("Olympia Gym");
    // Specialties survived the old lite object; assert they didn't regress.
    expect(body()).toContain("Powerlifting");
  });

  it("null-omits a section rather than rendering an empty header (blank location)", async () => {
    // Prod has a coach whose location is "" (empty string, not null) — the card
    // must hide the Located section, not render a bare heading.
    await mount(
      <CoachDetailDialog
        coach={{ ...ENRICHED_COACH, location: "", qualifications: [], gyms: [] }}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(body()).not.toContain("Kuwait City");
    expect(body()).not.toContain("Menno Henselman CPT");
    // Still renders the coach it does know about.
    expect(body()).toContain("Fahad");
  });

  it("deep-links 'View full profile' to /coaches/:slug when a slug is supplied", async () => {
    await mount(
      <CoachDetailDialog
        coach={ENRICHED_COACH}
        open
        onOpenChange={() => {}}
        profileHref="/coaches/theflexibledieter"
      />,
    );
    const link = document.querySelector('a[href="/coaches/theflexibledieter"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("View full profile");
  });

  it("omits the deep-link when the coach has no slug", async () => {
    await mount(<CoachDetailDialog coach={ENRICHED_COACH} open onOpenChange={() => {}} />);
    expect(body()).not.toContain("View full profile");
  });

  it("renders a Drawer on mobile and a Dialog on desktop", async () => {
    setViewport(390); // iPhone-class — onboarding's dominant viewport
    await mount(<CoachDetailDialog coach={ENRICHED_COACH} open onOpenChange={() => {}} />);
    expect(document.querySelector("[data-vaul-drawer]")).not.toBeNull();
    expect(document.querySelector('[role="dialog"][data-vaul-drawer]')).not.toBeNull();
    // Content still renders inside the drawer.
    expect(body()).toContain("Kuwait City");
  });
});
