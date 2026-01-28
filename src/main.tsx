import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry as early as possible
Sentry.init({
  dsn: "https://19890aca84d3e6f36dbf2e00a6ce7815@o4510780833923072.ingest.de.sentry.io/4510786480046160",
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

createRoot(document.getElementById("root")!).render(<App />);
