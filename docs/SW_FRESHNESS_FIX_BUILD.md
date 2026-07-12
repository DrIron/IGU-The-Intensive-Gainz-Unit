# Service-worker freshness — network-first HTML shell

**Status:** Build handoff (2026-07-07, Cowork). **Owner:** terminal CC.
**Problem:** after every prod deploy, returning users (and anyone with the PWA/tab previously loaded) keep running the **old bundle** until the workbox SW updates AND the page reloads again — often several reloads / a few minutes. Cache-buster `?cb=` params do NOT fix it (the SW intercepts the navigation regardless of query). Confirmed 2026-07-07: unregistering the SW + clearing `workbox-precache-v2-…` caches immediately loads the new `/assets/index-<hash>.js`.

**Root cause (config already has the "right" flags):** `vite.config.ts` `VitePWA` uses `registerType: "autoUpdate"` + `skipWaiting: true` + `clientsClaim: true` (all correct), **but** `workbox.globPatterns` includes `html` (so `index.html` is precached) and `navigateFallback: "index.html"` serves it **cache-first**. So a navigation serves the OLD precached shell — which references the OLD hashed assets — until the new SW fully activates and the user navigates again. Hashed JS/CSS are immutable so cache-first is correct for them; the **HTML shell** is the thing that must be fresh.

## Fix — serve the document/navigation NetworkFirst (keep offline fallback)
In `vite.config.ts` `VitePWA.workbox`:
1. **Remove `html` from `globPatterns`** so `index.html` is no longer precached cache-first (keep `js,css,ico,png,svg,woff2`).
2. **Add a `runtimeCaching` rule for navigations** (NetworkFirst), so the freshest `index.html` (pointing at the newest hashed assets) loads when online, falling back to cache offline:
   ```ts
   {
     urlPattern: ({ request }) => request.mode === "navigate",
     handler: "NetworkFirst",
     options: {
       cacheName: "html-shell",
       networkTimeoutSeconds: 3,            // fall back to cache if the network is slow/offline
       cacheableResponse: { statuses: [0, 200] },
     },
   }
   ```
3. Keep `navigateFallback: "index.html"` + `navigateFallbackDenylist` as the **offline** fallback only (NetworkFirst handles the online path first). Keep `registerType: "autoUpdate"`, `skipWaiting`, `clientsClaim` unchanged — the no-"new version" toast UX is deliberate (see the config comment) and stays.

Net effect: online, a returning user gets the latest shell + assets on their **next reload** (one reload, promptly), not after several. Offline still loads the last-cached shell.

## Also (small, optional)
- Ensure `sw.js` (and `index.html`) are served with `Cache-Control: no-cache` by Vercel so the browser detects a new SW quickly. Add to `vercel.json` headers if not already. Prevents the SW-update *check* itself being delayed by HTTP caching.

## Caveats / verify
- **The fix ships behind the OLD (cache-first) SW**, so the very deploy that introduces it will still look stale once; from the next deploy onward, freshness is fixed. Verify across TWO deploys.
- Confirm the app still installs as a PWA and **offline load still works** (NetworkFirst falls back to the `html-shell` cache; first-ever offline visit with an empty cache is the only gap, acceptable for an online coaching app).
- After deploying: with a previously-loaded tab, trigger a subsequent deploy and confirm one reload picks up the new build (check the running `/assets/index-<hash>.js` changes) without manually unregistering the SW.
- Relates to [[the existing vite:preloadError auto-reload]] (`feedback_spa_stale_chunk_crash_on_deploy`) — that catches lazy-chunk 404s; this makes the shell itself fresh so those are rarer.

Small, config-only change (`vite.config.ts`, maybe `vercel.json`). Gates: build + a manual SW/offline smoke.
