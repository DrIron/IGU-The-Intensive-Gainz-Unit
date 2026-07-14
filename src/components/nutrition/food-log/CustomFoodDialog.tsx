import { useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { toast } from "sonner";
import type { FoodRow } from "./useFoodCatalog";

/**
 * Create a custom food (§4.2). `source='custom'`, `owner_user_id = the client`.
 *
 * It stays PRIVATE to its owner — RLS only exposes global rows that are `approved` and
 * owner-less, so nothing a client types here leaks into anyone else's search. Promoting a
 * good custom food into the shared catalog is a deliberate staff act in the Food Library
 * Manager (P3c), not a side effect of a client saving one.
 *
 * Macros are entered per 100 g, matching how every other food in the system is stored — so
 * a custom food goes through the exact same unit/portion math as a USDA one, with no
 * special case anywhere downstream.
 */

interface CustomFoodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientUserId: string;
  /** Handed the newly created food so the caller can open it straight in the detail drawer. */
  onCreated: (food: FoodRow) => void;
}

export function CustomFoodDialog({
  open,
  onOpenChange,
  clientUserId,
  onCreated,
}: CustomFoodDialogProps) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carb, setCarb] = useState("");
  const [servingG, setServingG] = useState("");
  const [saving, setSaving] = useState(false);

  const num = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const valid = name.trim().length > 0 && kcal.trim().length > 0 && num(kcal) >= 0;

  const reset = () => {
    setName("");
    setKcal("");
    setProtein("");
    setFat("");
    setCarb("");
    setServingG("");
  };

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const serving = num(servingG);
      const { data: food, error } = await supabase
        .from("foods")
        .insert({
          source: "custom",
          owner_user_id: clientUserId,
          name: name.trim(),
          serving_default_g: serving > 0 ? serving : null,
          approval_status: "approved", // approved FOR ITS OWNER; RLS keeps it private regardless
          is_verified: false,
        })
        .select("id, name, source, owner_user_id, category_id, serving_default_g, is_verified")
        .single();
      if (error) throw error;

      // Nutrition goes in the normalized table, exactly like a seeded food — so the same
      // per-100g math, the same search view, the same everything downstream.
      const { data: nutrients, error: nErr } = await supabase
        .from("nutrients")
        .select("id, key")
        .in("key", ["energy", "protein", "fat", "carb"]);
      if (nErr) throw nErr;

      const amounts: Record<string, number> = {
        energy: num(kcal),
        protein: num(protein),
        fat: num(fat),
        carb: num(carb),
      };
      const rows = (nutrients ?? []).map((n) => ({
        food_id: food.id,
        nutrient_id: n.id,
        amount_per_100g: amounts[n.key as string] ?? 0,
      }));
      const { error: fnErr } = await supabase.from("food_nutrients").insert(rows);
      if (fnErr) throw fnErr;

      toast.success(`"${food.name}" saved to your foods`);
      onCreated({
        id: food.id,
        name: food.name,
        brand: null,
        source: "custom",
        owner_user_id: clientUserId,
        category_id: null,
        serving_default_g: serving > 0 ? serving : null,
        is_verified: false,
        kcal_100g: amounts.energy,
        protein_100g: amounts.protein,
        fat_100g: amounts.fat,
        carb_100g: amounts.carb,
      });
      reset();
      onOpenChange(false);
    } catch (e: unknown) {
      captureException(e, { source: "CustomFoodDialog" });
      toast.error("Couldn't save that food. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        title="Create a custom food"
        description="Per 100 g — the same basis as every other food. Only you can see it."
        className="sm:max-w-md"
      >
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cf-name">Name</Label>
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mum's chicken machboos"
              className="h-10 text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="cf-kcal" label="Calories (per 100 g)" value={kcal} onChange={setKcal} />
            <Field id="cf-protein" label="Protein (g)" value={protein} onChange={setProtein} />
            <Field id="cf-fat" label="Fat (g)" value={fat} onChange={setFat} />
            <Field id="cf-carb" label="Carbs (g)" value={carb} onChange={setCarb} />
          </div>

          <Field
            id="cf-serving"
            label="Typical serving (g) — optional"
            value={servingG}
            onChange={setServingG}
          />
        </div>

        <ResponsiveDialogFooter>
          <Button onClick={handleSave} disabled={!valid || saving} className="w-full sm:w-auto">
            {saving ? "Saving…" : "Save food"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="h-10 text-base"
      />
    </div>
  );
}
