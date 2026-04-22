# Client Overview Page — Handoff for Parallel Claude

> **You are building the coach-facing "Client Overview" shell.** Another Claude is in charge of the Nutrition tab (already scaffolded — see below). Do not touch nutrition files. Read this whole doc before coding.

## Status (Apr 21, 2026)

**PR A shipped** — shell + Overview tab + Workouts placeholder + route wiring. See `docs/history.md` for the writeup.

Landed files:
- `src/pages/CoachClientOverview.tsx` — shell, route target for `/coach/clients/:clientUserId`
- `src/components/client-overview/ClientOverviewHeader.tsx` — identity + status rail + service badges + demographics micro-line + "Submission" quick action
- `src/components/client-overview/ClientOverviewTabs.tsx` — tab strip, `?tab=` URL sync
- `src/components/client-overview/tabs/OverviewTab.tsx` — phase week + last workout + last weigh-in + pending-adjustments nudge
- `src/components/client-overview/tabs/WorkoutsTab.tsx` — placeholder (replaced in PR C)
- Route + `/coach/clients` mobile-nav prefix wired in `src/App.tsx`

Remaining per §10 ship plan:
- **PR B** — entry-point rewire (§10a). Not yet started.
- **PR C** — Workouts tab. Handed to a dedicated Claude; replaces the `WorkoutsTab.tsx` placeholder.
- Old `/coach-client-nutrition` route still live; deprecation is a later PR after entry-point rewire soaks.

## 1. Project context

- **Repo:** `/Users/HasDash/Desktop/intensive-gainz-unit-main`
- **Stack:** React 19 + Vite + TypeScript, Supabase (Postgres + Auth + Edge Functions), Tailwind + shadcn/ui, React Router v6, TanStack Query
- **Start with `CLAUDE.md`** at the repo root — it has the full architecture, conventions, and gotchas. Non-negotiable read.
- **No scripted emoji in output.** No multi-paragraph docstrings. Match the existing code style.

## 2. The goal

Today when a coach clicks a client, they're fragmented across `/coach-client-nutrition`, `/client-submission/:id`, and other standalone pages. We're consolidating into one page: **Client Overview**. One client, one URL, multiple domain tabs (Nutrition, Workouts, more later). No feature loss — all existing functionality must remain reachable.

## 3. Your scope

1. The route + page shell that fetches the client context once and renders tabs.
2. A **Header** at the top (client identity + service badges + status + a few quick actions).
3. An **Overview tab** that summarises the client (phase week, last workout, adherence pulse — think "at-a-glance is this client OK?").
4. A **Workouts tab** — list of `client_programs` for this user, with drill-down into recent sessions/adherence.
5. Wire mobile nav: add the new path prefix to `CoachMobileNavGlobal` in `src/App.tsx` (see CLAUDE.md § "Mobile bottom nav" rules).

### Explicitly out of scope (do NOT touch)

- `src/components/nutrition/**`
- `src/pages/*Nutrition*.tsx` and `src/pages/CoachClientNutrition.tsx`
- `src/components/client-overview/tabs/NutritionTab.tsx` (already exists — drop it into the shell as-is)
- `src/components/client-overview/types.ts` (stable contract — see §5)
- Removing the old `/coach-client-nutrition` route (a later PR will deprecate it once the shell is live)

## 4. Route + URL pattern

- **New route:** `/coach/clients/:clientUserId`
- **Query param:** `?tab=overview|nutrition|workouts` — defaults to `overview`
- **Auth:** wrap in `RoleProtectedRoute requiredRole="coach"` (see `src/components/RoleProtectedRoute.tsx`). Admins currently fail this check — that's OK for this PR. Admin access is a separate follow-up.
- **Mobile nav:** add `/coach/clients` to `coachPrefixes` in `src/App.tsx` (around line 135).

## 5. The stable contract — DO NOT CHANGE without cross-owner agreement

`src/components/client-overview/types.ts` is locked. Every tab receives:

