// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WeekConsistencyDots } from "./WeekConsistencyDots";
import { currentIguWeekDates, kuwaitDateIso } from "@/hooks/useWeeklyConsistency";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * CL5 guard — the wellbeing framing, enforced.
 *
 * This surface is client-facing and touches how someone feels about a hard week.
 * The rules it must never break:
 *   - A missed day is a NEUTRAL outline dot. No red, no destructive, no warning.
 *   - The copy counts what HAPPENED, never what didn't. No streak, no flame, no
 *     "don't break the chain", no guilt.
 *   - A zero-activity week says "0 active days this week" and nothing more.
 */

const WEEK = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12"];

let container: HTMLDivElement;
let root: Root;

async function render(active: string[], count?: number): Promise<HTMLDivElement> {
  const set = new Set(active);
  await act(async () => {
    root.render(
      <WeekConsistencyDots
        weekDates={WEEK}
        activeDates={set}
        activeCount={count ?? WEEK.filter((d) => set.has(d)).length}
      />,
    );
  });
  return container;
}

const dots = (el: HTMLElement) => [...el.querySelectorAll('[role="listitem"] span[aria-hidden]')];

describe("WeekConsistencyDots — CL5", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("dots reflect exactly the active-days set", async () => {
    // Active on Mon, Wed, Thu, Sat.
    const el = await render(["2026-07-06", "2026-07-08", "2026-07-09", "2026-07-11"]);
    const rendered = dots(el);
    expect(rendered).toHaveLength(7);

    const filled = rendered.map((d) => d.className.includes("bg-primary"));
    expect(filled).toEqual([true, false, true, true, false, true, false]);

    // And the outline days are genuinely outline, not filled.
    expect(rendered[1].className).toContain("border-border");
    expect(rendered[1].className).not.toContain("bg-primary");
  });

  it("a missed day carries NO red / destructive / warning class", async () => {
    const el = await render(["2026-07-06"]); // one active day, six missed

    // Same guard style as the CO4 gauge: assert the whole markup is clean, so a
    // future "helpful" red miss-dot fails the build rather than reaching a client.
    expect(el.innerHTML).not.toMatch(
      /destructive|text-red|bg-red|border-red|status-risk|status-warning|amber|text-orange|bg-orange/,
    );
  });

  it("never uses streak / guilt framing", async () => {
    const el = await render(["2026-07-06", "2026-07-08"]);
    const text = (el.textContent ?? "").toLowerCase();

    for (const banned of ["streak", "missed", "chain", "flame", "don't break", "keep it up", "failed"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("counts what happened, with correct singular/plural", async () => {
    const one = await render(["2026-07-06"]);
    expect(one.textContent).toContain("1 active day this week");
    expect(one.textContent).not.toContain("1 active days");

    await act(async () => root.unmount());
    root = createRoot(container);

    const four = await render(["2026-07-06", "2026-07-08", "2026-07-09", "2026-07-11"]);
    expect(four.textContent).toContain("4 active days this week");
  });

  it("a zero-activity week is all-outline, '0 active days', and nothing negative", async () => {
    const el = await render([]);

    // Every dot outline, none filled.
    expect(dots(el).some((d) => d.className.includes("bg-primary"))).toBe(false);
    expect(dots(el).every((d) => d.className.includes("border-border"))).toBe(true);

    expect(el.textContent).toContain("0 active days this week");
    // No nudge, no scolding — someone having a hard week doesn't need a lecture.
    expect(el.innerHTML).not.toMatch(/destructive|text-red|status-risk/);
    const text = (el.textContent ?? "").toLowerCase();
    expect(text).not.toContain("get started");
    expect(text).not.toContain("let's");
    expect(text).not.toContain("0 missed");
  });

  it("a full week is celebrated only by being full — no extra fanfare copy", async () => {
    const el = await render(WEEK);
    expect(dots(el).every((d) => d.className.includes("bg-primary"))).toBe(true);
    expect(el.textContent).toContain("7 active days this week");
    const text = (el.textContent ?? "").toLowerCase();
    expect(text).not.toContain("perfect");
    expect(text).not.toContain("streak");
  });
});

describe("useWeeklyConsistency — week/timezone maths", () => {
  it("returns 7 consecutive dates starting on MONDAY (the IGU week, not Sunday)", () => {
    // 2026-07-12 is a Sunday.
    const dates = currentIguWeekDates(new Date("2026-07-12T09:00:00Z"));
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-07-06"); // Monday
    expect(dates[6]).toBe("2026-07-12"); // Sunday
    expect(new Date(`${dates[0]}T00:00:00Z`).getUTCDay()).toBe(1); // Monday
  });

  it("a Sunday stays in the week that STARTED on Monday (not a new week)", () => {
    const sunday = currentIguWeekDates(new Date("2026-07-12T20:00:00Z"));
    const saturday = currentIguWeekDates(new Date("2026-07-11T20:00:00Z"));
    expect(sunday).toEqual(saturday);
  });

  it("buckets a late-night Kuwait workout onto the RIGHT day", () => {
    // 2026-07-09 21:30 UTC == 2026-07-10 00:30 Kuwait (UTC+3).
    // Bucketing by UTC date would put this on the 9th — the wrong dot.
    expect(kuwaitDateIso(new Date("2026-07-09T21:30:00Z"))).toBe("2026-07-10");
    // And an early-evening one stays put.
    expect(kuwaitDateIso(new Date("2026-07-09T15:00:00Z"))).toBe("2026-07-09");
  });
});
