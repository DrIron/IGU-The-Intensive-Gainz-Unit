# CO6 — Coach client view: master-detail (keep the coach in flow)

**Status:** Drop-in spec (2026-06-23, Cowork). **Priority / effort:** P1 / L. Routing + layout restructure; the detail *content* (the 8 section tabs) already exists and is reused unchanged. Mobbin-grounded (Squarespace Scheduling, Jobber, Copilot, Time2book — list + persistent detail).

## The problem (verified live)
Clicking a client navigates to `/coach/clients/:clientUserId` → `CoachClientOverview`, which renders **standalone** (`<Navigation>` + `ClientOverviewHeader` + `ClientOverviewTabs`, `App.tsx:242`) — *outside* the coach shell. So the **`CoachSidebar` global nav disappears** and the only way out is the "‹ My Clients" link: to see another client or jump elsewhere the coach backs out and re-navigates. The roster itself lives in the coach shell (`CoachDashboard` → `CoachDashboardLayout` → `CoachMyClientsPage`). They're two disconnected full pages.

## Target (approved mock)
A **master-detail workspace** inside the coach shell:
- **Desktop / iPad (lg+):** two panes — a **persistent compact roster** (master, ~300–340px) on the left + the **selected client's detail** (right). Clicking a roster row swaps the right pane via the `:clientUserId` URL **without remounting the shell or full-reloading**. The `CoachSidebar` stays.
- **Mobile (<lg):** detail-focused. With no client selected → the roster. With a client selected → the detail full-width, the master collapsed behind a **"Clients" toggle** (slides it in as a `vaul` Drawer) plus a "‹ Clients" back. The shell nav stays reachable.

## Build

### 1) Route + shell — mount the detail inside the coach shell
- Add a route `/coach/clients` (workspace, no client selected) and keep `/coach/clients/:clientUserId` (workspace + detail). Both wrap in the **same shell `CoachDashboard` uses** (the `SidebarProvider` + `CoachSidebar` from `CoachDashboardLayout`), so the global nav is always present. (Today only `:clientUserId` exists and is shell-less — `App.tsx:242`.)
- Net: the detail is never a dead-end page again; even with zero further work the coach keeps their nav + a one-click route home.

### 2) `CoachClientsWorkspace` (new) — the master-detail container
Renders within the coach shell:
- **Master pane** — a **compact, selectable roster list** of the coach's active clients. Reuse the row data + the three batched hooks already powering the roster (`useCoachRosterAttention`, `useCoachRosterStats`, `useStaffUnreadCounts`, `useCoachDeloadRequestCounts`) so each master row shows name · plan · a condensed status (adherence / check-ins / alert dots) and the urgency rail — the same vocabulary as the full roster, condensed to fit ~320px. The row for the active `:clientUserId` is highlighted (bg + rail). Includes the search + sort controls at the top of the master (RO2/RO3 carry over). Clicking a row → `navigate(\`/coach/clients/\${id}\`)` (client-side; the workspace stays mounted).
- **Detail pane** — render `CoachClientOverview`'s ready-state body (`ClientOverviewHeader` + `ClientOverviewTabs`) for `:clientUserId`. **Refactor `CoachClientOverview` so its context-resolution + render is reusable as a `<ClientOverviewPanel clientUserId=… />`** (extract the load/`LoadState` logic + the ready/loading/not-found/error states into a panel component; the route file becomes a thin wrapper). The panel must NOT render its own `<Navigation>` (the shell provides it) — drop that line when embedded. When no `:clientUserId`, the detail shows a calm empty state ("Select a client to view their overview").

### 3) Responsive
- `lg+`: CSS grid `[var(--master,340px) minmax(0,1fr)]`. Master scrolls independently from the detail (each its own overflow region — use the `DrawerScrollArea`/plain `overflow-y-auto` pattern, not a nested Radix ScrollArea inside a max-h chain; see the known-gotcha).
- `<lg`: single column. No `:id` → master (roster). With `:id` → detail full-width; a sticky top bar with a **"Clients"** button opens the master as a `vaul` Drawer (mobile branch via `useIsMobile()`), and a "‹ Clients" back returns to `/coach/clients`. Keep `pb-24 md:pb-8`.

### 4) Keep the full queue reachable
The existing full **Client Queue** (needs-attention strip + Pending/Awaiting/At-Risk sections + pagination in `CoachMyClientsPage`) stays as the `/coach` "Clients" section (and is the natural mobile roster). The workspace master is the *condensed selector* for in-flow triage — don't duplicate the strip/sections into the narrow master; link "Open full queue" from the master header if useful.

## Non-goals / guardrails
- Don't redesign the section tabs (Overview / Progress / Nutrition / Workouts / Sessions / Messages / Care Team / Profile) — they're built and on-brand; reuse `ClientOverviewTabs` as-is. (Per-tab upgrades are a separate pass.)
- Keep the `ClientContext` resolution contract intact (`CoachClientOverview` is the single source of identity for tabs — preserve that when extracting the panel).
- Keep `RoleProtectedRoute requiredRole="coach"` on the routes; keep the not-found/RLS-empty behavior (a client that isn't the coach's falls through to not-found).
- Mobile dock / `coachPrefixes` already include `/coach/clients` — verify the new `/coach/clients` route is covered.

## Known follow-up (NOT CO6, flag in PR)
Coaches can't read clients' `weight_logs` client-side (RLS), so the detail's **Overview "Last weigh-in" card and the Nutrition trend show "No weigh-ins yet / No data yet"** even when the client has logs (confirmed live on the +online client). RO Phase 2's `get_coach_roster_stats` RPC is the precedent; a sibling read should feed coach-visible weigh-ins/trend into those tabs. Separate ticket.

## Verify
- `npx tsc --noEmit` + `npm run build` clean.
- **Desktop:** `/coach/clients` shows the shell + master roster + empty detail; clicking a client loads the detail in the right pane with the `CoachSidebar` still present and **no full-page reload**; the selected row stays highlighted; switching clients just swaps the pane. The 8 section tabs work inside the pane.
- **Mobile:** `/coach/clients` shows the roster; tapping a client shows the detail full-width with the nav present; "Clients" opens the master drawer; "‹ Clients" returns.
- Smoke via the coach test session (the four wired clients). Coach-auth-gated; its own PR off main.
