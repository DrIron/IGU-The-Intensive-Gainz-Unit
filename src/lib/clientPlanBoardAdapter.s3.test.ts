// S3 (own-your-copy) — under board_v2, loadPlanForAssignment reads the assignee CLONE
// directly and NEVER queries client_plan_overrides. (The board_v2-OFF override path lives in
// clientPlanBoardAdapter.test.ts via the prescriptionDiff/muscleSlotToCanonicalPj helpers,
// which S3 leaves intact.)
//
// Run: npm test -- clientPlanBoardAdapter.s3

import { describe, it, expect, beforeEach, vi } from "vitest";

// Shared mock state (hoisted so the vi.mock factory can see it).
const h = vi.hoisted(() => ({ calls: [] as string[], data: {} as Record<string, { single?: unknown; array?: unknown[] }> }));

// board_v2 ON for this file.
vi.mock("@/lib/featureFlags", () => ({ isBoardV2Enabled: () => true }));

// Minimal supabase fluent-builder stub: records every from(table), resolves selects to the
// canned per-table data. The builder is awaitable (then) for array queries and exposes
// maybeSingle() for single-row reads.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      h.calls.push(table);
      const arrayResult = { data: h.data[table]?.array ?? [], error: null };
      const singleResult = { data: h.data[table]?.single ?? null, error: null };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        in: () => b,
        is: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => Promise.resolve(singleResult),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(arrayResult).then(res, rej),
      };
      return b;
    },
  },
}));

const { loadPlanForAssignment } = await import("./clientPlanBoardAdapter");

describe("loadPlanForAssignment — S3 reads the clone directly (board_v2)", () => {
  beforeEach(() => {
    h.calls.length = 0;
    h.data = {
      client_plan_assignment: { single: { id: "a1", plan_id: "clone1" } },
      plan: { single: { id: "clone1", name: "Clone", description: null } },
      plan_weeks: {
        array: [{ id: "w1", week_index: 1, label: null, is_deload: false, deload_preset_id: null, deload_placement: null }],
      },
      plan_sessions: {
        array: [{ id: "sess1", plan_week_id: "w1", day_index: 1, name: "Push", activity_type: "strength", sort_order: 0 }],
      },
      plan_slots: {
        array: [
          {
            id: "slot1",
            plan_session_id: "sess1",
            exercise_id: "ex1",
            sort_order: 0,
            prescription_json: { muscleId: "pecs", sets: 7, repMin: 8, repMax: 12 },
            instructions: null,
          },
        ],
      },
    };
  });

  it("returns the clone's own slot value (no override merge)", async () => {
    const loaded = await loadPlanForAssignment("a1");
    expect(loaded).not.toBeNull();
    expect(loaded!.planId).toBe("clone1");
    expect(loaded!.weeks).toHaveLength(1);
    expect(loaded!.weeks[0].slots).toHaveLength(1);
    // The slot renders the clone's prescription verbatim — what S2 wrote, not an override.
    expect(loaded!.weeks[0].slots[0].sets).toBe(7);
  });

  it("never queries client_plan_overrides under board_v2", async () => {
    await loadPlanForAssignment("a1");
    expect(h.calls).toContain("plan_slots");
    expect(h.calls).not.toContain("client_plan_overrides");
  });
});
