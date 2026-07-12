import { useTranslation } from "react-i18next";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWeightChange, type WeightChangeShape } from "@/lib/weightChangeFormat";

/**
 * Compact, on-brand proof chip for a weight-change testimonial attachment.
 * Renders e.g. "▼ 2.1 kg · 4 weeks · Summer Cut" with the optional note beneath.
 * Direction glyph is derived from delta_kg sign (down = loss, up = gain) — NOT an
 * assumption that down is good; the color stays neutral (muted) so we don't imply
 * good/bad. Shared by the coach page, /testimonials, and coach/admin surfaces.
 */
export function WeightChangeProof({
  attachment,
  note,
  className,
}: {
  attachment: WeightChangeShape;
  note?: string | null;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const delta = Number(attachment.delta_kg);
  const weeks = Number(attachment.weeks);
  if (!Number.isFinite(delta) || !Number.isFinite(weeks)) return null;

  const Icon = delta < 0 ? TrendingDown : TrendingUp;
  const kgLabel = t("proofKg", { n: Math.abs(delta), defaultValue: "{{n}} kg" });
  const weeksLabel =
    weeks === 1
      ? t("proofWeekOne", { defaultValue: "1 week" })
      : t("proofWeeks", { n: weeks, defaultValue: "{{n}} weeks" });

  return (
    <div className={cn("space-y-1", className)}>
      <span
        className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
        title={formatWeightChange(attachment)}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {kgLabel}
        <span className="text-muted-foreground">·</span>
        {weeksLabel}
        {attachment.phase_name && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{attachment.phase_name}</span>
          </>
        )}
      </span>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export default WeightChangeProof;
