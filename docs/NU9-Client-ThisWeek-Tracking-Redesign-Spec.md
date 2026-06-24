# NU9 — Client nutrition "This week" tracking redesign (ClientNutritionProgress)

**Status:** Drop-in spec (2026-06-24, Cowork). **Priority / effort:** P2 / M. Narrow scope — most of the client nutrition page is already modern. File: `src/components/nutrition/ClientNutritionProgress.tsx` (~680 lines).

## What's already aligned (do NOT touch)
The `/nutrition-client` page is mostly up to standard already: the hero `NutritionPhaseCard` (shared with the coach, uses the `w-1` status rail + status badge + `MacroDistributionRibbon`), `ClientWeeklyRibbon` (emerald completion tiles), and `LogTodayCard` (emerald daily log) all match the coach-grade language. Leave them as-is.

## The one laggard
`ClientNutritionProgress` — the "This week" tracking form (weight history, body fat, circumference, steps, weekly check-in) — is still generic shadcn `Card` + `CardTitle` with plain `grid grid-cols-1 md:grid-cols-3` inputs and no completion signalling. It's the heaviest client interaction surface and the one that reads as a different product from the rest of the page.

## Target (approved mock)
Restructure the form into a **completion-state card stack** under a "This week · Week N · X of Y logged" header (with the same segmented progress pips as `ClientWeeklyRibbon`):
1. **Per-section cards** each with a left status rail + a status chip:
   - **Weigh-ins** — emerald rail + `3/3 done` chip when complete; shows the logged values in monospace. Muted rail + `Log` action when incomplete.
   - **Steps** — emerald `7/7 days` + avg vs target.
   - **Body fat & circumference** — amber rail + `Due this week` when the 4-week trigger is active (collapse to a compact 2-up input grid); emerald when logged.
   - **Weekly check-in** — gray/neutral rail + `Not started` → emerald `Submitted` once done; adherence selects + notes textarea + submit.
2. **Status vocabulary** = the same `--status-*` rails + rounded `999px` chips used by `NutritionPhaseCard` / `ClientWeeklyRibbon` (emerald = done, amber = due, neutral = not started). No new colors.
3. Keep every existing write path intact — this is a presentation refactor of the form, not a data change.

## Build notes
- **No schema / RPC / query changes.** All the existing writes stay: `weight_logs`, `body_fat_logs` (dual-write with `weekly_progress.body_fat_percentage` — keep both, per the CLAUDE.md body-fat sync rule), `circumference_logs`, `step_logs`, `adherence_logs` + `weekly_progress`. Don't drop the dual-write.
- Reuse the rail + chip styling from `ClientWeeklyRibbon` / `NutritionPhaseCard` (`--status-ontrack`, `--status-attention`, `--status-neutral`, already in `index.css`) — don't introduce a parallel style.
- **Mobile:** this page currently has NO `useIsMobile()` branching — the forms are inline. The body-fat/circumference and weekly check-in inputs are the heaviest; consider a vaul `Drawer` for those two on mobile (bottom sheet, `h-10 text-base` inputs, safe-area padding) per the project's mobile-form pattern. If a `Drawer` is added, use the plain `overflow-y-auto` scroll body (NOT Radix ScrollArea in a max-h — known no-scroll bug).
- Keep the sign-sensitive adjustment math and goal_type enum handling elsewhere untouched — this card is input only.
- `ClickableCard` for any card that navigates; never `<Card onClick>`.

## Verify
- `npx tsc --noEmit` + `npm run build` clean.
- "This week" renders as the completion-state card stack; emerald/amber/neutral rails + chips reflect real logged state; all five writes still persist (weigh-in, steps, body fat dual-write, circumference, weekly check-in). Smoke via a test client with an active phase on desktop + a narrow mobile viewport.
- Confirm the body-fat write still hits BOTH `body_fat_logs` and `weekly_progress` (grep the save path before shipping).
