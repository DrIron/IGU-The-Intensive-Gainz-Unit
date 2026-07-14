import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * computeProgramWeeks — canonical repoint guard.
 *
 * The macrocycle list used to size its arcs from `program_template_days`
 * (ceil(max(day_index)/7)) — the LEGACY tree the unification is dropping. It agreed
 * with canonical, which is precisely why the breakage would have been silent: after
 * the drop every count collapses to the `1` default and a 16-week arc reports as 2.
 *
 * The fixtures below are the REAL prod rows (verified 2026-07-14):
 *
 *   d1e35f86…  Classic Series Strength Meso (Copy)  -> plan dd516335…  8 plan_weeks
 *   98255134…  Prenatal Trimester 1 (3 Day)         -> plan b7730e07…  8 plan_weeks
 *   372c58dc…  Prenatal T1 (orphaned double-convert) -> NO canonical plan
 *
 * What is locked down:
 *   - weeks come from COUNT(plan_weeks), NOT program_template_days
 *   - canonical WINS when the two disagree (the guard PR4 shipped)
 *   - a template with no canonical mirror falls back to legacy
 *   - after the legacy DROP, that fallback floors at 1 rather than crashing
 */

const CLASSIC = "d1e35f86-9766-438b-bf23-75710e39cb2c";
const PRENATAL = "98255134-d214-4a27-9bff-1d1e384d4112";
const ORPHAN = "372c58dc-ea03-481e-9ce9-c954fe49cb6a";

const MPT_CLASSIC = "21f2ecc9-d36d-4463-bc7a-80df50ed495f";
const MPT_PRENATAL = "16e210b0-8d77-4f9a-868e-0cbd3203ca25";
const PLAN_CLASSIC = "dd516335-6a51-4451-9ef3-35219342b183";
const PLAN_PRENATAL = "b7730e07-2668-4053-a0c6-5c7c87e3c3db";

/** Rows each table returns for a given test scenario. */
interface Scenario {
  muscle_program_templates: unknown[];
  plan: unknown[];
  plan_weeks: unknown[];
  program_template_days: unknown[];
}

let scenario: Scenario;
/** Every table the function actually reads, in order. */
let tablesRead: string[];

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    tablesRead.push(table);
    const rows = (scenario as unknown as Record<string, unknown[]>)[table] ?? [];
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
  return { supabase: { from: (table: string) => builder(table) } };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { computeProgramWeeks } = await import("./useMacrocycles");

/** n plan_weeks rows for a plan. */
const weeks = (planId: string, n: number) => Array.from({ length: n }, () => ({ plan_id: planId }));

beforeEach(() => {
  tablesRead = [];
  scenario = {
    muscle_program_templates: [
      { id: MPT_CLASSIC, converted_program_id: CLASSIC },
      { id: MPT_PRENATAL, converted_program_id: PRENATAL },
    ],
    plan: [
      { id: PLAN_CLASSIC, source_muscle_template_id: MPT_CLASSIC },
      { id: PLAN_PRENATAL, source_muscle_template_id: MPT_PRENATAL },
    ],
    plan_weeks: [...weeks(PLAN_CLASSIC, 8), ...weeks(PLAN_PRENATAL, 8)],
    program_template_days: [],
  };
});

describe("computeProgramWeeks — canonical plan_weeks, not the legacy tree", () => {
  it("returns 8 for both real canonical templates, sourced from plan_weeks", async () => {
    const map = await computeProgramWeeks([CLASSIC, PRENATAL]);

    expect(map.get(CLASSIC)).toBe(8);
    expect(map.get(PRENATAL)).toBe(8);

    // It read the canonical chain...
    expect(tablesRead).toContain("muscle_program_templates");
    expect(tablesRead).toContain("plan");
    expect(tablesRead).toContain("plan_weeks");
    // ...and never touched the legacy tree, because both resolved canonically.
    expect(tablesRead).not.toContain("program_template_days");
  });

  it("CANONICAL WINS when the legacy tree disagrees", async () => {
    // Legacy would say ceil(28/7) = 4 weeks. Canonical says 8. Canonical must win.
    scenario.program_template_days = [{ program_template_id: CLASSIC, day_index: 28 }];

    const map = await computeProgramWeeks([CLASSIC]);
    expect(map.get(CLASSIC)).toBe(8); // canonical, NOT the legacy 4
  });

  it("falls back to legacy for a template with NO canonical mirror", async () => {
    // The real orphaned double-conversion: no muscle_program_templates row, so no plan.
    scenario.program_template_days = [
      { program_template_id: ORPHAN, day_index: 52 }, // ceil(52/7) = 8
    ];

    const map = await computeProgramWeeks([ORPHAN]);
    expect(map.get(ORPHAN)).toBe(8);
    // The legacy read only happens for the template that needs it.
    expect(tablesRead).toContain("program_template_days");
  });

  it("mixes canonical and fallback in ONE call without an N+1", async () => {
    scenario.program_template_days = [{ program_template_id: ORPHAN, day_index: 52 }];

    const map = await computeProgramWeeks([CLASSIC, PRENATAL, ORPHAN]);
    expect(map.get(CLASSIC)).toBe(8); // canonical
    expect(map.get(PRENATAL)).toBe(8); // canonical
    expect(map.get(ORPHAN)).toBe(8); // legacy fallback

    // One read per table — never one per program.
    const counts = tablesRead.reduce<Record<string, number>>((acc, t) => {
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts["muscle_program_templates"]).toBe(1);
    expect(counts["plan"]).toBe(1);
    expect(counts["plan_weeks"]).toBe(1);
    expect(counts["program_template_days"]).toBe(1);
  });

  it("AFTER THE LEGACY DROP: a mirrorless template floors at 1, it does not crash", async () => {
    // Simulate program_template_days being gone: the table returns nothing.
    scenario.program_template_days = [];

    const map = await computeProgramWeeks([ORPHAN]);
    expect(map.get(ORPHAN)).toBe(1); // known-safe floor, never 0 or NaN
  });

  it("AFTER THE LEGACY DROP: canonical templates are completely unaffected", async () => {
    scenario.program_template_days = [];

    const map = await computeProgramWeeks([CLASSIC, PRENATAL]);
    expect(map.get(CLASSIC)).toBe(8);
    expect(map.get(PRENATAL)).toBe(8);
  });

  it("a canonical plan with zero plan_weeks is NOT treated as canonical", async () => {
    // Guard against a compiled-but-empty plan reporting 0 weeks.
    scenario.plan_weeks = [...weeks(PLAN_PRENATAL, 8)]; // Classic's plan has none
    scenario.program_template_days = [{ program_template_id: CLASSIC, day_index: 21 }];

    const map = await computeProgramWeeks([CLASSIC]);
    expect(map.get(CLASSIC)).toBe(3); // falls back to legacy ceil(21/7), not 0
  });

  it("returns an empty map for no input, without querying anything", async () => {
    const map = await computeProgramWeeks([]);
    expect(map.size).toBe(0);
    expect(tablesRead).toHaveLength(0);
  });
});
