# Coach Profile Pages + Testimonials & Reputation — Plan & Build Spec

_Full build spec (data model, curation, submission + attachments, public surfaces, phases, decisions)._
_Owner track: FOR_LATER planning session. Created 2026-07-05. Mockups: `docs/COACH_PROFILE_TESTIMONIALS_MOCKUPS.html` (client submit entry + form + add-proof, public /testimonials view, /coach/:slug profile, admin curation)._

Consolidates the deferred **Testimonials & coach reputation** arc from `docs/FOR_LATER.md` into one
plan, and — per Hasan — **includes the per-coach public profile page** (`/coach/:slug`). One coherent
surface: a coach's public page *is* where their curated reputation lives.

> **Foundation (separate, referenced):** submission is gated to real clients by
> `docs/TESTIMONIALS_CLIENTS_ONLY_BUILD.md` (a testimonial may be written only by a client of the coach
> being reviewed; server-side RLS + `is_client_of_coach`). This plan **assumes that gate** and builds the
> reputation/profile layer on top. Design fidelity per `[[feedback_mockups_ground_in_real_components]]`:
> real Card primitive (flat, `rounded-lg` 12px, `CardTitle` 500), tokens, light/dark theme (default dark).

---

## 0. Build-readiness snapshot (2026-07-05 review — hand to build sessions)

