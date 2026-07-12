# T2 — Public Coach Page `/coaches/:slug` (page shell) — Build Spec

> **Route decision (2026-07-10):** the public page lives at **`/coaches/:slug`** (plural), NOT `/coach/:slug`.
> `/coach/:section` (App.tsx:266) is a coach-only **catch-all** that swallows every `/coach/*` and would
> bounce anon visitors; concrete coach routes (`/coach/hub`, `/coach/clients`, `/coach/teams`, …) also make
> a slug-vs-section collision possible. `/coaches/:slug` is a clean, zero-risk separate namespace (mirrors
> `/meet-our-team` as the public roster). All public links, SEO/OG URLs, and Meet-the-Team "View profile"
> use `/coaches/:slug`. (The testimonials plan's `/coach/:slug` references should be read as `/coaches/:slug`.)

_Slice B of `docs/COACH_PROFILE_TESTIMONIALS_PLAN.md`, page-shell increment. Mounts the CPR card; reputation deferred to T1._
_Created 2026-07-10. Owner: this track (T2 reassigned from the testimonials-planning session, boundary lifted by Hasan). Card contract: `docs/CPR_TO_T2_HANDOFF.md`._

---

## 0. Scope

Ship a real, anon-viewable `/coaches/:slug` page that mounts the already-shipped `CoachPublicProfile` card and supplies coach data. **Reputation is deferred** — `reputationSlot` and `rating`/`reviewCount` stay undefined (the card renders its graceful **"New coach"** state), and they get wired once **T1** (Slice A) adds `show_on_coach_page` + the aggregate. This slice has **no dependency on T1** and is fully buildable now.

**In scope:** route + slug column + anon read RPC + page component (mount card, stats, gyms, CTA) + onboarding `?coach=` preselect + Meet-the-Team links + SEO + i18n/RTL of the card.
**Out of scope (T1):** curation columns, coach "My testimonials" UI, admin feature UI, the reputation block, aggregate-rating wiring, testimonial attachments.

## Ground state (prod-verified 2026-07-10)
- T0 foundation shipped: `is_client_of_coach` live, `testimonials` has 7 policies.
- `coaches_public.slug` does NOT exist; `testimonials.show_on_coach_page` does NOT exist (T1 net-new).
- CPR shipped: `CoachPublicProfile` + `deriveCoachHeadline` + `get_coach_client_count_band` + `intro_video_url`/`years_experience` + `videoUrl.ts` (all on `main`).

## Decisions locked (Hasan, 2026-07-10)
- **Slug:** generate from `nickname` → fallback `display_name` → `first-last`; lowercased + hyphenated; on collision append a short suffix (e.g. `-a1`). Admin-editable in `CoachManagement`.
- **CTA "Choose <coach>":** route into the start/onboarding flow with the coach **preselected**, carrying `?coach=<coach_user_id>`.
- **Aggregate (for when reputation lands, T1):** avg + count on the coach page (≥5-review threshold), **count-only** on Meet-the-Team cards. (Not built this slice; recorded so T1 doesn't re-litigate.)
- **i18n/RTL of the card is REQUIRED before this page ships public** (the card is English-only today).

---

## 1. Migration A — `coaches_public.slug`
`supabase/migrations/YYYYMMDDHHMMSS_coach_public_slug.sql`:
- `ADD COLUMN slug text` on `coaches_public` (nullable; write through `coaches_public` per the coach-tables refactor rules — NOT `coaches`).
- **Unique index** on `lower(slug)` (partial `WHERE slug IS NOT NULL`).
- **Backfill** slugs for existing coaches: `slugify(coalesce(nullif(nickname,''), display_name, first_name || '-' || last_name))`, lowercase, non-alnum → `-`, collapse repeats, trim; dedupe collisions by appending `-` + a short suffix (row-number or id fragment). Do it in the migration (deterministic) so every current coach has a slug.
- Anon-readability comes via the RPC (§2), NOT a base-table grant.

## 2. Migration B — anon read RPC `get_coach_public_profile_by_slug`
`supabase/migrations/YYYYMMDDHHMMSS_get_coach_public_profile_by_slug.sql`. **This is the anon read path** — `coaches_public` is not anon-readable (verified), so never grant anon on the base table.
- `get_coach_public_profile_by_slug(p_slug text) RETURNS jsonb` (or a typed record). `STABLE SECURITY DEFINER`, `SET search_path = public`.
- **Active-coach gate:** return the profile only when the coach is active (`coaches.status` = active — confirm the exact active value(s) against the enum). Slug-not-found OR inactive → return NULL (page 404s).
- Returns everything the card needs, resolved server-side where cheap:
  - identity: `first_name, last_name, nickname, profile_picture_url, location, bio, short_bio`
  - `qualifications[]`, `specializations[]` (VALUES — page resolves to labels), `specialties`
  - CPR net-new: `intro_video_url`, `years_experience`
  - headline inputs: `is_head_coach, head_coach_specialisation, coach_level`
  - `socials` (instagram/tiktok/youtube/snapchat from `coaches_private`)
  - `gyms`: array of `{ id, name }` from `coach_gyms` JOIN `gyms` for this coach
  - `coach_user_id` (so the page can call `get_coach_client_count_band` + build the CTA)
- **Grants (intentionally anon, like `get_coach_client_count_band`):** `REVOKE ALL ... FROM PUBLIC; REVOKE ALL ... FROM anon;` then `GRANT EXECUTE ... TO anon, authenticated;` — net result: anon+authenticated EXECUTE, no PUBLIC. Verify `has_function_privilege('public', ...) = false`.
- Regen `src/integrations/supabase/types.ts`.

## 3. Page component — `/coaches/:slug`
- New `src/pages/CoachPublicPage.tsx`. Route `path="/coaches/:slug"` in `App.tsx` wrapped in `PublicLayout` + `WaitlistGuard` (same as `/meet-our-team`); no `RoleProtectedRoute`. Register in `routeConfig.ts`. **Do NOT put it under `/coach/*`** — that namespace is the coach-only dashboard (catch-all `/coach/:section`).
- `useParams()` slug → call `get_coach_public_profile_by_slug(slug)`. Null → render a 404/not-found state (coach not found or inactive).
- Map the RPC result → `CoachPublicProfile` props (`variant="public"`), per `docs/CPR_TO_T2_HANDOFF.md` §2.1/§3.3:
  - `specializations`: resolve VALUES → labels via `useSpecializationTags().getLabel`.
  - `headline`: `deriveCoachHeadline({ isHeadCoach, headCoachSpecialisation, coachLevel, primarySpecialty })`.
  - `clientCount`: `get_coach_client_count_band(coach_user_id)` (fire alongside the profile fetch; NULL just hides the stat).
  - `gyms`, `socials`, `intro`/`years`/`bio`/`location`/`qualifications`: straight from the RPC.
  - `rating`/`reviewCount`/`reputationSlot`: **leave undefined** (T1) → "New coach" state.
  - `onPrimaryCta`: navigate into the start flow with `?coach=<coach_user_id>` (see §4).
- Loading skeleton; error/404 state; light + dark.

## 4. CTA preselect — onboarding `?coach=`
- The CTA routes to the existing start entry carrying `?coach=<coach_user_id>` (mirror how `?service=` is already handled).
- Extend `src/pages/OnboardingForm.tsx`: it already reads `searchParams.get('service')` (line ~232) — add reading `searchParams.get('coach')` → set `coach_preference_type='specific'` + `requested_coach_id=<coach>` in the form (validate the coach exists / is available; fall back to auto-match if not).
- **Flag (intersects ON2):** an anon `/coaches/:slug` visitor hits `WaitlistGuard`/auth before onboarding, so the `coach` param must **survive the waitlist → auth → signup → onboarding transition**. Under the current waitlist-ON state the public page + CTA are gated anyway; verify the carry end-to-end when waitlist is off, and coordinate the exact entry target with the onboarding/ON2 track. Don't re-spec the onboarding flow here — just pass the coach through.

## 5. Meet-the-Team links
- `src/pages/MeetOurTeam.tsx` + `src/components/CoachDetailDialog.tsx`: add a **"View profile" → `/coaches/:slug`** link (use the coach's slug; requires the slug in the team-listing read path — extend it or resolve slug alongside). The card layout / "Start with <coach>" onboarding target coordinate with the coach-system track — don't double-spec.

## 6. SEO
- `react-helmet-async` on the page: `<title>`, description, and Open Graph (name + headline + short_bio + avatar as `og:image`). Schema.org `AggregateRating`/`Review` is **deferred to T1** (needs the rating aggregate).

## 7. i18n / RTL (gates public launch)
- Localize `CoachPublicProfile` via `react-i18next` (`common` ns) + Arabic + dir-flip. Keys: the section titles (Specialties/About/Certified/Trains at/Located/What clients say/Follow), "New coach — building their reputation", "Watch a 30-sec intro from {name}", "Choose {name}", "Based on {n} reviews". Also localize the page's 404/loading strings. This is the one CPR-flagged blocker for going public.

## 8. Verify
- `npx tsc --noEmit` + eslint on changed files.
- RPC: `BEGIN; SET LOCAL ROLE anon; SELECT get_coach_public_profile_by_slug('<a real slug>'); ROLLBACK;` returns the profile (not 42501); a bad slug → NULL; an inactive coach → NULL. `has_function_privilege('public', ...) = false`.
- Page (anon, via a real slug — waitlist considerations aside, test the route directly): hero + Bebas name + derived headline; specialties (labels) + Certified + Trains at (gyms) + Located + Follow render from real data; stats show Years (if set) + Clients band (if ≥10) and omit nulls; **"New coach"** state (no reputation yet); CTA carries `?coach=`; light + dark; mobile.
- SEO tags present in the DOM; i18n keys resolve + Arabic flips dir.
- Cowork prod-smoke: RPC across a few coaches + the rendered page for an active coach + a 404 for a bad slug.

## 9. Related docs
- `docs/CPR_TO_T2_HANDOFF.md` (card contract + T2 checklist), `docs/COACH_PROFILE_TESTIMONIALS_PLAN.md` (§6.2 + T2 phase), `docs/COACH_PROFILE_REDESIGN_BUILD.md` (CPR).
