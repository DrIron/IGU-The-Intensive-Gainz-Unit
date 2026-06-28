/**
 * Retry an idempotent Supabase select a few times with linear backoff before surfacing an error.
 * Transient 5xx / network blips / connection-pooler hangs on cold or concurrent loads make reads
 * fail or hang; these are idempotent selects, so a warm retry usually succeeds — without this a
 * single blip strands the page on the loading skeleton with no recovery.
 *
 * Backward-compatible contract (matches the original WorkoutSessionV2 helper): RESOLVES with the
 * last result `{ data, error }` rather than throwing — callers destructure `{ error }` and throw
 * themselves. Two failure modes are retried:
 *   - the query RESOLVES with a truthy `.error` (the original behaviour), and
 *   - the attempt HANGS or REJECTS — only when `opts.timeoutMs` is set, each attempt is wrapped in
 *     withTimeout so a hang becomes a rejection, caught and synthesized into `{ error }` to retry.
 * After all attempts, returns the last result (its `.error` set), so existing `if (error) throw`
 * paths fire with a clear message.
 */
import { withTimeout } from "@/lib/withTimeout";

export async function selectWithRetry<R extends { error: unknown }>(
  run: () => PromiseLike<R>,
  attempts = 3,
  baseDelayMs = 400,
  opts?: { timeoutMs?: number; label?: string },
): Promise<R> {
  let result = { error: new Error(opts?.label ? `${opts.label} failed` : "request failed") } as R;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, baseDelayMs * i));
    try {
      result = opts?.timeoutMs
        ? await withTimeout(Promise.resolve(run()), opts.timeoutMs, opts.label)
        : await run();
      if (!result.error) return result;
    } catch (e) {
      // Hang (withTimeout reject) or thrown rejection — synthesize an error result so the
      // contract holds and the next attempt runs.
      result = { error: e } as R;
    }
  }
  return result;
}
