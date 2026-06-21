# Feature Ideas — Handover for a fresh Cowork session

_Captured 2026-06-20 from a brainstorm with Hasan. Each item below is grounded in a quick codebase scan so you don't start blind. Launch is **Sun Jul 12 2026** (signup Jul 14) — sequencing recommendations are relative to that. Read `CLAUDE.md` + `HANDOVER.md` + `docs/IGU-Design-Changes-Master.xlsx` first; this doc is a backlog of NEW ideas, not yet on the design board._

## How to use this
These are Hasan's ideas, not committed work. For each: **what it is**, **current state in the repo**, **considerations**, **a recommendation**, **rough effort**, and **suggested timing**. Discuss with Hasan before building any of them — several are strategic (especially #4).

---

## 1. Remove Discord

**What:** IGU is dropping Discord. Remove the integration.

**Current state (broad — it's client-facing):**
- Frontend (~18 files): `ServiceConfiguration.tsx`, `PlansServicesManager.tsx`, `AdminDashboardLayout.tsx` (Discord Automation section), marketing (`ComparisonTable.tsx`, `FAQSection.tsx`), `Navigation.tsx`, `client/WelcomeModal.tsx`, **onboarding** (`LegalStep.tsx`, `ServiceStep.tsx`, `OnboardingForm.tsx`), `Dashboard.tsx`, `ClientSubmission.tsx`, `PaymentStatusDashboard.tsx`, i18n (`en/nav.json`, `ar/nav.json`), `routeConfig.ts`.
- Edge functions: `manage-discord-roles/index.ts`, plus a Discord call inside `verify-payment/index.ts`.
- DB: `services.discord_role_id`, `discord_username` columns (migrations `20251005103034`, `20260121*`).

**Recommendation — split the work:**
- **Pre-launch:** remove only the *client-facing* references (onboarding steps, marketing comparison/FAQ, welcome modal, nav). Don't advertise a channel you're dropping to brand-new clients.
- **Post-launch:** remove the admin config UI, the edge functions, and drop the DB columns (migration). Lower-risk to do once no live flow depends on it.

**Effort:** M (client-facing pass) + M (backend/DB cleanup). **Timing:** client-facing pre-launch if Discord is definitely out; backend post-launch.

---

## 2. Improve the Legal section + integrate it into onboarding

**What:** Make the legal documents better, and weave consent/signing into the onboarding forms more cleanly (Terms, Privacy, PAR-Q waiver, refund/cancellation, medical disclaimer).

**Current state:**
- `LegalDocumentsManager.tsx` (admin: upload/version legal docs).
- Onboarding already has a `LegalStep.tsx` and PAR-Q medical screening (`parq_submissions`).
- A "Master Coaching Service Agreement" (EN/AR) exists in Hasan's Drive.

**Considerations:** This is the only **compliance-critical** item — clients sign PAR-Q / assumption-of-risk before training, and IGU is a sole establishment with unlimited personal liability (see the business docs), so the consent trail must be airtight. Coordinate copy with a Kuwaiti lawyer (per the action plan).

**Recommendation:** Make this a **pre-launch priority**. Scope = (a) review/upgrade the legal doc set + versioning, (b) ensure onboarding captures explicit, timestamped consent per document, (c) make it legible (not a wall of text). Another Claude can own the implementation; Hasan owns the legal copy.

**Effort:** M. **Timing:** Pre-launch.

---

## 3. Coach WhatsApp deep-link + "Contact coach about this workout" button

**What:**
- Link each coach's WhatsApp into the app so 1:1 clients get a one-tap "contact your coach" chat.
- Specifically: at the end of a 1:1 workout, a **"Message coach about this session"** button that opens WhatsApp pre-filled with a clean, well-organized text summary of what was just done (exercises, sets, new PRs), which the client then continues in their own words.

**Current state — most of the pieces already exist:**
- Coach **`whatsapp_number`** is stored (`coaches_private` / surfaced in `CoachManagement.tsx`, `CoachProfile.tsx`).
- A `marketing/WhatsAppButton.tsx` deep-link pattern already exists.
- The **workout summary is already computed at completion** — `WorkoutSessionV2.tsx` (~L2164) builds `setSummary({ volumeKg, setsCompleted, setsSkipped, prs, elapsedSeconds })` in the WK7 completion screen. The `prs` array is exactly the "new PRs" content.

**Implementation sketch:** On the WK7 completion summary (1:1 clients only — gate on service type), add a button that builds a `https://wa.me/<digits>?text=<encodeURIComponent(template)>` URL. Template = a tidy plain-text recap from the existing `summary` object (date, exercises/top sets, new PRs, volume, duration) + a trailing blank line for the client to keep typing. Pull the number from the client's assigned coach (resolve via `get_coach_for_client` RPC — note `coaches_client_safe` is RLS-broken, use the RPC). Strip non-digits from the number for `wa.me`.

**Considerations:** WhatsApp pre-fill has practical length limits — keep the template concise (top-line recap, not every set). Team-plan clients don't get it (they don't have a 1:1 coach the same way). Requires `whatsapp_number` to be populated per coach (currently may be blank).

