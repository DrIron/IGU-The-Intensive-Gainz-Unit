// vite.config.ts
import { defineConfig } from "file:///Users/HasDash/Desktop/intensive-gainz-unit-main/node_modules/vite/dist/node/index.js";
import react from "file:///Users/HasDash/Desktop/intensive-gainz-unit-main/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { sentryVitePlugin } from "file:///Users/HasDash/Desktop/intensive-gainz-unit-main/node_modules/@sentry/vite-plugin/dist/esm/index.mjs";
var __vite_injected_original_dirname = "/Users/HasDash/Desktop/intensive-gainz-unit-main";
var vite_config_default = defineConfig({
  server: {
    host: "::",
    port: 8080
  },
  build: {
    sourcemap: true
  },
  plugins: [
    react(),
    sentryVitePlugin({
      org: "igu-the-intensive-gainz-unit",
      project: "javascript-react",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        filesToDeleteAfterUpload: ["**/*.map"]
      },
      release: {
        name: process.env.VERCEL_GIT_COMMIT_SHA || "development"
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    },
    dedupe: ["react", "react-dom"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvSGFzRGFzaC9EZXNrdG9wL2ludGVuc2l2ZS1nYWluei11bml0LW1haW5cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9IYXNEYXNoL0Rlc2t0b3AvaW50ZW5zaXZlLWdhaW56LXVuaXQtbWFpbi92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvSGFzRGFzaC9EZXNrdG9wL2ludGVuc2l2ZS1nYWluei11bml0LW1haW4vdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBzZW50cnlWaXRlUGx1Z2luIH0gZnJvbSBcIkBzZW50cnkvdml0ZS1wbHVnaW5cIjtcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHNlcnZlcjoge1xuICAgIGhvc3Q6IFwiOjpcIixcbiAgICBwb3J0OiA4MDgwLFxuICB9LFxuICBidWlsZDoge1xuICAgIHNvdXJjZW1hcDogdHJ1ZSxcbiAgfSxcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgc2VudHJ5Vml0ZVBsdWdpbih7XG4gICAgICBvcmc6IFwiaWd1LXRoZS1pbnRlbnNpdmUtZ2FpbnotdW5pdFwiLFxuICAgICAgcHJvamVjdDogXCJqYXZhc2NyaXB0LXJlYWN0XCIsXG4gICAgICBhdXRoVG9rZW46IHByb2Nlc3MuZW52LlNFTlRSWV9BVVRIX1RPS0VOLFxuICAgICAgc291cmNlbWFwczoge1xuICAgICAgICBmaWxlc1RvRGVsZXRlQWZ0ZXJVcGxvYWQ6IFtcIioqLyoubWFwXCJdLFxuICAgICAgfSxcbiAgICAgIHJlbGVhc2U6IHtcbiAgICAgICAgbmFtZTogcHJvY2Vzcy5lbnYuVkVSQ0VMX0dJVF9DT01NSVRfU0hBIHx8IFwiZGV2ZWxvcG1lbnRcIixcbiAgICAgIH0sXG4gICAgfSksXG4gIF0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmNcIiksXG4gICAgfSxcbiAgICBkZWR1cGU6IFtcInJlYWN0XCIsIFwicmVhY3QtZG9tXCJdLFxuICB9LFxufSk7Il0sCiAgIm1hcHBpbmdzIjogIjtBQUFrVSxTQUFTLG9CQUFvQjtBQUMvVixPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBQ2pCLFNBQVMsd0JBQXdCO0FBSGpDLElBQU0sbUNBQW1DO0FBTXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxFQUNSO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxXQUFXO0FBQUEsRUFDYjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04saUJBQWlCO0FBQUEsTUFDZixLQUFLO0FBQUEsTUFDTCxTQUFTO0FBQUEsTUFDVCxXQUFXLFFBQVEsSUFBSTtBQUFBLE1BQ3ZCLFlBQVk7QUFBQSxRQUNWLDBCQUEwQixDQUFDLFVBQVU7QUFBQSxNQUN2QztBQUFBLE1BQ0EsU0FBUztBQUFBLFFBQ1AsTUFBTSxRQUFRLElBQUkseUJBQXlCO0FBQUEsTUFDN0M7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDdEM7QUFBQSxJQUNBLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFBQSxFQUMvQjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
