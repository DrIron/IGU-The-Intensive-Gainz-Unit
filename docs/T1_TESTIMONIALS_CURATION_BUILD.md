# T1 — Testimonials Curation + Consent + Reputation (Slice A) — Build Spec

_Slice A (T1) of `docs/COACH_PROFILE_TESTIMONIALS_PLAN.md`: curation columns + coach/admin curation UIs + consent/attribution on submit + `/testimonials` filter + remove the approval gate + wire the reputation block into the `/coaches/:slug` page (T2 shipped its shell)._
_Created 2026-07-10. Owner: this track. Card + page + RPCs from CPR/T2 are live (`docs/CPR_TO_T2_HANDOFF.md`)._

---

## 0. Scope + ground state

**In scope (T1):** the `testimonials` curation/consent columns + RLS, all curation writes via SECURITY DEFINER RPCs, consent+attribution on the submit form, coach "My testimonials" self-curation UI, slim admin feature-public UI, `/testimonials` filter/sort, **remove the `is_approved` visibility gate**, and **wire `reputationSlot` + aggregate `rating` into `CoachPublicProfile` on `/coaches/:slug`**.
**Out of scope (T3/T4):** attachments (weight-change / lift-progression proof). Do NOT add `attachment*` columns here.

**Ground state (prod-verified 2026-07-10):**
- `testimonials` columns = base only: `id, user_id, coach_id, rating, feedback, is_approved, is_archived, weight_change_kg, duration_weeks, goal_type, author_display_name, created_at, updated_at`. **No curation/consent columns.**
- **Table is EMPTY (0 rows)** → **no backfill / legacy-consent migration needed** (plan §11.7 is moot). Start clean.
- 7 RLS policies. The two that gate anon visibility on `is_approved` — **`"Anyone can view approved testimonials"`** (anon+auth SELECT) and **`"anon_can_read_approved_testimonials"`** (anon SELECT) — get REPLACED by the new visibility rule (§2). Keep the clients-only INSERT gate (`"Clients can insert testimonials for their coach"`, uses `is_client_of_coach`), the admin SELECT/UPDATE, the own-row SELECT, and the coach-views-clients SELECT.
- Submit form `src/pages/Testimonial.tsx` (clients-only, resolves coach from own subscriptions, snapshots `author_display_name`). Admin `src/components/TestimonialsManager.tsx` (currently approve/archive). View `src/pages/Testimonials.tsx` + `src/components/marketing/TestimonialsList.tsx`.

