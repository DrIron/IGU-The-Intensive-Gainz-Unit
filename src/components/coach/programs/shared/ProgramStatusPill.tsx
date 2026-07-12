import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * ProgramStatusPill — draft / ready / in-use state for a program (§11.2).
 *
 * NEW in PR1 and deliberately UNCONSUMED: it lands here so PR2's library card and
 * detail header can import it rather than re-implement it. Adding it changes no
 * existing rendering — nothing imports it yet.
 *
 * Flat, no shadow, mono uppercase micro-label — matches the current bar.
 */
export type ProgramStatus = "draft" | "ready" | "in_use";

const STATUS_META: Record<ProgramStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "text-muted-foreground border-border" },
  ready: { label: "Ready", className: "text-emerald-600 border-emerald-500/40 dark:text-emerald-400" },
  in_use: { label: "In use", className: "text-primary border-primary/40" },
};

interface ProgramStatusPillProps {
  status: ProgramStatus;
  /** Optional client count, rendered as "In use · 4" on the in_use state. */
  count?: number;
  className?: string;
}

export function ProgramStatusPill({ status, count, className }: ProgramStatusPillProps) {
  const meta = STATUS_META[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-mono uppercase tracking-wider shrink-0",
        meta.className,
        className,
      )}
    >
      {meta.label}
      {count != null && count > 0 && ` · ${count}`}
    </Badge>
  );
}
