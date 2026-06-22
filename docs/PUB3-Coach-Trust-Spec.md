# PUB3 — Coach trust: surface certifications on MeetOurTeam cards

**Status:** Drop-in spec (2026-06-22, Cowork). **Priority / effort:** P1 / S–M. Frontend only — single-file edit, no DB/RPC/migration. The data is already fetched.

## Goal
Move the coaches' **certifications/qualifications** from dialog-only onto the **card itself**, so the trust signal is visible without a click — trust is the paid-coaching conversion lever. Keep the existing lead-coach styling and the short-bio "philosophy" line.

## Verified facts (don't re-derive)
- `src/pages/MeetOurTeam.tsx` already SELECTs `qualifications` (L49) and the `Coach` interface already has `qualifications: string[] | null` (L22) — **the data is in scope; the card JSX just never renders it.** Today the card shows: avatar, name, Lead badge, location, `short_bio` (CardDescription, `line-clamp-3`), and **specializations only** (L142-158).
- `CoachDetailDialog.tsx` renders the full qualifications list under an **`Award` icon + "Qualifications & Certifications"** heading (L69-84). Match that vocabulary on the card.
- `qualifications` are **free-text strings** (e.g. `"MB BCh BAO (Hons)"`, `"ACE-CPT"`, `"Coaching Physique Athletes-by Dr. Eric Helms"`) — NOT tag codes, so render directly (no `getLabel`, unlike specializations).
- Live data (prod `coaches_directory`): the lead coach has **9 qualifications + 9 specializations** populated; first two quals are `MB BCh BAO (Hons)` and `ACE-CPT`. But `short_bio` and `location` are **empty** for that coach — see Content below.
- Lead styling is a hardcoded name match: `isLeadCoach()` checks `first_name==="hasan" && last_name==="dashti"` (L76-78). Keep it (scoping says preserve lead styling). *Flag for later: this is fragile — it won't mark any other head coach as "Lead", and `coaches_directory` doesn't expose `is_head_coach`. Out of scope for PUB3.*

---

## Change — `src/pages/MeetOurTeam.tsx`

**1. Import `Award`** alongside the existing icon:
```ts
import { MapPin, Award } from "lucide-react";
```

**2. Add a Certifications block** as the FIRST child of `<CardContent className="space-y-3">` (i.e. directly above the existing `{coach.specializations && ...}` block at ~L142), so certs read above specializations:
```tsx
{coach.qualifications && coach.qualifications.length > 0 && (
  <div>
    <div className="flex items-center gap-1.5 mb-2">
      <Award className="h-3.5 w-3.5 text-primary" />
      <h4 className="text-sm font-semibold">Certifications</h4>
    </div>
    <div className="flex flex-wrap gap-2">
      {coach.qualifications.slice(0, 2).map((qual, idx) => (
        <Badge
          key={idx}
          variant="outline"
          className="text-xs max-w-[180px] truncate"
          title={qual}
        >
          {qual}
        </Badge>
      ))}
      {coach.qualifications.length > 2 && (
        <Badge variant="outline" className="text-xs">
          +{coach.qualifications.length - 2} more
        </Badge>
      )}
    </div>
  </div>
)}
```

Behaviour:
- Shows the first 2 quals as outline badges (`max-w-[180px] truncate` + `title` so long ones don't break layout but are readable on hover); a `+N more` badge covers the rest. The card click already opens the dialog with the full list.
- Gated on presence — coaches with no `qualifications` render nothing (no empty heading).

**3. Philosophy / standout line — no code change, content only.** The card already renders `short_bio` as the `CardDescription` (L137-139, `line-clamp-3`). That IS the one-line philosophy/standout slot. It's currently empty for the lead coach, so it shows nothing until populated (see Content).

## Content to-do (Hasan — the conversion driver)
- **`short_bio`** is empty for the active coach → the philosophy line is blank. Populate a 1–2 sentence standout per coach (via the coach profile editor / admin). This is what makes the card persuasive; the code is ready for it.
- **`location`** is also empty → the MapPin line is hidden. Optional.
- **`qualifications`** are well-populated for the lead; ensure other coaches' certs are entered as they're added.

## Non-goals / guardrails
- Don't touch `isLeadCoach` / the lead styling, the dialog, or the specializations block.
- Don't add `getLabel` to qualifications — they're free text, not tag codes.
- No change to the `coaches_directory` query (qualifications already selected), no new fields, no migration. (Per CLAUDE.md, never write `coaches`/`coaches_public` profile columns from here anyway — this is read-only render.)
- `PublicLayout` wrapping unchanged.

## Verify
- `npx tsc --noEmit` clean; `npm run build` clean.
- `/meet-our-team`: the lead coach's card shows a "Certifications" row with `MB BCh BAO (Hons)`, `ACE-CPT`, and `+7 more`; specializations still render below it; Lead badge + ring styling unchanged. A coach with no qualifications shows no Certifications block.
- Dialog still shows the full qualifications list on click.
- **Live anon smoke is waitlist-gated** (same as PUB1): `/meet-our-team` is behind `WaitlistGuard`, and waitlist is currently ON, so an anon view redirects to `/waitlist`. Verify post-merge via an authenticated session (the page renders the same regardless of role) or defer to launch.
