import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { HelmetProvider } from "react-helmet-async";
import './i18n/config';
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry as early as possible.
// DSN comes from VITE_SENTRY_DSN; the previous hardcoded fallback stays in
// place so existing deployments don't stop reporting during the env-var
// rollout. Once every environment has the var set, delete the fallback.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
  || "https://19890aca84d3e6f36dbf2e00a6ce7815@o4510780833923072.ingest.de.sentry.io/4510786480046160";
Sentry.init({
  dsn: SENTRY_DSN,
  sendDefaultPii: true,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD || !!import.meta.env.VITE_SENTRY_DEBUG,

  // Filter out noisy errors
  ignoreErrors: [
    /chrome-extension:/,
    /moz-extension:/,
    "Network request failed",
    "Failed to fetch",
    "ResizeObserver loop",
  ],
});

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
