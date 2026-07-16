import { useState } from "react";
import { toast } from "sonner";
import { AddFoodDrawer } from "./AddFoodDrawer";
import { FoodDetailDrawer, type PendingEntry } from "./FoodDetailDrawer";
import { CustomFoodDialog } from "./CustomFoodDialog";
import {
  insertEntry,
  updateEntry,
  deleteEntry,
  type FoodLogWriteRole,
} from "./useFoodLog";
import type { FoodRow } from "./useFoodCatalog";
import type { NutritionTotals } from "../NutritionSummary";
import { captureException } from "@/lib/errorLogging";
import type { FoodLogUnit } from "@/lib/foodLog";

/**
 * The ONE food-log add/edit/delete path, shared by the client's own diary
 * (FoodLogDayView) and the staff surface (CoachFoodLogDay). It owns the add /
 * detail / custom-food drawers and the three mutations, parameterized by who is
 * writing. There is deliberately no second copy of this wiring — the #215/#217
 * drift lesson: a duplicated write path is where the two surfaces silently diverge.
 *
 * `writeRole` + `writeUserId` are stamped onto INSERTs as attribution. Edits never
 * change attribution (see updateEntry). RLS is the real gate — a coach with a
 * dietitian-assigned client fails the INSERT/UPDATE/DELETE server-side regardless
 * of `canEdit`; `canEdit` only decides whether we render the controls.
 */

/** The minimum an entry must expose to be edited/deleted through this path. */
export interface EditableEntry {
  id: string;
  food_id?: string | null;
  food_name: string;
  meal_slot: string;
  quantity: number;
  unit: FoodLogUnit;
  quantity_g: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  portion_label: string | null;
}

interface UseFoodLogAuthoringArgs {
  clientUserId: string;
  logDate: string;
  writeRole: FoodLogWriteRole;
  writeUserId: string | null;
  /** When false, the controls no-op and no drawers mount — read-only surfaces. */
  canEdit: boolean;
  /** The day's running totals + target, for the drawer's "impact on today" preview. */
  dayTotals: NutritionTotals;
  dayTarget: NutritionTotals | null;
  /** Refresh the caller's day read after any successful write. */
  onChanged: () => void | Promise<void>;
}

interface FoodLogAuthoring {
  openAdd: (slot: string) => void;
  startEdit: (entry: EditableEntry) => void;
  remove: (entry: EditableEntry) => Promise<void>;
  /** Mount this once in the caller's tree; null when !canEdit. */
  drawers: React.ReactNode;
}

