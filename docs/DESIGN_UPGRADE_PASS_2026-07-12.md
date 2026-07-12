# Design Upgrade Pass — 2026-07-12

_Deliverable #3 of DESIGN_TRACK_HANDOVER.md §6. Re-specs UPGRADE rows to the current bar (§3), each grounded in a fresh Mobbin screen + the real IGU component. Started with the two decision-locked items (ON2, PUB6); the heavier P1s (CC6, WK10, SE1, CT1) are held until the CC cross-check returns so its findings shape them._

Decisions locked by Hasan 2026-07-12: ON2 → enrich within RLS; PUB6 → reorder to lead with outcome; FU4 → P1/bug.

---

## PUB6 — public testimonial card: lead with the outcome, not stars

**Status today.** `TestimonialsList.tsx:108-139` renders every featured card in this order: 5-star row (`:109-119`) → italic quote (`:120`) → `WeightChangeProof` chip (`:121-123`, only if a `weight_change` attachment exists) → avatar + name + coach (`:124-137`). Used by both `Index.tsx:572` (landing) and `/testimonials`. So the proof is present but buried under a star row — the exact thing PUB6 said to stop doing.

**Mobbin references (fresh).**
- [Contractbook — outcome-led testimonial grid](https://mobbin.com/sites/sections/e66be7ae-4850-4bf8-8327-64e641e1c6b3): each card leads with a large result number (`-10%`, `45min`, `-25%`) + a one-word metric label, then the quote, then a small avatar + name + role at the bottom. No stars at all. This is the target hierarchy.
- [Shade — case-study cards](https://mobbin.com/sites/sections/ba35c5dc-b05b-4c92-a513-5e1ed4b47459): quote on top, then two stacked result metrics (`38% increase…`) in mono. Good model for pairing a quote with a measurable result.
- Anti-pattern to move away from: [Ramp — "Our customers love us"](https://mobbin.com/sites/sections/4bd26ace-b0af…) is stars-first, generic-quote, name — i.e. what IGU renders now.

**Upgraded spec (grounded in real components).** Reorder the card and introduce a marketing-only hero treatment of the existing proof, **without breaking `WeightChangeProof`'s neutrality contract** (`WeightChangeProof.tsx:9-11` — no good/bad color implication):

1. **Result hero (top), only when `attachment_type === "weight_change"`.** Render the delta as a Bebas Neue display number — `2.1` with a smaller `KG` unit and the direction glyph (`TrendingDown`/`TrendingUp` from the attachment sign) — in **`text-foreground` (neutral), never crimson-as-success**. Immediately beneath, in JetBrains Mono `text-xs text-muted-foreground`: `{weeks} WEEKS · {phase_name}`. The phase name stays so the number reads against the client's *own* goal (a `-2.1 kg` under "Summer Cut" is on-goal; the same under a lean-bulk phase would not be "good"). Reuse `formatWeightChange` / `WeightChangeShape` — do not recompute.
2. **Quote** — keep the italic `text-muted-foreground` treatment, unchanged, second.
3. **Author row** — avatar + `displayName` + coach attribution, unchanged, third.
4. **Stars** — demote to a small `h-3.5` row at the card footer (or drop entirely on the landing section; keep on `/testimonials` where rating sort exists). Stars become supporting metadata, not the headline.
5. **No-attachment cards** (testimonials without weight proof) keep quote-led (no fabricated hero number) — quote first, then author, then small stars. Never invent an outcome.

Card chrome stays `bg-card border border-border rounded-lg` (flat, current bar). This is a single-component change (`TestimonialsList.tsx`) that both public surfaces inherit. Effort: S.

**Guardrail for the builder:** honesty rule — only cards with a real `weight_change` attachment get the hero number. Don't backfill or estimate. Keep the neutral color; a reviewer who sees crimson on the loss number should reject it.

**Bigger win the CC scan surfaced — kill fabricated social proof (do this first).** `TestimonialsList.tsx:142-162` renders **three fake 5-star cards** with hardcoded `"Client Name"` / `"Program Type"` / "Coming soon — your testimonial could be here!" whenever there are no featured testimonials — and `:87-89` falls back to the *same fakes* on a fetch error. This is fabricated social proof on the public homepage, and it's the literal opposite of PUB6's "authentic" ask. Replace it with either a genuine `EmptyState` (nothing shown until real testimonials exist) or simply render nothing on the landing section. This outranks the card re-order. (Also: the component has no `useTranslation` despite mounting on the i18n'd homepage, and `:133` hardcodes `Coach: {first} {last}` — fold into CC11.)

---

## ON2 — onboarding coach selection: enrich the profile within RLS

**Status today.** The list itself is already good (`CoachPreferenceSection.tsx:330-425`): best-match-first sort, "Top match" / "Trains at your gym" / "{n} goals match" / spots-left badges, avatar, specialties, `ClickableCard`. The gap is the **profile dialog** (`:437-460`): `CoachDetailDialog` is fed a deliberately lite object — `location`, `qualifications`, `gyms`, `socials`, `introVideoUrl`, `headline`, `yearsExperience`, `clientCount` all hard-nulled with the comment "RLS-gated pre-subscription."

**Key reframe (the crux of this upgrade).** Those fields are **already public**. The `/coaches/:slug` page (`CoachPublicProfile`) renders location, qualifications, "trains at", reputation and intro-video to *anonymous* visitors. So they are not actually gated from a prospect mid-onboarding — the dialog is just reading a narrower RPC and self-omitting. The enrich path is to feed `CoachDetailDialog` from the **same anon-safe read that powers `CoachPublicProfile`**, keyed by coach id, rather than nulling.

**Mobbin references (fresh).**
- [Future Pro — "Recommended Coaches" card](https://mobbin.com/screens/50e21fab-5c26-4e05-a830-f99c0d1c6212): a "TOP RECOMMENDATION" hero card (photo + name + a one-line credential: "Previously: Master Trainer… 15,000+ sessions") in a swipeable carousel with "View More Coaches". Models the recommended → browse pattern.
- [Future Pro — coach profile: Specialties / About](https://mobbin.com/screens/20fd4906-a2f8-4ce2-b29d-cee7a2a972e4) and [Certified / Located](https://mobbin.com/screens/fc7492bc-971a-4bb9-8c33-ca381a10d647): the rich profile broken into labelled editorial sections (Specialties, About, Certified, Located) — the exact section vocabulary `CoachPublicProfile` already uses.

**Upgraded spec (grounded in real components).**
1. **Reuse `CoachPublicProfile`'s data source, not a lite object.** Change the dialog fill (`CoachPreferenceSection.tsx:440-459`) to populate from the public coach read (same query/RPC as `/coaches/:slug`): `location`, `qualifications`, `gyms` ("Trains at"), reputation aggregate (honest ≥5, if anon-readable — **build must confirm**), `introVideoUrl`, `headline`, `yearsExperience`. Only truly-private fields stay null. Where an anon reputation read isn't available, omit that one section — don't block the rest.
2. **Render with the `CoachPublicProfile` visual language, scaled to a dialog.** Bebas name, null-omitting stats row, primary specialty chips, editorial divider sections (Certified / Trains at / Located / reputation), intro-video affordance. Prefer sharing `CoachPublicProfile`'s section sub-components over duplicating markup (`[[feedback_mockups_ground_in_real_components]]`).
3. **Keep the list's recommendation framing, tighten it toward Future's model.** The first best-match card already gets a "Top match" badge — promote it to a slightly richer "recommended" treatment (e.g. a one-line credential from `headline`/`yearsExperience` under the name) so the top of the list reads as a recommendation, not just row #1. Low effort; no new data.
4. **Null-safety.** Every enriched section omits itself when its field is null (a coach mid-setup with no qualifications shows no "Certified" block, not an empty header) — same null-omitting discipline `CoachPublicProfile` already follows.

**RLS question — RESOLVED by the CC scan: the "RLS-gated" claim is false.** Three independent disproofs: (1) `CoachPreferenceSection.tsx:93` calls `list_active_coaches_for_service`, a `SECURITY DEFINER` RPC — RLS does not apply to it at all; it returns 5 columns only because its body selects 5 (`20260707163133_…:20-24,52-57`). (2) `coaches_public` RLS is `USING (auth.uid() IS NOT NULL)` (`20260126053859:337-340`) — any authenticated user reads every column; there is no pre-subscription tier. (3) Every field the dialog nulls is served to **anon** by `get_coach_public_profile_by_slug` (location, qualifications, intro_video_url, years_experience, socials, gyms — `20260711083642:20-49`, `GRANT EXECUTE … TO anon`), and `/meet-our-team` already renders `CoachDetailDialog` fully populated with location + qualifications for anon (`MeetOurTeam.tsx:241,245`).

So the fix is **one `CREATE OR REPLACE`** adding ~8 keys (incl. `slug`) to `list_active_coaches_for_service`'s `jsonb_build_object`, plus deleting the `CoachPreferenceSection.tsx:448-456` null block. No policy change, no new RLS. `CoachDetailDialog` + `CoachPublicProfile` already render every one of those fields and null-omit by design, so populating them is **zero component work**. Adding `slug` also lets the dialog deep-link "View full profile" → `/coaches/:slug`. **In the same PR, fix the two factually-wrong comments** (`CoachPreferenceSection.tsx:448`, `CoachDetailDialog.tsx:14-19`) before anyone builds on them, and add the `useIsMobile` → Drawer branch (the dialog is desktop-only today, `CoachDetailDialog` has 0 `useIsMobile`, and onboarding happens mostly on phones). Effort: **sub-day** — this is now the cheapest item on the board and the highest-intent funnel moment.

---

## CC cross-check folded in — revised P1 order

CC's scan (2026-07-12) reshaped the queue. Two DONE calls were downgraded (AD3 → PARTIAL activity-not-progress digest; MS2 → client-dock-only → split row MS5), ON2's blocker dissolved (above), PUB6 gained a bigger win (fake testimonials), SE1 was re-framed as targeting the wrong system, and a **systemic error-state gap** (0 of 16 surfaces have a visible error branch) was added as **CC10** — bundled with **CC6** because it's the same ~53-file sweep. New rows added to the board: CC9 (`<Card onClick>` a11y), CC10 (error-state sweep), CC11 (i18n/RTL), DS2 (authed-shell flatten), DS3 (shadow discipline + ClickableCard hover-shadow ruling), MS5 (coach/admin dock unread), PUB11 (coach-page Schema.org reputation), BUG13 (coach direct sessions invisible to client).

**Revised P1 build order (CC's call, adopted):**
1. **ON2** — cheapest on the board now (one migration + a deleted null block), highest-intent funnel moment. Fix the two lying comments in the same PR.
2. **CC6 + CC10 bundled** — one sweep: layout-shaped skeleton **and** an error branch per surface. Build 3-4 shared skeleton shells (MetricCard grid, roster row, tab shell) + a shared error state; swap across the ~53 spinner-only files. Zero blast radius, mechanical, and it's currently showing prospects fake testimonials and coaches false all-clears — moved ahead of CT1 now that the error gap is quantified.
3. **CT1** — self-contained (`learn/VideosTab.tsx` + `ExercisesTab.tsx`); add by-coach/equipment chips + a Saved shelf (new favourites table + RLS).
4. **WK10** — net-new authoring UI; **sequence after the SE1 architecture decision** (it writes `direct_calendar_sessions`, the exact table SE1 is about to re-spec around — don't author into a model you're about to change).
5. **SE1 — re-spec from scratch, don't build.** Targets a table the client never reads. Architecture decision gates AD4 + GC1 + BUG13 (see §decision below). CC's recommendation: build request→confirm on the existing `session_bookings` / `coach_time_slots` system (atomic booking, weekly limits, coach slot management already ship) rather than standing up a parallel one on `direct_calendar_sessions`.

Then the P2 UPGRADE batch (CC8/RO5 empty states, CO4 gauge, CO8 reports grid, ST1 settings, CL5 streak, NU6 share card, PUB5/PUB10 public, DS2/DS3 flatten+shadow, CC11 i18n/RTL, MS5, PUB11).

## Decisions this pass raised — LOCKED 2026-07-12

- **SE1 architecture → build on the existing `session_bookings`/`coach_time_slots` system.** Request→confirm is mostly a status column + UI on the system that already has atomic booking, weekly limits, and coach slot management. No parallel `direct_calendar_sessions` booking system. Gates AD4, GC1, BUG13 (BUG13's fix — surfacing coach direct sessions to clients — likely folds into this unification). Re-spec pending.
- **DS3 / ClickableCard hover-shadow → change the primitive.** Swap `clickable-card.tsx:52` `hover:shadow-md` for a border/bg hover so the sanctioned primitive obeys the flat bar; fixes ~26 call sites at source. (Exempting the most-used interactive primitive would hollow out the no-shadow rule.)
- **useIsMobile scope → the rule is narrower.** It applies to content-heavy modals + primary pickers/drawers, not every `Dialog`/`Popover`. CLAUDE.md wording clarified (`:392-396`); genuine offenders (`CoachDetailDialog` — folded into ON2; `NutritionTab` action-pill dialogs) fixed opportunistically, not tracked as 71-file debt.
- **CLAUDE.md fixes → applied (local edits, Hasan to commit).** Removed `react-helmet-async` from the stack line + noted `SEOHead`; rewrote the Nutrition-tab section to the shipped `This week / History / Edit phase` layout with `ActionDialog` pills; added the 5th phase-card status (`Completed`); clarified the `useIsMobile` scope.
