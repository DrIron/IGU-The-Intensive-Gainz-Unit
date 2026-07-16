import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/ui/load-error";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, Plus, MoreVertical, Loader2 } from "lucide-react";
import { addDays, format, isToday } from "date-fns";
import { NutritionSummary } from "../NutritionSummary";
import { ClientMacroNudge } from "./ClientMacroNudge";
import { EntryAttributionChip } from "./EntryAttributionChip";
import { useFoodLog } from "./useFoodLog";
import { useFoodLogAuthoring } from "./useFoodLogAuthoring";
import { formatAmount, MEAL_SLOTS, MEAL_SLOT_LABEL } from "@/lib/foodLog";
import { cn } from "@/lib/utils";

/**
 * The food-log day view — the client's diary for one date.
 *
 * Lives INSIDE the Nutrition section (D5: no separate Diary route). The hero is the shared
 * `NutritionSummary`, not a bespoke visual, so the day total renders identically to a single
 * food, a meal roll-up, and (in P4) the coach's intake panel.
 *
 * Totals are summed from the entries this component already holds, so the donut moves the
 * instant an entry lands — no round-trip, no stale rollup. The DB's trigger-written
 * `food_log_daily_rollup` stays the durable source for the staff surfaces.
 */

interface FoodLogDayViewProps {
  clientUserId: string;
}

export function FoodLogDayView({ clientUserId }: FoodLogDayViewProps) {
  const [date, setDate] = useState(() => new Date());
  const logDate = format(date, "yyyy-MM-dd");

  const { entries, totals, target, loading, loadError, reload } = useFoodLog(clientUserId, logDate);

  // The client authors their OWN diary — always editable, attributed 'client'. The add/edit/
  // delete wiring + drawers live in the shared authoring hook (one write path, no second copy).
  const { openAdd, startEdit, remove, drawers } = useFoodLogAuthoring({
    clientUserId,
    logDate,
    writeRole: "client",
    writeUserId: null,
    canEdit: true,
    dayTotals: totals,
    dayTarget: target,
    onChanged: () => reload({ silent: true }),
  });

  return (
    <div className="space-y-6">
      {/* Day header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDate((d) => addDays(d, -1))}
              aria-label="Previous day"
            >
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
            <LoadError message="We couldn't load your food log." onRetry={() => reload()} />
          ) : (
            <>
              {/* THE canonical calories+macros display. Not a bespoke hero. */}
              <NutritionSummary totals={totals} target={target} size="lg" />
              {!target && (
                <p className="mt-4 text-xs text-muted-foreground">
                  No coach target set for this phase — logging still works, there's just
                  nothing to measure it against yet.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* P5c-client — a gentle additive nudge (protein/calories under target), only when
          viewing TODAY. A "this past week" note while browsing a past day would be confusing.
          calories_high is suppressed for the client inside the component. */}
      {isToday(date) && <ClientMacroNudge clientUserId={clientUserId} />}

      {/* Meal sections */}
      {!loading && !loadError && (
        <div className="space-y-4">
          {MEAL_SLOTS.map((slot) => {
            const slotEntries = entries.filter((e) => e.meal_slot === slot);
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
                  {slotEntries.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">Nothing logged yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {slotEntries.map((e) => (
                        <li
                          key={e.id}
                          data-entry={e.id}
                          className="flex items-center gap-3 py-2.5"
                        >
                          <button
                            type="button"
                            onClick={() => startEdit(e)}
                            className="min-w-0 flex-1 text-left"
                            aria-label={`Edit ${e.food_name}`}
                          >
                            <p className="truncate font-medium">{e.food_name}</p>
                            <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                              {formatAmount(e.quantity, e.unit, e.quantity_g, e.portion_label)} ·{" "}
                              P {Math.round(e.protein_g)} F {Math.round(e.fat_g)} C{" "}
                              {Math.round(e.carb_g)}
                            </p>
                            {/* Transparency: a staff-added entry is visibly marked on the
                                client's own diary, so it's never indistinguishable from a
                                self-logged one. */}
                            <EntryAttributionChip role={e.created_by_role} perspective="client" />
                          </button>
                          <span className="shrink-0 font-mono text-sm tabular-nums">
                            {Math.round(e.kcal)}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                aria-label={`Options for ${e.food_name}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => startEdit(e)}>Edit</DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => remove(e)}
                                className="text-destructive focus:text-destructive"
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </li>
                      ))}
                    </ul>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openAdd(slot)}
                    className={cn("mt-1 w-full justify-start text-muted-foreground")}
                  >
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                    Add food
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {drawers}
    </div>
  );
}