**Recommendation — build it.** Strongest idea in this list: high value, low effort, reuses existing data. **Effort:** S–M. **Timing:** pre-launch quick win if there's room, else early post-launch.

---

## 4. Messaging strategy — WhatsApp vs. in-app (DECISION, not a build)

**The question Hasan raised:** people (esp. in the GCC) are more comfortable on WhatsApp than in-app chat; going WhatsApp-only would also avoid the in-app message encryption/PHI burden. Should we **ditch in-app messaging**?

**Current state:** in-app messaging is **substantial and recently built** —
- `coach_client_messages` + `CoachClientThread.tsx` (client↔coach thread), `ClientMessages.tsx`, unread badges (`useUnreadMessageCount`, `useStaffUnreadCounts`), email notifications, edit-history audit.
- **`care_team_messages`** — client-HIDDEN staff discussion (coach↔dietitian↔physio about a client), via `CareTeamMessagesPanel.tsx`.

**Recommendation — hybrid, do NOT rip it out pre-launch:**
- **Make WhatsApp the primary client↔coach quick-contact channel** (region prefers it; drops the PHI/encryption burden there; the #3 workout-summary deep-link is the flagship touchpoint).
- **Keep in-app `care_team_messages` for staff/MDT internal discussion** — WhatsApp can't do client-hidden, multi-party staff threads, and this ties into #5.
- **Defer the call on the general client↔coach in-app thread to post-launch**, based on real WhatsApp-adoption data.

**Why not all-WhatsApp:** (1) you lose **platform-owned message history** (disputes, quality review, handover when a coach changes); (2) it ties the relationship to a coach's **personal phone number** → coach-churn / client-ownership risk for the business; (3) health discussions on personal WhatsApp are arguably *worse* for compliance, not better; (4) the in-app system is already built and working.

**Effort:** decision + light config now; potential retirement of the client↔coach thread later. **Timing:** decide **post-launch** with adoption data. Layer WhatsApp on top first (#3).

---

## 5. MDT (multidisciplinary team) pre-formation

**What:** Let coaches + dietitians + other specialists form a standing **team**, so when a client is referred to an MDT they get a pre-assembled care team rather than ad-hoc assignment.

**Current state — infra exists, ad-hoc today:**
- `care_team_assignments` (per-client staff assignments), `care_team_messages`, `CareTeamCard.tsx`, `MyAssignmentsPanel.tsx`.
- `coach_teams` (head-coach **team-plan** teams) — different concept (a coach leading a team-plan cohort), but a useful precedent for grouping.
- Subroles: `subrole_definitions`, `user_subroles` (coach/dietitian/physio/etc.).

**Sketch:** a "care-team template" entity = a named set of staff (e.g. Coach A + Dietitian B + Physio C). Assigning a client to the template fans out `care_team_assignments` in one action (mirror the `assignProgram.ts` fan-out pattern). Needs DB (template table), UI (admin/head-coach builder), and RLS (team-coach policies — follow the pattern in migrations `20260212170000` / `20260212180000`).

**Recommendation:** Good post-launch feature; not launch-critical (ad-hoc care-team assignment already works). Ties to #4 (keep care-team messaging in-app). **Effort:** L. **Timing:** Post-launch.

---

## Suggested sequencing (relative to Jul 12 launch)

| When | Item | Why |
|---|---|---|
| **Pre-launch** | #2 Legal → onboarding | Only compliance-critical item; must be airtight for real clients |
| **Pre-launch (if room)** | #3 WhatsApp workout-summary button | High ROI, low effort, data already exists |
| **Pre-launch (conditional)** | #1 Discord — *client-facing* removal only | Don't advertise a dropped channel to new clients |
| **Post-launch** | #4 Messaging decision | Needs real WhatsApp-adoption data before retiring in-app |
| **Post-launch** | #1 Discord — backend/DB cleanup | Lower-risk once no live flow depends on it |
| **Post-launch** | #5 MDT pre-formation | Meatier build; ad-hoc care teams already work |

**Net for the pre-launch window:** if capacity is tight, do **#2 (legal)** as the must-have and **#3 (WhatsApp button)** as the high-value quick win; everything else is post-launch. Confirm the Discord drop and the messaging direction with Hasan before either is actioned.