export function useFoodLogAuthoring({
  clientUserId,
  logDate,
  writeRole,
  writeUserId,
  canEdit,
  dayTotals,
  dayTarget,
  onChanged,
}: UseFoodLogAuthoringArgs): FoodLogAuthoring {
  const [addOpen, setAddOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<string>("breakfast");
  const [pickedFood, setPickedFood] = useState<FoodRow | null>(null);
  const [editing, setEditing] = useState<EditableEntry | null>(null);

  const openAdd = (slot: string) => {
    if (!canEdit) return;
    setActiveSlot(slot);
    setAddOpen(true);
  };

  const startEdit = (entry: EditableEntry) => {
    if (!canEdit) return;
    setEditing(entry);
  };

  const handleAdd = async (entry: PendingEntry) => {
    if (!pickedFood) return;
    try {
      await insertEntry({
        clientId: clientUserId,
        logDate,
        mealSlot: entry.mealSlot,
        foodId: pickedFood.id,
        foodName: pickedFood.name,
        quantity: entry.quantity,
        unit: entry.unit,
        quantityG: entry.quantityG,
        kcal: entry.kcal,
        proteinG: entry.proteinG,
        fatG: entry.fatG,
        carbG: entry.carbG,
        micros: entry.micros,
        portionLabel: entry.portionLabel,
        createdByRole: writeRole,
        createdByUserId: writeUserId,
      });
      setPickedFood(null);
      await onChanged();
    } catch (e: unknown) {
      captureException(e, { source: "useFoodLogAuthoring.add" });
      toast.error("Couldn't add that entry. Please try again.");
    }
  };

  const handleEdit = async (entry: PendingEntry) => {
    if (!editing) return;
    try {
      await updateEntry(editing.id, {
        mealSlot: entry.mealSlot,
        quantity: entry.quantity,
        unit: entry.unit,
        quantityG: entry.quantityG,
        kcal: entry.kcal,
        proteinG: entry.proteinG,
        fatG: entry.fatG,
        carbG: entry.carbG,
        micros: entry.micros,
        portionLabel: entry.portionLabel,
      });
      setEditing(null);
      await onChanged();
    } catch (e: unknown) {
      captureException(e, { source: "useFoodLogAuthoring.edit" });
      toast.error("Couldn't update that entry. Please try again.");
    }
  };

  const remove = async (entry: EditableEntry) => {
    if (!canEdit) return;
    try {
      await deleteEntry(entry.id);
      await onChanged();
      toast.success("Entry removed");
    } catch (e: unknown) {
      captureException(e, { source: "useFoodLogAuthoring.delete" });
      toast.error("Couldn't remove that entry. Please try again.");
    }
  };

  // The entry being edited, re-shaped as a FoodRow so the SAME detail drawer serves
  // add AND edit. Per-100g macros are recovered from the entry's own snapshot
  // (kcal ÷ grams × 100), so an entry stays editable even if its food row is gone.
  const editingAsFood: FoodRow | null = editing
    ? {
        id: editing.food_id ?? "",
        name: editing.food_name,
        brand: null,
        source: "custom",
        owner_user_id: null,
        category_id: null,
        serving_default_g: null,
        is_verified: false,
        kcal_100g: (editing.kcal / editing.quantity_g) * 100,
        protein_100g: (editing.protein_g / editing.quantity_g) * 100,
        fat_100g: (editing.fat_g / editing.quantity_g) * 100,
        carb_100g: (editing.carb_g / editing.quantity_g) * 100,
      }
    : null;

  // The day WITHOUT the entry being edited — so the "after this" preview doesn't
  // double-count the very entry it is re-costing.
  const totalsExcludingEdited = editing
    ? {
        kcal: dayTotals.kcal - editing.kcal,
        protein: dayTotals.protein - editing.protein_g,
        fat: dayTotals.fat - editing.fat_g,
        carbs: dayTotals.carbs - editing.carb_g,
      }
    : dayTotals;

  const drawers = canEdit ? (
    <>
      <AddFoodDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        clientUserId={clientUserId}
        mealSlot={activeSlot}
        onPick={setPickedFood}
        onCreateCustom={() => {
          setAddOpen(false);
          setCustomOpen(true);
        }}
      />

      <CustomFoodDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        clientUserId={clientUserId}
        onCreated={setPickedFood}
      />

      {/* Add */}
      <FoodDetailDrawer
        food={pickedFood}
        open={pickedFood != null}
        onOpenChange={(o) => !o && setPickedFood(null)}
        dayTotals={dayTotals}
        dayTarget={dayTarget}
        defaultMealSlot={activeSlot}
        onSubmit={handleAdd}
      />

      {/* Edit — the same drawer, seeded with what was logged. */}
      <FoodDetailDrawer
        food={editingAsFood}
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        dayTotals={totalsExcludingEdited}
        dayTarget={dayTarget}
        defaultMealSlot={editing?.meal_slot ?? "breakfast"}
        initial={
          editing
            ? {
                quantity: editing.quantity,
                unit: editing.unit,
                portionLabel: editing.portion_label,
                mealSlot: editing.meal_slot,
              }
            : null
        }
        onSubmit={handleEdit}
        submitLabel="Save changes"
      />
    </>
  ) : null;

  return { openAdd, startEdit, remove, drawers };
}
