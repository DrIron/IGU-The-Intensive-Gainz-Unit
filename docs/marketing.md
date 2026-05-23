# IGU Marketing Plan — Pre-Launch

> **Status:** Pre-launch, waitlist mode active (`WaitlistGuard` ON, `waitlist_settings.is_enabled = true`).
> **Launch date:** **Sunday, July 12, 2026 — 09:00 Kuwait time.** Waitlist invites fire that morning; public signup opens 48h later (Tue Jul 14 09:00 Kuwait time).
> **Goal of this doc:** turn the existing waitlist + Resend + leads/referrals infrastructure into a deliberate go-to-market plan across Instagram, TikTok, and YouTube, and document the copy/calendar/KPIs so we execute against a single source of truth.
> **Maintainers:** update this doc when channels, positioning, or calendar shift. Phase-by-phase narratives belong in `docs/history.md`.

---

## 1. Brand & Positioning

### Name and voice
- **Brand:** IGU — *The Intensive Gainz Unit*. Never "Dr Iron" anywhere external-facing (CLAUDE.md rule). When the brand name needs to feel premium, write it as "The IGU"; when it's punchy/social, "IGU" alone.
- **Voice:** confident, direct, technical-but-warm. We sound like the best coach in the room, not a wellness influencer. Short sentences. Verbs over adjectives. No motivational-poster clichés.
- **Tone register:** bilingual — English-first for IG/YT, English + Arabic captions for TikTok. Arabic copy mirrors English directness (no over-formal MSA — Kuwaiti/Khaleeji-flavored phrasing where it lands).

### One-line positioning
> "Coach-led training and nutrition, built for serious results in Kuwait and the GCC. Real programs, real coaches, no app-only shortcuts."

### Differentiators (use these everywhere)
1. **Real coach relationships, not just an app.** Every client is matched with a primary coach. We're not selling a workout library.
2. **Multidisciplinary care team.** Coach + dietitian + physio + sports psych + mobility coach when needed. Most competitors give you one person trying to be all five.
3. **Medical screening up front.** PAR-Q gating on intake — we don't program around injuries we don't know about.
4. **Tiered access.** 12 KWD/mo Team Plan → 250 KWD in-person — same standard of programming, different levels of attention. Lowers the entry point without diluting quality.
5. **Built for the region.** Kuwait/GCC realities baked in: Ramadan periodization, summer heat, business-trip travel, family-meal nutrition.

### What we are NOT
- Not a content app. Not a "30-day shred" funnel. Not a supplement company. Not anti-rest-day. Not anti-cardio. Not pro-anything-extreme.

---

## 2. Audience Segments

| Priority | Segment | Pain we solve | Channel skew |
|---|---|---|---|
| **P0** | Men 24–38, Kuwait + GCC expats, intermediate lifters who plateaued on DIY/app programs | "I work hard but I'm not progressing and I don't trust the algorithm" | IG + YT |
| **P0** | Women 25–40, post-pregnancy / return-to-fitness / strength-curious | "I want structured strength training without being treated like a beginner forever" | IG + TT |
| **P1** | Recreational athletes (CrossFit / padel / Hyrox) wanting periodized strength | "I need a real program, not a random WOD" | YT + IG |
| **P1** | Busy professionals 30–45, time-poor, want accountability | "I just need someone to tell me what to do and notice when I skip" | IG + email |
| **P2** | Corporate wellness B2B (defer until post-launch) | — | LinkedIn (later) |

For each launch-window post, label which segment it targets. If a post can't name one, don't ship it.

---

## 3. Pre-Launch Strategy (Now → Launch Day)

The waitlist isn't an email list — it's a sequencing tool. The job before launch is to **expand the waitlist with the right people** and **warm them up enough that the launch invite converts**.

### Existing infrastructure we lean on
- `WaitlistGuard` — landing pages already gate to email capture for unauth visitors.
- `waitlist_settings` (single row, admin-editable) — `heading` and `subheading` can swing the message weekly without a code change. Use this.
- `leads` table — captures UTM params. Every external link must carry `utm_source` + `utm_medium` + `utm_campaign` (see § 7).
- `send-waitlist-confirmation` — fires on signup.
- `send-waitlist-invites` — fires when admin opens the door.
- `process-lead-nurture` cron — Day 1 / 3 / 7 drip for newsletter leads. This is where most of the warming happens.
- `referrals` table with `IGU-NAME-XXXX` codes — turn waitlist signups into referrers the day we launch.

