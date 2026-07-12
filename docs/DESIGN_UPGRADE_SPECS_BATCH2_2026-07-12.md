# Design Upgrade Specs — Batch 2 (2026-07-12)

_Continuation of `DESIGN_UPGRADE_PASS_2026-07-12.md` (which holds ON2 + PUB6). Drafted while CC builds ON2. Covers the remaining P1 re-specs (CC6+CC10, CT1, WK10, SE1) and the P2 UPGRADE batch (CO4, CO8, ST1, CL5, NU6, PUB5, PUB10, CC8+RO5). Each grounded in a fresh Mobbin screen + the real IGU component. Current bar = flat surfaces, crimson `hsl(355 78% 48%)`, Bebas hero numbers, JetBrains Mono labels, MetricCard/EmptyState house patterns, `ClickableCard`._

---

# P1 re-specs

## CC6 + CC10 — one skeleton + error-state sweep

**Current state.** Coach side is spinner-only: `CoachDashboardOverview.tsx:271`, `DietitianDashboardOverview.tsx:257`, `CoachMyClientsPage.tsx:1038`, `CoachSessions.tsx:408`, `ClientOverviewPanel.tsx:209` all render a full-page centered `Loader2`. 53 coach files use `Loader2`/`animate-spin`, 4 use `Skeleton`. And **0 of 16 audited surfaces have a visible error branch** — a failed fetch renders pixel-identical to the empty state, sometimes actively lying (`CoachAlerts.tsx:96` → "0 alerts"; `TestimonialsList.tsx:87` → 3 fake reviews). The Client Overview tabs destructure `{ error }` then swallow it (`NutritionTab.tsx:86`, `CareTeamTab.tsx:115`, `SessionsTab.tsx:111`, `OverviewTab.tsx:119`, `ProfileInfoTab.tsx:100`) — contradicting the CLAUDE.md destructure-and-throw rule.

**Mobbin ref.** Layout-shaped skeletons (not spinners) — the pattern is to mirror the loaded layout's boxes in `bg-muted` at `animate-pulse`; Fitbod/Hevy list-and-card skeletons are the house reference (the sheet's original CC6 citation still holds). No external ref needed for the error state — it's a component contract.

