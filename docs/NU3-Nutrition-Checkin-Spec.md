# NU3 — Weekly check-in: "here's your new target & why" moment

**Status:** RE-TARGET spec (v2, 2026-06-20). The first attempt (PR #168) shipped the banner into `ClientNutritionAdjustments.tsx`, which is **orphaned — never imported or mounted by any page** (dead since the Lovable migration), so it had zero UI effect. The live prod smoke caught it. This v2 points the banner at the surface the client actually sees.

**Priority / effort:** P1 / S–M (the `interpretAdjustment` helper + tests already landed in `interpret.ts` via #168 — reuse them unchanged; this is mount + wiring + cleanup).

---

## What's already done (keep, don't redo)
- `src/lib/interpret.ts` → `interpretAdjustment(...)` and its 4 vitest cases — **already merged (#168), generic, reusable as-is.** Do not re-add or modify.

## What was wrong
- Banner was added to `src/components/nutrition/ClientNutritionAdjustments.tsx` → **orphaned component, delete it** (see step 3).
- It read the `nutrition_adjustments` table → **empty platform-wide and unused on the client path** (the coach-approval adjustment flow is legacy). The real adjustment data for clients lives in **`weekly_progress`**.

## Surface map (verified 2026-06-20)
- **Team-plan client** → `TeamNutrition` page → **`NutritionProgress.tsx`** → reads `weekly_progress`; shows an "Active Goal Summary Card" (`currentCalories` + computed `currentProteinGrams/currentFatGrams/currentCarbGrams`) and a per-week green/orange adjustment `Alert`. **← NU3 target.**
- **1:1 client** → `ClientNutrition` page → `NutritionPhaseCard` (already a rich read-only hero) + `ClientNutritionProgress` (logging only; doesn't display adjusted calories). The 1:1 hero already exists, so **NU3 scope = the team-flow `NutritionProgress` only.**
- Data is empty pre-launch (`weekly_progress` = 0 rows), so the banner only appears once a client completes a weekly check-in. Verify via a temporary seeded row (step 5).

---

## 1) `src/components/nutrition/NutritionProgress.tsx` — add the hero banner

**Imports to add:**
```ts
import { interpretAdjustment, toneClasses } from "@/lib/interpret";
import { cn } from "@/lib/utils";
import { MacroDistributionRibbon } from "@/components/nutrition/MacroDistributionRibbon";
```
(`Card`, `Alert`, `AlertCircle` are already imported.)

`latestProgress`, `currentCalories`, `currentProteinGrams/currentFatGrams/currentCarbGrams`, and `activeGoal` are already in scope (computed at the top of the component).

**Render the banner** as the FIRST child of the top-level `<div className="space-y-6">` (i.e. directly above the `{/* Active Goal Summary Card */}` Card), shown only when the latest week has an applied target:

```tsx
{latestProgress && latestProgress.new_daily_calories != null && (() => {
  const interp = interpretAdjustment({
    calorieDelta: latestProgress.calorie_adjustment,
    newCalories: latestProgress.new_daily_calories,
    // actual = the logged weekly change %; expected = the goal's target rate, signed by direction
    actualPct: latestProgress.weight_change_percentage ?? null,
    expectedPct:
      latestProgress.weight_change_percentage == null
        ? null
        : activeGoal.goal_type === "fat_loss"
          ? -activeGoal.weekly_rate_percentage
          : activeGoal.goal_type === "muscle_gain"
            ? activeGoal.weekly_rate_percentage
            : 0,
    isDietBreak: !!latestProgress.is_diet_break_week,
  });
  const tc = toneClasses(interp.tone);
  return (
    <Card className={cn("border-l-4", tc.rail, tc.soft)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Your plan just updated</CardTitle>
        <CardDescription>Week {latestProgress.week_number} target</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">
            {Math.round(latestProgress.new_daily_calories).toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">kcal / day</span>
        </div>
        <MacroDistributionRibbon
          protein={currentProteinGrams}
          fat={currentFatGrams}
          carbs={currentCarbGrams}
          showLabels
        />
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <span aria-hidden className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", tc.dot)} />
          {interp.sentence}
        </p>
      </CardContent>
    </Card>
  );
})()}
```

Notes:
- Macros come from the component's already-computed `currentProteinGrams/Fat/Carb` (weekly_progress stores only `new_daily_calories`, not new macros).
- No coach-notes block here — `weekly_progress.notes` is the **client's own** note, not a coaching message; don't mislabel it.

## 2) CC5 token pass on the per-week adjustment Alert (in the same file)
The `WeekCard`'s adjustment `Alert` (~L941) hardcodes `border-green-200 bg-green-50` / `border-orange-200 bg-orange-50`. An increase/decrease is **directional, not good/bad** — route it through the neutral status surface: replace those conditional classes with `cn(toneClasses("neutral").soft)` (keep the up/down wording + AlertCircle as the direction cue). Don't tone it green/red.

## 3) Delete the orphaned component
Remove `src/components/nutrition/ClientNutritionAdjustments.tsx` entirely (dead code; the NU3 banner + token pass it received in #168 go away with it). Confirm nothing imports it (grep is clean today).

---

## 4) Verify (build + unit)
- `npx tsc --noEmit` clean.
- `npx vitest run src/lib/interpret.test.ts` green (the 4 `interpretAdjustment` cases already exist).

## 5) Verify (live — requires seeding, platform data is empty)
`weekly_progress` has 0 rows, so seed ONE temporary row against an active team-plan phase, screenshot the banner on `/nutrition-team?tab=progress` as that client, then DELETE the row:
```sql
-- pick an active team-plan goal_id + its user_id, then:
insert into weekly_progress (goal_id, user_id, week_number, week_start_date,
  new_daily_calories, calorie_adjustment, weight_change_percentage, is_diet_break_week)
values ('<goal_id>','<user_id>',1, current_date, 1620, -130, -0.85, false);
-- view banner → expect: 1,620 kcal hero + ribbon + "Your daily target is down 130 kcal to 1,620 kcal. Your weekly change came in at -0.85% vs your -<rate>% target."
-- then clean up:
delete from weekly_progress where goal_id='<goal_id>' and week_number=1 and created_at > now() - interval '1 hour';
```
Confirm the banner does NOT appear for a client with no `weekly_progress` row (no crash, just absent).

## Non-goals
- 1:1 flow (`ClientNutritionProgress` / `NutritionPhaseCard`) — out of scope; it already has a hero.
- The legacy `nutrition_adjustments` table / coach-approval flow — untouched.
- No new DB columns, RPCs, or migrations.