### Three-phase pre-launch arc

**Phase A — Authority (Weeks -8 → -5).** Build credibility before asking for anything. Content is pure education / POV. Waitlist CTA is soft ("we open in [month]"). Goal: brand recognition.

**Phase B — Anticipation (Weeks -4 → -2).** Tease the actual offering. Show coaches, methodology, behind-the-scenes. Waitlist CTA becomes primary ("limited spots, waitlist closes [date]"). Goal: signups + saves/shares.

**Phase C — Scarcity (Week -1 → Launch).** Countdown content. "Last call for waitlist." Coach intros. Goal: convert latent followers to signups, prime existing list for launch email.

### Waitlist heading copy — week-by-week (drop into `waitlist_settings`)

| Week | Dates (Sun-Sat) | Heading | Subheading |
|---|---|---|---|
| -8 → -5 | Sun May 17 -- Sat Jun 13 | "Something serious is coming to Kuwait." | "IGU opens July 12. Coach-led training and nutrition. Get on the list -- we'll tell you first." |
| -4 → -3 | Sun Jun 14 -- Sat Jun 27 | "Spots are limited. The list isn't." | "Join the waitlist and we'll invite you before public signup opens." |
| -2 | Sun Jun 28 -- Sat Jul 4 | "Two weeks out." | "Waitlist invites go out in order. Earlier = better odds at your preferred coach." |
| -1 | Sun Jul 5 -- Sat Jul 11 | "Final week of waitlist invites." | "Public signup opens Sunday, July 12. Waitlist gets a 48-hour head start." |
| Launch | Sun Jul 12 onward | "We're open." | "Waitlist members: check your email. Everyone else: pick your plan below." |

