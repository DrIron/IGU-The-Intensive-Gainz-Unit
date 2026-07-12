# PUB8 — Align public/marketing pages with the app's flat visual language

**Status:** Build handoff (2026-07-04, Cowork). **Owner:** terminal. Cowork verifies on prod.
**Decision (Hasan, 2026-07-04): strict app-parity — flatten everything** (no gradients, no glow, no grid-pattern, no shadows on public pages). **Buttons are OUT of scope here** — the gradient CTA is app-wide (28 usages) and is retired separately in `docs/BTN1_RETIRE_GRADIENT_BUTTONS_BUILD.md`. PUB8 does the non-button flatten. Purely visual; no layout/behavior/content change.

Board: PUB8 (Public/Marketing, brand cohesion). Siblings PUB5/6/7/10 are **content** restructures (outcome-focused steps, outcomes-first testimonials, real-objection FAQ, waitlist value) — NOT part of this visual sweep; leave for separate slices.

## Target language (from `src/index.css` + `tailwind.config`)
Geist sans / Bebas Neue display (`font-display`) / JetBrains Mono; font-weight capped ~600 (no `font-bold`/700+); FLAT cards (`bg-card border border-border`, no shadow); HSL token colors only (`--primary` red `355 78% 48%`, `--muted-foreground`, `--status-*`); `--radius: 0.75rem`. Already-clean (do NOT churn): `PublicLayout.tsx`, `Footer.tsx`, `FAQSection.tsx`, `HeroSocialProof.tsx`, `ComparisonTable.tsx`, `Services.tsx`.

## Per-file changes (file:line from 2026-07-04 audit — verify before editing)

### `src/index.css`
- Delete `.grid-pattern` (213–219) and `.red-glow` + `.red-glow::before` (221–237) — **all consumers are public and are removed below**, so the classes become unused.
- Remove the now-dead `--red-glow` var (106) — `.red-glow::before` uses a literal, nothing else reads it.
- Dead tokens (grep-confirmed 0 consumers in `src/`): `--gradient-primary`, `--gradient-accent`, `--gradient-hero`, `--shadow-glow`, `--shadow-card` (both `:root` + `.dark`). **Check `tailwind.config` `boxShadow`/`backgroundImage` references first**; if none, remove them. If any remain referenced, leave that one.

### `src/pages/Index.tsx`
- Remove inline `style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}` on hero CTA text (326, 342, 357, 374).
- Hero overlay `bg-gradient-to-b from-background/90 via-background/70 to-background` (405) → flat `bg-background` (or drop the overlay div).
- Remove `grid-pattern` (408) and `red-glow` (409, 699) class usages.
- Feature cards `hover:shadow-lg hover:shadow-primary/5` (469) → drop shadow; hover via `hover:border-primary/50` (flat card language).
- CTA section `bg-gradient-to-b from-background to-primary/5` (698) → flat `bg-background` (or `bg-card`).

### `src/components/ServiceCard.tsx`
- `hover:shadow-lg hover:shadow-primary/20` (23) + `shadow-lg shadow-primary/10` on `mostPopular` (25) → remove shadows. Distinguish "most popular" with `border-primary` (token) instead of shadow.
- Card fill `bg-gradient-to-br from-primary/5 to-accent/5` (28) → flat `bg-card`.
- Price `bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent` (50) → solid `text-primary`.
- `font-bold` (39) → `font-semibold` (capped).
- Gradient button (66) → **BTN1** (leave; that slice converts it).

### `src/pages/Waitlist.tsx`
- `bg-black` (102) → `bg-background`.
- Remove `grid-pattern` (104) + `red-glow` (106).
- Card `shadow-2xl` + `bg-card/90 backdrop-blur-sm` (124) → `bg-card border border-border` (drop shadow, blur, opacity).
- Gradient button (172) → **BTN1**.

### `src/pages/Testimonial.tsx`
- Page `bg-gradient-to-b from-background to-secondary/20` (168) → `bg-background`.
- Stars `fill-yellow-400 text-yellow-400` / empty `text-gray-300` (199–201) → filled `fill-primary text-primary` (matches `Index.tsx:634`), empty `text-muted-foreground`.

### `src/pages/MeetOurTeam.tsx`
- ClickableCard `hover:shadow-lg transition-all hover:scale-[1.02]` (110) → drop shadow + scale; hover via `hover:border-primary/50`.
- Lead-coach `border-primary/50 ring-1 ring-primary/20` (111) → drop the ring; keep `border-primary` as the emphasis (flat).

### `src/components/marketing/HowItWorksSection.tsx`
- Remove `grid-pattern opacity-10` (63).
- Connector `bg-gradient-to-r from-primary/50 to-primary/20` (82) → solid `bg-border` (or `bg-primary/30`).

## Verify (Cowork, prod after merge)
- `grep -rnE 'shadow-(sm|md|lg|xl|2xl)|bg-gradient|grid-pattern|red-glow|(fill|text|bg)-(yellow|gray)-[0-9]|bg-black|textShadow|font-bold' src/pages/Index.tsx src/pages/Waitlist.tsx src/pages/Testimonial.tsx src/pages/MeetOurTeam.tsx src/components/ServiceCard.tsx src/components/marketing/HowItWorksSection.tsx` → clean (the only remaining `bg-gradient` are the BTN1-owned buttons until that slice lands).
- Visual smoke each public page on prod (waitlist mode may gate some; check both waitlist-on and signed-out where reachable): Index (hero, features, pricing/ServiceCard, testimonials, CTA), Services, Testimonial, Meet Our Team, Waitlist, How It Works. Each reads as the flat app language — no glow/grid/gradient/shadow, tokenized colors, capped weights.
- tsc/build clean; CI green; no console errors; nav/footer unchanged.

## Out of scope (flag, don't do here)
Buttons (BTN1). PUB5/6/7/10 content restructures. Any app-interior surface. The `--transition-smooth` var + `.fade-up` scroll animation stay (motion, not the flat-card concern).