## Decisions locked (2026-07-10)
- **Attribution default = `first_initial`** (first name + last initial). Values: `full_name` | `first_initial` | `anonymous` ("IGU client").
- **Aggregate:** avg + count on the coach page, **≥5-review threshold** (below → `rating` undefined → card's "New coach" state); **count-only** on Meet-the-Team cards. (Locked earlier.)
- **No approval gate** (CP3) — `is_approved` kept as a column for back-compat but never gates visibility.
- **Backfill:** none (empty table).
- ⚑ **Coach "My testimonials" UI home = a new coach-dashboard section `/coach/testimonials`** (RECOMMENDED — flag if you'd rather it live in the Account "Coach Profile" area). Routes through the `/coach/:section` catch-all → `CoachDashboard`; add the section.

---

## 1. Migration A — curation + consent columns
`supabase/migrations/YYYYMMDDHHMMSS_testimonials_curation.sql`:
```sql
ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS show_on_coach_page boolean NOT NULL DEFAULT false,   -- coach-writable (own rows)
  ADD COLUMN IF NOT EXISTS featured_public     boolean NOT NULL DEFAULT false,   -- admin-writable
  ADD COLUMN IF NOT EXISTS featured_rank       integer,                          -- admin ordering
  ADD COLUMN IF NOT EXISTS hidden_by_admin     boolean NOT NULL DEFAULT false,   -- admin moderation floor
  ADD COLUMN IF NOT EXISTS display_consent     boolean NOT NULL DEFAULT false,   -- client opt-in; required for ANY public visibility
  ADD COLUMN IF NOT EXISTS attribution         text NOT NULL DEFAULT 'first_initial'
    CHECK (attribution IN ('full_name','first_initial','anonymous')),
  ADD COLUMN IF NOT EXISTS withdrawn_at        timestamptz;                      -- client retracted → hidden everywhere
CREATE INDEX IF NOT EXISTS idx_testimonials_coach_visible
  ON public.testimonials (coach_id) WHERE show_on_coach_page AND NOT hidden_by_admin;
CREATE INDEX IF NOT EXISTS idx_testimonials_featured
  ON public.testimonials (featured_rank) WHERE featured_public AND NOT hidden_by_admin;
```
Regen `types.ts`. Apply via `db push` (clean).

## 2. Migration B — RLS rewrite (the visibility rule)
**Public-visibility rule** (final, plan §3.1): a row is publicly visible only when
`display_consent AND withdrawn_at IS NULL AND (show_on_coach_page OR featured_public) AND NOT hidden_by_admin`.
- **Drop** `"Anyone can view approved testimonials"` + `"anon_can_read_approved_testimonials"`. **Create** one anon+authenticated SELECT policy `testimonials_public_visible` with the rule above.
- Keep: clients-only INSERT gate; admin SELECT (all) + admin UPDATE (all); own-row SELECT (`user_id = auth.uid()`); coach-views-own SELECT (`coach_id = auth.uid()` — verify the existing `"Coaches can view their clients' testimonials"` is coach_id-based; if it's relationship-based that's fine too, coaches must be able to read rows about them to curate).
- **Lock down non-admin UPDATE:** do NOT add broad coach/client UPDATE policies (column-level control is not RLS-expressible). All curation writes go through the SECURITY DEFINER RPCs in §3, which each touch exactly one concern. (Admin UPDATE policy can stay for admin tooling, or route admin writes through RPCs too — prefer RPCs for consistency.)

## 3. Migration C — curation RPCs (SECURITY DEFINER, REVOKE-PUBLIC + GRANT authenticated)
Each: `SET search_path=public`, verify caller, touch only its columns, `RETURNS void`/`jsonb`. Follow the CLAUDE.md REVOKE-from-PUBLIC/anon + GRANT-authenticated pattern.
- `set_testimonial_coach_visibility(p_id uuid, p_show boolean)` — requires `testimonials.coach_id = auth.uid()` (coach owns the review-about-them); sets `show_on_coach_page`. (+ optional `set_testimonial_coach_order(p_id, p_rank)` if the coach reorders — a coach-scoped rank column, or reuse client-side ordering by created_at for v1.)
- `set_testimonial_featured(p_id uuid, p_featured boolean, p_rank integer)` — admin-only (`is_admin(auth.uid())`); sets `featured_public` + `featured_rank`.
- `set_testimonial_hidden(p_id uuid, p_hidden boolean)` — admin-only; sets `hidden_by_admin`.
- `set_testimonial_consent(p_id uuid, p_consent boolean, p_attribution text)` — requires `testimonials.user_id = auth.uid()`; sets `display_consent` + `attribution` (validate enum).
- `withdraw_testimonial(p_id uuid)` — requires `user_id = auth.uid()`; sets `withdrawn_at = now()` (and an un-withdraw variant / nullable toggle if you want reversibility).
- **Anon, for the public coach page:**
  - `get_coach_public_testimonials(p_coach_user_id uuid)` → the coach's publicly-visible rows (rule §2 AND `show_on_coach_page`), each with a **display name derived from `attribution`** (full name / first name + last initial / "IGU client") + rating + created_at. Anon-callable (REVOKE PUBLIC, GRANT anon+authenticated) — like `get_coach_public_profile_by_slug`. Derive the name server-side so anon never needs the client's profile.
  - `get_coach_rating_aggregate(p_coach_user_id uuid)` → `{ avg numeric, count int }` over the coach's publicly-visible rows; **returns count + avg only when count ≥ 5, else `{count, avg:null}`** (frontend passes `rating` only when avg present). Anon-callable.

## 4. Submit form — consent + attribution (`src/pages/Testimonial.tsx`)
After rating + feedback, before submit (plan §5):
- **Consent checkbox** (`display_consent`) — "I agree to IGU displaying this publicly." Required for the testimonial to ever show publicly; without it, the row saves but stays private (make the copy clear it can be shown later from the account).
- **Attribution** radio — Full name / First name + initial (default) / Anonymous ("IGU client").
- Insert now includes `display_consent` + `attribution` (the INSERT policy already allows the client's own row; these are set at insert). Keep the `author_display_name` snapshot.
- Client can **withdraw** later from their account (a small "Manage my testimonials" affordance calling `withdraw_testimonial`) — minimal for T1 (a list of their own testimonials with a Withdraw button); can reuse the coach-curation list component styling.

## 5. Coach "My testimonials" curation UI — `/coach/testimonials`
- New coach-dashboard section (route via `/coach/:section` → `CoachDashboard` section router; add `testimonials` to the section list + mobile dock prefix already covered by `/coach`). Gated `RoleProtectedRoute requiredRole="coach"`.
- Lists testimonials about this coach (`coach_id = auth.uid()`, via the coach SELECT policy). Each row: author (attribution-derived) + rating + feedback + a **"Show on my public page"** toggle → `set_testimonial_coach_visibility`. Optional reorder.
- Empty state + explains that only consented testimonials can be shown (a row without `display_consent` shows a disabled toggle + "client hasn't consented to public display").

## 6. Admin — slim to feature-public (`src/components/TestimonialsManager.tsx`)
- **Remove the approve step** (the `is_approved` toggle no longer gates anything). Keep browse/filter + inline attachment view (attachments are T3/T4; none yet).
- Add: **`featured_public` toggle** + **`featured_rank` ordering** (drag or number) → `set_testimonial_featured`; **`hidden_by_admin` toggle** (moderation floor) → `set_testimonial_hidden`. Admin does NOT touch `show_on_coach_page` (coach-owned).

## 7. Public view `/testimonials` (filter/sort)
- `Testimonials.tsx` + `TestimonialsList.tsx`: the public rotation now reads `featured_public` rows (rule §2), ordered by `featured_rank`. Add **filter by coach + by goal (`goal_type`)**; sort by recency / rating. Cards show rating + result chips (goal · weeks · Δkg from the existing legacy fields) + attribution-derived name.
- The Index "What our clients say" section switches from `is_approved` to `featured_public` (empty until admin features some — fine, table is empty anyway).

## 8. Wire the reputation block into `/coaches/:slug`
- In `CoachPublicPage.tsx`: call `get_coach_public_testimonials(coach_user_id)` → render into `CoachPublicProfile`'s `reputationSlot` (a small list: attribution name + stars + quote). Call `get_coach_rating_aggregate(coach_user_id)` → pass `rating`/`reviewCount` (only when avg present; else leave undefined → the card's "New coach" state, already shipped).
- Meet-the-Team cards: **count-only** aggregate (reviewCount, no avg) per the locked decision — from `get_coach_rating_aggregate` count.

## 9. i18n
New public strings (submit consent/attribution labels, `/testimonials` filters, the coach page reputation block, "IGU client") through `react-i18next` (`common`), en + ar. The card metadata already uses React 19 native `<meta>` (helmet is gone — do NOT reintroduce react-helmet-async).

## 10. Verify
- `tsc -p tsconfig.app.json` (delta vs ~301 baseline, zero new); eslint clean; RPC anon checks (`has_function_privilege('public',…) = false` on the anon RPCs).
- Cowork prod-smoke (needs a seeded testimonial — the clients-only gate requires a real client of a coach; use a `+tier` test client of `dr.ironofficial` via the INSERT gate):
  1. Client submits with consent OFF → not visible on `/coaches/:slug` or `/testimonials`. Consent ON + coach toggles `show_on_coach_page` → appears in the coach page reputation block; withdraw → disappears everywhere.
  2. Non-owner coach cannot toggle another coach's row (RPC raises).
  3. Admin `featured_public` ON → appears in `/testimonials`; `hidden_by_admin` ON → hidden everywhere (overrides coach + featured).
  4. Aggregate: <5 visible → card shows "New coach"; ≥5 → avg+count on the coach page, count-only on Meet-the-Team.
  5. Attribution renders correctly (full name / first + initial / "IGU client").

## 11. Related docs
`docs/COACH_PROFILE_TESTIMONIALS_PLAN.md` (§3.1/§4/§5/§10), `docs/TESTIMONIALS_CLIENTS_ONLY_BUILD.md` (foundation gate), `docs/CPR_TO_T2_HANDOFF.md` (card `reputationSlot`/`rating` contract), `docs/T2_COACH_PUBLIC_PAGE_BUILD.md`.
