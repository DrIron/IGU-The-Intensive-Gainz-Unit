# PUB1 — Hero social-proof strip (founding-cohort + dormant number slots)

**Status:** Drop-in spec (2026-06-22, Cowork). **Priority / effort:** P1 / M. Frontend only — no DB, RPC, or migration. CMS-driven via the existing `site_content` layer.

## Decided framing (confirmed with Hasan)
Pre-launch reality (verified on prod): **1 active coach, 0 testimonials, 0 paying clients** — so live social-proof numbers are unusable and must NOT be queried. The strip ships:
1. **A founding-cohort line, always visible** (code default, CMS-overridable) — honest social proof that works *because* IGU is new.
2. **A dormant stats row** (athletes / coaches / rating) whose each cell renders only once a real value is entered in admin — so nothing shows as "0" now, and it upgrades to real numbers post-launch with zero code change.

Option 1 (generic qualitative trust cues) was dropped per Hasan. The existing dynamic hero CTA (`getHeroCtaVariant`/`renderHeroCta`) is untouched.

## Verified facts (don't re-derive)
- Hero lives in `src/pages/Index.tsx`. The CTA is wrapped in `<div ref={heroCtaRef} className="flex flex-col items-center gap-4 px-4">{renderHeroCta()}</div>` (~L432-434), inside the centered hero content div that closes at ~L435.
- **PUB4's mobile sticky CTA observes `heroCtaRef`.** The strip must be a **sibling after** that div (not a child), or it changes the observed bounds. Insert between L434 and the closing `</div>` at L435.
- CMS: `useSiteContent("homepage")` (already imported in Index as `cmsContent`) returns `{ section: { key: value } }` from `site_content` rows where `page='homepage'` and `is_active=true`. Add a new section `social_proof`; read it as `cmsContent?.social_proof`.
- `site_content` columns: `page, section, key, value, value_type, sort_order, is_active`. No migration needed — rows are added via the admin site-content editor.

---

## 1) New component — `src/components/marketing/HeroSocialProof.tsx`

```tsx
import { Star } from "lucide-react";

interface HeroSocialProofProps {
  /** cmsContent?.social_proof — the homepage "social_proof" section map (may be undefined pre-CMS). */
  content?: Record<string, string>;
}

const FOUNDING_DEFAULT =
  "Founding cohort now open — onboarding our first members ahead of launch";

export function HeroSocialProof({ content }: HeroSocialProofProps) {
  // Founding line: shown by default; hidden only when admin sets founding_enabled = "false".
  const foundingEnabled = content?.founding_enabled !== "false";
  const foundingLine = (content?.founding_line ?? FOUNDING_DEFAULT).trim();
  const showFounding = foundingEnabled && foundingLine.length > 0;

  // Stat slots: each renders only if its *_value is a non-empty string.
  const stats = [1, 2, 3]
    .map((n) => ({
      value: (content?.[`stat${n}_value`] ?? "").trim(),
      label: (content?.[`stat${n}_label`] ?? "").trim(),
    }))
    .filter((s) => s.value.length > 0);

  if (!showFounding && stats.length === 0) return null;

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      {showFounding && (
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20">
          <Star className="h-3.5 w-3.5 text-primary fill-current" aria-hidden />
          <span className="text-sm font-medium text-primary">{foundingLine}</span>
        </div>
      )}
      {stats.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {stats.map((s, i) => (
            <div key={i} className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground tabular-nums">{s.value}</span>
              {s.label && <span className="text-sm text-muted-foreground">{s.label}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Notes:
- Uses design tokens only (`primary`, `foreground`, `muted-foreground`) — no hardcoded colors.
- `★` is part of the rating cell's *value* if Hasan wants it (e.g. value `★ 4.9`), keeping the stat slots generic. No live DB read anywhere.

## 2) Wire into `src/pages/Index.tsx`

Add the import with the other component imports:
```ts
import { HeroSocialProof } from "@/components/marketing/HeroSocialProof";
```

Insert the strip as a **sibling right after** the `heroCtaRef` div (between L434 and the hero content div's closing `</div>` at ~L435):
```tsx
          <div ref={heroCtaRef} className="flex flex-col items-center gap-4 px-4">
            {renderHeroCta()}
          </div>

          <HeroSocialProof content={cmsContent?.social_proof} />
```

That's the whole code change. With no CMS rows present, the founding line shows (default) and the stats row is absent — launch-day-safe with zero content action.

## 3) CMS content (Hasan, via admin site-content editor — optional, not code-blocking)
Add rows under `page = homepage`, `section = social_proof` to customize/activate:

| key | value (example) | effect |
|---|---|---|
| `founding_line` | `Founding cohort now open — join the first members before July 12` | overrides the default founding line |
| `founding_enabled` | `false` | hides the founding line (use post-launch once real stats are in) |
| `stat1_value` / `stat1_label` | `120` / `athletes coached` | activates stat 1 |
| `stat2_value` / `stat2_label` | `8` / `expert coaches` | activates stat 2 |
| `stat3_value` / `stat3_label` | `★ 4.9` / `average rating` | activates stat 3 |

Each stat appears only when its `*_value` is set, so you can turn them on one at a time as real numbers arrive. (Once PUB6 lands approved testimonials, `stat3` can carry the real average rating.)

## Non-goals / guardrails
- Don't query live counts (coaches/clients/ratings) — they're 1/0/0 and would show "0". Numbers come only from CMS values Hasan enters.
- Don't touch `renderHeroCta` / `getHeroCtaVariant` / `heroCtaRef` (PUB4 depends on the ref).
- Don't touch the existing Testimonials section (that's PUB6).
- No new tables, RPCs, or migrations. `PublicLayout` wrapping unchanged.

## Verify
- `npx tsc --noEmit` clean; `npm run build` clean.
- `/` with no `social_proof` CMS rows: founding pill shows the default line under the CTA; no stats row; no layout break on mobile (hero is `min-h-screen` centered) or desktop.
- Add a `stat1_value`/`stat1_label` row → that stat appears; add all three → full row renders.
- Set `founding_enabled=false` with stats present → only the stats row shows. Set it false with no stats → component renders nothing (returns null), no empty container.
- Confirm PUB4's mobile sticky CTA still toggles correctly (strip is a sibling, observer on `heroCtaRef` unaffected).