**Spec — build 3-4 shared shells, then swap, don't hand-write 53.**
1. **Skeleton shells** in `src/components/ui/` (extend `loading-skeleton.tsx`): `<MetricCardGridSkeleton>` (mirrors the CC1 MetricCard grid — label bar + hero-number block + sparkline strip), `<RosterRowSkeleton>` (avatar circle + two text bars + a pill), `<TabShellSkeleton>` (sticky header bar + 2-3 stacked cards). All `bg-muted animate-pulse rounded-lg`, flat, matching real component dimensions so there's no layout shift on load.
2. **Shared error state** — `<LoadError onRetry?>` in `ui/`: mono uppercase `COULDN'T LOAD` + one plain-language line ("We couldn't load your clients. Check your connection.") + a `Retry` button (secondary, flat). Same visual family as `EmptyState` but semantically distinct — never reuse EmptyState for an error (that's the current bug).
3. **Sweep contract per surface:** `isLoading` → shell; `error` → `<LoadError onRetry={refetch}>`; empty → `EmptyState`; data → content. Three distinct branches, always. Prioritise the five full-page-spinner surfaces above + the four lying surfaces (`CoachAlerts`, `MeetOurTeam`, `TestimonialsList`, `CoachPublicPage`) first.
4. **Fix the swallow-and-hide tabs** in the same pass — surface the destructured `{ error }` into `<LoadError>` instead of `console.error` + silent empty.

**Effort:** M (mechanical once the 3 shells + `LoadError` exist). Zero logic blast radius. Highest-value non-ON2 P1 — it's currently showing prospects fake testimonials and coaches false all-clears.

---

## CT1 — content library filter chips + Saved shelf

**Current state.** `learn/VideosTab.tsx` + `ExercisesTab.tsx` have search + a category filter (`VideosTab.tsx:89,139-140`). Missing: by-coach / by-equipment filter chips and a Saved/Favourites shelf.

**Mobbin ref.** [pliability — "Find a Session" with horizontal filter chips (Target Areas / Outcome / Movements) + a heart-to-save on every row](https://mobbin.com/screens/4c77a6bb-454c-482d-9f50-0b664acf0f64) and [Alan — "Content types" chip + filled-heart save state](https://mobbin.com/screens/58c27044-a274-4949-b120-b36c3a0e76ac). The pattern: a scrollable chip row above the list, a heart affordance per card, and a "Saved" entry point.

**Spec.**
1. **Filter chip row** above the existing search — horizontal scroller of chips (Category · Coach · Equipment), flat `bg-muted` unselected / `bg-primary text-primary-foreground` selected, mono labels. Reuse the current category filter's state shape; add coach + equipment facets sourced from the library rows. Multi-select within a facet, AND across facets.
2. **Save affordance** — a heart/bookmark toggle on each library card (top-right, `h-8` touch target). New `content_favourites` table (`user_id`, `content_id`, `content_type`, `created_at`) + RLS (own rows only) + a `get_saved_content` read. Optimistic toggle with rollback (destructure `{ error }`, throw).
3. **Saved shelf** — a "Saved" chip (or a pinned first row) that filters to favourites; empty state via `EmptyState` ("Nothing saved yet — tap the heart on any video to keep it here."), never the fake-card pattern.
4. **Empty search** — apply the CLAUDE.md `searchTerm ? … : …` guard so it never renders `matching ""`.

**Effort:** M. Self-contained to the two Learn tabs + one small table.

---

## WK10 — coach Workouts per-day authoring +menu

**Current state.** `client-overview/tabs/WorkoutsTab.tsx` shows a read-only week/month calendar (`ClientScheduleCalendar`). The authoring path (`DirectClientCalendar.tsx`, 571 lines of CRUD on `direct_calendar_sessions`) exists but is tucked in a Sheet; "Assign" navigates away from the client page. No per-day inline authoring, no at-a-glance week.

**Mobbin ref.** [Runna — Training calendar with a per-day inline `+ Add` on each day row + WEEK N header + Reset](https://mobbin.com/screens/86245523-ea19-44cd-bb20-5b52f0bbaa88) and [Aaptiv — "Edit My Plan" per-day activity rows with a `…` kebab + a FAB `+`](https://mobbin.com/screens/d0021aaa-fb59-4146-bb9a-1ad96bdb91c1). The Runna day-list is the exact target: a calendar-forward week grid where each day carries its own `+ Add`.

**Spec.** (Note: SE1's model is locked to `session_bookings`; WK10 stays on `direct_calendar_sessions` — this is *program authoring*, not session booking. The two are now cleanly separated.)
1. **Calendar-forward week grid** in `WorkoutsTab` — each day row shows assigned workout(s) as flat cards (name + module count + a status dot reusing the canonical Done/Due/Scheduled/Missed vocabulary) and a persistent per-day **`+ Add`** (opacity-50 always, touch-reachable — same rule as the Planning Board `SessionBlock` `+`).
2. **Per-day +menu** (popover desktop / vaul Drawer mobile via `useIsMobile`): `Blank session` · `From saved` (opens `AssignFromLibraryDialog` scoped to that day, in-context — no navigation) · `Assign program` (`ClientProgramList` picker) · `Create program scoped to client`. Reuse `DirectClientCalendar`'s existing CRUD writes; this is a surfacing/placement change, not new data plumbing.
3. **Program history strip** below the grid — horizontal chips of past programs (name + date range), reusing `ClientProgramList` data.
4. **Week nav** — prev/next week + "this week" anchor; derive weekday labels from the assignment-start anchor, never Mon-first (the day-move slice's lesson).

**Effort:** L (net-new authoring UI, but all writes + pickers already exist to reuse). Sequence after ON2 + CC6/CC10.

---

## SE1 — sessions booking, re-spec from scratch (session_bookings model)

**Supersedes** `docs/SE-Sessions-Tab-Booking-Spec.md`, which targeted the wrong system. **Locked model:** build on the existing `session_bookings` + `coach_time_slots` + `book_session_atomic` (already live: atomic booking, weekly-limit enforcement off `subscriptions.weekly_session_limit`, coach slot management at `CoachSessions.tsx:268,345`). Do **not** build a parallel system on `direct_calendar_sessions`.

**Current state.** Client `/sessions` (`ClientSessions.tsx:135,147,168`) reads `session_bookings` + `coach_time_slots`, books via `book-session` edge fn. Coach mirror at `/coach/sessions` (`CoachSessions.tsx`). Both currently flat lists, no grouped Upcoming/Past, no request→confirm handshake (booking is immediate).

**Mobbin ref.** [Zomato — "Your bookings": Upcoming / History tabs, each row a card with date-time + a status pill ("Booking cancelled")](https://mobbin.com/screens/b2da1a7b-4031-4299-88e6-4942956cd1bc), [Urban Company — "My bookings": Active & upcoming / Previous, green "Scheduled · Fri 4:00PM" pill](https://mobbin.com/screens/d2b44cff-0d78-43c2-a40f-01d60e849a29), [Redfin — Upcoming/Past tabs + Reschedule](https://mobbin.com/screens/3e51ab5e-b6ef-4419-a793-fdfcdc47297b). Target = grouped **Upcoming / Past** with date chips + status pills, both sides.

**Spec — two stages.**
1. **Stage A (presentation, no schema change).** Redesign both `ClientSessions` and `CoachSessions` to grouped **Upcoming / Past** sections: each session a flat card with a mono date chip, a status pill (`Scheduled` / `Completed` / `Cancelled` — reuse `statusUtils` color vocabulary), coach/client name, and the session type. `EmptyState` for each empty group ("No upcoming sessions"). This alone closes most of SE1's visible intent and is buildable today.
2. **Stage B (request→confirm handshake).** Add a `status` progression `requested → confirmed → completed/cancelled` on `session_bookings` (it's free-text today, no CHECK — add the CHECK in the migration). Client "Request" writes `requested`; coach gets a confirm/decline action (Upcoming shows a "Requested" pill with Confirm/Decline for the coach). **RLS:** the only INSERT policy today is coach-side (`coach_user_id = auth.uid()`); a client-initiated request needs a new client-INSERT policy or a `SECURITY DEFINER` `request_session_atomic` RPC (follow the `book_session_atomic` pattern + the mandatory REVOKE/GRANT). Email both sides via the shared template system (request → coach; confirm/decline → client), throttled per the existing pattern.
3. **BUG13 folds in here** — coach-created `direct_calendar_sessions` are invisible to clients. Decide during Stage A whether the client Sessions page unions those in (read-only "scheduled by your coach" rows) or whether direct sessions migrate onto `session_bookings`. Recommend the read-only union first (cheap, fixes the live bug) and defer migration.

**Gates AD4** (in-app schedule-a-call = a session type on this same model) **and GC1** (Google Calendar sync hangs off `session_bookings`). **Effort:** Stage A = M, Stage B = L.

---

# P2 UPGRADE batch

## CO4 — capacity as a filled gauge

**Current state.** `coach/EnhancedCapacityCard.tsx` shows capacity as text.

**Mobbin ref.** [Oura — Activity Goal: a partial-arc gauge with the value as a large number, `0`/`600` endpoints, and a plain-language "You reached 40% of your activity goal."](https://mobbin.com/screens/c8eceb02-6db4-4cfd-9a46-e1ed8fa90e0a)

**Spec.** Re-spec as a MetricCard-family card: a crimson partial-arc gauge with the current count as a **Bebas hero number** (`18`) and the cap as the arc endpoint (`/ 25`), a mono `72% CAPACITY` label, and a CC2 plain-language read below ("7 spots open" / "At capacity — new clients will waitlist"). Arc color stays crimson; near-cap (≥90%) shifts to the amber `--status` warning token. Flat card, no shadow. **Effort:** S.

## CO8 — reports: date-range + MetricCard grid

**Current state.** `coach/CoachDashboardOverview.tsx` + `admin/AdminMetricsCards.tsx` render stats ad hoc.

**Mobbin ref.** IGU's own **CC1 MetricCard** is the house standard (shipped) — no external ref needed; the upgrade is to *converge* reports onto it. (Intercom Reports remains the conceptual origin from the sheet.)

**Spec.** A Reports view = a date-range filter (This week / Month / Quarter / Custom, mono segmented control) driving a responsive **grid of CC1 MetricCards** (label · timeframe · sparkline · hero value · delta · avg) for the coach/admin metrics (active clients, new signups, revenue via `paying_subscriptions`, adherence, sessions). Each card pairs a CC2 plain-language read. Reuse `MetricCard`; do not invent a second stat card. **Money metrics read `paying_subscriptions`, not `subscriptions`** (exempt-aware). **Effort:** M.

## ST1 — grouped settings list

**Current state.** `AccountManagement.tsx` — flat.

**Mobbin ref.** [Instagram — "Settings and activity": sectioned groups ("What you see", "Your app and media") with mono section heads, leading icons, chevrons](https://mobbin.com/screens/83c9dde8-a66e-4860-bfd4-dfc1c070827d); [TheFork](https://mobbin.com/screens/048e0d20-dc3e-4d39-b6f8-5d2e5714a089) similar.

**Spec.** Re-spec into grouped sections (Account · Notifications · Preferences · Billing · Help) with mono uppercase section heads + a short primary tick, each row a `ClickableCard` (or list row with `role=button`) with a leading lucide icon + label + chevron, flat dividers. Destructive actions (Log out, Delete) in their own footer group, crimson text. **Effort:** S. (Bundles naturally with CC9 — some of these rows are current `<Card onClick>` offenders.)

## CL5 — gentle consistency indicator (consolidate with AD2)

**Current state.** None near the client hero.

**Mobbin ref.** [timespent — "Arcs": a per-habit week strip (S–M–T–W–T–F–S) with a check per completed day + a quiet "5 days active" count](https://mobbin.com/screens/9cc7a829-7e52-4fba-a224-d18fba39c85e) and [Me+ weekly dot grid](https://mobbin.com/screens/68f3faa7-4603-4dbb-a21b-8b201dbbe2c9). **Explicitly NOT** [QUITTR's aggressive flame "5 Day Streak" + "Panic Button"](https://mobbin.com/screens/62e93e5d-41f4-42ba-b556-af0bfce9f536) — that pressure framing violates the wellbeing guidance.

**Spec.** A quiet week-dots row near the client dashboard hero: S–M–T–W–T–F–S with a filled crimson dot per day a workout/check-in happened, an outline dot otherwise, and a mono `4 of 7 this week` label — **no flame, no "don't break the chain", no red on misses** (a missed day is a neutral outline dot, not a failure state). Frame around presence ("4 active days"), never guilt. **Consolidate AD2** into this: skip a separate awards screen for now; if milestones are wanted later, surface them as occasional gentle callouts on this same card, not a gamified trophy wall. **Effort:** M.

## NU6 — shareable phase-summary card

**Current state.** `nutrition/PhaseSummaryReport.tsx` exists, not shareable.

**Mobbin ref.** [Beli — "September, at a glance" recap: big numbers (34 restaurants / 3,570 minutes / 8 bookmarks) + brand mark + @handle, with a share sheet to IG Story/TikTok](https://mobbin.com/screens/ac5b8c7f-dee7-478c-aad7-8c89728720b1) and [Beli "Top 10% Diner" stat card](https://mobbin.com/screens/b90ece28-8ba8-4718-a7c3-3b010ab774e5); [Spotify Wrapped hero number](https://mobbin.com/screens/9cc6cdc9-6c8f-49aa-99f7-1531de8b5017).

**Spec.** Render `PhaseSummaryReport` as an exportable image card (html-to-canvas or a server render): IGU wordmark, phase name, a **Bebas hero result** (the `WeightChangeProof` value — kept **neutral**, framed by phase name, honesty rule from PUB6), a small P/F/C `MacroDistributionRibbon`, duration, and the client's first name. Flat crimson/`bg-card`, no gradient. A share affordance (native share sheet) with the image. Every share = a branded impression — cheapest organic-growth lever. **Honesty guardrail:** neutral color on the result number, real data only. **Effort:** M.

## PUB5 — How It Works

**Current state.** `marketing/HowItWorksSection.tsx`. Standard pattern; needs the flat bar.

**Spec.** 3–4 outcome-focused steps (Choose your coach → Get your plan → Train & check in → See results), each a flat card with a mono step number tick, a lucide icon, a short outcome-led headline, one plain line. Crimson accents, no gradient, no shadow. Add `useTranslation` (it's a public i18n surface — see CC11). **Effort:** S.

## PUB10 — Waitlist

**Current state.** `Waitlist.tsx`. Needs value + what-happens-next.

**Spec.** Flat hero (no gradient wash — see DS2): a clear one-line value prop, the email capture, and an explicit **what-happens-next** strip (mono numbered: "1. You're on the list → 2. We invite in waves → 3. You'll get an email to finish signup"). Reuse the current waitlist submit. Add `useTranslation`. Keep `SEOHead` (no helmet). **Effort:** S.

## CC8 + RO5 — empty-state coverage + delight

**Current state.** `ui/empty-state.tsx` exists but is used in only 11 files.

**Mobbin ref.** [Fitbod/Hevy empty states] (sheet original) — mono icon + one line + a single action. The delight is restraint, not illustration-heaviness.

**Spec.** Coverage audit: every list/history/roster renders `EmptyState` (never a bare "No data" or, worse, fake cards). Add an optional `illustration`/`icon` slot to the primitive for high-traffic empties, in the flat mono style (a single lucide glyph in `text-muted-foreground`, not a stock illustration). RO5 = the roster's satisfying zero-state ("No clients need attention — nice." with a calm check glyph). **Effort:** S.

---

# Mechanical rows (board note suffices — no separate spec)

These are captured in their board rows; they're sweeps, not design decisions:
- **DS2** — flatten authed-shell gradient washes + retire the surviving gradient button + gradient-clipped hero numbers + icon medallions (extend PUB8 to admin/client/auth shells).
- **DS3** — remove caller-added shadows; **ruling locked: change the `ClickableCard` primitive** (`clickable-card.tsx:52` `hover:shadow-md` → border/bg hover).
- **CC9** — replace 13 `<Card onClick>` with `ClickableCard` (a11y). Bundle with ST1.
- **CC11** — i18n + RTL sweep (add `useTranslation`; physical `mr-/ml-/left-` → logical `me-/ms-/start-`). Covers PUB5/PUB10/TestimonialsList/MeetOurTeam/NutritionPhaseCard.
- **MS5** — coach/admin mobile dock Messages item + unread badge (reuse `useStaffUnreadCounts`).
- **PUB11** — Schema.org AggregateRating/Review JSON-LD on `CoachPublicPage` (aggregate already fetched).

---

## Build order (revised, from `DESIGN_UPGRADE_PASS`)
ON2 (CC building) → **CC6+CC10** (skeleton+error sweep) → **CT1** → **WK10** → **SE1** (Stage A, then B). P2 batch slots after, with CC9 bundled into ST1 and CC11 into the PUB5/PUB10/PUB6 work.
