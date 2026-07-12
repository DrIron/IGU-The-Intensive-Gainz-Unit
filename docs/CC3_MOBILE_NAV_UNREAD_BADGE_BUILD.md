# CC3 — Unread-count badge on the mobile bottom nav

**Status:** Build handoff (2026-07-05, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Board:** CC3 (Cross-cutting, P1, S). Status was "Partial — unread infra + non-bottom-nav badges shipped; bottom-nav wiring is the remaining piece." This slice does that last piece.
**Scope = frontend only, no DB/RPC/edge changes.** The unread infra already exists and is realtime-backed; this only surfaces it on the mobile dock.

## What already exists (reuse, don't rebuild)
- `useUnreadMessageCount(clientUserId) -> { count, isLoading }` (`src/hooks/useUnreadMessageCount.ts`) — per-thread count for the viewer, backed by `get_unread_message_count`, refreshed via Supabase realtime + 5-min poll + tab-focus. Pass the viewer's own user id.
- `ClientSidebar.tsx` already renders this badge on desktop: `useUnreadMessageCount(viewerId)` (viewerId from `useAuthSession`) -> `formatUnreadBadge(count)` (module-local, `src/components/client/ClientSidebar.tsx:199`, returns `"9"`/`"9+"`/`null`) -> badge with `aria-label={`${badge} unread`}`.
- `MobileBottomNav.tsx` (`src/components/layouts/MobileBottomNav.tsx`) — generic dock, `items: NavItem[]` (`{path,label,icon}`), `maxVisible=4`, overflow into a "More" `DropdownMenu`. **No badge support today.**
- Client dock wiring: `App.tsx:127 MobileBottomNavClient` lazy-renders `<MobileBottomNav items={getClientMobileNavItems()} />`. `getClientMobileNavItems()` (`ClientSidebar.tsx:209`) returns the items; **Messages is the 5th item -> lands in the "More" overflow on mobile** (maxVisible 4).

## The gap
`getClientMobileNavItems()` is a plain function (no hooks) and `MobileBottomNav` has no badge slot, so the mobile dock shows no unread badge even though the sidebar does. Because Messages is in overflow, the badge must show on the **"More" button** (dot) AND the **overflow menu item**.

## Build

### 1. `formatUnreadBadge` -> shared
Export `formatUnreadBadge` from `ClientSidebar.tsx` (or move it to a tiny util like `src/lib/unread.ts` and re-import in the sidebar) so the dock wrapper can reuse the exact same formatting (`"9"`/`"9+"`/`null`). Don't duplicate the logic.

### 2. `MobileBottomNav.tsx` — badge support
- Extend `NavItem` with optional `badge?: string | null` (the pre-formatted string, mirroring the sidebar).
- **Visible item:** when `item.badge`, render a small pill anchored top-right of the icon: `absolute -top-1 right-3` (tune to sit over the icon), `bg-destructive text-destructive-foreground text-[10px] leading-none rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center`, `aria-label={`${item.badge} unread`}`. The `<Link>` needs `relative` for the anchor. Don't change the 44px/`min-w-[64px]` target or layout height.
- **Overflow "More" button:** if any `overflowItems.some(i => i.badge)`, render a dot on the More button (e.g. `absolute top-1 right-3 h-2 w-2 rounded-full bg-destructive`, `aria-hidden` — the count lives on the item inside). Button needs `relative`.
- **Overflow menu item:** render the badge pill to the right of the label inside the `DropdownMenuItem` (`ml-auto`), same styling + `aria-label`.
- Purely additive: items with no `badge` render exactly as today (byte-identical for coach/admin docks).

### 3. Wire the client dock (`App.tsx` `MobileBottomNavClient`)
Mirror the coach dock pattern (`App.tsx:168-188`, which already uses `useAuthSession` inside the lazy `default`). In the client dock's lazy `default` component:
- Import `useUnreadMessageCount` + `useAuthSession` (add to the `Promise.all` imports).
- `const { user } = useAuthSession();`
- `const { count } = useUnreadMessageCount(user?.id);` (a client is the `client_id` of their own thread, so their own id is correct; `undefined` pauses the fetch pre-auth).
- Get `const items = getClientMobileNavItems();`, then inject the badge onto the Messages item: map items, and for the one whose `path === "/messages"` set `badge: formatUnreadBadge(count)`. Match on `path === "/messages"` (stable) — confirm the Messages item's `path` in `getClientMobileNavItems()`.
- Pass the mapped items to `MobileBottomNav`.
Keep it inside the lazy default so hooks run in a component and the dock re-renders on realtime count changes (same shape as the coach dietitian-swap dock).

### Out of scope (note in PR, don't build)
- **Coach/Admin docks:** the coach dock has no single Messages destination (coach messages are per-client via `useStaffUnreadCounts`), so there's nothing to attach a badge to. Leave them unchanged. If a coach "all messages" destination is added later, badge it then with the summed `useStaffUnreadCounts`.

## Verify (Cowork, prod, +online client, mobile viewport)
- With unread coach->client messages present: the client dock's **"More" button shows a dot**, and opening More shows **"Messages" with a count badge** matching the sidebar/desktop count. (If Messages is ever promoted to a visible slot, the pill shows on the icon.)
- Reading the thread -> badge clears within a few seconds (realtime) without a reload.
- Coach + admin docks unchanged (no badge, no layout shift).
- `aria-label="N unread"` present; 44px targets + dock height unchanged.
- tsc (~306 baseline, zero-new), ESLint 0, build clean.
