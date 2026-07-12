# Testimonials — split public VIEW from client SUBMIT

**Status:** Build handoff (2026-07-04, Cowork). **Owner:** terminal. Cowork verifies on prod.
**Why:** the clients-only gate (`docs/TESTIMONIALS_CLIENTS_ONLY_BUILD.md`) left the public **"Testimonials"** nav pointing at `/testimonial` — now a client-gated form — so a public visitor lands on the "clients only" state. Split view from submit. **No data model change** (approved testimonials are already anon-readable; the submit path already exists + is gated).

## Current state
- `PublicLayout.tsx:21` nav "Testimonials" → `/testimonial` (the **submit form**, AuthGuard + client-gated).
- Approved testimonials display only as an Index section ("What Our Clients Say", `Index.tsx:611+`, reads `is_approved=true`, resolves author + coach name; anon-readable).
- No standalone public testimonials page.

## Changes

### 1. Extract the display into a shared component
- Pull the Index "What Our Clients Say" list rendering (`Index.tsx` ~611+ and its `loadTestimonials` ~216) into a reusable `src/components/marketing/TestimonialsList.tsx` (props: `limit?`, maybe `coachId?` reserved for the deferred filter). Index keeps a **preview** (first N) + a "See all" link → `/testimonials`. Keep the flat PUB8 language (no shadows/gradients; stars `fill-primary`).

### 2. New public view page `/testimonials` (plural, view-only)
- `src/pages/Testimonials.tsx` — renders `<TestimonialsList />` (full approved list), read-only, **no form**. Wrap in `App.tsx` as `<WaitlistGuard><PublicLayout><Testimonials/></PublicLayout></WaitlistGuard>` (same guard set as other public marketing pages; no AuthGuard — approved rows are anon-readable). Add to `routeConfig.ts` (`layout: Public`, `showInNav` per nav). Flat language.
- Keep the singular `/testimonial` route as the **submit form** (unchanged, still AuthGuard + client-gated) — existing bookmarks still work.

### 3. Repoint the nav
- `PublicLayout.tsx:21`: "Testimonials" → **`/testimonials`** (view), not `/testimonial`.

### 4. Relocate the submit CTA to clients
- Surface a **"Leave a testimonial"** CTA for signed-in clients that links to `/testimonial`:
  - Primary: from the client surface (e.g. `ClientDashboardLayout` or `AccountManagement`) — a small card/button.
  - Optional: a button on the `/testimonials` view page that renders **only** for eligible clients (reuse the same client-of-coach resolution the form uses; if not a client, no button). Non-clients never see a submit entry point in public nav.
- The form itself keeps its own gate as the backstop (RLS + the "clients only" state).

## Verify (Cowork, prod after merge — hard-reload + confirm bundle hash first)
- Public **"Testimonials"** nav → `/testimonials`: a read-only list of approved testimonials, **no form**, flat styling (no shadows/gradients, `fill-primary` stars).
- `/testimonial` still shows the client-gated form (coach → "clients only"; anon → `/auth`).
- Signed-in **client** sees a "Leave a testimonial" CTA (dashboard/account and/or the view page) → opens the form pre-bound to their coach; a non-client sees no submit entry point.
- Index still shows the preview + "See all" → `/testimonials`; approved testimonials render in both places (shared component, no divergence).
- tsc/build clean; Sentry quiet.

## Notes
- Singular `/testimonial` (form) vs plural `/testimonials` (view) is intentional + backward-compatible; document the pair in the PR so it's not "fixed" later by mistake.
- Filter-by-coach is **deferred** (`docs/FOR_LATER.md`) — but building `/testimonials` as a real page + the `coachId?` prop hook is what sets it up cheaply later.
- Nothing about moderation, the RLS gate, or the schema changes here.
