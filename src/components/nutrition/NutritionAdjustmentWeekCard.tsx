import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowUp, ArrowDown, Pause, Coffee, Check, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single week's snapshot + inline adjustment controls. Replaces the legacy
 * Accordion-per-week layout. Matches StudioSlotCard's vocabulary: colored
 * status rail on the left, one hero number (avg weight), monospace micro-copy
 * for deviation, action pills when no adjustment exists.
 */
export interface WeekSnapshot {
  weekNumber: number;
  averageWeight: number;
  weighInCount: number;
  actualChange: number | null; // % vs previous week
  expectedChange: number; // % (from phase.weekly_rate_percentage)
  adjustment: {
    id: string;
    status: "pending" | "approved" | "rejected" | string;
    approved_calorie_adjustment: number;
    new_daily_calories: number;
    new_protein_grams: number;
    new_fat_grams: number;
    new_carb_grams: number;
    coach_notes?: string | null;
    is_diet_break_week?: boolean;
    is_delayed?: boolean;
  } | null;
}

interface NutritionAdjustmentWeekCardProps {
  week: WeekSnapshot;
  /** Sign-aware expected change (e.g. loss: -0.75%, gain: +0.75%). */
  signedExpectedChange: number;
  loading?: boolean;
  onCreateAdjustment: (weekNumber: number, input: { calories: number; notes?: string; isDietBreak: boolean }) => Promise<void> | void;
  onApproveAdjustment?: (weekNumber: number) => Promise<void> | void;
  onRejectAdjustment?: (weekNumber: number) => Promise<void> | void;
  onDelayWeek?: (weekNumber: number) => Promise<void> | void;
}

