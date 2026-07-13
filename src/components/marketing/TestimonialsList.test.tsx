// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "@/i18n/locales/en/common.json";
import type { TestimonialRow } from "./TestimonialsList";

// Initialise i18next with the REAL en/common bundle: this also proves the new PUB6
// keys exist and interpolate, rather than silently falling back to defaultValue.
await i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  ns: ["common"],
  defaultNS: "common",
  resources: { en: { common: enCommon } },
  interpolation: { escapeValue: false },
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * PUB6 guard — "lead with outcomes, not stars" and NEVER fabricate.
 *
 * Two things this locks down permanently:
 *   1. The empty state must not manufacture social proof. It used to render three
 *      fake 5-star "Client Name" / "Program Type" / "Coming soon" cards on the
 *      public homepage.
 *   2. The honesty contract on the result hero: the number is NEUTRAL. Colouring a
 *      weight loss crimson/emerald would imply "down is good" — false under a
 *      lean-bulk phase. If someone tints it, this fails.
 */

let rows: TestimonialRow[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
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

const { TestimonialsList } = await import("./TestimonialsList");

const WITH_PROOF: TestimonialRow = {
  id: "t1",
  rating: 5,
  feedback: "The programming finally made sense to me.",
  user_id: "u1",
  coach_id: null,
  created_at: "2026-01-01",
  author_display_name: "Sara A.",
  attribution: "first_initial",
  attachment_type: "weight_change",
  attachment: { phase_name: "Summer Cut", delta_kg: -2.1, weeks: 4 },
  attachment_note: null,
  coaches: null,
};

const NO_PROOF: TestimonialRow = {
  ...WITH_PROOF,
  id: "t2",
  feedback: "Great coaching, no complaints.",
  author_display_name: "Omar K.",
  attachment_type: "none",
  attachment: null,
};

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<HTMLDivElement> {
  await act(async () => {
    root.render(<TestimonialsList />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return container;
}

describe("TestimonialsList — PUB6", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  it("(a) renders NO fabricated cards when there are no testimonials", async () => {
    rows = [];
    const el = await mount();
    const text = el.textContent ?? "";

    // The fabrications that used to ship on the public homepage.
    expect(text).not.toContain("Client Name");
    expect(text).not.toContain("Program Type");
    expect(text).not.toContain("Coming soon");
    // And zero stars — the fakes were 5-star cards.
    expect(el.querySelectorAll("svg.lucide-star").length).toBe(0);
    // A genuine empty state instead.
    expect(text).toContain("No testimonials yet");
  });

  it("(b) leads with the OUTCOME: result hero before quote before stars", async () => {
    rows = [WITH_PROOF];
    const el = await mount();
    const html = el.innerHTML;

    const heroPos = html.indexOf("2.1");
    const quotePos = html.indexOf("The programming finally made sense");
    const starsPos = html.indexOf("lucide-star");

    expect(heroPos).toBeGreaterThan(-1);
    expect(quotePos).toBeGreaterThan(-1);
    expect(starsPos).toBeGreaterThan(-1);
    // Outcome first, stars last.
    expect(heroPos).toBeLessThan(quotePos);
    expect(quotePos).toBeLessThan(starsPos);

    // Phase-framed, so the number reads against the client's own goal.
    expect(el.textContent).toContain("Summer Cut");
    expect(el.textContent).toContain("4 weeks");
  });

  it("(c) the hero number is NEUTRAL — no crimson/emerald success colouring", async () => {
    rows = [WITH_PROOF];
    const el = await mount();

    const hero = [...el.querySelectorAll("span")].find((s) => s.textContent?.trim() === "2.1");
    expect(hero).toBeTruthy();

    const cls = hero!.className;
    // Bebas display number, foreground-coloured.
    expect(cls).toContain("font-display");
    // Must NOT imply good/bad. (WeightChangeProof.tsx:9-11 contract.)
    expect(cls).not.toMatch(/text-primary|text-emerald|text-green|text-destructive|text-red/);
  });

  it("(d) does NOT invent a hero for a testimonial with no weight_change attachment", async () => {
    rows = [NO_PROOF];
    const el = await mount();

    // No Bebas hero number anywhere on an attachment-less card.
    expect(el.querySelector(".font-display")).toBeNull();
    // It stays quote-led.
    expect(el.textContent).toContain("Great coaching, no complaints.");
    // Stars still render, demoted (small).
    const star = el.querySelector("svg.lucide-star");
    expect(star?.getAttribute("class")).toContain("h-3.5");
  });

  it("stars are demoted to h-3.5 (were h-5) even on a proof card", async () => {
    rows = [WITH_PROOF];
    const el = await mount();
    const star = el.querySelector("svg.lucide-star");
    expect(star?.getAttribute("class")).toContain("h-3.5");
    expect(star?.getAttribute("class")).not.toContain("h-5");
  });
});