(Subheading uses `--` per email-copy rule even though it's not technically email -- consistency is cheap.)

---

## 4. Content Pillars

Five pillars. Every piece of content maps to exactly one. If it doesn't fit a pillar, we don't ship it.

| # | Pillar | What it is | Why it works | Channel weight |
|---|---|---|---|---|
| 1 | **Execution** | One movement, broken down: function → setup → cues → common errors. Builds on `IGU_MASTER_EXERCISE_LIBRARY_v2.md`. | Highest save rate. Library content. Searchable on YouTube. | YT-heavy, IG carousel, TT cut-down |
| 2 | **POV / philosophy** | Coach talking head: "here's how we program X", "why we don't do Y" | Differentiates from generic fitness content. Builds trust in coaches by name. | IG + TT |
| 3 | **Myth-busting** | Region-specific: Ramadan training, "lifting makes women bulky", "fasted cardio", supplement myths | High share rate. GCC-specific angle competitors miss. | TT-heavy, IG reels |
| 4 | **Transformation** | Client stories (anonymized pre-launch, named with consent post-launch) | Social proof. Converts lurkers. | IG carousel, YT mini-doc |
| 5 | **Behind-the-scenes** | Programming process, coach team, gym setup, training Ramadan, summer logistics | Humanizes. Pre-launch this is *the* anticipation builder. | IG stories, TT |

### Pillar mix targets (pre-launch)
- Execution 35% · POV 20% · Myth-busting 20% · Transformation 10% · BTS 15%
- Re-weight to 30/15/15/25/15 once we have launched clients and can lean on real transformations.

---

## 5. Channel Playbooks

### Instagram (primary)
- **Cadence:** 5 posts/week + daily story. Mix: 2 Reels, 2 Carousels, 1 single image quote/announcement.
- **Reels:** 15–30s. Hook in first 2s. Subtitles burned in (Arabic + English where possible). End with one CTA — "Join the waitlist, link in bio" for pre-launch; rotate post-launch.
- **Carousels:** 7–10 slides. Slide 1 = strong hook. Slide 2 = problem framing. Slides 3–8 = teach. Final slide = soft CTA + brand mark. Save rate is the KPI.
- **Stories:** daily. BTS pillar lives here. Polls and Q&A to harvest content ideas. End-of-week story highlights become the next week's pillar drafts.
- **Bio:** rotate the CTA line with the waitlist weekly heading. Link goes to a UTM'd landing.

### TikTok (acceleration)
- **Cadence:** 4–6 posts/week. TT rewards volume; if a video doesn't take off in 48h, ship the next one — don't dwell.
- **Format:** 9:16, 20–45s. Hook in first 1s. Coach-on-camera over text-on-screen wherever feasible — face beats slideshow.
- **Sound:** trending sounds for Myth-busting and BTS. Original audio for Execution and POV.
- **Hashtags:** `#kuwaitfitness #q8gym #gulffitness #strengthtraining` + 2 movement-specific. Avoid generic `#fitness`.

### YouTube (compound interest)
- **Cadence:** 1 long-form (8–15 min) per week + 2 Shorts (re-cut from Reels/TT).
- **Long-form structure:** [Hook 0:00] [Problem 0:30] [Teaching 1:30] [Demo 4:00] [Common errors 7:00] [Program application 10:00] [CTA + waitlist 12:00].
- **Titles:** SEO over cleverness. "Romanian Deadlift -- The 4 Mistakes Killing Your Hamstring Gains" beats "RDL Done Right". (Note: hyphens, not em-dash, to keep tooling consistent.)
- **Thumbnails:** face + one bold word. No five-text-element clutter.
- **Description:** waitlist link first, chapters second, coach bio + IG/TT links last. All links UTM'd.

---

## 6. 4-Week Pre-Launch Content Calendar (Phase C → Launch Week)

**Launch locked: Sunday, July 12, 2026.** Weeks run Sun-Sat (GCC work week). Phase A (Weeks -8 → -5, **Sun May 17 -- Sat Jun 13**) follows a looser, education-first cadence -- batch-record before the dated calendar below kicks in at Week -4.

### Week -4 — Sun Jun 14 to Sat Jun 20 (Phase B begins)
| Date | IG | TikTok | YouTube |
|---|---|---|---|
| Sun Jun 14 | Reel: Execution -- barbell row setup cues | — | — |
| Mon Jun 15 | Carousel: 5 myths about Ramadan training | TT: same myth #1 standalone | — |
| Tue Jun 16 | Story poll: "biggest plateau this year?" | TT: Coach POV -- why we deload | — |
| Wed Jun 17 | Reel: Coach intro #1 (lead coach) | — | YT long: "How we program for the GCC summer" |
| Thu Jun 18 | Carousel: Anonymized transformation #1 | TT: 60-sec version of transformation | — |
| Fri Jun 19 | Single image: waitlist CTA + spots remaining | TT: Behind-the-scenes -- programming session | — |
| Sat Jun 20 | Story takeover: coach answers DMs | — | YT Short: rep cadence |

### Week -3 — Sun Jun 21 to Sat Jun 27
| Date | IG | TikTok | YouTube |
|---|---|---|---|
| Sun Jun 21 | Reel: Execution -- RDL common errors | TT: same content, faster cut | — |
| Mon Jun 22 | Carousel: "What 12 KWD/month actually gets you" (Team Plan breakdown) | — | — |
| Tue Jun 23 | Reel: Coach intro #2 (dietitian) | TT: Coach POV -- when we recommend a dietitian | — |
| Wed Jun 24 | Carousel: Myth-bust -- fasted cardio for fat loss | TT: same | YT long: "The 4-week onboarding -- what to expect" |
| Thu Jun 25 | Reel: BTS -- programming for a real client | TT: trending sound + lift fail compilation (educational angle) | — |
| Fri Jun 26 | Story Q&A | TT: Myth -- women + lifting | — |
| Sat Jun 27 | Single image: waitlist CTA | — | YT Short: brace before you load |

### Week -2 — Sun Jun 28 to Sat Jul 4
| Date | IG | TikTok | YouTube |
|---|---|---|---|
| Sun Jun 28 | Reel: Execution -- split squat | TT: same | — |
| Mon Jun 29 | Carousel: Coach team grid (all coaches, names + specialisations) | — | — |
| Tue Jun 30 | Reel: Transformation #2 | TT: same | YT long: "Why we screen with PAR-Q -- and what we've caught" |
| Wed Jul 1 | Carousel: "What does the in-person tier include?" | TT: Coach POV -- when in-person is worth it | — |
| Thu Jul 2 | Reel: Myth -- supplements vs sleep | TT: same | — |
| Fri Jul 3 | Story countdown sticker -- 9 days | TT: BTS -- coach morning routine | — |
| Sat Jul 4 | Carousel: full FAQ | — | YT Short: hinge vs squat |

### Week -1 — Sun Jul 5 to Sat Jul 11 (Phase C: Scarcity)
| Date | IG | TikTok | YouTube |
|---|---|---|---|
| Sun Jul 5 | Reel: "Waitlist closes Friday Jul 10" | TT: same | — |
| Mon Jul 6 | Carousel: Founder/lead-coach POV -- why we built IGU | TT: 60s version | — |
| Tue Jul 7 | Reel: BTS -- final gym walkthrough | TT: same | YT long: "Inside IGU -- a day in the gym" |
| Wed Jul 8 | Story countdown -- 96h | TT: Coach Q&A | — |
| Thu Jul 9 | Reel: "Waitlist closing 24h" reminder | TT: same | — |
| Fri Jul 10 | Reel: "Last call -- waitlist closes tonight midnight" | TT: Coach intro #3 | — |
| Sat Jul 11 | Story: "Doors open tomorrow" + Carousel: launch-day preview | TT: 24h countdown | YT Short: final hype |

### Launch Day — Sunday, July 12, 2026
- IG: Reel announcement + Carousel of plans + Story takeover all day.
- TT: 3-4 posts spaced across the day. One coach-on-camera "we're open" + 2 plan-explainers + 1 "what to expect after you sign up".
- YT: Launch-day video pinned to channel.
- Waitlist email batch goes out **09:00 Kuwait time** (`send-waitlist-invites`).
- Public signup opens **48 hours later** -- Tue Jul 14 at 09:00 Kuwait time. Update `WaitlistGuard` toggle at that moment.
- Public CTA appears in bios and ends of every piece.

---

## 7. UTM & Tracking Conventions

Every external link uses these. `leads.utm_*` columns capture them automatically.

```
utm_source   = instagram | tiktok | youtube | email | whatsapp
utm_medium   = bio | story | reel_caption | description | drip
utm_campaign = prelaunch_w4 | prelaunch_w3 | prelaunch_w2 | prelaunch_w1 | launch_day | postlaunch_ref
utm_content  = [pillar]_[short-slug]     # e.g. execution_rdl, myth_ramadan
```

Example:
```
https://theigu.com/?utm_source=instagram&utm_medium=bio&utm_campaign=prelaunch_w3&utm_content=execution_rdl
```

Audit weekly: `SELECT utm_source, utm_campaign, COUNT(*) FROM leads GROUP BY 1, 2 ORDER BY 3 DESC`.

---

## 8. Sample Copy — Drafts

### 8.1 Instagram Captions

**1) Execution pillar — Reel**
> Most "back days" are actually arm days.
>
> The barbell row is one of the most miscued lifts in any gym. Here's what the cue "row to your belly" gets wrong -- and the three checkpoints we use with every client.
>
> 1. Hinge first. Chest faces the floor, not the mirror.
> 2. Elbows track *back*, not flared.
> 3. Pull to the bottom of your sternum, not your navel.
>
> Save this for your next pull session.
>
> IGU opens in [Month]. Waitlist link in bio.

