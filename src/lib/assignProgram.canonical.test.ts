import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * assignPlanToClientCanonical (Phase 1b): assigns a STANDALONE canonical `plan` template to a client
 * via assign_plan_to_client_canonical, with parity timezone (Asia/Kuwait) — distinct from the legacy
 * program_templates path.
 */

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const { assignPlanToClientCanonical } = await import("./assignProgram");

const args = {
  coachUserId: "coach-1",
  clientUserId: "client-1",
  subscriptionId: "sub-1",
  planId: "plan-1",
  startDate: new Date(2026, 6, 22), // local July 22 → "2026-07-22" regardless of TZ
};

describe("assignPlanToClientCanonical", () => {
  beforeEach(() => rpc.mockReset());

  it("calls assign_plan_to_client_canonical with the plan id + Kuwait timezone; returns the assignment id", async () => {
    rpc.mockResolvedValue({ data: { skipped: false, assignment_id: "a1", plan_id: "clone-1" }, error: null });
    const res = await assignPlanToClientCanonical(args);
    expect(res).toEqual({ success: true, assignmentId: "a1" });
    expect(rpc).toHaveBeenCalledWith(
      "assign_plan_to_client_canonical",
      expect.objectContaining({
        p_coach_id: "coach-1",
        p_client_id: "client-1",
        p_subscription_id: "sub-1",
        p_plan_id: "plan-1",
        p_start_date: "2026-07-22",
        p_team_id: null,
        p_timezone: "Asia/Kuwait",
      }),
    );
  });

  it("returns { success: false } when the RPC errors (no throw to the caller)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const res = await assignPlanToClientCanonical(args);
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
