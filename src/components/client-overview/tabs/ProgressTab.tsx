import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Apple, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CoachNutritionGraphs } from "@/components/nutrition/CoachNutritionGraphs";
import { VolumeChart } from "@/components/coach/VolumeChart";
import type { ClientOverviewTabProps } from "../types";

/**
 * Progress tab for the Client Overview shell.
 *
 * Reorganises graphs that already live elsewhere in the app:
 *  - `CoachNutritionGraphs` -- weight (daily + weekly avg + adjustments),
 *    body-fat %, circumference trends. Phase-scoped: pulls from
 *    `weight_logs`, `body_fat_logs`, `circumference_logs`, and
 *    `nutrition_adjustments` filtered by the client's active phase.
 *  - `VolumeChart` -- weekly training volume per muscle group, derived
 *    from `exercise_set_logs` via the `useVolumeTracking` hook.
 *
 * This is a display layer only -- no new queries, tables, or RPCs.
 * When there is no active nutrition phase, the body-comp graphs sit
 * behind an empty state that points the coach to the Nutrition tab
 * (volume still renders, since it's independent of phase).
 */
export function ProgressTab({ context }: ClientOverviewTabProps) {
  const { clientUserId } = context;
  const [activePhase, setActivePhase] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("nutrition_phases")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (error) console.warn("[ProgressTab] phase:", error.message);
    setActivePhase(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    load(clientUserId).catch((err) => {
      console.error("[ProgressTab] unexpected:", err);
      setLoading(false);
    });
  }, [clientUserId, load]);

  return (
    <div className="space-y-6">
      {loading ? (
        <Card>
          <CardContent className="py-8 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </CardContent>
        </Card>
      ) : activePhase ? (
        <CoachNutritionGraphs phase={activePhase} />
      ) : (
        <NoPhaseState clientUserId={clientUserId} />
      )}

      <VolumeChart clientUserId={clientUserId} />
    </div>
  );
}

function NoPhaseState({ clientUserId }: { clientUserId: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center space-y-3">
        <div className="flex justify-center">
          <div className="p-3 rounded-full bg-muted">
            <Apple className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-medium">No active nutrition phase</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Weight, body-fat, and circumference trends appear once a nutrition
            phase is active. Workout volume is still plotted below.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/coach/clients/${clientUserId}?tab=nutrition`}>Open Nutrition</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
