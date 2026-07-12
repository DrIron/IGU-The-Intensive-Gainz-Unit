# Coach Profile Redesign — Build Spec

_CC-handoff build spec. Two surfaces: the coach's **editor** and the client-facing **public card**._
_Approved mockup: `docs/COACH_PROFILE_REDESIGN_MOCKUPS.html` (editor + public card, light/dark, real IGU tokens)._
_Created 2026-07-10. Grounded in the live components + prod schema (verified `coaches_public` / `testimonials` columns 2026-07-10)._

---

## ⚠️ 0. Ownership & coordination — READ FIRST

The mockup's **public card** is the same page (`/coach/:slug`) that `docs/COACH_PROFILE_TESTIMONIALS_PLAN.md`
(a separate FOR_LATER track) **already owns end-to-end** — its route, the `coaches_public.slug` column, anon
RLS, the reputation/testimonials block, the aggregate-rating, "New coach" state, SEO/OG, and phases T0–T4.
Neither plan has shipped yet (prod `testimonials` still matches that plan's "current state"; no `slug` column).

**This spec does NOT re-own that page.** To avoid a double-spec:

- **Part A (Editor)** is fully owned here — the testimonials plan never touches the editor. Build it independently.
- **Part B (Public `/coach/:slug`)** is specced here as the **presentation/component layer only** — hero, Bebas
  name, stats row, specialty chips, editorial sections, intro video. The **page shell** (route, `slug` column,
  anon read RLS, reputation block, aggregate, lifecycle 404, SEO) stays owned by `COACH_PROFILE_TESTIMONIALS_PLAN.md`
  **T2**. Part B defines the `CoachPublicProfile` component that T2 mounts and into which T2's reputation block plugs.
- Net-new fields introduced by THIS mockup that the testimonials plan does not cover — `intro_video_url`,
  `years_experience`, the stats row — are owned here (§3).

**Decision for Hasan (sequencing):** Part A ships now, no dependency. Part B's component can be built now and
previewed from the editor (§5.4) **without** the `/coach/:slug` route existing, but wiring it to a live public
URL requires the testimonials-plan T2 (slug + anon route). Either (a) build `CoachPublicProfile` here and let T2
consume it, or (b) fold Part B into T2. **LOCKED (a)** (2026-07-10) — build `CoachPublicProfile`
here (the editor Preview needs it regardless); the testimonials-plan T2 consumes it at `/coach/:slug`.

---

## 1. Current state

**Editor** — `src/components/CoachProfile.tsx`, mounted as the "Coach Profile" tab in `src/pages/AccountManagement.tsx:1104-1111`
(there is **no `/coach/profile` route** — the mockup label is aspirational; keep it in the Account tab, §5.5).
One long-scroll shadcn `<form>`. Writes `coaches_public` directly (allowed self-service single-table path per
CLAUDE.md "Write rules"). Already uses `SpecializationTagPicker` (`src/components/ui/SpecializationTagPicker.tsx`,
`maxTags={15}`) and `GymPicker` (`src/components/ui/GymPicker.tsx`, keyed by `coachUserId` → managed gyms).
Qualifications are a newline/comma-split text input; socials are raw URL inputs. Self-gates to `null` when no
`coaches_public` row (pure specialists).

**Public card today** — `src/components/CoachDetailDialog.tsx`, a lite dialog opened from the onboarding
coach-selection step (`src/components/onboarding/CoachPreferenceSection.tsx:437`). Fed by
`list_active_coaches_for_service` RPC (anon-safe; the `coaches_client_safe` view is RLS-broken pre-subscription).
Shows avatar, name, nickname, location, head-coach line, bio, qualifications (bulleted), specialization badges.
No hero, no stats, no chips styling, no intro video, no testimonials. `/meet-our-team` is the public grid; **no
per-coach public page exists.**

**Prod schema (verified 2026-07-10):**
- `coaches_public` public columns: `bio, short_bio, first_name, last_name, nickname, display_name, location,
  profile_picture_url, qualifications text[], specializations text[], specialties[], coach_level, is_head_coach,
  head_coach_specialisation, instagram_url, tiktok_url, youtube_url, status`. **No `slug`, no `intro_video_url`,
  no `years_experience`.**
- `testimonials`: `id, user_id, coach_id, rating, feedback, is_approved, is_archived, weight_change_kg,
  duration_weeks, goal_type, author_display_name`. No curation flags / attachments / slug (matches the
  testimonials-plan "current state" — nothing built there yet).

---

## 2. Scope

| Part | Owner | Ships |
|---|---|---|
| **A — Editor redesign** (`CoachProfile.tsx`) | **This spec** | Now (no deps) |
| **B — Public card component** (`CoachPublicProfile`) | **This spec** (presentation), mounted by testimonials-plan T2 | Component now; live route with T2 |
| Net-new fields: `intro_video_url`, `years_experience`, stats row | **This spec** | With A/B |
| `/coach/:slug` route, `slug` column, anon RLS, reputation block, aggregate, SEO | `COACH_PROFILE_TESTIMONIALS_PLAN.md` T2 | Their track |

---

## 3. Data model

### 3.1 New columns on `coaches_public` (one migration)

`coaches_public` is the client-facing profile store and the correct home per the coach-tables refactor's
"canonical homes" (CLAUDE.md). Add:

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_coach_profile_redesign_fields.sql
ALTER TABLE public.coaches_public
  ADD COLUMN IF NOT EXISTS intro_video_url text,
  ADD COLUMN IF NOT EXISTS years_experience integer
    CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 70);