export function NutritionAdjustmentWeekCard({
  week,
  signedExpectedChange,
  loading,
  onCreateAdjustment,
  onApproveAdjustment,
  onRejectAdjustment,
  onDelayWeek,
}: NutritionAdjustmentWeekCardProps) {
  const hasEnoughWeighIns = week.weighInCount >= 3;
  const deviation =
    week.actualChange != null && signedExpectedChange !== 0
      ? ((week.actualChange - signedExpectedChange) / Math.abs(signedExpectedChange)) * 100
      : null;

  const status = getStatus(deviation, week.adjustment);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex">
          <div aria-hidden className={cn("w-1 shrink-0", STATUS_RAIL[status])} />
          <div className="flex-1 p-4 space-y-3">
            {/* Header: week + status badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] text-muted-foreground tracking-wider uppercase">
                  Week {week.weekNumber} | {week.weighInCount} weigh-in{week.weighInCount === 1 ? "" : "s"}
                </p>
                <p className="text-2xl font-display tabular-nums leading-tight">
                  {week.averageWeight.toFixed(1)}
                  <span className="text-xs text-muted-foreground ml-1">kg</span>
                </p>
              </div>
              <AdjustmentStatusBadge status={status} />
            </div>

            {/* Deviation strip */}
            {week.actualChange != null && (
              <div className="font-mono text-[11px] tabular-nums text-muted-foreground flex items-center gap-2">
                <span className="text-foreground">
                  {week.actualChange > 0 ? "+" : ""}
                  {week.actualChange.toFixed(2)}%
                </span>
                <span className="opacity-60">vs</span>
                <span>
                  {signedExpectedChange > 0 ? "+" : ""}
                  {signedExpectedChange.toFixed(2)}% expected
                </span>
                {deviation != null && (
                  <span className={cn("ml-auto", DEVIATION_COLOR(deviation))}>
                    {deviation > 0 ? "+" : ""}
                    {Math.round(deviation)}% dev
                  </span>
                )}
              </div>
            )}

            {/* Body */}
            {week.adjustment ? (
              <AdjustmentDetails
                adjustment={week.adjustment}
                loading={loading}
                onApprove={onApproveAdjustment ? () => onApproveAdjustment(week.weekNumber) : undefined}
                onReject={onRejectAdjustment ? () => onRejectAdjustment(week.weekNumber) : undefined}
              />
            ) : hasEnoughWeighIns ? (
              <CreateAdjustmentPills
                loading={loading}
                onCreate={(input) => onCreateAdjustment(week.weekNumber, input)}
                onDelay={onDelayWeek ? () => onDelayWeek(week.weekNumber) : undefined}
              />
            ) : (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>3+ weigh-ins needed before adjusting.</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------ details view for existing adjustments ------------

function AdjustmentDetails({
  adjustment,
  loading,
  onApprove,
  onReject,
}: {
  adjustment: NonNullable<WeekSnapshot["adjustment"]>;
  loading?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const delta = adjustment.approved_calorie_adjustment;
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {adjustment.is_diet_break_week ? (
            <>
              <Coffee className="h-4 w-4 text-amber-500" />
              <span>Diet break week</span>
            </>
          ) : adjustment.is_delayed ? (
            <>
              <Pause className="h-4 w-4 text-muted-foreground" />
              <span>Delayed</span>
            </>
          ) : delta > 0 ? (
            <>
              <ArrowUp className="h-4 w-4 text-emerald-500" />
              <span>+{delta} kcal</span>
            </>
          ) : (
            <>
              <ArrowDown className="h-4 w-4 text-destructive" />
              <span>{delta} kcal</span>
            </>
          )}
        </div>
        {adjustment.status === "pending" && onApprove && onReject && (
          <div className="flex gap-1">
            <Button size="sm" variant="default" onClick={onApprove} disabled={loading} className="h-7 px-2">
              <Check className="h-3 w-3 mr-1" />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={onReject} disabled={loading} className="h-7 px-2">
              <X className="h-3 w-3 mr-1" />
              Reject
            </Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 font-mono text-[11px] tabular-nums">
        <Cell label="kcal" value={Math.round(adjustment.new_daily_calories)} />
        <Cell label="P" value={`${Math.round(adjustment.new_protein_grams)}g`} />
        <Cell label="F" value={`${Math.round(adjustment.new_fat_grams)}g`} />
        <Cell label="C" value={`${Math.round(adjustment.new_carb_grams)}g`} />
      </div>
      {adjustment.coach_notes && (
        <p className="text-[11px] text-muted-foreground italic whitespace-pre-wrap">
          {adjustment.coach_notes}
        </p>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded bg-background/50 px-2 py-1">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-[12px] font-medium">{value}</div>
    </div>
  );
}

// ------------ inline pill row for new adjustments ------------

function CreateAdjustmentPills({
  loading,
  onCreate,
  onDelay,
}: {
  loading?: boolean;
  onCreate: (input: { calories: number; notes?: string; isDietBreak: boolean }) => void | Promise<void>;
  onDelay?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CalorieChangePopover direction="up" onCreate={(c, notes) => onCreate({ calories: c, notes, isDietBreak: false })} loading={loading} />
      <CalorieChangePopover direction="down" onCreate={(c, notes) => onCreate({ calories: c, notes, isDietBreak: false })} loading={loading} />
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-[11px]"
        onClick={() => onCreate({ calories: 0, notes: undefined, isDietBreak: true })}
        disabled={loading}
      >
        <Coffee className="h-3 w-3 mr-1" />
        Diet break
      </Button>
      {onDelay && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onDelay} disabled={loading}>
          <Pause className="h-3 w-3 mr-1" />
          Delay
        </Button>
      )}
    </div>
  );
}

function CalorieChangePopover({
  direction,
  onCreate,
  loading,
}: {
  direction: "up" | "down";
  onCreate: (calories: number, notes?: string) => void | Promise<void>;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("100");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    const raw = parseInt(amount, 10);
    if (!Number.isFinite(raw) || raw <= 0) return;
    const signed = direction === "up" ? raw : -raw;
    await onCreate(signed, notes || undefined);
    setOpen(false);
    setAmount("100");
    setNotes("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn("h-7 px-2 text-[11px]", direction === "up" ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}
          disabled={loading}
        >
          {direction === "up" ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
          {direction === "up" ? "Increase" : "Decrease"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Amount (kcal)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={50}
            className="h-8"
          />
          <p className="text-[10px] text-muted-foreground">Minimum ±50 kcal; macros scaled to preserve ratios.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-xs"
            placeholder="Why this change..."
          />
        </div>
        <Button size="sm" onClick={handleSubmit} disabled={loading} className="w-full">
          {direction === "up" ? "Increase" : "Decrease"} by {amount || 0} kcal
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ------------ helpers ------------

type AdjStatus = "none" | "pending" | "approved" | "rejected" | "diet_break" | "delayed";

function getStatus(deviation: number | null, adjustment: WeekSnapshot["adjustment"]): AdjStatus {
  if (!adjustment) {
    if (deviation == null) return "none";
    return "none";
  }
  if (adjustment.is_diet_break_week) return "diet_break";
  if (adjustment.is_delayed) return "delayed";
  if (adjustment.status === "pending") return "pending";
  if (adjustment.status === "approved") return "approved";
  if (adjustment.status === "rejected") return "rejected";
  return "none";
}

const STATUS_RAIL: Record<AdjStatus, string> = {
  none: "bg-muted",
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-destructive/70",
  diet_break: "bg-amber-400/70",
  delayed: "bg-muted-foreground/40",
};

const DEVIATION_COLOR = (deviation: number): string => {
  const abs = Math.abs(deviation);
  if (abs > 50) return "text-destructive";
  if (abs > 30) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
};

function AdjustmentStatusBadge({ status }: { status: AdjStatus }) {
  if (status === "none") return null;
  const map: Record<Exclude<AdjStatus, "none">, { label: string; classes: string }> = {
    pending: { label: "Pending", classes: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    approved: { label: "Approved", classes: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    rejected: { label: "Rejected", classes: "border-destructive/40 bg-destructive/10 text-destructive" },
    diet_break: { label: "Diet break", classes: "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300" },
    delayed: { label: "Delayed", classes: "border-muted-foreground/30 bg-muted/60 text-muted-foreground" },
  };
  const { label, classes } = map[status];
  return <Badge variant="outline" className={cn("shrink-0 text-[10px] font-medium", classes)}>{label}</Badge>;
}
