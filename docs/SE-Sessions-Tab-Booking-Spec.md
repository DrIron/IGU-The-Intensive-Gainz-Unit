# SE — Sessions: grouped digest + request→confirm booking (both sides)

**Status:** Drop-in spec (2026-06-23, Cowork). **Priority / effort:** P1 / L (phased). Approved off the mock. Surfaces: coach `SessionsTab.tsx` (client-detail) + the client `/sessions` page. Booking model confirmed: **request→confirm first**, availability later, **both client and coach can book**, **Google Calendar = its own later phase**.

## Boundary (decide + apply)
**Sessions = booked appointments** (1:1 / in-person meetings + add-on bookings — *when you meet*). **Workouts = the training program/calendar** (*what to train*). Today `direct_calendar_sessions` leak into both surfaces — after this + the WK redesign, sessions live on the Sessions surface; Workouts shows training only. State this split in the PR.

## Data (verified — no new table needed)
`direct_calendar_sessions(id, client_user_id, coach_user_id, subscription_id, session_date, session_type, session_timing, title, notes, status, created_at, updated_at)` — already has `status` + both user ids. `addon_session_logs(... session_date, notes ...)` for add-on bookings.

---

## Phase 1 — UI redesign (both surfaces, read)
Redesign the coach `SessionsTab` AND the client `/sessions` page to the approved mock — same component/visual language both sides (role-agnostic list; actions differ):
- **Grouped sections:** **Upcoming** (future, status confirmed/requested) and **Past** (completed/cancelled), each a list of session rows.
- **Session row:** a **date chip** (weekday · day · month) + title/type (e.g. "In-person · Lower body", "Coaching call") + time + mode/location (`session_timing`) + a **status pill** (Booked/Confirmed = info, Completed = success, Cancelled = muted, **Requested = amber** once Phase 2 lands) + a kebab.
- **Add-on bookings** (`addon_session_logs`) fold into the same list with a small "Add-on" tag.
- Empty state stays the reworded "No booked sessions yet".
- Coach gets the existing `DirectClientCalendar` (now reachable via "Book session", not a separate always-on calendar — the calendar itself lives on Workouts).

## Phase 2 — request → confirm booking (the new flow)
- **Coach "Book session"** — schedule directly (creates a `direct_calendar_sessions` row, `status='confirmed'`); reuse `DirectClientCalendar`'s create path.
- **Client "Request session"** (on `/sessions`) — propose date/time/type → insert a `direct_calendar_sessions` row with **`status='requested'`** (initiated by the client for their primary coach). Shows as **Requested/Pending** on both sides.
- **Coach confirm / decline** — on a `requested` row: **Confirm** (`status='confirmed'`) or **Decline** (`status='cancelled'`, with optional note). A `SECURITY DEFINER` RPC or guarded updates; notify the other party (reuse the `_shared` email system — a new `session_requested` / `session_confirmed` / `session_declined` template; `--no-verify-jwt` pattern like the other notification fns).
- **Data:** extend the `status` CHECK to include `'requested'` (migration). **RLS:** a client may `INSERT` a `direct_calendar_sessions` row only for themselves (`client_user_id = auth.uid()`) with `status='requested'` and their actual coach; a client may `UPDATE` only to cancel their own requested/confirmed session; the coach (primary or care-team) may confirm/decline/complete. Mirror the coach + team-coach policy pattern (CLAUDE.md migrations 20260212170000/180000). Add a `requested_by` column **only if** "who initiated" can't be inferred (coach-created = confirmed, client-created = requested makes it inferable — prefer not adding a column).
- **Status pills:** Requested (amber) → Confirmed (info) → Completed (success) / Cancelled (muted).

## Phase 3 — availability (future, after Phase 2)
Coach publishes availability slots; client books a slot directly (skips the request step). Needs a coach-availability model. Out of scope here — sequence after request→confirm is proven.

## Future phase — Google Calendar sync (separate project, NOT this spec)
Both coach + client connect Google Calendar (OAuth + Calendar API + token storage/refresh): booked sessions sync to their personal calendar with reminders; (later) read busy times to avoid clashes. Substantial — Google OAuth, two-way sync, read-calendar scope, and must work inside the Capacitor WebView for native. Its own phase; captured in the backlog.

## Non-goals / guardrails
- Phase 1 ships the redesigned read on both surfaces — don't gate it on the booking flow.
- Reuse `DirectClientCalendar` for coach direct-create; don't rebuild it.
- Keep the Workouts/Sessions boundary clean (no `direct_calendar_sessions` on Workouts after WK).
- Standard SECURITY DEFINER REVOKE/GRANT + both coach AND team-coach RLS policies for any new RPC/policy.

## Verify
- `tsc` + `build` clean (per phase).
- **Phase 1:** coach `SessionsTab` + client `/sessions` both show grouped Upcoming/Past with date chips + status pills; add-ons inline; smoke via the coach + a client test session.
- **Phase 2:** client requests a session → appears Requested on both sides → coach confirms → both show Confirmed; decline → Cancelled; emails fire; RLS verified (client can't insert for another client / can't self-confirm). Anon denied on any new RPC.
- Two+ PRs (Phase 1 UI, then Phase 2 booking); each its own branch off main.