**2) Myth-busting pillar — Carousel**
> "I'll lose all my gains in Ramadan." → No, you won't.
>
> What you'll lose is bad programming. Here's how we periodize training for the 30 days, and why most people come out stronger than they went in.
>
> [Slide 2-7 teach the protocol]
>
> Waitlist for our Ramadan protocol intake: link in bio.

**3) POV pillar — Reel**
> Why we don't run "shred programs."
>
> A 6-week shred is a marketing decision, not a coaching decision. Your body doesn't respect arbitrary deadlines. Our programs run in 12-week blocks because that's what produces composition change without injury risk.
>
> If you want a coach who'll tell you the truth about timelines, IGU opens in [Month]. Link in bio.

**4) Transformation pillar — Carousel (anonymized pre-launch)**
> 24 weeks. From "I can't deadlift, my back hurts" to a pain-free 140kg pull.
>
> Not the gym. Not the supplement stack. The programming.
>
> [Slides 2-8: timeline, what changed each block, key data points]
>
> If you've been told to "just rest your back," there's a better answer. Waitlist: link in bio.

**5) BTS pillar — Reel**
> What a real programming session looks like.
>
> Not vibes. Not templates. We review three weeks of training data, weight trend, sleep, and bar-speed notes before we touch your next block.
>
> This is what 12 KWD/month gets you on our Team Plan -- the same review process, scaled.
>
> Waitlist link in bio.

