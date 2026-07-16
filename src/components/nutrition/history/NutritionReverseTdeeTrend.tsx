import { Flame } from "lucide-react";
import {
  PhaseAnnotatedTrendChart,
  type TrendPhase,
} from "@/components/client-overview/charts/PhaseAnnotatedTrendChart";
import { useReverseTdeeTrend } from "./useReverseTdeeTrend";

/**
 * NU2 — "Real energy expenditure (TDEE)": the rolling reverse-TDEE derived from what the client
 * actually logged (calories in) against their measured weight change (energy stored). Unlike a
 * formula TDEE, this is what their body is ACTUALLY burning.
 *
 * Shown to ALL viewers — it's the client's own expenditure, calorie-derived, with no
 * micronutrient/role gate. Phase bands are reused from the intake trends. Degrade-safe: <2 points
 * → the chart's calm empty state (no error banner), matching the rest of the History surface.
 */
export function NutritionReverseTdeeTrend({
  clientUserId,
  phases,
}: {
  clientUserId: string;
  phases: TrendPhase[];
}) {
  const { series } = useReverseTdeeTrend(clientUserId);

  return (
    <PhaseAnnotatedTrendChart
      title="Real energy expenditure (TDEE)"
      description="reverse-TDEE from logged calories vs measured weight change"
      icon={Flame}
      points={series}
      phases={phases}
      unit="kcal"
      betterDirection="neutral"
      formatValue={(v) => Math.round(v).toLocaleString()}
      emptyLabel="Log calories and weigh-ins consistently for ~2 weeks to see your real TDEE trend."
    />
  );
}
