import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          // vendor-forms also removed — only needed on auth/onboarding pages
          // vendor-dnd and vendor-charts removed from manualChunks —
          // they were being modulepreloaded on every page (384KB + 98KB)
          // even though they're only needed on coach/workout routes.
          // Rollup's automatic splitting handles them as async chunks now.
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-accordion',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-switch',
            '@radix-ui/react-toast',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
            '@radix-ui/react-label',
            '@radix-ui/react-separator',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-progress',
            '@radix-ui/react-slider',
            '@radix-ui/react-avatar',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-navigation-menu',
            '@radix-ui/react-slot',
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: the service worker silently installs the new build and
      // activates it on the next full navigation. No "New version available"
      // toast — the only way a user notices is the refreshed page content.
      // Every form the coach/client touches either auto-saves (Planning
      // Board, muscle plans) or posts immediately, so a background swap
      // never yanks in-progress input.
      registerType: "autoUpdate",
      workbox: {
        // HTML deliberately EXCLUDED from precache: the hashed JS/CSS are immutable
        // (cache-first, below), but the index.html shell must stay fresh so it always
        // points at the newest hashed assets. Precaching it served an old shell
        // cache-first after each deploy → stale bundle for returning users. The shell
        // is now served NetworkFirst (runtimeCaching below): fresh online, cached
        // offline in `html-shell`.
        //
        // navigateFallback is explicitly DISABLED (null). Two reasons it must be
        // off, not merely omitted:
        //  1. With index.html no longer precached, workbox's
        //     createHandlerBoundToURL("index.html") throws `non-precached-url`
        //     synchronously at SW load — bricking the whole service worker.
        //  2. VitePWA registers the NavigationRoute fallback BEFORE our
        //     runtimeCaching rules, and workbox matches routes in registration
        //     order. A live fallback would intercept every navigation and serve
        //     the cache-first shell, shadowing the NetworkFirst rule below and
        //     re-introducing the exact staleness this fix removes.
        // Omitting the key is NOT enough: VitePWA merges in a default of
        // "index.html", so it must be set to null to suppress the route.
        // Offline navigations are served from the `html-shell` NetworkFirst cache
        // (below); the only gap is a never-yet-visited route while offline
        // (acceptable for an online coaching app).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigateFallback: null as any,
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // The document/navigation shell: fetch the freshest index.html online
            // (so the newest hashed assets load on the next reload), fall back to
            // the last-cached shell when offline / slow (3s timeout).
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-shell",
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "IGU - Intensive Gainz Unit",
        short_name: "IGU",
        description: "Evidence-based online coaching for serious lifters",
        theme_color: "#09090B",
        background_color: "#09090B",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/android-chrome-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/android-chrome-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
    sentryVitePlugin({
      org: "igu-the-intensive-gainz-unit",
      project: "javascript-react",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        filesToDeleteAfterUpload: ["**/*.map"],
      },
      release: {
        name: process.env.VERCEL_GIT_COMMIT_SHA || "development",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
});