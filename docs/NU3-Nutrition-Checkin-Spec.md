# NU3 — Weekly check-in: "here's your new target & why" moment

**Status:** Spec ready (authored 2026-06-20, Cowork). Implement on a clean `main` after CL2 + HX1 merge — NU3 adds a helper to `src/lib/interpret.ts`, the same file CL2/HX1 touched, so wait for those to land to avoid a 3-deep stack.

**Priority / effort:** P0 / M (re-scoped to S–M).

**Surface:** `src/components/nutrition/ClientNutritionAdjustments.tsx` (the client-facing adjustment view). Coach side (`CoachNutritionProgress`, `NutritionAdjustmentWeekCard`) is **out of scope**.

---

## Why / re-scope

The client already sees a full **adjustment history** (per-week expected / actual / deviation + applied calorie change + new macros + coach notes). What's missing is the *moment*: when an adjustment is applied, there's no single, legible "your plan just changed — here's the new target and why" hero. The adaptive loop is the core value of coached nutrition; right now it reads as a flat audit log.

NU3 = surface the **latest applied** adjustment as a celebratory hero banner above the history list, using a new `interpretAdjustment()` plain-language helper and the existing `MacroDistributionRibbon`, plus a light status-token pass on the history cards (CC5).

---

## Data (no new fetch)

`ClientNutritionAdjustments` already loads `nutrition_adjustments` for the phase, ordered `week_number` **descending** (newest first). The latest applied adjustment is therefore:

```ts
const latestApplied = adjustments.find((a) => a.status === "approved"); // 'approved' renders as "Applied"
```

Relevant columns (all already in the row): `new_daily_calories`, `new_protein_grams`, `new_fat_grams`, `new_carb_grams`, `approved_calorie_adjustment` (signed kcal), `expected_weight_change_percentage`, `actual_weight_change_percentage`, `is_diet_break_week`, `coach_notes`, `week_number`, `created_at`.

**Status vocabulary** (from the existing `getStatusBadge`): `approved` = Applied, `pending` = Pending Review, `rejected` = Not Applied.

---

## 1) `src/lib/interpret.ts` — add `interpretAdjustment`

Add to the "Net-new helpers" section (reuses module-private `f1`). **The sentence is built only from the applied calorie delta + the stored expected/actual percentages — it must NOT re-derive direction from raw weight signs.** That re-derivation is exactly what flipped advice in PR #70 (see CLAUDE.md "sign-sensitive adjustment math"). Here the coach/system decision (`approved_calorie_adjustment`) is ground truth, so we render it directly.

```ts
/**
 * NU3 — the client "here's your new target & why" moment for an APPLIED
 * nutrition adjustment. Ground-truth only: built from the applied calorie
 * delta + the stored expected/actual percentages. It never RE-DERIVES
 * direction from raw weight signs (that path caused the PR #70 advice flip).
 */
export function interpretAdjustment(args: {
  calorieDelta: number | null;   // approved_calorie_adjustment (signed kcal)
  newCalories: number | null;    // new_daily_calories
  expectedPct: number | null;    // expected_weight_change_percentage
  actualPct: number | null;      // actual_weight_change_percentage
  isDietBreak: boolean;
}): Interpretation {
  const { calorieDelta, newCalories, expectedPct, actualPct, isDietBreak } = args;
  const target = newCalories != null ? `${Math.round(newCalories).toLocaleString()} kcal` : "your new target";
  if (isDietBreak) {
    return {
      tone: "neutral",
      label: "Diet break",
      sentence: `Recovery week — calories set to maintenance (${target}). Back to the plan next week.`,
    };
  }
  const d = calorieDelta == null ? 0 : Math.round(calorieDelta);
  const moved =
    d > 0 ? `up ${d.toLocaleString()} kcal to ${target}`
    : d < 0 ? `down ${Math.abs(d).toLocaleString()} kcal to ${target}`
    : `held at ${target}`;
  const why =
    expectedPct != null && actualPct != null
      ? ` Your weekly change came in at ${f1(actualPct)}% vs your ${f1(expectedPct)}% target.`
      : "";
  return { tone: "on_track", label: "New target", sentence: `Your daily target is ${moved}.${why}` };
}
```

