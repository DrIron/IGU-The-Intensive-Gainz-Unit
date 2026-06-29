import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import type { TeamDetailTabProps } from "../team-types";
import { useTeamPulse } from "../useTeamPulse";

/** Nutrition reasons surfaced from the Pulse needs-attention list. */
const NUTRITION_REASONS: Record<string, string> = {
  no_active_phase: "No active nutrition phase",
  pending_adjustment: "Pending nutrition adjustment",
};

const SPLIT_TILES: { key: "deficit" | "maintenance" | "surplus" | "none"; label: string }[] = [
  { key: "deficit", label: "Cutting" },
  { key: "maintenance", label: "Maintaining" },
  { key: "surplus", label: "Gaining" },
  { key: "none", label: "No phase" },
];

/**
 * Team nutrition — VIEW-ONLY aggregate (who's drifting). The deficit/maintenance/
 * surplus/none split + a list of members flagged for a nutrition reason, each
 * linking to their (view-only) member detail. No edit controls — the team coach
 * never edits a member's individual nutrition here.
 */
export function TeamNutritionTab({ context }: TeamDetailTabProps) {
  const navigate = useNavigate();
  const state = useTeamPulse(context.teamId);

  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          Couldn't load nutrition aggregate: {state.message}
        </CardContent>
      </Card>
    );
  }

  const { nutrition_split, needs_attention } = state.pulse;
  const drifting = needs_attention.filter((m) =>
    m.reasons.some((r) => r in NUTRITION_REASONS),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Goal direction</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SPLIT_TILES.map((t) => (
            <div key={t.key} className="rounded-md border border-border/60 p-3 text-center">
              <p className="font-mono text-2xl font-semibold tabular-nums">{nutrition_split[t.key]}</p>
              <p className="text-xs text-muted-foreground mt-1">{t.label}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-medium">Drifting ({drifting.length})</p>
        {drifting.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No nutrition flags — everyone has an active phase and no pending adjustments.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {drifting.map((m) => (
              <ClickableCard
                key={m.user_id}
                ariaLabel={`Open ${m.first_name}'s detail`}
                onClick={() => navigate(`/coach/clients/${m.user_id}`)}
              >
                <CardContent className="py-3">
                  <p className="font-medium truncate">{m.first_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.reasons
                      .filter((r) => r in NUTRITION_REASONS)
                      .map((r) => NUTRITION_REASONS[r])
                      .join(" · ")}
                  </p>
                </CardContent>
              </ClickableCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