**6) POV pillar — Reel (coach intro)**
> Meet [Coach First Name].
>
> [Specialisation] coach at IGU. [One-line credential]. Has worked with [type of client] for [N] years.
>
> Specialises in: [3 short tags].
>
> Pick your coach when you sign up. IGU opens [Month]. Waitlist: link in bio.

**7) Myth-busting — Reel**
> "Lifting will make me bulky."
>
> Show me the woman who got "bulky" by accident.
>
> Hypertrophy is hard. We have to *try* to make it happen. What lifting actually does for most women: posture, energy, sleep, bone density, and the ability to carry your own groceries when you're 65.
>
> If you want a strength program built for actual goals, IGU's waitlist is in our bio.

**8) Single image — Final call**
> Waitlist closes Friday at midnight.
>
> Public signup opens Sunday. Waitlist members get 48 hours of head start and priority on coach selection.
>
> Link in bio.

### 8.2 TikTok Hooks (first 1-second line)

1. "Stop rowing like this. You're not training your back, you're training your biceps."
2. "Three things every coach in Kuwait tells you that are quietly wrong."
3. "I'm a strength coach. Here's what 12 KWD/month should actually buy you."
4. "Ramadan is not an excuse to stop training. It's a programming problem."
5. "If your trainer hasn't asked about your sleep, find a new trainer."
6. "This is what happens when you skip the PAR-Q. We had a client who --"

### 8.3 YouTube Video Concepts (titles + 1-line angles)

1. **"How We Program for the GCC Summer (Heat, Hydration, and Volume)"** — region-specific, evergreen, no one else makes this.
2. **"The 4-Week IGU Onboarding -- What Actually Happens"** — funnel content, converts the "what does it look like" objection.
3. **"Why We Screen Every Client with a PAR-Q (And What We've Caught)"** — trust + differentiator + medical-credibility content.
4. **"Inside IGU -- A Day in Our Gym"** — launch-week hype piece. Pin to channel.
5. **"Romanian Deadlift -- The 4 Mistakes Killing Your Hamstring Gains"** — SEO + execution pillar; ranks for high-intent search.

### 8.4 Waitlist Email Sequence (Resend, via `_shared/emailTemplate`)

> **Rules reminder:** use `--` not `—`. `From:` uses one of the `EMAIL_FROM_*` constants. `showUnsubscribe: true` on every email in this sequence.

**Email 1 — Confirmation (immediate, via `send-waitlist-confirmation`)**
> Subject: You're on the IGU waitlist
>
> Hi [first name],
>
> You're in. We're opening doors in [Month], and waitlist members hear from us first.
>
> Here's what to expect:
>
> -- A short note from us every few days with execution breakdowns, programming POV, and the occasional myth-bust.
> -- An invite email when your spot opens. You'll have 48 hours to claim it before we move down the list.
> -- Priority on coach selection -- earlier signups choose first.
>
> If you didn't sign up, reply and we'll remove you.
>
> -- The IGU team

**Email 2 — Day 3 nurture (via `process-lead-nurture`)**
> Subject: The thing most coaches won't tell you about Ramadan training
>
> [Body teaches the protocol -- 4 short paragraphs. Links to the YouTube long-form. Ends with: "Reply if you want us to flag your file for a Ramadan-specific intake."]

**Email 3 — Day 7 nurture (via `process-lead-nurture`)**
> Subject: What 12 KWD/month actually gets you
>
> [Body breaks down the Team Plan tier -- what's in it, what's not, why it exists. Compares honestly to the higher tiers. Ends with: "Reply with the tier you're considering and we'll prepare your onboarding accordingly."]

**Email 4 — T-7 days before launch (manual send)**
> Subject: One week out
>
> [Body: launch date (Sun July 12), what to expect, how the invite system works, how to choose your coach. CTA is "watch your inbox Sunday July 12 at 9am Kuwait time."]

