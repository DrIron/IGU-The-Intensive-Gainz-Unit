import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { cn } from "@/lib/utils";
import { toneClasses, type Interpretation } from "@/lib/interpret";
import { DeltaChip } from "./delta-chip";
import { Sparkline } from "./sparkline";

/**
 * MetricCard — the CC1 single metric-card standard.
 *
 * Layout: label (+ optional icon / timeframe), hero value (+ unit), optional
 * DeltaChip, optional Sparkline, and a CC2 interpretation line with a tone dot.
 * Tone (from `interpretation`) drives the delta + dot colour so every metric
 * reads consistently. When `onClick` is set it renders as an accessible
 * ClickableCard (ariaLabel falls back to `label`).
 */
export interface MetricCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  timeframe?: string;
  icon?: LucideIcon;
  delta?: { value: number; suffix?: string };
  interpretation?: Interpretation;
  spark?: number[];
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  timeframe,
  icon: Icon,
  delta,
  interpretation,
  spark,
  onClick,
  ariaLabel,
  className,
}: MetricCardProps) {
  const tone = interpretation?.tone ?? "neutral";
  const body = (
    <CardContent className="space-y-2 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {Icon && <Icon className="h-4 w-4" />}
          <span>{label}</span>
        </div>
        {timeframe && <span className="text-xs text-muted-foreground">{timeframe}</span>}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-1">
          <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
        {delta && <DeltaChip value={delta.value} suffix={delta.suffix} tone={tone} className="shrink-0" />}
      </div>
      {spark && <Sparkline data={spark} />}
      {interpretation?.sentence && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", toneClasses(tone).dot)} />
          {interpretation.sentence}
        </p>
      )}
    </CardContent>
  );

  return onClick ? (
    <ClickableCard onClick={onClick} ariaLabel={ariaLabel ?? label} className={className}>
      {body}
    </ClickableCard>
  ) : (
    <Card className={className}>{body}</Card>
  );
}
