import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NutritionSummary, type NutritionTotals } from "../NutritionSummary";
import { useFoodDetail, type FoodRow } from "./useFoodCatalog";
import {
  availableUnits,
  defaultUnitFor,
  macrosForGrams,
  microsForGrams,
  toGrams,
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  type FoodLogUnit,
} from "@/lib/foodLog";
import { cn } from "@/lib/utils";

/**
 * Food detail — portion + the D6 unit picker, with a live "impact on today's targets".
 *
 * The unit chips show ONLY the units this food can legally be logged in: mass always,
 * volume only when the food carries a density, servings only when it has named measures.
 * Offering "ml" for chicken and quietly assuming 1 g/ml is the exact class of invented
 * number this whole model exists to prevent — `toGrams` returns null instead, and the
 * Add button stays disabled.
 *
 * The preview and the row that gets written are computed by the SAME function
 * (`macrosForGrams`), so the client cannot be shown one number and have another stored.
 */

export interface PendingEntry {
  quantity: number;
  unit: FoodLogUnit;
  quantityG: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  micros: Record<string, number>;
  portionLabel: string | null;
  mealSlot: string;
}

const UNIT_LABEL: Record<FoodLogUnit, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "L",
  serving: "serving",
};

interface FoodDetailDrawerProps {
  food: FoodRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The day's totals BEFORE this entry — used to show what the entry does to them. */
  dayTotals: NutritionTotals;
  dayTarget: NutritionTotals | null;
  defaultMealSlot: string;
  /** Editing an existing entry: seed the picker with what was logged. */
  initial?: {
    quantity: number;
    unit: FoodLogUnit;
    portionLabel: string | null;
    mealSlot: string;
  } | null;
  onSubmit: (entry: PendingEntry) => Promise<void>;
  submitLabel?: string;
}

export function FoodDetailDrawer({
  food,
  open,
  onOpenChange,
  dayTotals,
  dayTarget,
  defaultMealSlot,
  initial,
  onSubmit,
  submitLabel = "Add to log",
}: FoodDetailDrawerProps) {
  const { portions, micros100g } = useFoodDetail(open && food ? food.id : null);

  const [quantity, setQuantity] = useState("100");
  const [unit, setUnit] = useState<FoodLogUnit>("g");
  const [portionId, setPortionId] = useState<string | null>(null);
  const [mealSlot, setMealSlot] = useState(defaultMealSlot);
  const [saving, setSaving] = useState(false);

  const units = useMemo(() => availableUnits(portions), [portions]);

  // Seed the picker once the food's portions are known: last-used for this food if we have
  // it (an edit), else the food's default serving. "1 breast" is the tap a human wants.
  useEffect(() => {
    if (!open || !food) return;
    const lastUsed = initial
      ? {
          unit: initial.unit,
          quantity: initial.quantity,
          portionId:
            portions.find((p) => p.label === initial.portionLabel)?.id ?? null,
        }
      : null;
    const d = defaultUnitFor(portions, food.serving_default_g, lastUsed);
    setQuantity(String(d.quantity));
    setUnit(d.unit);
    setPortionId(d.portionId);
    setMealSlot(initial?.mealSlot ?? defaultMealSlot);
  }, [open, food, portions, initial, defaultMealSlot]);

  const qty = parseFloat(quantity);
  const grams = food ? toGrams(qty, unit, portions, portionId) : null;
  const entryMacros = food && grams != null ? macrosForGrams(food, grams) : null;

  const selectedPortion = portions.find((p) => p.id === portionId) ?? null;

  // "Impact on today's targets": the day AFTER this entry lands. Shown through the same
  // NutritionSummary as everywhere else — no bespoke mini-visual.
  const projected: NutritionTotals | null = entryMacros
    ? {
        kcal: dayTotals.kcal + entryMacros.kcal,
        protein: dayTotals.protein + entryMacros.protein_g,
        fat: dayTotals.fat + entryMacros.fat_g,
        carbs: dayTotals.carbs + entryMacros.carb_g,
      }
    : null;

  const handleSubmit = async () => {
    if (!food || grams == null || !entryMacros || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        quantity: qty,
        unit,
        quantityG: grams,
        kcal: entryMacros.kcal,
        proteinG: entryMacros.protein_g,
        fatG: entryMacros.fat_g,
        carbG: entryMacros.carb_g,
        // Snapshot the food's micros scaled to the logged grams. P1 stubbed this as {} — the
        // detail drawer already loaded micros100g and imported microsForGrams but never wired
        // them, so every entry stored empty micros and the dietitian micro panel (P4) had
        // nothing to show. Same denormalize-at-log-time rule as the macros: the diary is an
        // immutable record, so we store the values as they were, not a live re-read.
        micros: grams != null ? microsForGrams(micros100g, grams) : {},
        portionLabel: unit === "serving" ? (selectedPortion?.label ?? null) : null,
        mealSlot,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  if (!food) return null;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        title={food.name}
        description={`Per 100 g · ${Math.round(food.kcal_100g)} kcal · P ${Math.round(food.protein_100g)} F ${Math.round(food.fat_100g)} C ${Math.round(food.carb_100g)}`}
        className="sm:max-w-lg"
      >
        <div className="space-y-5 py-2">
          {/* Amount + unit */}
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fd-qty">Amount</Label>
              <Input
                id="fd-qty"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="h-10 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              {/* Only the units valid for THIS food (D6). */}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Unit">
                {units.map((u) => (
                  <button
                    key={u}
                    type="button"
                    data-unit={u}
                    aria-pressed={unit === u}
                    onClick={() => setUnit(u)}
                    className={cn(
                      "min-h-[44px] rounded-md border px-3 text-sm font-medium transition-colors md:min-h-0 md:py-2",
                      unit === u
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    {UNIT_LABEL[u]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Which named measure, when logging by serving. */}
          {unit === "serving" && portions.length > 0 && (
            <div className="space-y-1.5">
              <Label>Serving</Label>
              <Select value={portionId ?? undefined} onValueChange={setPortionId}>
                <SelectTrigger className="h-10 text-base">
                  <SelectValue placeholder="Choose a serving" />
                </SelectTrigger>
                <SelectContent>
                  {portions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label} · {Math.round(p.gram_weight)} g
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* The resolved grams. Always visible — whatever unit the client picked, the number
              that actually drives the math is never hidden from them. */}
          <p className="font-mono text-sm tabular-nums text-muted-foreground" data-resolved-grams>
            {grams != null ? `= ${Math.round(grams)} g` : "Choose an amount"}
          </p>

          <div className="space-y-1.5">
            <Label>Meal</Label>
            <Select value={mealSlot} onValueChange={setMealSlot}>
              <SelectTrigger className="h-10 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEAL_SLOTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {MEAL_SLOT_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* This entry, on its own. Same component, no target -> no bar. */}
          {entryMacros && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                This entry
              </p>
              <NutritionSummary
                size="sm"
                totals={{
                  kcal: entryMacros.kcal,
                  protein: entryMacros.protein_g,
                  fat: entryMacros.fat_g,
                  carbs: entryMacros.carb_g,
                }}
              />
            </div>
          )}

          {/* ...and what it does to the day. Only meaningful when there's a target to move. */}
          {projected && dayTarget && (
            <div className="rounded-lg border p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Today, after this
              </p>
              <NutritionSummary size="sm" totals={projected} target={dayTarget} />
            </div>
          )}
        </div>

        <ResponsiveDialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={grams == null || saving}
            className="w-full sm:w-auto"
          >
            {saving ? "Saving…" : submitLabel}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
