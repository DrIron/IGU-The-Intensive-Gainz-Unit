import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Debug: Check if auth token is available
console.log("SENTRY_AUTH_TOKEN exists:", !!process.env.SENTRY_AUTH_TOKEN);
console.log("VERCEL_GIT_COMMIT_SHA:", process.env.VERCEL_GIT_COMMIT_SHA);

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    sourcemap: true,
  },
  plugins: [
    react(),
    // Only add Sentry plugin if auth token exists
    process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          org: "igu-the-intensive-gainz-unit",
          project: "javascript-react",
          authToken: process.env.SENTRY_AUTH_TOKEN,
          sourcemaps: {
            filesToDeleteAfterUpload: ["**/*.map"],
          },
          release: {
            name: process.env.VERCEL_GIT_COMMIT_SHA || "development",
          },
          debug: true, // Enable debug logging
        })
      : null,
  ].filter(Boolean), // Remove null plugins
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
});