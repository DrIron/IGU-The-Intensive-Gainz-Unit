import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { HelmetProvider } from "react-helmet-async";
import './i18n/config';
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry as early as possible.
// DSN comes from VITE_SENTRY_DSN; the hardcoded fallback matches the active
// `javascript-react` project in the `igu-the-intensive-gainz-unit` Sentry org.
// The previous fallback DSN ended in project id ...480046160, which is a
// separate (orphaned) project -- events landed there but nobody watched it,
// so the dashboard showed 0 captured events for 30+ days. Once VITE_SENTRY_DSN
// is confirmed set in every Vercel environment, delete the fallback.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
  || "https://83c5d33453db27cb12b872be6d9b4dd0@o4510780833923072.ingest.de.sentry.io/4510786489352273";

// De-dupe identical errors within a 5s window so a runaway loop (e.g. an
// effect throwing on every render) doesn't exhaust the project's ingestion
// quota -- once quota is hit, Sentry returns 403s for the rest of the
// period and we lose visibility on real errors.
const recentFingerprints = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5000;
function fingerprint(event: Sentry.ErrorEvent): string {
  const type = event.exception?.values?.[0]?.type ?? event.level ?? "unknown";
  const message = event.exception?.values?.[0]?.value ?? event.message ?? "";
  const frame = event.exception?.values?.[0]?.stacktrace?.frames?.at(-1);
  const at = frame ? `${frame.filename}:${frame.lineno}` : "";
  return `${type}|${message}|${at}`;
}

Sentry.init({
  dsn: SENTRY_DSN,
  sendDefaultPii: true,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD || !!import.meta.env.VITE_SENTRY_DEBUG,

  // 10% performance sampling: catches slow transactions + N+1 patterns
  // without multiplying event volume / Sentry quota cost by 10x. Errors
  // are still sampled at 100% (Sentry's default `sampleRate`). Session
  // Replay stays off for now (would need `replayIntegration()` + privacy
  // review -- replay captures DOM + user input).
  tracesSampleRate: 0.1,

  // Filter out noisy errors
  ignoreErrors: [
    /chrome-extension:/,
    /moz-extension:/,
    "Network request failed",
    "Failed to fetch",
    "ResizeObserver loop",
  ],

  beforeSend(event) {
    const fp = fingerprint(event);
    const now = Date.now();
    const last = recentFingerprints.get(fp);
    if (last && now - last < DEDUPE_WINDOW_MS) return null;
    recentFingerprints.set(fp, now);
    // Prune old entries so the map doesn't grow unbounded in a long session.
    if (recentFingerprints.size > 200) {
      for (const [key, ts] of recentFingerprints) {
        if (now - ts > DEDUPE_WINDOW_MS) recentFingerprints.delete(key);
      }
    }
    return event;
  },
});

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
