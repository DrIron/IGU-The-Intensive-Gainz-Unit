import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import './i18n/config';
import App from "./App.tsx";
import "./index.css";

// Render immediately — don't block on Sentry
createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

// Initialize Sentry asynchronously after first paint
if (import.meta.env.PROD || !!import.meta.env.VITE_SENTRY_DEBUG) {
  import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn: "https://19890aca84d3e6f36dbf2e00a6ce7815@o4510780833923072.ingest.de.sentry.io/4510786480046160",
      sendDefaultPii: true,
      environment: import.meta.env.MODE,
      ignoreErrors: [
        /chrome-extension:/,
        /moz-extension:/,
        "Network request failed",
        "Failed to fetch",
        "ResizeObserver loop",
      ],
    });
    // Store reference for lazy access by errorLogging.ts
    (window as unknown as Record<string, unknown>).__SENTRY__ = Sentry;
  });
}
