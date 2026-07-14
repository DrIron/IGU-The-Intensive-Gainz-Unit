import { useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Share2, Loader2, Calendar, Target } from "lucide-react";
import { format, differenceInCalendarWeeks } from "date-fns";
import { toast } from "sonner";
import { PhaseSummaryCard, type PhaseSummaryCardData } from "./PhaseSummaryCard";
import { sharePhaseCard } from "@/lib/sharePhaseCard";

/**
 * PhaseSummaryReport — the end-of-phase recap (NU6).
 *
 * The branded `PhaseSummaryCard` at the top is the SHAREABLE artifact: tapping Share
 * rasterises that exact node to a PNG and hands it to the native share sheet (or
 * downloads it). That replaces the old plain-.txt export, which nobody could share and
 * which carried no brand at all.
 *
 * The detail below stays — a client still wants the full numbers — but the card is
 * what leaves the app.
 *
 * HONESTY: the hero result is neutral and phase-framed (see PhaseSummaryCard). The
 * detail's change figure is now neutral too: it previously carried a GREEN up-arrow
 * and a RED down-arrow, which asserted that gaining is good and losing is bad (or the
 * reverse, depending on the arrow you read) — false under any phase whose goal runs
 * the other way. Same rule PUB6 / CL5 / CO4 enforce.
 */
interface PhaseSummaryReportProps {
  phase: {
    phase_name: string;
    start_date: string;
    [key: string]: unknown;
  };
  summary: {
    startWeight: number;
    endWeight: number;
    totalChange: number;
    targetChange: number;
    percentOfTarget: number;
    averageAdherence: number;
    dietBreaksTaken: number;
    avgDailyCalories: number;
    avgProtein: number;
    avgFat: number;
    avgCarbs: number;
  } | null;
  /** From profiles_public — the card null-omits the line when unknown. */
  firstName?: string | null;
}

export function PhaseSummaryReport({ phase, summary, firstName }: PhaseSummaryReportProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  // Real data only. No usable summary -> render NOTHING, never a zeroed card claiming
  // a 0.0 kg result the client never had.
  if (!summary || !Number.isFinite(summary.totalChange)) return null;

  const start = new Date(phase.start_date);
  const end = new Date();
  const weeks = Math.max(1, differenceInCalendarWeeks(end, start));

  const cardData: PhaseSummaryCardData = {
    phaseName: phase.phase_name,
    deltaKg: summary.totalChange,
    weeks,
    protein: summary.avgProtein,
    fat: summary.avgFat,
    carbs: summary.avgCarbs,
    firstName,
  };

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    const outcome = await sharePhaseCard(cardRef.current, phase.phase_name);
    setSharing(false);

    if (outcome === "downloaded") toast.success("Saved to your device");
    else if (outcome === "failed") toast.error("Couldn't create the image. Please try again.");
    // "shared" needs no toast — the share sheet is its own feedback. "cancelled" is the
    // client changing their mind; say nothing.
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>Phase Summary</CardTitle>
            <CardDescription className="truncate">{phase.phase_name}</CardDescription>
          </div>
          <Button onClick={handleShare} variant="outline" size="sm" disabled={sharing}>
            {sharing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            ) : (
              <Share2 className="h-4 w-4 mr-2" aria-hidden />
            )}
            {sharing ? "Preparing…" : "Share"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* The shareable artifact — THIS exact node is what gets rasterised to PNG. */}
        <PhaseSummaryCard ref={cardRef} data={cardData} />

        {/* Timeline */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
          <Calendar className="h-5 w-5 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-sm text-muted-foreground">Duration</p>
            <p className="font-medium">
              {format(start, "MMM dd, yyyy")} - {format(end, "MMM dd, yyyy")}
            </p>
          </div>
        </div>

        {/* Weight Progress */}
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Target className="h-4 w-4" aria-hidden />
            Weight Progress
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Starting" value={`${summary.startWeight} kg`} />
            <Stat label="Ending" value={`${summary.endWeight} kg`} />
            {/* Neutral: no green-up / red-down. The sign carries the information. */}
            <Stat
              label="Change"
              value={`${summary.totalChange > 0 ? "+" : ""}${summary.totalChange.toFixed(1)} kg`}
            />
            <Stat label="vs Target" value={`${summary.percentOfTarget.toFixed(0)}%`} />
          </div>
        </div>

        {/* Adherence & Nutrition */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="font-semibold">Adherence</h3>
            <Row label="Average" value={`${summary.averageAdherence.toFixed(0)}%`} />
            <Row label="Diet Breaks" value={`${summary.dietBreaksTaken} weeks`} />
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Nutrition Averages</h3>
            <Row label="Calories" value={`${Math.round(summary.avgDailyCalories)} kcal`} />
            <Row
              label="P / F / C"
              value={`${Math.round(summary.avgProtein)}g / ${Math.round(summary.avgFat)}g / ${Math.round(summary.avgCarbs)}g`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/30">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
