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
      registerType: "prompt",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/functions/],
        runtimeCaching: [
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