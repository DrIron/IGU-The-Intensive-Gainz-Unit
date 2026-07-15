import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadError } from "@/components/ui/load-error";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFoodLogAdherence } from "./useFoodLogAdherence";
import { BAND_STATUS, BAND_LABEL, MACRO_TIER, type AdherenceBand } from "@/lib/adherence";

/**
 * "Adherence · last 7 days" — the coach/dietitian headline above the day view (P5a).
 *
 * A thin shell over the pure adherence module and its honesty rules. The only judgement this
 * component makes is visual: it never invents a red state the module didn't produce. An
 * unlogged day is a hollow dot; an empty week is a neutral note; a missing target is a neutral
 * note. Nowhere does an absence of data read as a failure.
 */

// Band → the app's status tokens (NutritionPhaseCard rail vocabulary). No invented colours.
const STATUS_DOT: Record<AdherenceBand, string> = {
  adherent: "bg-status-ontrack",
  slightly_off: "bg-status-attention",
  off_track: "bg-status-risk",
  // A hollow ring, not a filled colour — "no data", visibly distinct from any verdict.
  not_logged: "border border-muted-foreground/30 bg-transparent",
};

const STATUS_BADGE: Record<AdherenceBand, string> = {
  adherent: "border-status-ontrack/40 bg-status-ontrack/10 text-status-ontrack",
  slightly_off: "border-status-attention/40 bg-status-attention/10 text-status-attention",
  off_track: "border-status-risk/40 bg-status-risk/10 text-status-risk",
  not_logged: "border-muted-foreground/30 bg-muted/60 text-muted-foreground",
};

export function FoodLogAdherenceCard({ clientUserId, endDate }: { clientUserId: string; endDate: Date }) {
  const { data, loading, loadError, reload } = useFoodLogAdherence(clientUserId, endDate);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Adherence · last 7 days</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : loadError || !data ? (
          <LoadError message="We couldn't load this client's adherence." onRetry={() => reload()} />
        ) : data.loggedDays === 0 ? (
          // Empty week — NEUTRAL, never an off-track/red verdict. There is no failure here.
          <p className="py-2 text-sm text-muted-foreground" data-empty-adherence>
            No food logged in the last 7 days.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Headline: band pill + the logged-day average vs target */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Badge variant="outline" className={cn("font-medium", STATUS_BADGE[data.headlineBand])}>
                {BAND_LABEL[data.headlineBand]}
              </Badge>
              {data.target && data.avgConsumedKcal != null && data.avgDeviationPct != null ? (
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  {Math.round(data.avgConsumedKcal).toLocaleString()} avg vs{" "}
                  {data.target.kcal.toLocaleString()} target ·{" "}
                  <span className="text-foreground">
                    {data.avgDeviationPct > 0 ? "+" : ""}
                    {data.avgDeviationPct}%
                  </span>
                </span>
              ) : (
                // Logged, but no target: consistency shown below; quality not judged.
                <span className="text-sm text-muted-foreground" data-no-target>
                  No target set to measure against
                </span>
              )}
            </div>

            {/* 7-dot strip, oldest → newest. A not_logged day is hollow, never red. */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5" role="img" aria-label="Last 7 days, oldest to newest">
                {data.perDay.map((band, i) => (
                  <span
                    key={i}
                    data-day-dot={band}
                    aria-hidden
                    className={cn("h-3 w-3 rounded-full", STATUS_DOT[band])}
                  />
                ))}
              </div>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {data.loggedDays}/{data.totalDays} days logged
              </span>
            </div>

            {/* Macro chips — protein loud, fat/carbs quiet. Only when a target exists to
                measure against; otherwise there is nothing honest to show. */}
            {data.target && data.avgConsumedMacros && (
              <div className="flex flex-wrap gap-2">
                <MacroChip
                  label="Protein"
                  band={data.macroBands.protein}
                  consumed={data.avgConsumedMacros.protein}
                  target={data.target.protein}
                  tier={MACRO_TIER.protein}
                />
                <MacroChip
                  label="Fat"
                  band={data.macroBands.fat}
                  consumed={data.avgConsumedMacros.fat}
                  target={data.target.fat}
                  tier={MACRO_TIER.fat}
                />
                <MacroChip
                  label="Carbs"
                  band={data.macroBands.carbs}
                  consumed={data.avgConsumedMacros.carbs}
                  target={data.target.carbs}
                  tier={MACRO_TIER.carbs}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MacroChip({
  label,
  band,
  consumed,
  target,
  tier,
}: {
  label: string;
  band: AdherenceBand;
  consumed: number;
  target: number;
  tier: "loud" | "quiet";
}) {
  const status = BAND_STATUS[band];
  return (
    <div
      data-macro-chip={label.toLowerCase()}
      className={cn(
        "rounded-md border px-2.5 py-1.5 font-mono text-xs tabular-nums",
        tier === "loud" ? "bg-card" : "bg-muted/40",
        band === "off_track" ? "border-status-risk/40" : "border-border",
      )}
    >
      <span className={cn(tier === "loud" ? "font-medium text-foreground" : "text-muted-foreground")}>
        {label}
      </span>{" "}
      <span className={cn(status === "risk" ? "text-status-risk" : "text-muted-foreground")}>
        {Math.round(consumed)} / {Math.round(target)} g
      </span>
    </div>
  );
}
