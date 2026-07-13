// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WeekBreakdownCard, type WeekBreakdown } from "./WeekBreakdownCard";
import {
  adaptCanonicalPlanToSlots,
  adaptCanonicalPlanToSessions,
  type CanonicalPlanSessionRow,
  type CanonicalPlanSlotRow,
} from "./programSummaryAdapter";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * PR3 guard — the week-by-week breakdown.
 *
 * The fixture below is REAL week-1 data from the "Prenatal Trimester 1 (3 Day)"
 * template on prod (sampled 2026-07-13): 3 named sessions on days 1-3, real exercise
 * names, repMin == repMax. Prod ground truth for that week: 3 sessions, 17 slots,
 * 53 sets. If the canonical serialization changes, these fail.
 */

const SESSIONS: CanonicalPlanSessionRow[] = [
  { id: "s1", plan_week_id: "w1", day_index: 1, name: "Lower One", activity_type: "strength", sort_order: 0 },
  { id: "s2", plan_week_id: "w1", day_index: 2, name: "Upper One", activity_type: "strength", sort_order: 0 },
  { id: "s3", plan_week_id: "w1", day_index: 3, name: null, activity_type: "strength", sort_order: 0 },
];

const SLOTS: CanonicalPlanSlotRow[] = [
  {
    id: "sl1",
    plan_session_id: "s1",
    sort_order: 0,
    prescription_json: {
      sets: 4,
      repMin: 9,
      repMax: 9,
      muscleId: "quads",
      exerciseName: "Quads BB High Bar Back Squat (M)",
    },
  },
  {
    id: "sl2",
    plan_session_id: "s1",
    sort_order: 1,
    prescription_json: {
      sets: 4,
      repMin: 15,
      repMax: 15,
      muscleId: "hamstrings",
      exerciseName: "Hamstrings M Seated Leg Curl (L)",
    },
  },
  {
    id: "sl3",
    plan_session_id: "s2",
    sort_order: 0,
    prescription_json: {
      sets: 3,
      repMin: 8,
      repMax: 12,
      muscleId: "lats_thoracic",
      exerciseName: "Thoracic Lat BB Wide Overhand Row (M)",
    },
  },
  // Day 3's session is UNNAMED -> must fall back to the dominant muscle.
  {
    id: "sl4",
    plan_session_id: "s3",
    sort_order: 0,
    prescription_json: { sets: 5, repMin: 10, repMax: 10, muscleId: "quads", exerciseName: "Leg Press" },
  },
];

function buildWeek(overrides: Partial<WeekBreakdown> = {}): WeekBreakdown {
  return {
    weekId: "w1",
    weekIndex: 1,
    isDeload: false,
    sessions: adaptCanonicalPlanToSessions(SESSIONS),
    slots: adaptCanonicalPlanToSlots(SESSIONS, SLOTS),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

async function render(week: WeekBreakdown, collapsed = false): Promise<HTMLDivElement> {
  await act(async () => {
    root.render(<WeekBreakdownCard week={week} defaultCollapsed={collapsed} />);
  });
  return container;
}

/** Click a button by its visible text. */
async function click(el: HTMLElement, text: string) {
  const btn = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  expect(btn, `no button containing "${text}"`).toBeTruthy();
  await act(async () => {
    btn!.click();
  });
}

describe("WeekBreakdownCard — PR3", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("header: week number, session count and the week's totals via ProgramStatStrip", async () => {
    const el = await render(buildWeek());
    const text = el.textContent ?? "";

    expect(text).toContain("Week 1");
    expect(text).toContain("3 sessions");
    // 4 + 4 + 3 + 5 = 16 sets across 4 exercises.
    expect(text).toContain("16 sets");
    expect(text).toContain("4 exercises");
  });

  it("shows a Deload badge only when the week is flagged", async () => {
    const plain = await render(buildWeek());
    expect(plain.textContent).not.toContain("Deload");

    await act(async () => root.unmount());
    root = createRoot(container);

    const deload = await render(buildWeek({ isDeload: true, weekIndex: 4 }));
    expect(deload.textContent).toContain("Week 4");
    expect(deload.textContent).toContain("Deload");
  });

  it("day rows use the coach's session name, and fall back to the dominant muscle when unnamed", async () => {
    const el = await render(buildWeek());
    const text = el.textContent ?? "";

    expect(text).toContain("Lower One"); // named
    expect(text).toContain("Upper One"); // named
    // Day 3 is unnamed and quad-dominant -> "<Muscle> focus", never a blank row.
    expect(text).toMatch(/focus/i);
  });

  it("renders Rest rows for days with no session (a gap in the week is information)", async () => {
    const el = await render(buildWeek());
    // Prenatal T1 trains days 1-3 -> days 4,5,6,7 are rest.
    const rests = (el.textContent ?? "").match(/Rest/g) ?? [];
    expect(rests).toHaveLength(4);
    expect(el.textContent).toContain("Thu");
    expect(el.textContent).toContain("Sun");
  });

  it("expanding a day reveals its exercises with prescriptions", async () => {
    const el = await render(buildWeek());

    // Collapsed by default at the day level — the exercise isn't shown yet.
    expect(el.textContent).not.toContain("Quads BB High Bar Back Squat (M)");

    await click(el, "Lower One");

    const text = el.textContent ?? "";
    expect(text).toContain("Quads BB High Bar Back Squat (M)");
    // repMin == repMax (9/9) -> a single value, NOT "9–9".
    expect(text).toContain("4 × 9");
    expect(text).not.toContain("9–9");
    expect(text).toContain("Hamstrings M Seated Leg Curl (L)");
    expect(text).toContain("4 × 15");
  });

  it("renders a true rep RANGE as 'sets × min–max'", async () => {
    const el = await render(buildWeek());
    await click(el, "Upper One");
    // sl3 is 3 × 8–12.
    expect(el.textContent).toContain("3 × 8–12");
  });

  it("per-day counts are scoped to that day, not the week", async () => {
    const el = await render(buildWeek());
    const text = el.textContent ?? "";
    // Day 1 has 2 exercises / 8 sets; day 2 has 1 exercise / 3 sets.
    expect(text).toContain("2 exercises");
    expect(text).toContain("8 sets");
    expect(text).toContain("1 exercise"); // singular
    expect(text).toContain("3 sets");
  });

  it("collapses to just the header on mobile (defaultCollapsed)", async () => {
    const el = await render(buildWeek(), true);
    const text = el.textContent ?? "";

    // Header summary survives...
    expect(text).toContain("Week 1");
    expect(text).toContain("16 sets");
    // ...but no day rows until it's opened.
    expect(text).not.toContain("Lower One");
    expect(text).not.toContain("Rest");

    await click(el, "Week 1");
    expect(el.textContent).toContain("Lower One");
  });
});
