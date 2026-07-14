import { useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
} from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { Search, Plus, History, Loader2 } from "lucide-react";
import { useFoodCategories, useFoodSearch, useRecentFoods, type FoodRow } from "./useFoodCatalog";
import { MEAL_SLOT_LABEL } from "@/lib/foodLog";

/**
 * Add food — search, Recent / Frequent, and browse-by-category.
 *
 * The category accordion reuses the `SessionAddPicker` idiom (region → subdivision → items):
 * a client who doesn't know the exact name can browse "Protein → Poultry" the same way a
 * coach browses "Upper → Chest". Search and browse sit side by side; neither is a mode.
 *
 * "Recently used" + the per-food ×N frequency badge are the Planning Board add-picker's
 * vocabulary, applied to food. What you actually eat IS your favourites — there is no
 * separate favourites list to fall out of sync with the diary.
 */

interface AddFoodDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientUserId: string;
  mealSlot: string;
  onPick: (food: FoodRow) => void;
  onCreateCustom: () => void;
  /** Bumped by the parent after a write so Recent/Frequent refreshes. */
  recentKey?: number;
}

export function AddFoodDrawer({
  open,
  onOpenChange,
  clientUserId,
  mealSlot,
  onPick,
  onCreateCustom,
}: AddFoodDrawerProps) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const { results, searching, searchError } = useFoodSearch(query, categoryId);
  const { parents, childrenOf } = useFoodCategories();
  const { recent, frequency } = useRecentFoods(clientUserId);

  const searchActive = query.trim().length > 0 || categoryId != null;

  const pick = (food: FoodRow) => {
    onPick(food);
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        title="Add food"
        description={`To ${MEAL_SLOT_LABEL[mealSlot] ?? mealSlot}`}
        className="sm:max-w-2xl"
      >
        <div className="space-y-4 py-2">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value) setCategoryId(null);
              }}
              placeholder="Search foods…"
              className="h-10 pl-9 text-base"
              aria-label="Search foods"
            />
          </div>

          <Button variant="outline" size="sm" onClick={onCreateCustom} className="w-full">
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Create a custom food
          </Button>

          {/* Search / browse results */}
          {searchActive ? (
            searchError ? (
              <LoadError message="We couldn't search the food catalog." />
            ) : searching ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : results.length === 0 ? (
              <EmptyState
                title={query.trim() ? `No foods matching "${query.trim()}"` : "Nothing in this category yet"}
                description="Try another name, or create a custom food."
              />
            ) : (
              <ul className="space-y-2">
                {results.map((f) => (
                  <FoodResultRow key={f.id} food={f} count={frequency.get(f.id)} onPick={pick} />
                ))}
              </ul>
            )
          ) : (
            <>
              {/* Recently used */}
              {recent.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <History className="h-3.5 w-3.5" aria-hidden />
                    Recently used
                  </h3>
                  <ul className="space-y-2">
                    {recent.slice(0, 5).map((f) => (
                      <FoodResultRow key={f.id} food={f} count={frequency.get(f.id)} onPick={pick} />
                    ))}
                  </ul>
                </section>
              )}

              {/* Browse by category — the SessionAddPicker accordion, for food. */}
              <section>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Browse</h3>
                <Accordion type="single" collapsible className="w-full">
                  {parents.map((parent) => {
                    const subs = childrenOf(parent.id);
                    if (subs.length === 0) return null;
                    return (
                      <AccordionItem key={parent.id} value={parent.id}>
                        <AccordionTrigger className="text-sm">{parent.name}</AccordionTrigger>
                        <AccordionContent>
                          <div className="flex flex-wrap gap-1.5 pb-1">
                            {subs.map((sub) => (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => {
                                  setQuery("");
                                  setCategoryId(sub.id);
                                }}
                                className="min-h-[44px] rounded-md border border-border bg-background px-3 text-sm hover:bg-muted md:min-h-0 md:py-1.5"
                              >
                                {sub.name}
                              </button>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </section>
            </>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** One result row: name, provenance badge, per-100g macros — the Ultrahuman idiom. */
function FoodResultRow({
  food,
  count,
  onPick,
}: {
  food: FoodRow;
  count?: number;
  onPick: (f: FoodRow) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(food)}
        data-food-row={food.id}
        className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{food.name}</span>
            {food.source === "custom" ? (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                My food
              </Badge>
            ) : food.is_verified ? (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                Verified
              </Badge>
            ) : null}
            {count != null && count > 1 && (
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                ×{count}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs tabular-nums text-muted-foreground">
            Per 100 g · {Math.round(food.kcal_100g)} kcal · P {Math.round(food.protein_100g)} F{" "}
            {Math.round(food.fat_100g)} C {Math.round(food.carb_100g)}
          </p>
        </div>
        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}
