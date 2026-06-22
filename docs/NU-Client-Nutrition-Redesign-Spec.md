# NU — Client nutrition page redesign: kill the tabs, one consolidated scroll

**Status:** Drop-in spec (2026-06-22, Cowork). **Priority / effort:** P1 / L (two phases). Frontend only — re-composition of existing components. **No data-model change** (all queries still hit `nutrition_goals` / `weekly_progress` / `nutrition_phases` / `weight_logs` / `circumference_logs` / `adherence_logs` / `step_logs`).

Mobbin-grounded (MacroFactor / Lifesum / Yazio / Alma / MyFitnessPal): targets + trend + logging live on one scroll; the goal is edited in a sheet; "progress vs graphs" is never nested tabs — a trend chart with a range control sits above the entries list.

## The problem (current IA)
- **Team** (`TeamNutrition.tsx`): top-level tabs **Goal Setting** | **Progress Tracker**. The Progress tab *also* shows current targets and a **"Change Goal" button that navigates away to the Goal tab**, and it nests a second tab pair **Progress | Graphs**. Three layers of redundant tabbing; both tabs render the current goal.
- **1:1** (`ClientNutrition.tsx`): cleaner, but still 3 tabs **Log Today | This Week | History** under the hero.

## Target IA (both flows converge — see the approved mock)
One scroll, **zero tabs**:
1. **Targets hero** — kcal + macro ribbon + on-track status (+ week/phase context). Team: an **"Edit targets"** button opens a sheet. 1:1: read-only + a **"Message coach to adjust"** link (goal is coach-set).
2. **Log today** — inline weight + steps (the daily habit), with the this-week status strip (weigh-ins X/3, steps, check-in due).
3. **Trend** — weight chart with a **range control (4W / 12W / All)** and a **Weight | Body fat** toggle. Replaces the buried Graphs tab.
4. **Weekly check-ins** — team: the per-week `WeekCard` list (current week expanded, past weeks collapsed one-line rows). 1:1: the single current-week form.

---

## Shared building blocks (build once, use in both phases)

**a. Range filter (no graph-internal changes).** Add local state `range: "4w" | "12w" | "all"` (default `"all"`). Filter the series *before* passing to the existing graph components, so `TeamWeightProgressGraph` / `WeightProgressGraph` / `BodyFatProgressGraph` are untouched:
- Team (weekly rows): `weeklyProgress.slice(range === "all" ? 0 : -(range === "4w" ? 4 : 12))`.
- 1:1 (dated `weight_logs`): filter by `log_date >= now - {28|84} days` (skip filter for `all`).
Render the segmented control as three pill buttons (active = `bg-secondary` + `border-secondary`; matches the mock).

**b. Weight | Body fat toggle.** Local state `metric: "weight" | "bodyfat"`; show `TeamWeightProgressGraph`/`WeightProgressGraph` for `weight`, `BodyFatProgressGraph` for `bodyfat`. (Today both stack; the toggle replaces that.)

**c. Edit-targets sheet.** A responsive sheet hosting the existing `<NutritionGoal />`. Use the shared `ResponsiveDialog` (`src/components/ui/responsive-dialog.tsx`) if its API fits; otherwise mirror `SwapExerciseDialog.tsx`'s `useIsMobile()` Drawer(mobile)/Dialog(desktop) branch (vaul Drawer `max-h-[92dvh]`, `repositionInputs={false}` since `NutritionGoal` has inputs — see BUG6). Mobile drawer must use `DrawerScrollArea` for the body (the calculator is tall).

---

## Phase 1 — Team page (the actual mess)

### 1) `src/components/nutrition/NutritionGoal.tsx` — make it sheet-aware (small, non-breaking)
- Add optional prop: `interface NutritionGoalProps { onSaved?: () => void }` and accept `{ onSaved }`.
- After a **successful** goal insert (the deactivate-then-insert block ~L295-307 — keep the deactivate-before-insert exactly; it satisfies the `nutrition_goals` single-active partial unique index), call `onSaved?.()`.
- No other change — it already loads + displays the active goal and toggles its own `isEditing` wizard. It never navigated, so nothing to remove here.

### 2) `src/components/nutrition/NutritionProgress.tsx` — the restructure (return JSX, ~L197-355)
Keep all data loading, macro math (`currentCalories`/`currentProteinGrams`/…), and the `WeekCard` component unchanged. Restructure the render:

- **Keep** the NU3 "Your plan just updated" banner (L199-242) at the very top.
- **Hero** = the existing Active Goal Summary Card (L244-307), with two changes:
  - Add a `MacroDistributionRibbon` (already imported) under the kcal/macros grid (protein/fat/carbs grams already computed).
  - Replace the **"Change Goal"** button (L256-258, which does `navigate('/nutrition')`) with an **"Edit targets"** button that opens the edit-targets sheet (block **c**) hosting `<NutritionGoal onSaved={() => { setSheetOpen(false); loadData(sessionUser); }} />`.
