import { describe, it, expect, vi } from "vitest";
import { selectWithRetry } from "./selectWithRetry";

describe("selectWithRetry", () => {
  it("returns immediately when the first attempt succeeds (no retry)", async () => {
    const run = vi.fn(async () => ({ data: 1, error: null }));
    const res = await selectWithRetry(run, 3, 1);
    expect(res).toEqual({ data: 1, error: null });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("retries on a returned error, then succeeds", async () => {
    let n = 0;
    const run = vi.fn(async () => (++n < 3 ? { data: null, error: new Error("blip") } : { data: 9, error: null }));
    const res = await selectWithRetry(run, 3, 1);
    expect(res).toEqual({ data: 9, error: null });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("returns the last error result after exhausting attempts", async () => {
    const run = vi.fn(async () => ({ data: null, error: new Error("down") }));
    const res = await selectWithRetry(run, 2, 1);
    expect(res.error).toBeInstanceOf(Error);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("with timeoutMs: a hanging attempt times out, retries, then succeeds", async () => {
    let n = 0;
    const run = vi.fn(() => {
      n++;
      // First attempt hangs forever; second resolves fast.
      return n === 1
        ? new Promise<{ data: number | null; error: unknown }>(() => {})
        : Promise.resolve({ data: 5, error: null });
    });
    const res = await selectWithRetry(run, 3, 1, { timeoutMs: 20, label: "x" });
    expect(res).toEqual({ data: 5, error: null });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("with timeoutMs: all attempts hang -> resolves with a synthesized error (never throws)", async () => {
    const run = vi.fn(() => new Promise<{ data: null; error: unknown }>(() => {}));
    const res = await selectWithRetry(run, 2, 1, { timeoutMs: 15, label: "hang" });
    expect(res.error).toBeInstanceOf(Error);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