**Already shipped (don't rebuild):** the clients-only submission gate (`20260704140000`), the
`/testimonials` view + `TestimonialsList` + admin `TestimonialsManager`, and — from the CPR track — the
whole coach **card** (`CoachPublicProfile.tsx` + `deriveCoachHeadline` + `get_coach_client_count_band` +
`intro_video_url`/`years_experience` + `videoUrl.ts`). So the two "hard" surfaces (submission trust +
the profile card) exist.

**The net-new build = the testimonials data model + curation UIs + the anon page.** None of the
curation/attachment columns exist yet on `testimonials`. Clean slices for build sessions:

- **Slice A (T1) — curation + submit polish.** Migration: `show_on_coach_page` (coach-writable, own-coach
  rows), `featured_public`/`featured_rank` (admin-writable), `hidden_by_admin` (admin), `display_consent`,
  `attribution`, `withdrawn_at` + RLS (visibility rule §3.1). Coach **"My testimonials"** self-curation UI
  + slim admin **feature-public** UI + consent/attribution on the submit form + `/testimonials` filter.
- **Slice B (T2) — the public page.** `coaches_public.slug` + anon RPC `get_coach_public_profile_by_slug`
  + `/coach/:slug` mounting the card + `reputationSlot` = the coach's `show_on_coach_page` testimonials +
  CTA + SEO + **i18n/RTL of the card (required before public — the card is English-only)**. Meet-the-Team
  cards link here.
- **Slice C (T3)** — weight-change attachment. **Slice D (T4)** — lift-progression attachment (gated on
  the canonical workout log).

A + B is the coherent "reputation goes live" release; C then D follow.

**Pin these before a session starts** (see §11): slug collision strategy; legacy-testimonial **consent
backfill** (existing approved rows have no `display_consent`); default **attribution** (first-name +
initial); where the coach **"My testimonials"** UI lives (coach dashboard tab); and that **i18n/RTL of
the card gates the public launch**.

## 1. Current state → the gap

- **`testimonials` table:** `user_id`, `coach_id` (nullable), `feedback`, `rating`, `is_approved`,
  `is_archived`, `author_display_name`, plus result fields `goal_type`, `duration_weeks`,
  `weight_change_kg`. **No curation flags, no attachment model, no slug.**
- **Surfaces:** `/testimonial` (submit, `Testimonial.tsx`), `/testimonials` (view, `Testimonials.tsx` +
  `TestimonialsList`), admin moderation (`TestimonialsManager`, `/admin/testimonials`), and the Index
  "What Our Clients Say" section (approved-only). `/meet-our-team` is the public team page; there is
  **no per-coach public page** and testimonials don't appear on any coach surface.

**The gap this plan closes:** (a) admin-curated placement of testimonials on public + coach surfaces,
(b) richer testimonials with client-attached **proof** (weight change, lift progression, note),
(c) filter/sort of the public testimonials view, and (d) a real **per-coach public profile page**
(`/coach/:slug`) that pulls it all together.

---

## 2. Decisions locked (2026-07-05)

| # | Decision | Choice |
|---|----------|--------|
| CP1 | Scope | **One plan = Coach public profile page + Testimonials/Reputation**, full build spec. |
| CP2 | Coach controls their own page | The **coach self-curates** — a coach chooses which of *their* testimonials appear on **their** `/coach/:slug` page (coach-writable flag on rows about them). **Admin does NOT control coach pages.** |
| CP3 | Admin controls public pages only + **no approval** | The admin's only role is to **feature** testimonials on the **public pages** (landing / `/testimonials`). **Admin approval is removed** (CP2 revised, 2026-07-05) — the admin no longer approves testimonials. Trust anchor = the clients-only submission gate; **nothing is public until the coach shows it (their page) or the admin features it (public pages)**. |
| CP4 | Per-coach public pages | **In scope** — `/coach/:slug`, public (anon-readable like `/meet-our-team`). |
| CP5 | Reputation = client-attached proof | A client may **optionally attach** to their testimonial: **average/total weight change** over a phase (easy — first), and later a **lift progression** (pick one of their lifts → shows the increase across a phase), each with an optional **note**. |

---

## 3. Data model

### 3.1 `testimonials` extensions (curation + attachments)
```
testimonials  (existing + new)
  -- curation (split ownership, CP2/CP3):
  show_on_coach_page   bool   default false  -- COACH-writable: coach shows this on their /coach/:slug page
  featured_public      bool   default false  -- ADMIN-writable: show in the site public rotation (landing / /testimonials)
  featured_rank        int    nullable       -- admin ordering for the public rotation
  hidden_by_admin      bool   default false  -- ADMIN moderation floor (Gap 5): hard-hide abusive content everywhere; overrides coach + public
  -- consent + attribution (Gap 1 — public display of a client's name/photo/results is opt-in):
  display_consent      bool   default false  -- client explicitly agreed to public display; REQUIRED for any public visibility
  attribution          text   'full_name'|'first_initial'|'anonymous'  default 'first_initial'
  withdrawn_at         timestamptz nullable  -- client retracted; hidden everywhere while set
  -- attachment (proof, CP5):
  attachment_type      text   'none'|'weight_change'|'lift_progression'  default 'none'
  attachment           jsonb  nullable        -- shape depends on type (below)
  attachment_note      text   nullable        -- client's note on the attachment
  -- `is_approved` is DEPRECATED as a gate (CP3, admin approval removed). Keep column for back-compat / a
  -- possible light spam flag, but visibility is driven by show_on_coach_page (coach) + featured_public (admin).
```
**Public-visibility rule (final):** a testimonial shows publicly only when
`display_consent AND withdrawn_at IS NULL AND (show_on_coach_page OR featured_public) AND NOT hidden_by_admin`.
The displayed name is derived from `attribution` (full name / first name + initial / "IGU client"); the
avatar shows only for `full_name`/`first_initial` if the client has one and consented.
```_(schema block continues)_
```
- **Coach page inclusion** = `coach_id = <coach> AND show_on_coach_page` (the coach's own picks), coach-ordered.
- **Public rotation** = `featured_public` (admin's site-wide picks), ordered by `featured_rank`. The Index
  "What our clients say" + the `/testimonials` featured strip read this.
- A testimonial that is neither coach-shown nor admin-featured is **not shown anywhere public** — it just
  sits in the coach's "my testimonials" list (and the admin's) to be curated.

### 3.2 Attachment shapes (`attachment` JSONB by `attachment_type`)
- **`weight_change`** (easy, first): `{ start_kg, end_kg, delta_kg, phase_id?, weeks }`. Sourced from the
  client's `weight_logs` over a chosen phase/date-range (or the existing `weight_change_kg`/`duration_weeks`
  fields). Renders "−8.2 kg over 12 weeks".
- **`lift_progression`** (later, "a bit tough"): `{ exercise_id, exercise_name, start:{value,unit,reps?},
  end:{value,unit,reps?}, phase_id?, from_date, to_date }`. The client **picks one of their own lifts**
  and a phase/range; we read their logged workout data (`exercise_logs` / canonical program logs) for the
  start→end. Renders "Bench press 60 → 90 kg across Spring Strength" + note.
- Both are **client-owned, opt-in**, and only surface once the testimonial is approved.

### 3.3 `coaches` slug (for `/coach/:slug`)
- Add `slug` (unique, indexed) on the coach profile store (`coaches_public`, per the coach-tables refactor
  write rules). Generated from `nickname`/name, admin-editable, uniqueness-enforced. Anon-readable.
- Public reads for the profile page go through the existing anon-safe coach read path (the
  `list_public_teams_for_browser` / `coaches_public` anon SELECT pattern) — **not** the client-safe RPC.

### 3.4 RLS
- Testimonials: keep the clients-only INSERT gate (foundation spec). **Anon SELECT = visible when
  `featured_public` OR `show_on_coach_page`** (approval no longer gates — CP3). Split write ownership:
  `featured_public` + `featured_rank` are **admin-write only**; **`show_on_coach_page` is coach-writable
  on rows where `coach_id = auth.uid()`** (new coach UPDATE policy), and the **coach can SELECT
  testimonials about them** (`coach_id = auth.uid()`) to curate. Attachment columns are written by the
  client on their own row at submit/edit time (own-row check).
- Attachment data reads (weight/lift) at submit time use the client's own logs (their RLS already allows
  their own `weight_logs` / workout logs); the **snapshot is denormalized into `attachment`** so the
  public render never needs the client's private data.

