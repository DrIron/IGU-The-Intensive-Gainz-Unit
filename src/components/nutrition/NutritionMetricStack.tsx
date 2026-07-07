import type { ReactNode } from "react";
import { MetricCard } from "@/components/ui/metric-card";
import { cn } from "@/lib/utils";
import type { Interpretation } from "@/lib/interpret";

export type NutritionMetricKey = "weight" | "bodyfat" | "adherence" | "steps";

export interface NutritionMetricTile {
  key: NutritionMetricKey;
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: { value: number; suffix?: string };
  spark?: number[];
  interpretation?: Interpretation;
}

interface NutritionMetricStackProps {
  tiles: NutritionMetricTile[];
  selected: NutritionMetricKey;
  onSelect: (key: NutritionMetricKey) => void;
}

/**
 * NU5 — the 4-metric card stack (Weight / Body fat / Adherence / Steps) that
 * replaces the old Weight|Body-fat toggle on the client nutrition page. Tiles are
 * MetricCard primitives, 2-up on mobile / 4-up on desktop. Clicking a tile selects
 * it (the caller renders that metric's detail chart below); the active tile gets a
 * primary ring.
 */
export function NutritionMetricStack({ tiles, selected, onSelect }: NutritionMetricStackProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tiles.map((tile) => (
        <MetricCard
          key={tile.key}
          label={tile.label}
          value={tile.value}
          unit={tile.unit}
          delta={tile.delta}
          spark={tile.spark}
          interpretation={tile.interpretation}
          onClick={() => onSelect(tile.key)}
          ariaLabel={`Show ${tile.label} trend`}
          className={cn(
            "h-full cursor-pointer transition-shadow",
            selected === tile.key ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-border",
          )}
        />
      ))}
    </div>
  );
}
