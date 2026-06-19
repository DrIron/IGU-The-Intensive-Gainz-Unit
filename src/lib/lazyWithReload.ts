// Stale-chunk recovery (P2). After a deploy, a still-open SPA tab holds an old
// index.html that references hashed chunks no longer on the CDN. Loading a lazy
// route then fails — the CDN serves index.html (200, text/html) for the missing
// chunk path, so the browser throws:
//   "'text/html' is not a valid JavaScript MIME type"
//   "Importing a module script failed" / "Failed to fetch dynamically imported module"
// (Sentry JAVASCRIPT-REACT-5/4). A single hard reload fetches the fresh
// index.html + chunk hashes and the navigation succeeds.
//
// This module centralises (a) detection, (b) a loop-guarded one-reload helper,
// and (c) `lazyWithReload`, a drop-in for React.lazy on route imports. The same
// helper backs the `vite:preloadError` listener (main.tsx) and the global error
// boundary, so every path a chunk error can surface through auto-recovers.
import { lazy, type ComponentType } from "react";

const RELOAD_TS_KEY = "igu_chunk_reload_ts";
// Min gap between auto-reloads. A real stale-chunk reload recovers and a LATER
// deploy in the same session can reload again; a tight loop (reload immediately
// re-hits the same error) is suppressed once it recurs inside this window.
const MIN_RELOAD_INTERVAL_MS = 10_000;

/** True if the error looks like a dynamic-import / preload chunk failure. */
export function isChunkLoadError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String((error as { message?: string } | null)?.message ?? error ?? "");
  return (
    /importing a module script failed/i.test(msg) ||
    /failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /not a valid (javascript|module) mime type/i.test(msg) ||
    /'text\/html' is not a valid/i.test(msg) ||
    /unable to preload css/i.test(msg) ||
    /dynamically imported module/i.test(msg)
  );
}

/**
 * Reload once to pick up the fresh deploy. Returns true if it triggered a
 * reload, false if the loop guard suppressed it (caller should then surface the
 * error rather than hang). sessionStorage-scoped so it never loops indefinitely
 * and resets on a new tab/session.
 */
export function reloadOnceForChunkError(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || "0");
    if (Number.isFinite(last) && Date.now() - last < MIN_RELOAD_INTERVAL_MS) {
      return false; // already reloaded moments ago → don't loop
    }
    sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
  } catch {
    // sessionStorage blocked (private mode / cookies off): one reload is still
    // better than a hard crash; loop risk is bounded by how rare a deploy is.
  }
  window.location.reload();
  return true;
}

/**
 * React.lazy drop-in: on a chunk-load failure, hard-reload once to fetch the
 * fresh deploy instead of crashing to the error boundary. While the reload is
 * in flight, returns a never-settling promise so the Suspense fallback stays up
 * (no flash of the error UI). If the loop guard suppresses the reload, the
 * original error is rethrown so the boundary can show.
 */
export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory().catch((error) => {
      if (isChunkLoadError(error) && reloadOnceForChunkError()) {
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }),
  );
}
