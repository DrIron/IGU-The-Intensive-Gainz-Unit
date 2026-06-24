# RO — Coach "My Clients" roster redesign: active-first + needs-attention strip + scannable rows

**Status:** Drop-in spec (2026-06-23, Cowork). **Priority / effort:** P1 / L (two phases). Covers **RO2** (scannable rows), **RO3** (sort), and Hasan's additions (active-first ordering, per-client alert cluster, adherence + weekly check-ins). Design locked off the approved mock.

File: `src/components/coach/CoachMyClientsPage.tsx` (Phase 1). Phase 2 adds a batched data source.

## The problem (live, verified 2026-06-23)
The roster is a stacked action-queue: **Pending Approvals → Awaiting Payment → Active → At-Risk**. The coach lands on **two empty "0" headers** before their active roster, and each active row shows only **name + plan badge + kebab** — no status, adherence, check-in cadence, or alerts visible (even a client with weigh-ins shows nothing, because the row only had a drift chip and coach-RLS hides the data). Coaches can't read "who needs me" at a glance.

## Locked design (see the approved mock)
1. **Needs-attention strip** on top — compact count chips (To approve · At-risk · Check-ins overdue · Adjustments) that jump to the relevant clients. Replaces the empty stacked headers.
2. **Active first** — the active roster is the primary view; the action sections (Pending / Awaiting / At-Risk) move below and stay collapsed-when-empty.
3. **Scannable row** — rail (urgency tone) · name · plan · `status · adherence · check-ins X/3 · last weigh-in` · **alert cluster** (right). Desktop spreads the stats into aligned columns; mobile wraps.
4. **Real sort control** (RO3): Check-in due / At-risk / Adherence (Phase 2) / Name.

---

## Existing infrastructure to REUSE (don't rebuild)
- **`useCoachRosterAttention()`** (`src/hooks/useCoachRosterAttention.ts`) → the `get_coach_roster_attention()` RPC. Returns `{ total, most_overdue_days, tiles, client_ids }` where `tiles`/`client_ids` cover **`payment_failed`, `inactive`, `check_in_overdue`, `pending_approval`, `adjustments_pending`**. This is the **single source for the needs-attention strip counts AND the per-row alert flags** (membership test: is `client.id` in `client_ids.check_in_overdue` / `.payment_failed` / `.adjustments_pending`?). Already coach-readable, batched, deduped — reuse it; never recompute the headline.
- **`useStaffUnreadCounts()`** — per-client unread message counts (already wired into the row).
- **`useCoachDeloadRequestCounts(coachUserId)`** — per-client pending deload counts (already wired).
- **`rosterTone()` / `byRosterUrgency()`** (`src/lib/rosterTone.ts`) — the urgency Tone + sort comparator. Keep using for the rail + at-risk sort.

So the alert cluster = a union of three existing batched sources. **No new backend in Phase 1.**

---

## Phase 1 — UI restructure (frontend only, `CoachMyClientsPage.tsx`)

### 1) Needs-attention strip (new), above the sections
Add `const { attention } = useCoachRosterAttention();`. Render a compact strip of count chips from `attention.tiles` + the page's own `awaitingPayment.length`:
- **To approve** (`tiles.pending_approval`) → expands/scrolls the Pending section.
- **At-risk** (`tiles.payment_failed + tiles.inactive`) → At-Risk section.
- **Check-ins overdue** (`tiles.check_in_overdue`, with `most_overdue_days` as a hint) → jumps to the most-overdue client (`client_ids.check_in_overdue[0]` via `onViewClient`/navigate) or filters.
- **Adjustments** (`tiles.adjustments_pending`) → first flagged client.
Each chip: colored (warning/danger/neutral), count, label; zero chips render muted, not hidden (so the row is stable). Clicking a chip with a section target expands that section (set `collapsedSections[key]=false` + scroll) — reuse the existing `sectionPages`/`collapsedSections` machinery and `pendingRef` pattern.

### 2) Reorder — active first
Render order becomes: **needs-attention strip → Active Clients → Pending Approvals → Awaiting Payment → At-Risk**. Keep the existing `QueueSectionCard` for each; Active is no longer buried. Pending/Awaiting/At-Risk keep "collapse when empty" so they're quiet when there's nothing to do (the strip already surfaces their counts up top).