- **Delete the nested `<Tabs Progress | Graphs>`** (L309-353). Replace with, in order:
  - **Trend block**: the range control (block **a**) + Weight|Body-fat toggle (block **b**) + the selected graph (filtered data).
  - **Weekly check-ins**: the existing "Weekly Logs" header + `WeekCard` map (L316-346) exactly as-is (it already defaults `expandedWeeks` to the current week, so past weeks are collapsed). Drop the now-defunct "Add Inputs" button if it's a no-op (`onClick={() => {}}`, L319).
- **Empty state** (no active goal, L119-128): change the copy from "set a goal first in the Goal tab" to a **"Set your targets"** button that opens the same edit-targets sheet.

### 3) `src/pages/TeamNutrition.tsx` — remove the top-level tabs
- Delete the `<Tabs>` / `TabsList` / two `TabsContent` (L147-166) and the `activeTab`/`?tab=` plumbing (L22, the `onValueChange` navigation).
- Render `<NutritionProgress />` directly as the page body. The "Goal Setting" surface now lives only inside the hero's Edit sheet.
- Keep the page header but simplify the subtitle (it no longer describes two tabs). Keep `Navigation`, the access checks, and `pb-24 md:pb-12`.
- Note: `?tab=progress` deep links (e.g. from NU3 history) now 404-less — just land on the page. Grep for `/nutrition-team?tab=` and drop the `?tab=` (harmless if left, but tidy).

---

## Phase 2 — 1:1 page alignment (`src/pages/ClientNutrition.tsx`)
Bring it to the same shape (it's already close — hero + ribbon exist). Restructure the active-phase render (L266-335):

- **Keep** `PhaseSummaryReport` (when complete), the `NutritionPhaseCard` hero, and `ClientWeeklyRibbon`.
- **Hero affordance**: since 1:1 goals are coach-set (no self-edit), add a small **"Message coach to adjust"** link under the hero → `navigate("/messages")`. (No Edit sheet here.)
- **Promote "Log Today"** out of the tab: render `<LogTodayCard …>` inline right after the ribbon (it's the daily habit; same component already used).
- **Delete the `<Tabs today | week | history>`** (L289-334). Replace with, in order:
  - **Trend block**: range control + Weight|Body-fat toggle (blocks **a**/**b**), rendering `WeightProgressGraph` (weight) / `BodyFatProgressGraph` (bodyfat) with filtered data — was the "History" tab.
  - **This week**: `<ClientNutritionProgress phase=… userGender=… initialBodyFat=… />` (the full weekly form) — was the "This Week" tab — under a "This week" heading.
- Keep the `!activePhase` empty state and `pb-24`.

The shapes now match: **hero → log today → trend (range + toggle) → weekly input**. Team differs only by self-service goal editing (sheet) + a multi-week `WeekCard` list; 1:1 has a coach-set hero + a single current-week form. That's the "similar as appropriate."

---

## Non-goals / guardrails
- No DB / RPC / migration. No change to the adjustment math, the deactivate-before-insert goal flow, or the graph components' internals (filter data upstream).
- Don't merge the team `WeekCard` multi-week list into the 1:1 page — 1:1 phases are coach-managed; its weekly input stays the single `ClientNutritionProgress` form.
- Keep `calculateNutritionGoals()` as the only macro/TDEE source (NutritionGoal already uses it via the wizard) — don't inline math.
- Coach nutrition surfaces (`CoachNutritionGoal`, the Client Overview `NutritionTab`) are **out of scope** — this is the client-facing pages only.
- Preserve every auth/access check at the top of both pages and the `nutrition_goals` single-active index behavior.

## Verify (per phase)
- `npx tsc --noEmit` clean; `npm run build` clean.
- **Team (Phase 1):** `/nutrition-team` (active team client) shows one scroll: hero with macro ribbon + Edit targets → opens the sheet → editing + saving closes it and the hero/logs refresh (no navigation, no tabs). Trend range control + Weight/Body-fat toggle work; weekly check-ins list shows current week expanded. First-time (no goal) → "Set your targets" opens the sheet.
- **1:1 (Phase 2):** `/nutrition-client` (active 1:1 client) shows hero (read-only) + "Message coach to adjust" → `/messages`; Log Today inline; trend toggle/range; This-week form below. No tabs.
- **Auth-gated:** both pages require an active client of the right service type (admin/coach are redirected) — verify via test-client logins (team + 1:1) or the Capacitor build, like CL1/PUB1. I'll read each diff on push; on-device/test-client visual is the acceptance gate.
- Ship as **two PRs** (Phase 1 then Phase 2); each its own branch off main.
