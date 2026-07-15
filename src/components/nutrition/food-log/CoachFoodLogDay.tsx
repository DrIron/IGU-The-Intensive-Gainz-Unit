import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { ChevronLeft, ChevronRight, Loader2, UtensilsCrossed } from "lucide-react";
import { addDays, format, isToday } from "date-fns";
import { NutritionSummary } from "../NutritionSummary";
import { useCoachFoodLog } from "./useCoachFoodLog";
import { FoodLogAdherenceCard } from "./FoodLogAdherenceCard";
import { formatAmount, MEAL_SLOTS, MEAL_SLOT_LABEL } from "@/lib/foodLog";

/**
 * CoachFoodLogDay — a coach's / dietitian's READ-ONLY view of a client's food log for one day
 * (P4). Mounts inside the Client Overview nutrition tab.
 *
 * Read-only is the whole point: no kebab, no Add, no drawers, no mutations. A coach reviews
 * what the client logged; they do not edit it. (Coach/dietitian AUTHORING is a later slice —
 * `created_by_role` is already in the schema to carry it when it lands.)
 *
 * Every byte here comes from get_client_daily_nutrition, which has already applied the role
 * gate and the macro/micro boundary. The "Micronutrients" section renders only what the RPC
 * returned — so for a plain coach it is empty (macros only) by construction, not by a check
 * in this file. There is no client-side filtering to get wrong.
 */

// Display metadata for the micro keys the RPC may return (nutrients.key → label + unit).
const MICRO_META: Record<string, { label: string; unit: string }> = {
  fiber: { label: "Fibre", unit: "g" },
  sugar: { label: "Sugars", unit: "g" },
  sat_fat: { label: "Saturated fat", unit: "g" },
  sodium: { label: "Sodium", unit: "mg" },
  potassium: { label: "Potassium", unit: "mg" },
  calcium: { label: "Calcium", unit: "mg" },
  iron: { label: "Iron", unit: "mg" },
  vitamin_c: { label: "Vitamin C", unit: "mg" },
  vitamin_d: { label: "Vitamin D", unit: "µg" },
};
// Stable display order; unknown keys fall to the end alphabetically.
const MICRO_ORDER = ["fiber", "sugar", "sat_fat", "sodium", "potassium", "calcium", "iron", "vitamin_c", "vitamin_d"];

export function CoachFoodLogDay({ clientUserId }: { clientUserId: string }) {
  const [date, setDate] = useState(() => new Date());
  const logDate = format(date, "yyyy-MM-dd");

  const { totals, target, entries, dayMicros, loading, loadError, reload } = useCoachFoodLog(
    clientUserId,
    logDate,
  );

  const microRows = Object.keys(dayMicros)
    .sort((a, b) => {
      const ia = MICRO_ORDER.indexOf(a);
      const ib = MICRO_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    })
    .map((key) => ({ key, value: dayMicros[key], meta: MICRO_META[key] ?? { label: key, unit: "" } }));

  const hasEntries = entries.length > 0;

  return (
    <div className="space-y-6">
      {/* P5a — the 7-day adherence headline, ending on the day being viewed. */}
      <FoodLogAdherenceCard clientUserId={clientUserId} endDate={date} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="icon" onClick={() => setDate((d) => addDays(d, -1))} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <CardTitle className="text-base font-medium">
                {isToday(date) ? "Today" : format(date, "EEE, MMM d")}
              </CardTitle>
              {!isToday(date) && (
                <button
                  type="button"
                  onClick={() => setDate(new Date())}
                  className="text-xs text-primary hover:underline"
                >
                  Back to today
                </button>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDate((d) => addDays(d, 1))}
              disabled={isToday(date)}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : loadError ? (
            <LoadError message="We couldn't load this client's food log." onRetry={() => reload()} />
          ) : (
            <NutritionSummary totals={totals} target={target} size="lg" />
          )}
        </CardContent>
      </Card>

      {!loading && !loadError && (
        <>
          {!hasEntries ? (
            <EmptyState
              icon={UtensilsCrossed}
              title={`No food logged on ${format(date, "MMM d")}`}
              description="When your client logs food on this day, it'll appear here."
            />
          ) : (
            <>
              {MEAL_SLOTS.map((slot) => {
                const slotEntries = entries.filter((e) => e.meal_slot === slot);
                if (slotEntries.length === 0) return null;
                const slotKcal = slotEntries.reduce((s, e) => s + e.kcal, 0);
                return (
                  <Card key={slot} data-meal-section={slot}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-medium">{MEAL_SLOT_LABEL[slot]}</CardTitle>
                        <span className="font-mono text-sm tabular-nums text-muted-foreground">
                          {Math.round(slotKcal)} kcal
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <ul className="divide-y">
                        {slotEntries.map((e) => (
                          <li key={e.id} data-entry={e.id} className="flex items-center gap-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{e.food_name}</p>
                              <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                                {formatAmount(e.quantity, e.unit, e.quantity_g, e.portion_label)} · P{" "}
                                {Math.round(e.protein_g)} F {Math.round(e.fat_g)} C {Math.round(e.carb_g)}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-sm tabular-nums">{Math.round(e.kcal)}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Micronutrients — renders ONLY what the RPC returned. Empty for a plain coach
                  (macros only), populated for a dietitian/admin/self. No filter here. */}
              {microRows.length > 0 && (
                <Card data-micro-panel>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Micronutrients</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="divide-y">
                      {microRows.map((m) => (
                        <li key={m.key} className="flex items-center justify-between py-2">
                          <span className="text-sm">{m.meta.label}</span>
                          <span className="font-mono text-sm tabular-nums text-muted-foreground">
                            {Math.round(m.value * 10) / 10} {m.meta.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
