/**
 * SessionProgressRing — compact SVG progress ring for the workout logger header
 * (WK7 §2a). Replaces the thin h-2 Progress bar. Status-token stroke only
 * (--status-*), no ad-hoc colors: complete → ontrack, in-progress → primary.
 * Pure presentational; counts come from the caller's real setLogs tally.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SessionProgressRing({
  completed,
  total,
  size = 44,
  strokeWidth = 4,
  className,
  label,
}: {
  completed: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  // Center content. Omit → the percentage (header's primary metric). Pass a
  // node (e.g. a check or "2/4") to override, or null to show nothing.
  label?: ReactNode;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;
  const isDone = total > 0 && completed >= total;

  return (
    <div
      className={cn("relative shrink-0", isDone ? "text-status-ontrack" : "text-primary", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${completed} of ${total} sets done, ${pct}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="text-muted"
          stroke="currentColor"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      {(() => {
        const center = label === undefined ? `${pct}%` : label;
        return center == null ? null : (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-foreground">
            {center}
          </span>
        );
      })()}
    </div>
  );
}