COMMENT ON COLUMN public.coaches_public.intro_video_url IS 'Coach 30-sec intro video (YouTube/Vimeo/mp4). Self-service editable. Shown in public About.';
COMMENT ON COLUMN public.coaches_public.years_experience IS 'Coaching years; self-declared; drives the public stats row.';
```

- **RLS:** no policy change for coach self-write (existing `coaches_public` own-row UPDATE covers new columns).
- **Anon read — CORRECTED 2026-07-10 (prod-verified).** Anon has **NO grant on `coaches_public`** (only
  `authenticated` can SELECT it). Anon reads coach data exclusively through views/RPCs: the anon-readable coach
  views are `coaches_client_safe`, `coaches_directory`, `coaches_directory_admin`, `coaches_full`, plus RPCs like
  `list_active_coaches_for_service` / `list_public_teams_for_browser`. **Adding the columns to `coaches_public`
  does NOT surface them to anon** — and it must not (granting anon SELECT on `coaches_public` would be a security
  regression). To render `intro_video_url` / `years_experience` on the public `/coach/:slug` page, **T2 must add
  them to whichever view or RPC that page reads from** (`coaches_directory` or a new anon coach-page RPC). This is
  **T2's job** (`COACH_PROFILE_TESTIMONIALS_PLAN.md` owns the anon read path for `/coach/:slug`), not CPR0's. The
  editor Preview (§5.4) renders from live form state, so it needs no anon read. _(The earlier draft's
  `SET LOCAL ROLE anon; SELECT ... FROM coaches_public` check was wrong — that query correctly raises 42501.)_
- **Do NOT** add these to `coaches` (Phase-3 drop list) — `coaches_public` only.
- After migration: `supabase gen types` / regen `src/integrations/supabase/types.ts`.

### 3.2 Stats row — data sources (mockup shows `10+ Years · 40+ Clients · 4.9 Rating`)

| Stat | Source | Decision |
|---|---|---|
| **Years** | `coaches_public.years_experience` (new, §3.1). Render `{n}+`. Hide the stat if NULL. | Own here. |
| **Clients** | Derived active-client count for the coach, **rounded down to a "N+" band** (e.g. 42→`40+`) via an anon-safe RPC. Exposing exact live counts is competitively sensitive (same concern as the testimonials aggregate). | **LOCKED** (2026-07-10) — derived-rounded anon RPC with a **floor of 10** (hide the stat entirely under 10, so a new/thin coach never shows a lopsided count). Uses `subscriptions` active count (engagement, not revenue). |
| **Rating** | The testimonials **aggregate** (avg rating + count) — **owned by `COACH_PROFILE_TESTIMONIALS_PLAN.md` §7**, gated by a min-review threshold (≥5) with a "New coach" fallback. | **Defer** — `CoachPublicProfile` accepts `rating?` / `reviewCount?` props; renders the stat only when provided, else omits it. T2 supplies them. Do not compute rating here. |

If clients-count lands as an RPC, it must exclude payment-exempt (`paying_subscriptions` view / CLAUDE.md exempt rule) — but "clients coached" is an engagement number, not revenue, so use `subscriptions` active count; state the choice in the PR. Anon-safe RPC → follow the REVOKE-from-PUBLIC pattern but keep `anon` EXECUTE (intentionally public, like `list_public_teams_for_browser`).

### 3.3 Completeness meter — computed, no schema

Client-side only. `computeProfileStrength(coach): { pct, missing[] }` in a small util
(`src/lib/coachProfileStrength.ts`). Weighted checklist (sums to 100):

| Field | Weight |
|---|---|
| `profile_picture_url` | 20 |
| `short_bio` (non-empty) | 15 |
| `bio` (non-empty) | 10 |
| `specializations.length ≥ 3` | 15 |
| `qualifications.length ≥ 1` | 10 |
| `location` | 5 |
| `years_experience` not null | 5 |
| ≥1 gym (in-person/hybrid) OR explicitly online-only | 10 |
| `intro_video_url` | 5 |
| ≥1 social link | 5 |

Meter shows `{pct}% complete` + an ontrack-colored bar (mockup `.meter`). `missing[]` powers optional "add X to
reach 100%" nudges. Pure function → unit-testable (§10).

---

## 4. Design tokens (from mockup, already IGU)

Reuse existing IGU tokens — do **not** hardcode the mockup's hex. Mockup `--primary hsl(355 78% 48%)` = existing
crimson; `--display Bebas Neue`, `--mono JetBrains Mono`, body Geist; `--radius 12px` = Card `rounded-lg`. Card
primitive stays flat (no shadow), `CardTitle` 500 — per `[[feedback_mockups_ground_in_real_components]]` and the
DS foundation. Light + dark both required (default dark; `ThemeProvider` already shipped).

---

## 5. Part A — Editor redesign (`CoachProfile.tsx`)

Restructure the single scroll into a **sectioned editor with a sticky Preview/Save header and a completeness
meter**. No data-model change beyond §3.1. Keep the direct-`coaches_public` write path and the `null` self-gate.

### 5.1 Header (sticky)
- Title "Edit profile" + actions **Preview** (opens §5.4) and **Save** (submits the form).
- Below the title: the **completeness meter** (§3.3) — label `Profile strength` + `{pct}% complete` + bar.
- Keep the existing bottom "Save changes" button too (mockup `.foot`) for reachability on long forms; both call the same submit.

### 5.2 Sections (replace the flat form; mockup section heads = mono uppercase, top-border divider)
1. **Identity** — avatar + "Change photo" (existing upload handler), First name, Nickname, Location. Email stays read-only/disabled.
2. **Bio** — Short bio (card bio) with a live **counter `{n}/160`** (soft cap, warn past 160); Full bio with counter (e.g. `/600`).
3. **Specializations** — existing `SpecializationTagPicker` (chips), with a **counter `{n} / 15 selected`** below (subtitle: "shown to clients & used for matching").
4. **Trains at** — existing `GymPicker` (chips), subtitle "clients matched by gym for in-person / hybrid".
5. **Qualifications** — render as **rows** (mockup `.qual`), not a raw comma field: an editable list (add/remove line items) that still round-trips to `qualifications text[]`. Keep newline import for back-compat.
6. **Experience** — new `years_experience` number input (0–70), hint "shown on your public profile".
7. **Intro video** — new `intro_video_url` input; validate a YouTube/Vimeo/mp4 URL (Zod refine); helper "A 30-sec intro clients see on your profile."
8. **Contact & social** — WhatsApp (country code + number, existing), Instagram / TikTok / Snapchat / YouTube as **labeled link rows** (mockup `.social`, show handle or "add link"). DOB + Gender stay (write `coaches_private`, existing).

### 5.3 Form mechanics
- Migrate to **React Hook Form + Zod** (CLAUDE.md standard) — current component is `useState`-driven; the counters,
  URL validation, and dirty-tracking are cleaner under RHF. Preserve existing fetch/populate + the WhatsApp
  country-code split logic (`CoachProfile.tsx:114-125`).
- Keep both writes: `coaches_public` (public fields + new `intro_video_url`, `years_experience`) and
  `coaches_private` (gender/whatsapp/dob/socials). **Destructure `{ error }` and throw** on the `coaches_public`
  update (already correct); the `coaches_private` update currently only `console.error`s (`CoachProfile.tsx:241`) —
  surface a toast on failure too.
- Counters are **display-only soft caps** (LOCKED 2026-07-10 — no DB CHECK, no hard block): warn/color past the limit but allow save. Keeps the DB constraint-free (current `testimonials`/`coaches_public` bio has none).

### 5.4 Preview
- **Preview** opens the **`CoachPublicProfile` component (Part B) in a Dialog/Drawer** populated from current form
  state (not a fetch) — so the coach sees the client-facing card live while editing, **before** `/coach/:slug`
  exists. Mobile → vaul `Drawer`; desktop → `Dialog` (branch on `useIsMobile()`, CLAUDE.md).
- Preview passes `rating`/`reviewCount` as undefined (no testimonials yet) → the card shows the "New coach"/no-rating state.

### 5.5 Route
- Keep the editor in the Account "Coach Profile" tab (`AccountManagement.tsx:1104`). No new route required. If a
  dedicated `/coach/profile` is wanted later it's a thin wrapper — **out of scope here** (flag).

---

## 6. Part B — Public card (`CoachPublicProfile` component)

A presentational component that renders the client-facing coach card (mockup PUBLIC 1 + 2). **New file:**
`src/components/coach/CoachPublicProfile.tsx`. Pure props in, no data fetching — both the editor Preview (§5.4)
and the testimonials-plan `/coach/:slug` page mount it.

### 6.1 Props contract
```ts
interface CoachPublicProfileProps {
  coach: {
    firstName: string; lastName?: string | null; nickname?: string | null;
    headline?: string | null;              // e.g. "Head Coach · Strength & Physique" (derive from is_head_coach + head_coach_specialisation, else level/specialty)
    avatarUrl?: string | null;
    location?: string | null;
    bio?: string | null; shortBio?: string | null;
    specializations?: string[];            // display labels (resolve via useSpecializationTags)
    qualifications?: string[];
    gyms?: { id: string; name: string }[]; // "Trains at"
    socials?: { instagram?: string; tiktok?: string; youtube?: string; snapchat?: string };
    introVideoUrl?: string | null;
    yearsExperience?: number | null;
    clientCount?: number | null;           // pre-rounded "N+" band or null (§3.2)
  };
  rating?: number | null;                  // from testimonials aggregate (T2); undefined in Preview
  reviewCount?: number | null;
  reputationSlot?: React.ReactNode;        // T2 injects the curated-testimonials block here
  onPrimaryCta?: () => void;               // "Choose <coach>" / "Start with <coach>"
  variant?: "preview" | "public";          // preview hides the CTA route wiring
}
```

### 6.2 Layout (mockup)
- **Hero** (`.hero`) — photo/gradient bg, gradient shade, **Bebas name** (`firstName lastName`), headline line.
  Fall back to an avatar-initials block when no photo.
- **Stats row** (`.stats`) — up to 3 stats: `Years` (yearsExperience `+`), `Clients` (clientCount `+`), `Rating`
  (rating, 1-dp). **Render only the stats that have values** — omit any null; if all null, hide the row.
- **Specialties** — chips (mockup `.chip.on`), primary-filled.
- **About** — `bio` (fallback `shortBio`); if `introVideoUrl`, an **intro-video affordance** (`.intro` play row →
  opens the video in a lightbox/embed; sanitize/whitelist YouTube/Vimeo/mp4 hosts).
- **Detail sections** (editorial, divider between): **Certified** (qualifications rows), **Trains at** (gym rows
  with pin), **Located** (location), **What clients say** = `reputationSlot` (T2), **Follow** (social icon links).
- **CTA** (`.cta`) — primary "Choose <coach>" (+ optional "View full profile"). In `public` variant the CTA calls
  `onPrimaryCta` (T2 wires the Services/onboarding preselect handoff — do not re-spec that here).

### 6.3 What Part B does NOT do
- No route, no `slug` resolve, no anon fetch, no `coaches.status` lifecycle 404, no testimonials query, no aggregate
  computation, no SEO/OG helmet — **all T2** (`COACH_PROFILE_TESTIMONIALS_PLAN.md` §6.2). Part B is the dumb view T2 fills.

---

## 7. Accessibility / mobile / i18n
- Chips = real toggle buttons in the editor (keyboard, `aria-pressed`); public chips are static.
- Intro-video affordance is a `<button>` with an accessible label; video embed lazy-loaded.
- Preview drawer/dialog follows the `useIsMobile()` branch + safe-area padding; `pb-24 md:pb-8` if any full-page surface is added.
- Editor buttons keep `min-h-[44px] md:min-h-0` (button primitive).
- **Public card (`CoachPublicProfile`, CPR2) MUST be i18n/RTL** — `react-i18next` (`common` namespace), Arabic +
  dir-flip (the testimonials plan requires it for `/coach/:slug`). **Editor (CPR1) stays English** (ACCEPTED
  deviation 2026-07-10): the existing `CoachProfile.tsx` was 100% hardcoded English and it's a staff-only surface —
  keeping it consistent with surrounding code beats a partial i18n pass. A full editor i18n pass is a separate,
  larger ticket if wanted. So: i18n is required on the public surface, deferred on the staff editor.

---

## 8. Files touched

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_coach_profile_redesign_fields.sql` | New — `intro_video_url`, `years_experience` on `coaches_public` (§3.1). |
| `src/integrations/supabase/types.ts` | Regen after migration. |
| `src/components/CoachProfile.tsx` | Editor redesign (§5): sections, sticky Preview/Save, meter, counters, RHF+Zod, qualifications rows, years + intro-video fields, Preview wiring. |
| `src/lib/coachProfileStrength.ts` | New — `computeProfileStrength` (§3.3) + tests. |
| `src/components/coach/CoachPublicProfile.tsx` | New — Part B presentational component (§6). |
| `src/components/CoachDetailDialog.tsx` | **Reskin to reuse `CoachPublicProfile`** (`variant="preview"`) so the onboarding coach-selection lite view matches (LOCKED 2026-07-10). Keep the **RLS-safe subset** — the RPC (`list_active_coaches_for_service`) only supplies name/avatar/short_bio/specializations pre-subscription, so pass qualifications/location/socials/intro-video as undefined (they're RLS-gated until subscribed, per `CoachPreferenceSection.tsx:434`). The card gracefully omits null sections (§6.2). |
| `src/components/onboarding/CoachPreferenceSection.tsx` | Update the props mapping feeding the reskinned dialog. |
| (T2, not here) `routeConfig.ts` / `App.tsx` / `coaches_public.slug` / anon RLS / reputation | Owned by `COACH_PROFILE_TESTIMONIALS_PLAN.md`. |

---

## 9. Phases

- **CPR0 — Fields.** Migration §3.1 + types regen. Verify anon SELECT of the two new columns. _Ships alone._
- **CPR1 — Editor redesign.** §5 in full behind no flag (self-service surface, low blast radius). Includes meter
  (§3.3) + counters + intro-video/years fields + RHF migration. _Verify: coach edits all fields, Save persists to
  `coaches_public`/`coaches_private`, meter reacts, RLS-deny path toasts._
- **CPR2 — Public component + Preview.** Build `CoachPublicProfile` (§6) and wire the editor **Preview** (§5.4).
  Stats render from `years_experience` + (deferred) rating; clients-count per §3.2 decision. _Verify: Preview shows
  the card from live form state; null stats omitted; intro video plays; light+dark._
- **CPR3 — Clients-count RPC.** Anon-safe, rounded "N+" band, floor 10 (§3.2). _Verify: anon call, rounding, floor-hide under 10._
- **Hand-off to T2.** Testimonials plan mounts `CoachPublicProfile` at `/coach/:slug`, injects `reputationSlot`,
  supplies `rating`/`reviewCount`, adds slug + anon route + lifecycle 404 + SEO. _Coordinate; do not build the route here._

---

## 10. Verification
- `npx tsc --noEmit` + `npm run lint`.
- Unit: `coachProfileStrength.test.ts` — weight sum, each-field contribution, empty profile = 0, full = 100.
- Editor smoke (Cowork, prod, coach acct `dr.ironofficial`): edit each section → Save → confirm `coaches_public`
  (`intro_video_url`, `years_experience`, specializations, qualifications) + `coaches_private` (socials/whatsapp)
  persisted; meter updates; Preview renders.
- RLS: post-migration anon SELECT check (§3.1); coach can only update own row (existing policy — spot-check).
- Visual: light + dark, mobile + desktop; card matches mockup; no Card shadow / no font-bold >600.
- Regression: pure-specialist account (no `coaches_public` row) still renders nothing (self-gate intact).

---

## 11. Decisions — all LOCKED 2026-07-10 (Hasan: "do as recommended" ×5)
1. **Clients stat** — ✅ derived-rounded anon RPC, floor 10 (hide under), `subscriptions` active count. §3.2.
2. **CoachDetailDialog** — ✅ reskin to reuse `CoachPublicProfile` (`variant="preview"`), RLS-safe subset. §8.
3. **Bio caps** — ✅ soft counters only, no DB CHECK. §5.3.
4. **Editor route** — ✅ keep the Account "Coach Profile" tab; no `/coach/profile` route. §5.5.
5. **Sequencing** — ✅ build `CoachPublicProfile` here; testimonials-plan T2 consumes it. §0/§6.

No open decisions remain. Spec is ready to hand to CC.

---

## 12. Dependencies / coordination
- **`COACH_PROFILE_TESTIMONIALS_PLAN.md` (other track)** — owns `/coach/:slug` route, `coaches_public.slug`, anon
  RLS, reputation/aggregate, "New coach" state, lifecycle 404, SEO. Part B is built to be **consumed by** its T2.
  Coordinate the hand-off; the rating/reviewCount + `reputationSlot` are theirs to supply.
- **Coach-tables refactor (mid-soak, CLAUDE.md)** — new columns go on `coaches_public` only; don't write the
  Phase-3 deprecated `coaches.*` profile columns.
- **Onboarding coach-selection (ON2)** — the public CTA "Start with <coach>" preselect handoff is owned there; Part B
  just exposes `onPrimaryCta`.
- **Theme + DS foundation** — flat Card, `CardTitle` 500, font-bold ≤600, Bebas/Geist/JetBrains, light+dark default dark.
- **i18n/RTL** — all new copy via `react-i18next`; public card must flip for Arabic.
