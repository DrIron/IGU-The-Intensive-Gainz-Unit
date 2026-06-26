// src/components/nutrition/NutritionCheckInCard.tsx
//
// Read-only coach view of the client's most recent weekly check-in (redesign
// B2 -- "This week" tab). Surfaces the unified 3-level adherence_logs check-in
// (calorie_adherence + tracking_accuracy + notes + physical_changes); there was
// no coach-facing view of this before. Degrade-safe: a coach who can't read the
// row (phase.coach_id trap) or a week with no check-in shows a calm empty line.

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface CheckIn {
  weekNumber: number;
  calorieAdherence: string | null;
  trackingAccuracy: string | null;
  notes: string | null;
  physicalChanges: string | null;
}

const CALORIE_LABEL: Record<string, { label: string; tone: string }> = {
  on_point: { label: "On point", tone: "text-emerald-600" },
  mostly: { label: "Mostly on", tone: "text-amber-600" },
  off_track: { label: "Off track", tone: "text-destructive" },
};

const TRACKING_LABEL: Record<string, string> = {
  weighed: "Weighed",
  estimated: "Estimated",
  guessed: "Guessed",
};

export function NutritionCheckInCard({ phaseId }: { phaseId: string }) {
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("adherence_logs")
      .select("week_number, calorie_adherence, tracking_accuracy, notes, physical_changes")
      .eq("phase_id", id)
      .order("week_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) console.warn("[NutritionCheckInCard]", error.message);
    setCheckIn(
      data
        ? {
            weekNumber: data.week_number,
            calorieAdherence: data.calorie_adherence,
            trackingAccuracy: data.tracking_accuracy,
            notes: data.notes,
            physicalChanges: data.physical_changes,
          }
        : null,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasFetched.current === phaseId) return;
    hasFetched.current = phaseId;
    load(phaseId);
  }, [phaseId, load]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const calorie = checkIn?.calorieAdherence ? CALORIE_LABEL[checkIn.calorieAdherence] : null;
  const tracking = checkIn?.trackingAccuracy ? TRACKING_LABEL[checkIn.trackingAccuracy] : null;

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Client check-in
          {checkIn && (
            <span className="font-mono normal-case tracking-normal">· week {checkIn.weekNumber}</span>
          )}
        </div>

        {!checkIn || (!calorie && !checkIn.notes && !checkIn.physicalChanges) ? (
          <p className="text-sm text-muted-foreground">No check-in logged yet.</p>
        ) : (
          <div className="space-y-1.5 text-sm">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {calorie && (
                <span>
                  <span className="text-muted-foreground">Calories: </span>
                  <span className={cn("font-medium", calorie.tone)}>{calorie.label}</span>
                </span>
              )}
              {tracking && (
                <span>
                  <span className="text-muted-foreground">Tracking: </span>
                  <span className="font-medium">{tracking}</span>
                </span>
              )}
            </div>
            {checkIn.physicalChanges && (
              <p className="text-muted-foreground">
                <span className="text-foreground">Changes: </span>
                {checkIn.physicalChanges}
              </p>
            )}
            {checkIn.notes && (
              <p className="text-muted-foreground italic whitespace-pre-wrap">"{checkIn.notes}"</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
