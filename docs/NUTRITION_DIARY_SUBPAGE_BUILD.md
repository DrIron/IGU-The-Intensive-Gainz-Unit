# Nutrition diary → its own sub-page, for all plans (1A)

Move the client food diary off the `/nutrition` landing into its own nested sub-page
`/nutrition-diary`, and open it to **all active members on any plan** (team, 1:1 online,
1:1 complete, hybrid, in-person). The `/nutrition` landing becomes a clean at-a-glance page; a
compact "Today's food" entry card replaces the inline diary and links into the sub-page. The
same card goes on the client dashboard and on the team nutrition landing.

This is a re-placement + one new shared card + a loosened access gate. `FoodLogDayView`
internals and the `useFoodLogAuthoring` write path do NOT change. **No DB migration.**

## Grounding (verified against main 2026-07-17)
- **RLS is already plan-agnostic.** `food_log own` policy (migration
  `20260714120000_food_logging_p0_lite.sql` L442-446): `USING (client_id = auth.uid()) WITH
  CHECK (client_id = auth.uid())` for all `authenticated`. Every member can already read/write
  their own food log regardless of plan. No migration needed.
- **Target resolves for both plan types automatically.** `getActiveNutritionTarget`
  (`src/lib/nutritionTarget.ts`) reads the active `nutrition_phases` row (1:1 coach-set) then
  falls back to the active `nutrition_goals` row (team-plan self-service, set via the team
  calorie calc at `/nutrition-team?tab=goal`). So: a team member who set a goal gets a target +
  progress bar in the diary; one who hasn't logs targetless (NutritionSummary drops "of N" +
  bar). Nothing to build for targets.
- `src/pages/ClientNutrition.tsx` (1:1 landing) renders `<FoodLogDayView clientUserId={user.id} />`
  inline in BOTH branches: no-phase ~L424, active-phase ~L439.
- `src/pages/TeamNutrition.tsx` (team landing) renders `<NutritionProgress />` at ~L140, under a
  centered header; no food-log surface today.
- `/nutrition` (`src/pages/Nutrition.tsx`) is a redirect dispatcher → `/nutrition-client` (1:1) /
  `/nutrition-team` (team), and already blocks non-active clients. New route slots in beside
  these as a flat `/nutrition-diary`.
- `useFoodLog(clientUserId, logDate)` (`.../food-log/useFoodLog.ts`) returns
  `{ totals, target, loading, loadError, reload }` — the reusable read for the card.
- `NutritionSummary` (`.../nutrition/NutritionSummary.tsx`) is THE canonical kcal+macros visual;
  drops "of N"/bar when `target` is null. Reuse it — no bespoke visual.
- `NewClientOverview` (the dashboard body) is shared across plans — `ClientDashboardLayout`
  renders it for both team and 1:1 (L478 + L516).
- Dock persistence: `ClientMobileNavGlobal.clientPaths` (App.tsx L99) — `/nutrition-diary` does
  NOT match `/nutrition` (no trailing slash), so the dock hides unless added.
- No dashboard food-diary entry exists today.

## Changes

### 1. New shared card: `src/components/nutrition/food-log/TodayFoodCard.tsx`
- Props: `{ clientUserId: string }`.
- `const { totals, target, loading, loadError, reload } = useFoodLog(clientUserId, format(new Date(), "yyyy-MM-dd"))`.
- Render a `ClickableCard` (NEVER `<Card onClick>`) → `navigate("/nutrition-diary")`,
  `ariaLabel="Open your food diary"`.
  - Header row: mono uppercase label "Today's food" + trailing "Open diary" with `ChevronRight`.
  - Body: `<NutritionSummary totals={totals} target={target} size="sm" />` (bump to `md` if it
    reads cramped — your call).
