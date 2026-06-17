import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses, type Tone } from "@/lib/interpret";

/**
 * Compact directional delta pill (e.g. "▲ 1.2%"). Tone drives the colour so it
 * matches the interpretation sentence on the same MetricCard.
 */
export function DeltaChip({
  value,
  suffix = "",
  tone = "neutral",
  className,
}: {
  value: number;
  suffix?: string;
  tone?: Tone;
  className?: string;
}) {
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus;
  const { text, soft } = toneClasses(tone);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums",
        soft,
        text,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value)}
      {suffix}
    </span>
  );
}