---

## 4. Curation — two surfaces, split ownership

### 4a. Admin — public pages only
Slim down `TestimonialsManager` (`/admin/testimonials`): the admin's **only** job is to **feature on the
public pages** — toggle `featured_public` + drag-order (`featured_rank`) the site rotation (landing "What
our clients say" + `/testimonials` featured strip). Admin can browse/filter all testimonials and see the
attachment inline. **No "approve" step, no coach-page control** (CP3). (Optional: a light "hide/report"
for abuse, but not an approval gate.)

### 4b. Coach — their own page
A **coach-facing "My testimonials"** surface (in the coach dashboard/profile): the coach sees the
testimonials their clients wrote about them and **toggles which appear on their `/coach/:slug` page**
(`show_on_coach_page`) and orders them. The coach curates only their own; they can't edit the content or
touch other coaches'. This is the FOR_LATER "coach-curated testimonials" idea, now the coach-page model.

---

## 5. Submission + attachments (client side)

Builds on the clients-only `/testimonial` form (foundation). After the text + rating, an optional
**"Add proof"** step:
- **Weight change** (P-early): "Attach your weight change" → pick a phase or date range → we compute
  start/end/delta from `weight_logs` → preview "−8.2 kg / 12 weeks" → optional note.
- **Lift progression** (P-later): "Attach a lift" → pick **one of your lifts** (from your logged
  exercises) → pick a phase/range → preview "Bench 60 → 90 kg" → optional note.
- Attachments are optional; a text-only testimonial is fine. Attachment renders only after admin approval.

The submit form still resolves the coach from the client's **own subscription** (never the URL param) per
the foundation gate.

**Consent + attribution (Gap 1) — required at submit.** Before submit the client must:
- **Consent** to public display (`display_consent`) — an explicit checkbox; without it the testimonial is
  saved but never shows publicly (coach still can't display it).
- Choose **attribution** — full name / first name + initial / anonymous ("IGU client"). Drives the
  displayed name + whether the avatar shows.
- The client can **withdraw** later (`withdrawn_at`) from their account — removes it from every public
  surface immediately (defense: a departed/unhappy client can pull their words back).

Any attached proof (weight/lift) is scoped to the period **with the coach being reviewed** (Gap 2) — the
result window intersects that coach relationship, so we never credit one coach for another's results.

---

## 6. Public surfaces

### 6.1 `/testimonials` — view page (near-term split, completed here)
- Public **view-only** display of approved testimonials (the nav "Testimonials" points here, not the
  submit form — kills the broken dead-end). The **submit** action becomes a client-only CTA surfaced from
  the client dashboard / account, not the public nav.
- **Filter / sort:** by **coach**, and by **goal** (`goal_type`) / result; sort by recency / rating /
  biggest result. Cards show rating, result chips (goal · weeks · Δkg), and any attachment.

### 6.2 `/coach/:slug` — per-coach public profile page (the centerpiece)

> **CPR shipped the card (2026-07-10) — T2 mounts it, doesn't rebuild it.** The Coach Profile Redesign
> track shipped `src/components/coach/CoachPublicProfile.tsx` (pure presentational, prop contract in
> `docs/CPR_TO_T2_HANDOFF.md`) + `deriveCoachHeadline`, the `get_coach_client_count_band` RPC, the
> `intro_video_url`/`years_experience` columns, and `src/lib/videoUrl.ts`. **T2's job = the public page
> that mounts the card + supplies data + reputation** (route, slug, anon RPC, prop-mapping, `reputationSlot`,
> CTA, SEO, i18n). The card already null-omits every empty section, renders the graceful **"New coach"**
> state for null `rating`, whitelists the intro video, and guards socials — so T2 is data plumbing, not card
> work. **Critical gotcha:** `coaches_public` is NOT anon-readable — build a dedicated anon RPC
> `get_coach_public_profile_by_slug` (`SECURITY DEFINER`, `REVOKE PUBLIC` + `GRANT anon,authenticated`,
> active-coach gate), never grant anon on the base table.

- Anon-readable public page per coach: hero (name/nickname, photo, location, level/head-coach badge),
  bio / short_bio, qualifications, specializations/specialties, socials, and a **CTA — "Start with
  <coach>"**.
- **"Start with <coach>" destination:** takes the visitor into the **Services / start flow with this coach
  preselected** — i.e. it hands off to onboarding coach-selection (ON2) carrying the coach id (e.g.
  `/services?coach=<id>` → the intake/signup pre-fills "start with <coach>"). This is the intersection with
  the coach-selection work; the exact target is owned there — this page just passes the coach through.
- **Reputation block:** the **coach-curated** testimonials (`show_on_coach_page`, CP2), each with rating +
  attached proof; plus a light **aggregate** — average rating + count. **Aggregate shows only past a
  minimum review count (Gap 4)** (e.g. ≥5) — under that, a graceful **"New coach"** state (no misleading
  0.0/lopsided average). Softens the coach-vs-coach ranking concern too.
- **Coach lifecycle (Gap 2):** the page + aggregate render only for an **active** coach (`coaches.status`);
  a deactivated/departed coach's `/coach/:slug` 404s or redirects — no stale public page.
- Wrapped in `PublicLayout` + `WaitlistGuard` (same as `/meet-our-team`). Route + slug resolution;
  `RoleProtectedRoute` not needed (public).

### 6.3 Meet Our Team + Coach detail
- **`/meet-our-team`** = the grid of coach cards (the public shopfront). Each card: photo, name/nickname,
  level / Head-Coach badge, a couple of specialty tags, the light **aggregate** (rating/count — subject to
  the aggregate decision), and actions **"View profile" → `/coach/:slug`** and **"Start with <coach>"**
  (same preselect handoff as the profile CTA). `CoachDetailDialog.tsx` (the expand) can show 1–2 of the
  coach's curated testimonials + "See full profile →".
- **Overlap note:** the coach *card* content + the "Start with <coach>" onboarding handoff overlap the
  coach-system / onboarding-coach-selection work (`docs/COACH_SYSTEM_REVIEW.md` / ON2). This plan owns the
  **testimonials/reputation + `/coach/:slug` page**; the card layout + the Services/onboarding preselect
  target are coordinated with that track (don't double-spec the onboarding flow here).

---

## 7. Reputation signals

- **Attached proof** (CP5) is the primary, distinctive signal — real client results (weight, lifts) beat
  star counts.
- **Aggregate (recommended, flag):** average `rating` + testimonial count on the coach page / card. Powerful
  social proof but **competitive/sensitive between IGU's own coaches** — Hasan to confirm whether to show
  it, hide it, or show count-only. Default proposal: show avg rating + count on the coach page, count-only
  (no avg) on Meet-Our-Team cards to avoid ranking coaches against each other at a glance.

---

## 7b. Gaps & connections addressed (2026-07-05 review)

Cross-cutting items surfaced by mapping this against the rest of IGU. 1, 2, 4, 5 are woven into the
sections above; the rest:

1. **Consent + attribution** — §5 + §3.1 (`display_consent`, `attribution`, `withdrawn_at`). Must-fix.
2. **Coach-attribution honesty** — proof scoped to the reviewed coach's relationship window; deactivated
   coach → no live page (§5, §6.2). Must-fix.
3. **Lift-proof reads the CANONICAL workout log (hard dependency).** The lift-progression attachment
   (T4) reads logged sets, but the workout model is mid-canonicalization (board_v2 / `plan_*`). It must
   read the canonical surface, and a **workout lift isn't bounded by a nutrition `phase`** — use a
   **date / mesocycle range** picker, not `nutrition_phases`. Sequence T4 after the program-canonical work.
4. **New-coach / low-review state** — min-review threshold before an aggregate (§6.2). Must-fix (fairness).
5. **Light moderation floor** — `hidden_by_admin` hard-hide (not an approval gate) since IGU's name is on
   public content (§3.1, §4a). Must-fix.
6. **Close the prompt loop.** The existing `process-testimonial-requests` cron (fires ~4 weeks active),
   the dashboard milestone card (screen 1), and the submit CTA should be **one prompt** — the drip email
   deep-links the client-only submit; and the **coach gets notified** of a new testimonial to curate
   (reuse the notification/email system). Today these are disconnected.
7. **SEO / structured data on `/coach/:slug`.** Public marketing assets — emit schema.org
   `AggregateRating` / `Review` + Open Graph via `react-helmet-async` so ratings surface as Google rich
   snippets. Free amplification; nearly zero cost given helmet is already used.
8. **i18n / RTL + Arabic.** All new public surfaces (coach page, testimonials view, submit) go through
   `react-i18next` and flip dir for Arabic; testimonial content may be **written in Arabic** — store as-is
   and render with the correct direction. Don't ship English-only.
9. **Backfill decision.** The Index "What our clients say" switches from `is_approved`-only to
   `featured_public`. One-time call: do existing approved testimonials get `featured_public = true`
   (keep the current wall live) or start empty and re-curate? Also seed `display_consent` for legacy rows
   (likely `true` for already-public ones, but confirm — consent is the point). Write a data migration.

## 8. Screens (for mockups)

1. `/testimonials` view — filter-by-coach/goal, cards with rating + result chips + attachment.
2. Submit flow — testimonial + rating + **"Add proof"** (weight change; lift progression).
3. **`/coach/:slug`** public profile — hero + bio/specialties + reputation block (curated testimonials +
   aggregate) + CTA.
4. Admin `TestimonialsManager` — approve + **feature-public** + **coach-page curation** + attachment view.
5. Meet-Our-Team card → coach page; CoachDetailDialog with a couple curated testimonials.

---

## 9. Related-page changes

| Area | Change |
|------|--------|
| `routeConfig.ts` / `App.tsx` | Add `/coach/:slug` (Public + WaitlistGuard). `/testimonials` nav points to the view (not submit). |
| Nav / Footer | "Testimonials" → `/testimonials` (view). Submit CTA moves to client dashboard/account. |
| `TestimonialsManager` (admin) | Curation controls (feature-public, coach-page exclude, ordering, attachment view). |
| `Testimonial.tsx` (submit) | Optional "Add proof" attachment step (weight → lift). |
| `Testimonials.tsx` + `TestimonialsList` | Filter/sort by coach/goal; render attachments. |
| `MeetOurTeam.tsx` / `CoachDetailDialog.tsx` | Link to `/coach/:slug`; show curated testimonials. |
| `coaches_public` | `slug` column (+ admin edit in CoachManagement); anon read. |
| Client dashboard / account | "Leave a testimonial" CTA (client-only entry to the submit form). |

---

## 10. Phases

- **T0 — Foundation (LARGELY DONE — verify, don't rebuild).** Shipped already: the **clients-only gate**
  (`supabase/migrations/20260704140000_testimonials_clients_only.sql` — `is_client_of_coach` + the
  members-only INSERT policy), the **`useCanLeaveTestimonial`** hook (gates the submit CTA to real
  clients), the `/testimonials` **view page** (`Testimonials.tsx` + `TestimonialsList`), and admin
  `TestimonialsManager`. Remaining T0 = confirm the public **nav points to `/testimonials`** (view, not
  the submit form) and the **submit CTA lives client-side** (dashboard/account). _Verify current prod
  state first._
- **T1 — Curation (coach + admin) + filter.** Columns `show_on_coach_page` (coach-writable) +
  `featured_public`/`featured_rank` (admin); **coach "My testimonials" curation** surface + **slim admin
  public-feature** UI; `/testimonials` filter/sort by coach/goal. **Remove the approval gate.** _Verify:
  coach shows/hides on their own page; admin features for public; anon sees only coach-shown OR
  admin-featured; a non-owner coach can't touch another's rows._
- **T2 — Light up `/coach/:slug` (card already shipped by CPR).** Add the route (`PublicLayout` +
  `WaitlistGuard`) + `coaches_public.slug` (unique/indexed/admin-editable); build the anon RPC
  `get_coach_public_profile_by_slug` (active-coach gated); map its result → `CoachPublicProfile` props
  (`variant="public"`) — resolve specialization VALUES→labels, `deriveCoachHeadline(...)`,
  `get_coach_client_count_band(user_id)` → `clientCount`, aggregate → `rating`/`reviewCount` (≥5 threshold,
  else undefined → "New coach"); inject the **coach-curated testimonials** into `reputationSlot`; wire
  `onPrimaryCta` → the Services/onboarding preselect (ON2); add SEO/OG (`react-helmet-async`) + i18n/RTL
  (the card is English-only today). Meet-the-Team cards link to it. See `docs/CPR_TO_T2_HANDOFF.md` §3.
  _Verify: anon opens a coach page (via the RPC, not `coaches_public`); only `show_on_coach_page`
  testimonials show; slug resolves; inactive coach 404s; "Start with <coach>" carries the coach id._
- **T3 — Weight-change attachment.** "Add proof" (weight) on submit; render on cards + coach page.
- **T4 — Lift-progression attachment (the tough one).** Pick-a-lift + phase → start/end from logged data;
  render. _Verify: a real logged lift renders start→end correctly; opt-in; approved-gated._

---

## 11. Open decisions

1. **Aggregate rating** on coach pages/cards — show avg+count, count-only, or none? (Recommended: avg+count
   on the coach page, count-only on team cards.) Competitive-sensitivity call for Hasan.
2. **Slug source + collisions** — nickname vs display_name; how to disambiguate duplicates (append id?).
3. **Lift-progression data source** — which logged surface is authoritative for the start→end (canonical
   program logs vs `exercise_logs`), and how a "phase" bounds it for a workout lift (nutrition phases are
   nutrition-scoped; may need a date-range picker instead).
4. **Where the submit CTA lives** exactly (dashboard card vs account) and whether we prompt clients to
   testimonial after a milestone (ties into the existing testimonial-request drip cron).
5. **Per-coach page for specialists** (dietitians etc.) — coaches are the public shopfront; do specialists
   get pages too, or stay care-team-only? (Default: coaches only for now.)
6. **Min-review threshold** — **≥5 confirmed** (the shipped `CoachPublicProfile` card renders the
   "New coach" state below it; CPR handover §3.3). Remaining: the **default attribution** (proposed
   first-name + initial), and whether Meet-the-Team **cards** show avg+count or count-only.
7. **Backfill** of existing approved testimonials → `featured_public`? and legacy `display_consent`
   seeding (Gap 9). Existing rows predate consent — decide auto-consent-existing-public vs hide-until-reconsented.
8. **Coach "My testimonials" UI placement** — which coach dashboard surface hosts the self-curation list
   (a dashboard tab / profile section). Needs a home before Slice A.
9. **i18n/RTL of `CoachPublicProfile`** — the card is English-only by design; a `react-i18next` + dir-flip
   pass **gates the public `/coach/:slug` launch** (not optional). Copy is kept flat so it's cheap.

---

## 12. Dependencies

- **Clients-only gate** — `docs/TESTIMONIALS_CLIENTS_ONLY_BUILD.md` (foundation; T0).
- **CPR (shipped 2026-07-10)** — `docs/CPR_TO_T2_HANDOFF.md` + `docs/COACH_PROFILE_REDESIGN_BUILD.md`. The
  `CoachPublicProfile` card + `deriveCoachHeadline` + `get_coach_client_count_band` RPC + `intro_video_url`/
  `years_experience` columns + `videoUrl.ts` are live on `main`. T2 mounts, not rebuilds. Anon-read via a
  new `get_coach_public_profile_by_slug` RPC (never anon-grant `coaches_public`).
- **Coach tables refactor** — write `slug` through `coaches_public` per the CLAUDE.md write rules (mid-soak
  caution).
- **Onboarding coach-selection (ON2)** — the coach-page CTA ("start with this coach") intersects it;
  coordinate the hand-off target.
- **Workout logging canonical model** — the lift-progression attachment (T4) reads logged lift data;
  depends on which program/log surface is canonical.
- **Coach lifecycle** — `coaches.status` gates whether a `/coach/:slug` page + aggregate render (Gap 2);
  `coach_change_requests` informs proof-window scoping.
- **Prompt loop** — `process-testimonial-requests` cron + the notification/email system (Gap 6): drip
  deep-links the submit CTA; coach is notified of new testimonials.
- **i18n** — `react-i18next` (en/ar) + RTL on all new public surfaces (Gap 8).
- **SEO** — `react-helmet-async` for structured data / OG on `/coach/:slug` (Gap 7).
- Anon-safe coach reads (`coaches_public` anon SELECT / public team browse), `PublicLayout` + `WaitlistGuard`
  (and the "Start with <coach>" preselect must survive the waitlist/auth/signup transition).
