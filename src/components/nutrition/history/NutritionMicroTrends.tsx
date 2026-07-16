import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FlaskConical } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PhaseAnnotatedTrendChart,
  type TrendPoint,
  type TrendPhase,
} from "@/components/client-overview/charts/PhaseAnnotatedTrendChart";
import type { MicrosByDay } from "./useNutritionIntakeHistory";

/**
 * Micronutrient trends (P5b extension) — dietitian/admin only. The parent gates rendering on
 * viewerRole AND the hook only populates `microsByDay` for those roles, so this panel is a
 * dead end for a coach even if it were somehow mounted.
 *
 * The micros span g / mg / µg, so they CANNOT share one Y-axis. Instead of a multi-series chart
 * with a meaningless axis, this is a nutrient picker + a single-series chart: one nutrient at a
 * time, drawn in its own unit, over the client's logged history. Phase bands are reused from the
 * intake trends so a micro reading is still legible against the plan it sat in.
 *
 * Degrade-safe: <2 charted points → the chart's own calm empty state; a failed nutrients read
 * leaves an empty picker and no panel content — never an error banner.
 */

interface MicroNutrient {
  key: string;
  name: string;
  unit: string;
}

interface NutritionMicroTrendsProps {
  clientUserId: string;
  microsByDay: MicrosByDay;
  phases: TrendPhase[];
}

const DEFAULT_MICRO_KEY = "sodium";

/** Midnight-of-day ms for an ISO date string (local), matching the intake trends' day math. */
function dayStartMs(isoDate: string): number {
  return new Date(isoDate + "T00:00:00").getTime();
}

export function NutritionMicroTrends({ clientUserId, microsByDay, phases }: NutritionMicroTrendsProps) {
  const [nutrients, setNutrients] = useState<MicroNutrient[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>(DEFAULT_MICRO_KEY);
  const fetchedRef = useRef(false);

  // The micronutrient roster is small + static — fetch once. `clientUserId` isn't a filter here
  // (nutrients are global); it just scopes the effect to a mounted panel.
  useEffect(() => {
    if (fetchedRef.current || !clientUserId) return;
    fetchedRef.current = true;
    supabase
      .from("nutrients")
      .select("key, name, unit")
      .eq("category", "micro")
      .order("display_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.warn("[NutritionMicroTrends] nutrients:", error.message);
          return;
        }
        const rows = (data ?? []).map((n) => ({
          key: n.key as string,
          name: n.name as string,
          unit: n.unit as string,
        }));
        setNutrients(rows);
        // Default to sodium when present, else the first micro.
        if (rows.length && !rows.some((r) => r.key === DEFAULT_MICRO_KEY)) {
          setSelectedKey(rows[0].key);
        }
      });
  }, [clientUserId]);

  const selected = nutrients.find((n) => n.key === selectedKey) ?? null;

  // Build the single-series points for the picked nutrient over all logged days.
  const points = useMemo<TrendPoint[]>(() => {
    const out: TrendPoint[] = [];
    for (const [isoDate, dayMap] of Object.entries(microsByDay)) {
      const v = dayMap[selectedKey];
      if (v == null || !Number.isFinite(v)) continue;
      const t = dayStartMs(isoDate);
      if (!Number.isFinite(t)) continue;
      out.push({ t, value: v });
    }
    return out.sort((a, b) => a.t - b.t);
  }, [microsByDay, selectedKey]);

  return (
    <div className="space-y-3" data-micro-trends>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Nutrient</span>
        <Select value={selectedKey} onValueChange={setSelectedKey}>
          <SelectTrigger className="h-8 w-56" aria-label="Micronutrient">
            <SelectValue placeholder="Choose a nutrient" />
          </SelectTrigger>
          <SelectContent>
            {nutrients.map((n) => (
              <SelectItem key={n.key} value={n.key}>
                {n.name} ({n.unit})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PhaseAnnotatedTrendChart
        title="Micronutrient trends"
        description={selected ? `daily logged ${selected.name.toLowerCase()}` : "daily logged micronutrients"}
        icon={FlaskConical}
        points={points}
        phases={phases}
        unit={selected?.unit}
        formatValue={(v) => `${Math.round(v * 10) / 10}`}
        emptyLabel="Not enough logged days yet to chart this nutrient."
      />
    </div>
  );
}