**Tests** (`src/lib/interpret.test.ts`, new `describe("interpretAdjustment (NU3)")`):
- increase `{120, 2120, -0.8, -0.6, false}` → tone `on_track`, label `New target`, sentence contains `up 120 kcal to 2,120 kcal` and `-0.8% vs your -0.6%`.
- decrease `{-150, 1850, -0.3, -0.6, false}` → sentence contains `down 150 kcal to 1,850 kcal`.
- diet break `{0, 2400, null, null, true}` → tone `neutral`, label `Diet break`, contains `maintenance`.
- held / null pcts `{0, 2000, null, null, false}` → contains `held at 2,000 kcal`, no `vs your`.

---

## 2) `src/components/nutrition/ClientNutritionAdjustments.tsx` — hero banner

**Imports to add:**
```ts
import { interpretAdjustment, toneClasses } from "@/lib/interpret";
import { cn } from "@/lib/utils";
import { MacroDistributionRibbon } from "@/components/nutrition/MacroDistributionRibbon";
```
(`Badge`, `Card*`, `format` are already imported.)

**Compute** `latestApplied` (see Data) inside the component after `adjustments` is set.

**Render the banner** at the top of the returned `<div className="space-y-6">`, immediately **above** the existing "Adjustment History" header card — only when `latestApplied` exists:

```tsx
{latestApplied && (() => {
  const interp = interpretAdjustment({
    calorieDelta: latestApplied.approved_calorie_adjustment,
    newCalories: latestApplied.new_daily_calories,
    expectedPct: latestApplied.expected_weight_change_percentage,
    actualPct: latestApplied.actual_weight_change_percentage,
    isDietBreak: latestApplied.is_diet_break_week,
  });
  const tc = toneClasses(interp.tone);
  return (
    <Card className={cn("border-l-4", tc.rail, tc.soft)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Your plan just updated</CardTitle>
            <CardDescription>
              Week {latestApplied.week_number} · {format(new Date(latestApplied.created_at), "MMM d, yyyy")}
            </CardDescription>
          </div>
          <Badge variant="secondary">Applied</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">
            {Math.round(latestApplied.new_daily_calories || 0).toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">kcal / day</span>
        </div>
        <MacroDistributionRibbon
          protein={latestApplied.new_protein_grams || 0}
          fat={latestApplied.new_fat_grams || 0}
          carbs={latestApplied.new_carb_grams || 0}
          showLabels
        />
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <span aria-hidden className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", tc.dot)} />
          {interp.sentence}
        </p>
        {latestApplied.coach_notes && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium mb-1">From your coach</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{latestApplied.coach_notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
})()}
```

Leave the existing "Adjustment History" list untouched below the banner (the latest applied week still appears in the list — that's fine; the banner is the *moment*, the list is the record).

---

## 3) Light token pass (CC5) on the history cards

Within the existing per-week card, route the ad-hoc colors through the status vocabulary:
- The deviation value (currently `text-destructive` when `|deviation| > 30`): replace with `cn(Math.abs(adjustment.deviation_percentage || 0) > 30 && toneClasses("risk").text)`.
- The applied calorie-change line (currently `text-green-500` / `text-red-500` on the Trending icons): an increase/decrease is **directional, not good/bad**, so don't tone it green/red — use `text-muted-foreground` for both icons and keep the up/down icon as the only directional cue. (Avoids implying a calorie cut is "bad news".)

Do **not** otherwise restructure the history cards — NU3 is the banner moment + this token tidy, nothing more.

---

## Verification

- `npx tsc --noEmit` clean.
- `vitest` green incl. the 4 new `interpretAdjustment` cases.
- Live render needs a client with an `approved` adjustment on an active phase → fold into post-deploy smoke: confirm the banner shows the new kcal hero + macro ribbon + plain-language line + coach notes, and that a client with only `pending` adjustments sees **no** banner (just the history).

## Notes / non-goals

- No `goal_type` needed anywhere here, so the `loss`/`fat_loss` enum mismatch is irrelevant to NU3 — keep it that way.
- No new DB reads, RPCs, or migrations.
- Macro **interpretation** of the split (protein-forward etc.) is CL2's `interpretMacroTargets`; NU3 deliberately doesn't duplicate it — the banner shows the ribbon + the *change* story, not a macro-split sentence.