```ts
export interface ClientContext {
  clientUserId: string;
  profile: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    status: string; // profiles_public.status
  };
  subscription: {
    id: string;
    status: string;      // subscriptions.status
    serviceType: string; // services.type: 'one_to_one' | 'team' | 'hybrid' | 'in_person'
    serviceName: string | null; // services.name
  } | null;
  viewerRole: "coach" | "admin" | "dietitian";
}

export interface ClientOverviewTabProps { context: ClientContext; }
```

Every tab component (yours and mine) must accept `{ context }: ClientOverviewTabProps`. The shell is the single place that resolves identity, profile, subscription, and viewer role. **No tab refetches these.** Tabs fetch their own domain data (phase, programs, etc.).

## 6. Data to fetch in the shell

- **Profile:** `profiles_public` row by `id = clientUserId` (already RLS-safe for coaches of the client)
- **Subscription:** `subscriptions` joined with `services!inner(name, type)` — most recent only
- **Viewer role:** `user_roles` for `auth.uid()` — map to the three viewerRole values

Follow the pattern in `src/pages/CoachClientNutrition.tsx` (lines ~100–170) for the coach-access check. Reuse `useClientDemographics` hook (`src/hooks/useClientDemographics.ts`) if you need age / gender / height / latest weight for the header — **don't build a parallel fetch**.

## 7. Files to read before you code

- `CLAUDE.md` (root) — **must**
- `src/auth/roles.ts` — role system
- `src/lib/routeConfig.ts` — route registry
- `src/App.tsx` — where to add the route + mobile nav prefix
- `src/components/RoleProtectedRoute.tsx` — the guard pattern
- `src/components/coach/CoachDashboardLayout.tsx` — the header visual style you should match
- `src/components/ui/clickable-card.tsx` — **use this** for any clickable card (CLAUDE.md rule: never `<Card onClick>`)
- `src/pages/CoachClientNutrition.tsx` — existing client-access pattern you're superseding
- `src/hooks/useClientDemographics.ts` — reuse for age/height/weight if shown in the header

## 8. Design guidance

- Apply the **`frontend-design`** / **`web-design-guidelines`** skills if you have them. You're designing a primary page; don't wing the visual system.
- Header should echo the Planning Board / Nutrition redesign visual vocabulary — minimal cards, monospace micro-copy for numeric stats, color rails for status, status badges. See `src/components/nutrition/NutritionPhaseCard.tsx` for tone.
- Mobile: tab strip sticks below header; each tab's content is its own scroll. `pb-24 md:pb-8` on the content area (CLAUDE.md rule — client dock is `h-16` on mobile).
- Keep the page `max-w-7xl mx-auto` to match `/coach-client-nutrition` and `/coach`.

## 9. Suggested file structure

```
src/
├── pages/
│   └── CoachClientOverview.tsx            // the shell, route target
├── components/
│   └── client-overview/
│       ├── types.ts                       // LOCKED, do not edit
│       ├── ClientOverviewHeader.tsx       // new — your scope
│       ├── ClientOverviewTabs.tsx         // new — the tab strip + routing sync
│       └── tabs/
│           ├── OverviewTab.tsx            // new — your scope
│           ├── NutritionTab.tsx           // EXISTS, do not edit
│           └── WorkoutsTab.tsx            // new — your scope
```

## 10. Ship plan

**PR A — Shell + Overview tab + route wiring** (your first PR)
- Route added, mobile nav prefix added
- Shell fetches profile/subscription/role once
- Header renders with avatar, name, service badge, status
- Overview tab placeholder content (weeks active, quick stats — can be minimal)
- Nutrition tab slot imports `NutritionTab` and passes `context` through
- Workouts tab: empty-state card `"Workouts tab coming soon"`
- tsc + lint + build must be clean

**PR B — Entry-point rewire** (see §10a below)

**PR C — Workouts tab**
- Fetch `client_programs` for `clientUserId` (use three separate queries — **never** nested PostgREST FK joins on `client_programs`, see CLAUDE.md)
- Render program list → drill-down into day_modules/client_day_modules
- Reuse existing workout-viewer components if any exist

## 10a. Entry points — rewire in PR B

