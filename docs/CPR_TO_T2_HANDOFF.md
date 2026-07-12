# CPR → Testimonials-Plan T2 Hand-off

_What the Coach Profile Redesign (CPR) delivered, and exactly what T2 must do to light up the public `/coach/:slug` page._
_Created 2026-07-10. CPR track (CPR0–CPR3) is fully shipped + prod-verified. T2 = phase T2 of `docs/COACH_PROFILE_TESTIMONIALS_PLAN.md` (that track's territory — this doc is the interface, not a spec of their work)._

---

## 1. Status

The client-facing coach card is **built, shipped, and prod-verified** as a pure presentational component. It's already mounted in two places (the coach editor Preview + the RLS-safe onboarding coach-selection dialog). **T2 does not build the card** — T2 builds the public *page* that mounts it and supplies the data + reputation.

CPR shipped on `main`: `1b5c318` (CPR0/CPR1), `7e04b04` (counter nit), `63819d4` (CPR2), `04ca400` (CPR3). Spec: `docs/COACH_PROFILE_REDESIGN_BUILD.md`.

---

## 2. What CPR delivered (T2 consumes these)

### 2.1 The card — `src/components/coach/CoachPublicProfile.tsx`
Pure props in, **no fetch / no Supabase / no network hooks**. Named + default export. Renders: gradient/photo hero + Bebas name + headline, null-omitting stats row, primary specialty chips, About + inline intro-video embed, editorial sections (Certified / Trains at / Located / **What clients say** = `reputationSlot` / Follow), and a **public-variant-only** CTA. Exact prop contract (from the shipped file):

```ts
interface CoachPublicProfileProps {
  coach: {
    firstName: string; lastName?; nickname?;
    headline?;                 // build via deriveCoachHeadline (exported, see 2.2)
    avatarUrl?; location?; bio?; shortBio?;
    specializations?: string[]; // PRE-RESOLVED display LABELS (not values)
    qualifications?: string[];
    gyms?: { id: string; name: string }[];
    socials?: { instagram?; tiktok?; youtube?; snapchat? };
    introVideoUrl?;            // component runs it through toEmbed() (whitelist) itself
    yearsExperience?: number | null;
    clientCount?: number | null; // pre-rounded "N+" band from CPR3 RPC (see 2.3)
  };
  rating?: number | null;      // from the testimonials aggregate; null/undefined → "New coach" state auto-renders
  reviewCount?: number | null; // renders "Based on N reviews" when > 0
  reputationSlot?: React.ReactNode; // T2 injects the curated-testimonials block here
  onPrimaryCta?: () => void;   // "Choose <coach>" click (public variant only)
  variant?: "preview" | "public"; // T2 passes "public" → shows the CTA
}
```

**Behavior T2 gets for free:** every section null-omits when its data is empty; the stats row hides entirely when Years/Clients/Rating are all null; when `rating` is null it renders the graceful **"New coach — building their reputation"** line (never `0.0`); the intro video is host-whitelisted internally (YouTube/Vimeo/mp4 via `toEmbed`, junk never embeds); social links are `http(s)`-guarded.

### 2.2 Headline helper — `deriveCoachHeadline(...)` (exported from the same file)
```ts
deriveCoachHeadline({ isHeadCoach?, headCoachSpecialisation?, coachLevel?, primarySpecialty? }): string | null
```
Head coach → "Head Coach · <spec>"; else "<Level> Coach · <primary specialty>"; else the primary specialty. **Use this** so the page and the editor Preview derive the headline identically.

### 2.3 Clients-band RPC — `public.get_coach_client_count_band(p_coach_user_id uuid) → integer|null`
Migration `20260710191900`. Active `subscriptions` coached by this coach (`coach_id = coach user_id`, `status='active'`, incl. payment-exempt), floored to nearest 10, **NULL under 10** (hides thin coaches). `SECURITY DEFINER`, `search_path=public`, **anon+authenticated EXECUTE, no PUBLIC grant** (public by design). Prod-verified. → pass its result as `coach.clientCount`; the card renders "N+".

### 2.4 Net-new profile columns (CPR0, migration `20260710075019`)
`coaches_public.intro_video_url text` + `years_experience integer` (CHECK 0–70). Coach-editable via the redesigned editor. **These do NOT reach anon yet** — see §3.2.

### 2.5 Video util — `src/lib/videoUrl.ts`
`isAllowedVideoUrl(url)` + `toEmbed(url) → { provider, embedUrl } | null`. One source of truth for the editor's Zod validation and the card's embed. T2 needs nothing here — the card calls it internally.

---

## 3. What T2 must build to light up `/coach/:slug`

### 3.1 Route + slug
- **Route = `/coaches/:slug` (plural), NOT `/coach/:slug`** — `/coach/:section` is a coach-only catch-all (App.tsx:266) that would swallow it. Decision + rationale in `docs/T2_COACH_PUBLIC_PAGE_BUILD.md`. Add `/coaches/:slug` in `App.tsx` + `routeConfig.ts`, wrapped in `PublicLayout` + `WaitlistGuard` (same as `/meet-our-team`). No `RoleProtectedRoute` (public).
- Add `coaches_public.slug` (unique, indexed, anon-readable) — generate from nickname/name, admin-editable in `CoachManagement`, collision strategy per the testimonials plan §11.2. Write it through `coaches_public` per the coach-tables refactor rules.

### 3.2 Anon read path — **the critical gotcha**
Anon has **NO grant on `coaches_public`** (prod-verified: only `authenticated` SELECTs it). Anon reads coaches only through views/RPCs (`coaches_directory`, `coaches_client_safe`, …). **Adding columns to `coaches_public` did NOT surface them to anon, and must not** (granting anon SELECT on the base table is a security regression). So T2 must:
- Build a **dedicated anon RPC** (recommended) e.g. `get_coach_public_profile_by_slug(p_slug text)` — `SECURITY DEFINER`, `REVOKE FROM PUBLIC` + `GRANT anon, authenticated` (same pattern as `get_coach_client_count_band`), **active-coach only** (`coaches.status` gate → the page 404s/redirects for inactive coaches). It returns everything the card needs: `first_name, last_name, nickname, location, bio, short_bio, profile_picture_url, qualifications[], specializations[] (VALUES), specialties, intro_video_url, years_experience`, the role fields for the headline (`is_head_coach, head_coach_specialisation, coach_level`), socials, and the coach `user_id` (to call the band RPC + resolve gyms).
- Resolve the coach's **gyms** (`{id,name}[]`) via the existing gym-assignment source (anon-safe).

### 3.3 Map fetched data → `CoachPublicProfile` props (`variant="public"`)
- `specializations`: resolve VALUES → labels via `useSpecializationTags().getLabel`.
- `headline`: `deriveCoachHeadline({ isHeadCoach, headCoachSpecialisation, coachLevel, primarySpecialty })`.
- `clientCount`: `get_coach_client_count_band(user_id)`.
- `rating` / `reviewCount`: the testimonials **aggregate** (T2's §7) — apply the **min-review threshold (≥5)**; below it pass `rating` undefined so the card shows the "New coach" state.
- `reputationSlot`: the **curated** testimonials block (`show_on_coach_page`, T2's curation model).
- `onPrimaryCta`: "Choose <coach>" → the Services/onboarding **preselect handoff** (ON2), carrying the coach id.

### 3.4 SEO + i18n
- **SEO/OG** via `react-helmet-async` — schema.org `AggregateRating` / `Review` + Open Graph (testimonials plan Gap 7).
- **i18n/RTL:** `CoachPublicProfile` is currently **English-only** (flat strings, intentionally deferred). Localize it via `react-i18next` (`common`) + Arabic/dir-flip **before it ships public**. Strings to key: section titles (Specialties/About/Certified/Trains at/Located/What clients say/Follow), "New coach — building their reputation", "Watch a 30-sec intro from {name}", "Choose {name}", "Based on {n} reviews". Kept flat so this pass is cheap.

---

## 4. Notes / open threads T2 inherits
- **Gyms in the editor Preview are omitted** (`TODO(CPR2)` — `GymPicker` selection isn't lifted into form state). This is Preview-only; the public page fetches gyms directly (§3.2), so `/coach/:slug` shows them fine.
- The component is **already proven** end-to-end via the editor Preview (live form state) and the reskinned `CoachDetailDialog` (RLS-safe subset in onboarding coach-selection) — so T2 only needs the public data plumbing, not card debugging.
- One benign lint warning (`react-refresh/only-export-components`) from co-exporting `deriveCoachHeadline`; kept for T2 reuse — don't "fix" by moving it unless you also update the import.
- Clients-band is **engagement, not revenue** (reads `subscriptions`, includes payment-exempt) — matches CLAUDE.md's decision rule; don't swap it to `paying_subscriptions`.

---

## 5. Files
- `src/components/coach/CoachPublicProfile.tsx` — the card + `deriveCoachHeadline`.
- `src/lib/videoUrl.ts` — `isAllowedVideoUrl` / `toEmbed`.
- `supabase/migrations/20260710075019_coach_profile_redesign_fields.sql` — `intro_video_url` + `years_experience`.
- `supabase/migrations/20260710191900_coach_client_count_band.sql` — the band RPC.
- `src/components/CoachProfile.tsx` — editor + Preview (reference for prop mapping).
- `src/components/CoachDetailDialog.tsx` — RLS-safe `variant="preview"` mount (reference).
- `docs/COACH_PROFILE_REDESIGN_BUILD.md` — full CPR spec. `docs/COACH_PROFILE_TESTIMONIALS_PLAN.md` — T2's own plan.
