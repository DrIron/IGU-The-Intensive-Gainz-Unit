import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * LoadError — the surface failed to LOAD. Semantically distinct from EmptyState.
 *
 * ── Why this exists (CC10) ──────────────────────────────────────────────────
 * An audit found 0 of 16 coach/public surfaces with a visible error branch: a
 * failed fetch rendered pixel-identical to "no data", and four surfaces actively
 * lied — CoachAlerts showed "0 alerts" on failure, MeetOurTeam said the team was
 * "being assembled", TestimonialsList fell back to three FAKE 5-star reviews, and
 * CoachPublicPage collapsed a network error into a 404.
 *
 * So the rule is: **never render EmptyState for an error.** "There is nothing here"
 * and "we could not find out what is here" are different claims, and conflating them
 * is how a transient blip tells a coach everything is fine.
 *
 * Every data surface gets three distinct branches:
 *   isLoading → a layout-shaped skeleton
 *   error     → <LoadError onRetry={refetch} />
 *   empty     → <EmptyState />
 *   data      → content
 *
 * Visually in the EmptyState family (flat, centered, no shadow) but with a mono
 * uppercase label + a destructive-tinted icon so it reads as a fault, not a void.
 */
interface LoadErrorProps {
  /**
   * Plain-language, surface-specific. "We couldn't load your clients." — not a raw
   * error message, and never a stack trace.
   */
  message?: string;
  /** Wire to the surface's refetch. Omit only when there is genuinely nothing to retry. */
  onRetry?: () => void;
  className?: string;
  size?: "sm" | "md";
}

export function LoadError({
  message = "We couldn't load this. Check your connection and try again.",
  onRetry,
  className,
  size = "md",
}: LoadErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-border/60 bg-muted/20 text-center",
        size === "sm" ? "gap-2 px-4 py-6" : "gap-2.5 px-6 py-10",
        className,
      )}
    >
      <AlertTriangle
        className={cn("text-destructive/70", size === "sm" ? "h-5 w-5" : "h-6 w-6")}
        aria-hidden
      />
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        Couldn&apos;t load
      </p>
      <p className={cn("max-w-xs text-muted-foreground", size === "sm" ? "text-xs" : "text-sm")}>
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-1" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
