# Dark / light mode toggle

**Status:** Build handoff (2026-07-05, Cowork). **Owner:** terminal. Cowork verifies on prod.
Small build. Add a user-facing dark/light theme toggle. Today the app is **hard-locked to dark** — `<html>` carries the `dark` class permanently and there's no `ThemeProvider` / `next-themes` / switcher. Default stays dark; light becomes opt-in.

## Current state (verified 2026-07-05)
- `document.documentElement.className === "dark"` at all times (the `dark` class is applied statically, never toggled).
- `src/index.css` **already has both palettes**: a full `:root` light-mode token set (`:10`) and a `.dark` set (`:68`). So the design tokens for light mode exist — nothing consumes them because the class never flips.
- No theme state anywhere (`grep` found only `sonner.tsx`'s local `theme` prop). No `next-themes`, no provider.

## Build

### 1. Theme state + provider
- Add a lightweight theme controller: a `ThemeProvider` (or `next-themes` if you want SSR-safe + system-pref handling for free) that toggles the **`dark` class on `document.documentElement`** and persists the choice to `localStorage` (key e.g. `igu_theme`, values `dark` | `light` | `system`).
- **Default = dark** (preserve today's experience). On first visit with no stored value, default dark (or `system` if you want to respect `prefers-color-scheme` — Hasan's call; recommend default **dark** to keep the current feel).
- Apply the class **before first paint** (inline script in `index.html` or an early effect) so there's no flash of the wrong theme on load.
- **Not an artifact** — real app, so `localStorage` is fine (the no-localStorage rule is artifacts-only).

### 2. Toggle control
- A sun/moon toggle in the top nav (`Navigation.tsx` / the header, next to the Menu) and/or a setting in Account. Recommend the nav (always reachable). `ClickableCard`/`Button` primitives, tokenized colors, `active:scale` per the button conventions.

### 3. Light-mode QA pass (the real effort — flag)
The `:root` light palette **has never been exercised**, so the toggle mechanism is trivial but light mode needs an audit:
- Grep for **hardcoded dark colors** that bypass tokens (`bg-black`, `text-white` without a token, `bg-[#…]`, `bg-zinc-9…`, raw `rgba(0,0,0,…)` like the ones PUB8 removed) — those won't flip with the theme.
- Check contrast/legibility in light mode across the key surfaces: public pages (already flat/tokenized post-PUB8), client + coach dashboards, forms, the flat cards, charts (recharts colors), status tokens (`--status-*`), and the crimson `font-display` numbers.
- Fix any component that renders illegibly or hardcodes a dark value so both themes read cleanly.
- Scope note: because the app is token-heavy (flat cards, `--status-*`, PUB8 flattening), most of it should flip correctly — but treat the light QA as the bulk of the work, not the toggle.

## Verify (Cowork, prod)
- Toggle flips `document.documentElement.classList` between `dark`/`light`; choice **persists across reload** and tab restart; no flash of wrong theme on load.
- Default is dark for a fresh session (no stored value).
- Both themes render legibly on: a public page, the client dashboard, a coach dashboard, a form, and a charts view — no black-on-black / white-on-white, tokenized colors flip correctly.
- tsc/build clean; no console errors.

## Notes
- Keep the toggle a pure presentation concern — no role/data coupling.
- If `system` mode is included, listen to `prefers-color-scheme` changes and update live.
- This pairs well with the PUB8 flat/token work (already done) — that made the public pages token-driven, so they should light-flip cleanly.