### 3) Scannable row — extend the active-row markup
In the row (the `pageClients.map` inside `QueueSectionCard`), restructure to a consistent layout:
- **Line 1:** name + plan badge (existing) + the **alert cluster** pushed right.
- **Line 2 (stat row):** small, labeled, flex-wrap on mobile / aligned columns on desktop (`sm:` grid):
  - **Status** — `getStatusBadge` (existing) or a compact tone label.
  - **Adherence** — Phase 2 (`—` placeholder in Phase 1).
  - **Check-ins X/3** — Phase 2 (`—` placeholder in Phase 1; the existing drift chip / `days_since_check_in` stays as "last weigh-in").
  - **Last weigh-in** — from `days_since_check_in` ("today" / "Nd ago" / "No check-in").
- **Alert cluster** (replaces the scattered chips) — a right-aligned icon row, each icon shown only when flagged, with a count where it makes sense:
  - `check-in overdue` (`ti-clock-exclamation`, warning) — `client_ids.check_in_overdue.includes(c.id)`.
  - `payment` (`ti-credit-card-off`, danger) — `client_ids.payment_failed.includes(c.id)`.
  - `adjustment pending` (`ti-adjustments-alt`, info) — `client_ids.adjustments_pending.includes(c.id)`.
  - `unread` (`ti-message` + count, destructive) — `unreadCounts[c.id]` (existing).
  - `deload` (`ti-snowflake`, info) — `deloadCounts.get(c.id)` (existing).
  Keep the left `border-l-4` tone rail (`toneClasses(tone).rail`) as-is.

### 4) Sort control (RO3)
Expand `sortBy` from `'at_risk' | 'name'` to add **`'check_in_due'`** (by `days_since_check_in` desc, nulls last) now; reserve `'adherence'` for Phase 2. Update the `<Select>` options accordingly. (At-risk-first stays the default via `byRosterUrgency`.)

### Phase 1 guardrails
- Reuse the three existing hooks; do not add a fetch or RPC. Keep `hasFetched` ref guards and the batched-fetch pattern.
- Don't change the approval/decline handlers, pagination, or the Payouts tab.
- Keep email hidden from coaches (privacy). Keep `pb`/mobile dock clearance.

---

## Phase 2 — adherence % + weekly check-ins (new data)
Extend `get_coach_roster_attention()` (or add a sibling `get_coach_roster_stats()`), `SECURITY DEFINER`, coach-scoped, returning a **per-active-client** map: `{ client_id, adherence_pct, weigh_ins_this_week, expected_weigh_ins, last_weigh_in_date, has_program }`. Follow the REVOKE/GRANT pattern (revoke anon, grant authenticated). Sources to confirm:
- **Weigh-ins this week / last weigh-in:** 1:1 → `weight_logs` in the current IGU week (`startOfIguWeek()`); team → `weekly_progress` weight entries. (CLAUDE.md: team check-ins live in `weekly_progress`, not `weight_logs` — handle both.)
- **Adherence %:** team → share of recent `weekly_progress` weeks with `followed_calories = true` (and `tracked_accurately`); 1:1 → confirm source (`adherence_logs` vs `weekly_progress`) — **flag in PR which you used.**
- **has_program:** `client_programs` count > 0 (powers a "no program yet" alert — add to the cluster in Phase 2).

Then: replace the Phase-1 `—` placeholders with real `adherence_pct` (colored: ≥80 success, 50-79 warning, <50 danger, null `—`) and `weigh_ins_this_week / expected`, add the **no-program** alert icon, and enable the **Adherence** sort option. New hook `useCoachRosterStats()` mirroring `useCoachRosterAttention`'s batched/degrade-safe shape.

---

## Verify
- `npx tsc --noEmit` + `npm run build` clean (per phase).
- **Phase 1** (`/coach/clients`, coach session): lands on the needs-attention strip + Active roster first (no empty headers on top); each active row shows status + last weigh-in + the consolidated alert cluster; the strip counts match the sections and clicking a chip jumps to it; sort includes Check-in-due. Smoke via the coach account (the four wired test clients give varied states).
- **Phase 2:** rows show real adherence % + check-ins X/3; adherence sort works; "no program yet" alert appears for clients with zero `client_programs`. Seeded test-client states (Online on-track, Hybrid quiet, In-Person partial) exercise the range.
- Two PRs (Phase 1 then Phase 2); each its own branch off main. Auth-gated to a coach — Cowork drives the smoke via the coach test session.