- States (HONESTY — assert the bad state can't render):
  - `loading` → `Skeleton`, not a zeroed card.
  - `loadError` → `<LoadError message="We couldn't load today's food." onRetry={reload} />`.
    NEVER render a 0-kcal "nothing logged" summary on error.
  - No target → NutritionSummary already drops of-N + bar; no fabricated target, no red on over.
- Test `TodayFoodCard.test.tsx`: (a) renders totals from a mocked `useFoodLog`; (b) on
  `loadError` shows retry and does NOT render NutritionSummary / any "0 kcal" text; (c) navigates
  to `/nutrition-diary`.

### 2. New page: `src/pages/ClientNutritionDiary.tsx`
- Access gate: **active member on ANY plan** — `profile.status === "active"` AND
  `subscription.status === "active"`. Do NOT restrict by `service.type` (this is the change from
  1:1-only). Reuse the `useAuthSession` + `hasFetched` ref pattern. Inactive / no active sub →
  toast + `navigate("/dashboard")` (mirrors Nutrition.tsx's activation gate).
- Shell: `<ClientPageLayout>`. Top: a back link `‹ Nutrition` → `navigate("/nutrition")` (the
  dispatcher routes each member back to their own landing). Then
  `{user?.id && <FoodLogDayView clientUserId={user.id} />}`. Nothing else.
- Test: an active team member renders `FoodLogDayView` (NOT redirected); an inactive member is
  redirected.

### 3. Route registration
- `src/lib/routeConfig.ts` (near L145-147): add
  `{ id: "nutrition-diary", path: "/nutrition-diary", label: "Food diary", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },`
- `src/App.tsx`:
  - Lazy import (near L44): `const ClientNutritionDiary = lazyWithReload(() => import("./pages/ClientNutritionDiary"));`
  - Route (near L332): `<Route path="/nutrition-diary" element={<AuthGuard><OnboardingGuard><ClientNutritionDiary /></OnboardingGuard></AuthGuard>} />`
  - `ClientMobileNavGlobal.clientPaths` (L99): add `"/nutrition-diary",` so the dock persists.

### 4. `src/pages/ClientNutrition.tsx` — lift the diary out (1:1 landing)
- Remove BOTH inline `<FoodLogDayView clientUserId={user.id} />` (~L424 no-phase, ~L439 phase).
- In each branch put `{user?.id && <TodayFoodCard clientUserId={user.id} />}` at the top of the
  stack instead.
- Drop the unused `FoodLogDayView` import; add `TodayFoodCard`.
- Test: on `/nutrition-client` the inline diary meal sections no longer render
  (`data-meal-section` absent); `TodayFoodCard` is present.

### 5. `src/pages/TeamNutrition.tsx` — add the entry card (team landing)
- Insert `{user?.id && <TodayFoodCard clientUserId={user.id} />}` between the header block and
  `<NutritionProgress />` (~L139), wrapped with `mb-6` (or a `space-y` container).
- Test: `TodayFoodCard` renders on the team nutrition page.

### 6. `src/components/client/NewClientOverview.tsx` — dashboard entry (all plans)
- Render `<TodayFoodCard clientUserId={user.id} />` at the TOP of the main column (L206, above
  `NutritionTargetsCard`).
- Gate only on active status (matches the diary gate), NOT on plan:
  `{profile?.status === "active" && subscription?.status === "active" && user?.id && <TodayFoodCard .../>}`.
  No service-type query needed — the card and diary are open to every plan.

## Guards / conventions
- `ClickableCard` for the card (CLAUDE.md), not `<Card onClick>`.
- Destructure `{ error }` on any new Supabase call and throw; `.maybeSingle()` for optional rows.
- Match each file's existing plain-string convention (they don't use `t()` today); Arabic rides
  the CC11-b string-extraction pass.
- Copy uses `--` never `—` (none needed here).

## Verify
- `tsc -p tsconfig.app.json --noEmit` → zero NEW errors vs the 292 baseline (root `tsc` is a no-op).
- Vitest: the new/updated tests green; confirm CI green (not just local — supabase-env false-green).
- Live smoke (after deploy, Hasan signs in):
  - `+online` (1:1) client: `/nutrition` shows `TodayFoodCard` (no inline meal sections) → tap →
    `/nutrition-diary` renders the full diary with the bottom dock present; add/edit/delete an
    entry still works; dashboard shows the card.
  - A **team** test client: `/nutrition-team` shows the card → `/nutrition-diary` opens and logs
    food; if the team member has set a goal via the calc, the diary shows their target + bar; if
    not, it logs targetless. Confirm they are NOT redirected out.

## Optional (flag, don't fold in)
- Nutrition dock tab (`path: "/nutrition"`) doesn't highlight on `/nutrition-client`,
  `/nutrition-team`, or `/nutrition-diary` — `MobileBottomNav.isActive` (L43) exact-matches
  non-root paths. Pre-existing. If wanted, special-case the nutrition item to also match those.
- The team nutrition header still uses a `bg-gradient-to-r from-primary to-accent` icon circle
  (TeamNutrition.tsx L127) — a leftover gradient the DS2 flatten pass could pick up later.
