# IGU Design Backlog — Reconciliation Report

_2026-07-12. Design-owner Cowork session. Deliverable #1 of §6 (DESIGN_TRACK_HANDOVER.md)._

Row-by-row pass over every **non-Shipped** row in `docs/IGU-Design-Changes-Master.xlsx` → "Design Changes" tab. Each classified `DONE/SUPERSEDED | UPGRADE | KEEP`. Sheet `Status` column updated in place to match (dated `2026-07-12`).

Legend: **DONE** = ship-state now covers it → close. **UPGRADE** = still open but the recommendation was written below the current bar (§3 of handover) → re-spec. **KEEP** = still open and still correctly specced → leave, priority confirmed.

---

## 0. Headline corrections (read first)

Two of the handover's "confirmed supersedes" did **not** hold up against the code, and two blank rows are actually already shipped. Recent work is not sacred — verifying against `file:line` changed four verdicts:

| Item | Handover said | Verified verdict | Why it matters |
|---|---|---|---|
| **ON2** | SUPERSEDED by `/coaches/:slug` | **PARTIAL — decision needed** | Rich `CoachPublicProfile` shipped, but onboarding selection intentionally renders a **lite** `CoachDetailDialog` (`CoachPreferenceSection.tsx:437-460` — location/qualifications nulled, "RLS-gated pre-subscription"). The onboarding half is not done; it's deliberately thin. |
| **PUB6** | SUPERSEDED by testimonials system | **UPGRADE — targeted** | `WeightChangeProof` proof chips DO render on the public `TestimonialsList` (`TestimonialsList.tsx:108-139`, used by both `Index.tsx:572` and `/testimonials`), but the card **leads with a star row**, then quote, then proof, then author. PUB6's literal ask was "lead with outcomes, not stars." Card re-order remains. |
| **AD3** | blank / open | **DONE** | `send-weekly-coach-digest/index.ts` sends a real roster-progress digest (total / active-this-week / inactive / new + inactive names, body lines 132-155), cron-wired `0 7 * * 1` (`vercel.json:4`). |
| **MS2** | Blocked on CC3 | **DONE** | Bottom-nav unread badge shipped: `MobileBottomNav.tsx:15-16,90-97` badge slot + `App.tsx:142-144` wires `useUnreadMessageCount` onto the `/messages` dock item. CC3 dependency resolved. |

Also confirmed effectively done: **CARE1** (role-coloured chips `CareTeamCard.tsx:85-95,321`; staff-only banner `:236-240`; own-vs-other bubbles `CareTeamMessagesPanel.tsx:403-467`) — only @-mention syntax absent, which is optional.

---

## 1. Full reconciliation table

### P1 items (do these first in the upgrade pass)

| ID | Recommendation (short) | Verdict | Note |
|---|---|---|---|
| **CC6** | Coach content surfaces → layout-shaped skeletons | **KEEP** | PARTIAL is accurate — client uses `Skeleton` (~14 sites), coach still full-page spinner (~102). When built, shape skeletons to the real coach components (MetricCard grids, roster rows), not generic bars. Still P1. |
| **NU2** | TDEE trend over the phase | **KEEP (BLOCKED)** | Correctly reasoned block — real/reverse TDEE needs calories-consumed (food logging, FOR_LATER). Formula-only TDEE is a low-insight curve, not worth it. Revisit after food logging. |
| **MS2** | Unread count on bottom nav | **DONE** | Shipped (see §0). Reclassify SHIPPED. |
| **ON1** | Intake as quiz + Skip on optional | **KEEP** | PARTIAL is accurate — `StepIndicator` + single-focus steps exist; the missing piece is a Skip affordance on optional steps + light momentum polish. Small remaining scope. |
| **ON2** | Coach selection → rich profile | **UPGRADE + DECISION** | See §0 + §2 Decision 1. Public profile done; onboarding dialog deliberately lite. Re-scope, don't close. |
| **CT1** | Content library: filter chips + Saved shelf | **KEEP** | PARTIAL accurate — Learn has search + category; missing by-coach/equipment chips + Saved/Favourites shelf. Still valid. |
| **WK10** | Coach client Workouts: per-day +menu authoring | **KEEP (upgrade spec)** | PARTIAL accurate — read-only `ClientScheduleCalendar` exists; net-new authoring +menu (Blank/Saved/Assign/Create in-context) is open. Re-ground spec in TrueCoach/Runna Mobbin during upgrade pass. |
| **SE1** | Sessions: grouped lists + request→confirm booking | **KEEP (spec stale — fix)** | Spec `docs/SE-Sessions-Tab-Booking-Spec.md` assumes both surfaces read `direct_calendar_sessions`; client `/sessions` reads a different model. Spec needs a data-model correction before build (handover §5.2 "upgrade the plans"). |

