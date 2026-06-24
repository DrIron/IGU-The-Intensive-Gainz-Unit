# PF — Coach client Profile tab polish (identity header + consistency)

**Status:** Drop-in spec (2026-06-24, Cowork). **Priority / effort:** P3 / S. The tab is already well-built (emerald status rails, demographics grid, subscription + onboarding cards, all read-only) — this is a light polish pass, NOT a rewrite. File: `src/components/client-overview/tabs/ProfileInfoTab.tsx`.

## What's already good (keep)
`useClientDemographics` (3 SECURITY DEFINER RPCs + latest weight/body-fat), `form_submissions_safe` read for the onboarding card, the `w-1` emerald status rails, the PHI-gated "Open full submission" link, and the read-only framing all stay. No data-model change.

## Target (approved mock — deltas only)
1. **Identity header card** (new, top) — avatar (initials) + name + a subtitle line (`<service plan> · client since <month yyyy>`) + a subscription **status pill**. Gives the tab a face instead of leading straight into a demographics grid. Derive name/plan/status from the existing `ClientContext` + subscription (no new fetch). Note `profile.lastName` is always null in context — use `displayName` / `firstName` only.
2. **Status-pill consistency** — replace the shadcn `Badge` on the subscription + onboarding cards with the same rounded `999px` pills the rest of the redesign uses (success/secondary/amber/danger by status), so Profile matches Overview/Progress/Nutrition.
3. **Stat label consistency** — the existing `Stat` uppercase-label + value pattern is already right; just confirm the demographics grid uses `minmax(0,1fr)` auto-fit so it reflows cleanly (it currently uses fixed `grid-cols-2 md:grid-cols-4`).
4. **Onboarding card** — keep the Medical / Documents / Red flags / Submitted stats + the colour tones; align the "Open full submission" to the standard outline button.

## Build notes
- **No new queries/tables/RPCs.** Everything the header needs is already on `ClientContext` + the demographics hook.
- Keep the `hasFetched` ref guard + `.maybeSingle()` submission fetch.
- Keep the read-only posture — coach-editable fields are an explicit later ticket (the file already says so).
- Emerald rail / status colours: reuse `statusUtils` (`getSubscriptionStatusVariant`) — don't hardcode a second status→colour map.

## Verify
- `npx tsc --noEmit` + `npm run build` clean.
- Profile leads with the identity header, then Demographics / Subscription / Onboarding, all with consistent pills + rails; grid reflows on mobile. Smoke via a test client with a completed submission (medical cleared) and one mid-onboarding (review-needed rail) to confirm both rail states.
