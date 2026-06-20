# PUB* — Public / Marketing launch pass (scoping & sequencing)

**Authored 2026-06-20 (Cowork).** Launch context: public launch **Sun Jul 12 2026** (Kuwait), signup opens **Tue Jul 14** — there is a waitlist-capture window between the two. This doc sequences PUB1–PUB10 into build waves and splits **code work** from **content/config** (CMS or admin), so we don't spend dev cycles on things Hasan can edit directly.

This is a *scoping* doc, not 10 implementation specs. Each item gets a full drop-in spec (CL2/HX1/NU3 style) when its wave starts.

---

## What's already solid (don't rebuild)

- **Auth-aware hero CTA** (`getHeroCtaVariant` in `Index.tsx`) — branches logged-out / active / cancelled / pending correctly. Keep.
- **CMS content layer** (`useSiteContent` / `site_content`) — hero subtitle/badge, features, How-It-Works steps, FAQ items are all editable without code. Many "gaps" below are **content edits**, flagged 📝.
- **Design tokens unified** — `--status-*`, `--macro-*`, `--chart-*`, gradients, fonts in `index.css`; marketing already consumes them via Tailwind. PUB8 is largely a documentation/audit task, not a re-theme.
- **SEOHead** (`react-helmet-async`) — per-page title/description/OG/Twitter already wired; Index/Services/MeetOurTeam/Waitlist already override. PUB9 is mostly asset + schema work, not plumbing.
- **Responsive carousels + LCP** — services carousels and `fetchPriority="high"` hero image exist. PUB4's real gap is a sticky mobile CTA + an `index.html` hero preload, not a mobile rebuild.

---

## Build waves

### Wave 1 — Conversion core (do first; all P1)
The three items that move signup rate the most. Target: complete before Jul 12.

| Item | Surface | The actual change | Effort | Code/Content |
|---|---|---|---|---|
| **PUB1** | `Index.tsx` hero | Add an above-the-fold social-proof strip under the CTA: client/coach count + avg testimonial rating + a cert/trust line. Keep the existing dynamic CTA untouched. Default badge content so it's not empty pre-CMS. | M | Code (strip) + 📝 (numbers) |
| **PUB2** | `Services.tsx`, `ServiceCard.tsx`, `ComparisonTable.tsx` | Add a single **"Most popular"** badge + emphasized card (the table already highlights Hybrid — make the *card* match), tighten per-card CTA copy, surface the team-plan start-date on Services (currently only on Index). | M | Code |
| **PUB4** | `Index.tsx`, `index.html` | Sticky bottom **"Choose your plan"** CTA bar on mobile (hide when hero CTA is in view); add `<link rel="preload" as="image">` for the hero in `index.html` (component-level preload only today). | S | Code |

### Wave 2 — Trust & shareability (high ROI; pull P2s forward)
| Item | Surface | The actual change | Effort | Code/Content |
|---|---|---|---|---|
| **PUB3** | `MeetOurTeam.tsx`, `CoachDetailDialog.tsx` | Surface **certifications/qualifications on the card** (currently dialog-only), add a one-line philosophy/standout, keep the lead-coach styling. Pure render of fields already in `coaches_directory`. | M | Code + 📝 (coach copy) |
| **PUB9** | `SEOHead.tsx`, `index.html`, `/public` | Produce a real **OG share image** (1200×630), validate the `og-image.png` URL, add `Service`/`LocalBusiness` (Kuwait) structured data alongside the existing Organization schema. | S | Code + asset |
| **PUB6** | `Index.tsx` testimonials | Lead with **outcome** (result + author) over stars; add a "view all" link to the existing `/testimonial` page; CTA below the section. | S | Code + 📝 (approve testimonials) |

### Wave 3 — Polish & objections (P2; after Wave 1–2)
| Item | Surface | The actual change | Effort | Code/Content |
|---|---|---|---|---|
| **PUB5** | `HowItWorksSection.tsx` | Add a duration/timeline cue per step; outcome-focused copy. | S | 📝 mostly (CMS) |
| **PUB7** | `FAQSection.tsx` | Ensure the 8 FAQs answer real signup objections (price, commitment, refunds, medical/PAR-Q). | S | 📝 (CMS content) |
| **PUB8** | `PublicLayout.tsx`, `Footer`, `index.css` | Audit marketing↔app token parity; write a short tokens note. No re-theme expected. | M | Code/audit |
| **PUB10** | `Waitlist.tsx` | Clear "what happens next" expectation; optional referral/share line. Relevant in the Jul 12–14 capture window. | S | Code + 📝 |

---

## Recommended order & rationale

1. **PUB4** first (S, mobile sticky CTA + preload) — smallest, mobile-heavy audience, unblocks conversion measurement.
2. **PUB1** (hero social proof) — biggest first-impression lever; pair with PUB6 testimonial approval so the numbers are real.
3. **PUB2** (pricing clarity) — decision-stage conversion.
4. **PUB9** (SEO/OG) — cheap, and every pre-launch share needs a real OG image; do before any promotion goes out.
5. **PUB3** (coach trust) — trust is the paid-coaching conversion lever.
6. Remainder (PUB6 → PUB5 → PUB7 → PUB10 → PUB8) as time allows before/just after launch.

## Dependencies & flags
- **Content vs code:** PUB5 and PUB7 are mostly CMS content Hasan can edit via the admin site-content editor — confirm before speccing dev work. PUB1/PUB3/PUB6 need real numbers/testimonials/coach copy to land well (code can ship with sensible defaults, but the *content* is the conversion driver).
- **Waitlist state:** currently disabled by default; if the Jul 12–14 window runs waitlist-on, PUB10 + PUB1 are the pre-signup capture surfaces — prioritize accordingly.
- **No new tables/RPCs/migrations** anticipated for any PUB item. PUB9's OG image is a static asset.
- **PublicLayout rule (CLAUDE.md):** every public page stays wrapped in `<PublicLayout>`; never add `<Navigation>`/`<Footer>` inside a page.

## Next step
On your word, I'll write the full drop-in spec for **PUB4** (then PUB1), same format as the CL2/HX1/NU3 specs. PUB4 is self-contained and conflicts with nothing in the current CL2/HX1/NU3 lane (different files), so it could even be built in parallel with those PRs.