**Email 5 — Launch day invite (via `send-waitlist-invites`)**
> Subject: Your IGU spot is ready
>
> [Body: short, direct. Personalized link. 48-hour clock. Coach selection link. Final line: "If now isn't the right time, reply and we'll hold your spot for the next intake."]

---

## 9. Post-Launch — First-30-Days Plan (Sketch)

To be expanded after launch. High-level:

- **Days 1-7 (Sun Jul 12 -- Sat Jul 18):** thank-you content (story takeover with new clients, with consent), referral code rollout -- every active client gets `IGU-NAME-XXXX` via `referrals` table, post-onboarding email surfaces it.
- **Days 8-21 (Sun Jul 19 -- Sat Aug 1):** real (not anonymized) transformation drips begin. First testimonial-request emails fire at 4 weeks active via `process-testimonial-requests`.
- **Days 22-30 (Sun Aug 2 -- Mon Aug 10):** first paid acquisition test. Budget cap: [TBD]. Channels: Meta + TikTok ads. Creative is repurposed top-performing organic, not net-new. Funnel: ad → landing page → waitlist (now "intake form" UX) → onboarding.

---

## 10. KPIs and Reporting

Weekly review every Sunday. Track:

| Metric | Source | Target (pre-launch) |
|---|---|---|
| Waitlist signups / week | `leads` table | 50+ by Week -4, 150+ by Week -1 |
| IG followers gained / week | IG insights | net +5% week-over-week |
| TT followers gained / week | TT insights | +10% week-over-week (volume game) |
| YT subscribers / week | YT studio | +50/week minimum |
| Save rate (IG) | IG insights | >5% on Execution and Myth pillars |
| Share rate (IG/TT) | platform insights | >2% on Myth pillar |
| Waitlist → invited → onboarded | edge function logs + `subscriptions` | >40% invite acceptance |
| Referral codes generated post-launch | `referrals` table | 60%+ of active clients within 30 days |

If a pillar underperforms two weeks in a row, re-weight the mix the following Sunday. Don't wait for a third data point — small audience means signal moves fast.

---

## 11. Production Notes

- **Filming kit:** one camera person on retainer + one editor. Batch-record 2 days/week, edit + schedule the rest of the week.
- **Approval flow:** lead coach reviews any clinical / programming claim before publish. Anything mentioning PAR-Q outcomes or transformation data goes through medical-claims review first.
- **Asset library:** keep raw footage in [TBD cloud bucket]. Folder convention: `YYYY-MM-DD_pillar_short-slug/`.
- **Caption file:** keep all caption drafts in a shared doc (Notion / GDrive) with status `Draft / Approved / Scheduled / Published`. Don't write captions in IG's composer — too easy to lose.
- **Arabic copy:** every shipped caption gets an Arabic version below the English. Do not use machine translation -- one of the coaches reviews each.

---

## 12. Open Questions / Decisions Needed

Decide before Week -4:

1. ~~Launch date~~ — **LOCKED: Sunday, July 12, 2026.** All calendar references back-filled.
2. Filming kit and editor — in-house, freelance, or agency?
3. Paid-ads budget cap for days 22-30 post-launch.
4. Whether `/coach-signup` stays public during launch week or gates behind invite (current code: public, no `WaitlistGuard`).
5. Whether we run a referral-bonus promo at launch (e.g. first-month discount for referrer + referee) — requires a Tap discount-code path and an addition to `referrals`.
6. Arabic content lead — which coach (or external) signs off on Arabic copy each week.

---

## 13. Related Files

- `CLAUDE.md` — branding rules, email-copy `--` rule, waitlist guard locations.
- `src/components/WaitlistGuard.tsx` — gating logic.
- `supabase/migrations/` — `waitlist_settings`, `leads`, `referrals` schemas.
- `supabase/functions/send-waitlist-confirmation/`
- `supabase/functions/send-waitlist-invites/`
- `supabase/functions/process-lead-nurture/`
- `supabase/functions/process-testimonial-requests/`
- `supabase/functions/process-referral-reminders/`
- `supabase/functions/_shared/emailTemplate.ts`, `emailComponents.ts`, `config.ts`