Today several places on the coach side click into client-specific views. After PR A lands, re-target these to `/coach/clients/:clientUserId` so the coach lands in the new shell instead of the fragmented standalone pages. Do them in **one focused PR** after the shell is verified live.

| File | Line(s) | Today | Change to |
|---|---|---|---|
| `src/components/coach/CoachDashboardLayout.tsx` | ~93 (`handleViewClientDetail`) | Sets local state; layout swaps to inline `CoachClientDetail` panel | `navigate(\`/coach/clients/${clientId}\`)` and remove the inline panel branch |
| `src/components/coach/CoachMyClientsPage.tsx` | ~495 (`handleViewNutrition`) | `navigate(\`/coach-client-nutrition?client=${client.id}\`)` | `navigate(\`/coach/clients/${client.id}?tab=nutrition\`)` |
| `src/components/coach/CoachMyClientsPage.tsx` | ~671 (dropdown "View Submission") | `navigate(\`/client-submission/${client.id}\`)` | Either leave (separate concern) or `navigate(\`/coach/clients/${client.id}\`)` |
| `src/components/coach/CoachMyClientsPage.tsx` | ~825 | `navigate('/coach-client-nutrition')` (context-free) | Remove — the new shell only makes sense with a specific client |
| `src/components/coach/CoachClientDetail.tsx` | ~497 | `window.open(\`/coach-client-nutrition?client=${clientUserId}\`, '_blank')` | `navigate(\`/coach/clients/${clientUserId}?tab=nutrition\`)` — same tab |
| `src/components/coach/ClientActivityFeed.tsx` | ~202 | `navigate(\`/coach/clients?client=${activity.clientId}\`)` (goes to list, not detail) | `navigate(\`/coach/clients/${activity.clientId}\`)` |
| `src/components/coach/MyAssignmentsPanel.tsx` | ~203, ~211, ~255 | `onClientSelect?.(assignment.client_id)` → parent handler | Unchanged if parent (CoachDashboardLayout) is updated above. Verify. |

**Do NOT touch in PR B:**
- `src/components/coach/NeedsAttentionAlerts.tsx:101` — `/coach/clients?filter=pending` is the filtered *list* view, still needed.
- `src/components/coach/CoachTodaysTasks.tsx:37` — also goes to filtered list.
- Existing `/coach-client-nutrition` route itself — deleting the route is a later PR (after entry-point rewire is soaked for a day).

The inline `CoachClientDetail` panel that `CoachDashboardLayout` renders today becomes dead once entry points reroute. Flag it for removal in the ship-plan comment; don't delete yet.

## 11. Testing checklist before merge

- [ ] Type check clean (`npx tsc --noEmit`)
- [ ] Lint clean (`npm run lint`)
- [ ] Build clean (`npm run build`)
- [ ] Coach can load `/coach/clients/:someClientId` and see their own client
- [ ] Coach cannot load a URL with a client that isn't theirs (RLS returns empty → friendly empty state, not crash)
- [ ] Mobile: dock doesn't clip the footer of the page; tab strip is reachable
- [ ] Tab query param sync works: `?tab=nutrition` deep links to that tab; clicking tabs updates URL
- [ ] Feature parity with `/coach-client-nutrition` when on Nutrition tab (run through once end-to-end)

## 12. Coordination rules

- Branch off `main`. Do not rebase onto the nutrition Claude's branch or vice versa.
- If you need to change `types.ts`, ping the other Claude first (Slack / shared note). Additive changes only; never rename or remove fields.
- If you hit a blocker in the nutrition components, do not monkey-patch them — flag it.
- Commit message prefix: `feat(client-overview):` for new work, `fix(client-overview):` for bugs.

## 13. Current repo state at handoff time

- `src/components/client-overview/types.ts` — locked contract
- `src/components/client-overview/tabs/NutritionTab.tsx` — ready to drop into your shell
- Nothing else exists in `src/components/client-overview/` yet

Good luck. The nutrition Claude is on standby to discuss contract changes if anything in the current shape doesn't fit — raise early rather than fork.
