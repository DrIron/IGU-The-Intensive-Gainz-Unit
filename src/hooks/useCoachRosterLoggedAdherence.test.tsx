// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Roster real-adherence — the two load-bearing correctness rules:
 *   1. resolveRosterAdherence merges the sources: flag ON prefers a non-null LOGGED %, else the
 *      self-report proxy; flag OFF is IDENTICAL to today (self-report, no hint).
 *   2. The hook does NOT touch the network when the flag is off — the roster stays on pure
 *      self-report with zero added risk.
 */

let rpcCalls: string[] = [];
let rpcData: unknown = {};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string) => {
      rpcCalls.push(name);
      return Promise.resolve({ data: rpcData, error: null });
    },
  },
}));

const { useCoachRosterLoggedAdherence, resolveRosterAdherence } = await import("./useCoachRosterLoggedAdherence");

describe("resolveRosterAdherence — source merge", () => {
  it("flag ON + logged present → shows the LOGGED value, source=logged, no self-report hint", () => {
    const r = resolveRosterAdherence(true, 42, 90);
    expect(r.pct).toBe(42);
    expect(r.source).toBe("logged");
    expect(r.selfReportedHint).toBe(false);
  });

  it("flag ON + logged NULL → falls back to self-report, source=self, hint shown", () => {
    const r = resolveRosterAdherence(true, null, 88);
    expect(r.pct).toBe(88);
    expect(r.source).toBe("self");
    expect(r.selfReportedHint).toBe(true);
  });

  it("flag OFF → IDENTICAL to today: self-report, source=self, NO hint (even if a logged value exists)", () => {
    const r = resolveRosterAdherence(false, 42, 90);
    expect(r.pct).toBe(90); // the self-report proxy, unchanged
    expect(r.source).toBe("self");
    expect(r.selfReportedHint).toBe(false); // no hint when the feature is off
  });

  it("flag ON, both null → null, no hint (nothing to mark)", () => {
    const r = resolveRosterAdherence(true, null, null);
    expect(r.pct).toBeNull();
    expect(r.selfReportedHint).toBe(false);
  });

  it("a logged value of 0 is respected (not treated as missing)", () => {
    const r = resolveRosterAdherence(true, 0, 75);
    expect(r.pct).toBe(0);
    expect(r.source).toBe("logged");
  });
});

describe("useCoachRosterLoggedAdherence — flag gating", () => {
  let container: HTMLDivElement;
  let root: Root;
  let captured: { logged: Record<string, unknown>; loading: boolean } | null = null;

  function Probe({ enabled }: { enabled: boolean }) {
    captured = useCoachRosterLoggedAdherence(enabled);
    return null;
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    rpcCalls = [];
    rpcData = {};
    captured = null;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("flag OFF → NEVER calls the RPC, returns an empty map (no added risk to the roster)", async () => {
    await act(async () => root.render(<Probe enabled={false} />));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(rpcCalls).not.toContain("get_coach_roster_logged_adherence");
    expect(captured?.logged).toEqual({});
    expect(captured?.loading).toBe(false);
  });

  it("flag ON → calls the RPC and returns its per-client map", async () => {
    rpcData = { "client-a": { logged_adherence_pct: 39, logged_days: 18 } };
    await act(async () => root.render(<Probe enabled />));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(rpcCalls).toContain("get_coach_roster_logged_adherence");
    expect(captured?.logged).toEqual({ "client-a": { logged_adherence_pct: 39, logged_days: 18 } });
  });
});