### P2 items

| ID | Recommendation (short) | Verdict | Note |
|---|---|---|---|
| **CC8** | Empty-state audit + optional illustration slot | **UPGRADE** | `EmptyState` primitive is now house style. Re-scope to coverage audit + a tasteful mono-icon/illustration slot in the current flat aesthetic. Merge conceptually with RO5. |
| **CL5** | Streak / consistency indicator near hero | **UPGRADE** | Re-spec to current bar (mono counter, gentle framing — no pressure per wellbeing). Overlaps AD2. Ground in Oura/Ladder. |
| **CO4** | Capacity as a filled gauge | **UPGRADE** | `EnhancedCapacityCard.tsx` exists — re-spec as a MetricCard-family gauge (18/25) in current tokens. |
| **CO8** | Reports: date-range + metric-card grid | **UPGRADE** | Now clearly a MetricCard grid (CC1 house style) + date-range filter. Consistent coach/admin analytics. |
| **RO5** | Satisfying roster empty states | **UPGRADE** | Merge with CC8. "No clients need attention — nice." in the flat/mono empty-state style. |
| **WK5** | Set-type affordance (warmup/drop/failure) | **KEEP** | Still valid, correctly specced. Ground in Hevy set-type chip during build. |
| **WK6** | Share spacing/type between strength & activity grids | **KEEP** | Internal consistency, still valid. |
| **HX5** | Muscle / volume distribution view | **KEEP (upgrade spec)** | High value; `useMusclePlanVolume` already computes volume (reuse). Ground in Hevy muscle/body distribution. |
| **NU6** | Shareable phase-summary image card | **UPGRADE** | `PhaseSummaryReport.tsx` → branded exportable image in current bar (Bebas hero number, crimson, flat, `WeightChangeProof` chip). Cheapest organic-growth lever. Ground in WHOOP sharing. |
| **MS3** | Team / community channel + cheers | **KEEP** | Net-new (existing `coach_client_messages`/`care_team_messages` don't cover team-client community). Retention, big effort. |
| **ON3** | Goal setup → program-customization kickoff | **KEEP** | Verify current onboarding nutrition-goal capture during build; likely still valid. |
| **ST1** | Grouped settings list | **UPGRADE** | Re-spec `AccountManagement.tsx` to sectioned list w/ mono section heads + leading icons + chevrons + `ClickableCard`. Reads as "finished." Ground in Hevy/Oura settings. |
| **CT3** | Verify cast + fullscreen + audio-switch controls | **KEEP** | Verification task on `SecureVideoPlayer.tsx`; keep watermark/secure access. |
| **CT4** | Long-form article reader | **UPGRADE (conditional)** | Conditional on expanding written content. If built, apply current typographic bar (Geist body, mono section labels). |
| **AD1** | Reorderable dashboard cards | **KEEP** | Power-user polish; strong curated default first. Low priority. |
| **AD2** | Awards / achievements screen | **KEEP** | Retention; keep positive/health-aligned. Consolidate scope with CL5 streak so we don't build two overlapping engagement surfaces. |
| **AD3** | Auto weekly roster-progress digest | **DONE** | Shipped (see §0). Reclassify SHIPPED. |
| **AD4** | In-app schedule-a-call with coach | **KEEP** | Overlaps Sessions booking (SE1) — fold into that phase rather than build standalone. |
| **PUB5** | How It Works: 3-4 outcome steps + icons | **UPGRADE** | Re-spec `HowItWorksSection.tsx` to flat surfaces, mono step labels, crimson accents. |
| **PUB6** | Testimonials: lead with outcomes not stars | **UPGRADE** | Re-order the `TestimonialsList` card to lead with the outcome/`WeightChangeProof`, demote stars (see §0). Quick win. |
| **PUB7** | FAQ answers real objections | **KEEP + light UPGRADE** | Content audit (price/commitment/refunds/medical) + flat accordion in current bar. |
| **PUB10** | Waitlist: value + what-happens-next | **UPGRADE** | Re-spec `Waitlist.tsx` to current bar + explicit next-step expectation copy. |
| **FU1** | `getLoadColor` → `--status-*` tokens | **KEEP** | Token consistency (CC5). Engineering-consistency backlog. |
| **FU2** | Unify phase-status logic (client/coach) | **KEEP** | Dedupe `signedExpectedChange` onto `classifyPhaseStatus`. |
| **FU3** | WoW % DeltaChip in TeamWeightProgressGraph | **KEEP** | Needs upstream signed WoW threaded first. |
| **FU4** | WeeklyProgressCard "This Week" trend fix | **KEEP — consider bump** | This is a **data-correctness bug** (single outlier weigh-in → e.g. +17.5 kg shown). It's mislabelled a P2 polish item; it shows users a wrong number. Recommend bumping to P1 / bug track. See §2 Decision 3. |
| **GC1** | Google Calendar 2-way sync | **KEEP (future)** | XL, gated on Sessions booking (Phase 2). Correctly parked. |
| **CARE1** | Care-team roster/thread polish | **DONE** | Shipped (see §0). Only optional @-mentions remain — split into a new low-priority row if we want it, else close. |

---

## 2. Decisions for Hasan (blocking the close/re-spec of 3 rows)

**Decision 1 — ON2 onboarding coach card.** The onboarding coach-selection dialog is deliberately lite because a prospect isn't subscribed yet, so RLS hides location/qualifications. Options: (a) accept lite as the intended end state and close the onboarding half of ON2; (b) enrich within RLS limits — show what a prospect *is* allowed (specialties, short bio, reputation aggregate/rating, intro-video affordance, "trains at" if not gated) using the `CoachPublicProfile` visual language scaled down. My recommendation: **(b)** — a prospect choosing a coach is the highest-intent moment in the funnel and deserves more than name + short bio, and we can do it without leaking gated PII.

**Decision 2 — PUB6 card re-order.** Reorder the public testimonial card to lead with the outcome (`WeightChangeProof` + one-line result), then quote, then author, then a smaller star row. Low effort, directly fulfils the original ask. Recommend **yes** — include it in the upgrade pass.

**Decision 3 — FU4 priority.** It's tracked as P2 "polish" but it's a correctness bug (wrong weight-trend number from a single zero/outlier weigh-in). Recommend **re-tagging P1 / bug** so it doesn't sit behind cosmetic P2s. Purely a priority call.

---

## 3. Tally

- **Reclassified DONE this pass:** AD3, MS2, CARE1 (3).
- **UPGRADE (re-spec to current bar):** CC8, CL5, CO4, CO8, RO5, NU6, ST1, CT4*, PUB5, PUB6, PUB10, ON2 (12; CT4 conditional).
- **KEEP (still valid as specced):** CC6, NU2 (blocked), ON1, ON3, CT1, CT3, WK5, WK6, HX5, WK10, SE1 (spec fix), MS3, AD1, AD2, AD4, PUB7, FU1, FU2, FU3, FU4, GC1 (21).

Next: hand terminal Claude Code the independent cross-check (Deliverable #2), fold its findings in, then run the Mobbin-grounded upgrade pass on the P1s first (Deliverable #3).

---

## 4. CC cross-check — corrections folded in (2026-07-12)

Terminal Claude Code ran an independent code scan. It corrected four of my calls and surfaced a systemic gap. All folded into the sheet.

**Corrections to my classifications:**
- **AD3 → PARTIAL (was DONE).** `send-weekly-coach-digest` is an *activity* digest, not a *progress* one — it counts `exercise_set_logs > 0` per client and discards the magnitude (`index.ts:97-117`); body = Total/Active/Inactive/New. No weight/adherence/volume/PR/check-in trend. AD3's roster-progress ask is still open.
- **MS2 → SHIPPED (client dock only).** The badge is wired only on the client dock; coach + admin docks have no Messages item at all (`CoachSidebar.tsx:232`, `AdminSidebar.tsx:131`), so a coach on mobile has no dock unread signal. Split into new row **MS5**.
- **ON2 → the "RLS-gated" justification is false.** Disproved three ways (SECURITY DEFINER RPC selecting only 5 cols; `coaches_public` readable by any authed user; the nulled fields already served to anon by `get_coach_public_profile_by_slug` and rendered on `/meet-our-team`). Fix collapses to one `CREATE OR REPLACE` + a deleted null block. The two code comments asserting the RLS gate are factually wrong and must be fixed in the same PR. Decision 1 answers itself → enrich. Detail in `DESIGN_UPGRADE_PASS_2026-07-12.md`.
- **PUB6 → confirmed + bigger bug.** `TestimonialsList.tsx:142-162` renders **three fabricated 5-star cards** ("Client Name" / "Program Type") when there are no featured testimonials, and the same fakes on fetch error. Killing the fakes outranks the card re-order — it's the literal "authentic" ask.
- **SE1 → targets the wrong system.** Client `/sessions` reads `session_bookings` + `coach_time_slots` + `book_session_atomic`, never `direct_calendar_sessions`. The spec's premises are all false (no shared table; no status CHECK to extend; the availability model already ships). Re-spec from scratch; the real fork is an architecture decision (build on `session_bookings` vs unify `direct_calendar_sessions`) that gates AD4 + GC1 + BUG13.

**Systemic finding (bigger than any P2 on the sheet):** 0 of 16 audited shipped surfaces have a visible error branch — every one degrades a fetch failure into its empty state. Actively misleading: `CoachAlerts.tsx:96` shows "0 alerts" on failure (the warnings surface), `MeetOurTeam:76` tells prospects the team is "being assembled" on a blip, `TestimonialsList:87` renders the three fake reviews, `CoachPublicPage:98` collapses errors + 404. Added as **CC10** (P1), bundled with CC6 (same ~53-file sweep). Contradicts the CLAUDE.md `{error}` destructure-and-throw rule — the Client Overview tabs destructure it then swallow it.

**New rows added (collision-free per §1 hygiene):** CC9 (`<Card onClick>` a11y, 13 sites), CC10 (error-state sweep), CC11 (i18n/RTL gaps), DS2 (authed-shell gradient flatten — PUB8 never reached admin/client/auth shells), DS3 (shadow discipline + ClickableCard hover-shadow ruling), MS5 (coach/admin dock unread), PUB11 (coach-page Schema.org reputation markup — orphaned T2 deferral), BUG13 (coach direct sessions invisible to client). CO3 and BUG7 (two non-Shipped rows the first pass didn't cover) reviewed: leave as-is.

**Build-doc drift CC catalogued (for a docs-hygiene pass, not blocking):** the `/coach/:slug` → `/coaches/:slug` rename never propagated to the coach-profile/testimonials build docs; `react-helmet` remediation advice survives in ~5 docs + CLAUDE.md:13; several build docs describe a pre-shipped world (slug column, reputation deferral, English-only profile) that no longer matches code; `T3_WEIGHT_ATTACHMENT_BUILD.md:51` prescribes color-by-direction that the shipped `WeightChangeProof` deliberately (correctly) does not do.

**CLAUDE.md contradictions to arbitrate:** (a) `:13` react-helmet-async listed but not a dependency → remove; (b) `:628,675,682-692` Nutrition-tab layout no longer matches code → confirm + correct; (c) ClickableCard hover-shadow (DS3 ruling); (d) useIsMobile mandated but 71/84 files don't branch → narrow the rule or track the debt.
