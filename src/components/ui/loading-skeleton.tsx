import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

interface LoadingSkeletonProps {
  /** Type of content being loaded */
  variant?: "card" | "list" | "table" | "form" | "profile" | "stats";
  /** Number of items to show for list/table variants */
  count?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standardized loading skeleton component.
 * Use to show placeholder content while data is loading.
 * 
 * @example
 * {isLoading ? <LoadingSkeleton variant="card" /> : <ActualContent />}
 */
export function LoadingSkeleton({
  variant = "card",
  count = 3,
  className,
}: LoadingSkeletonProps) {
  switch (variant) {
    case "card":
      return (
        <div className={cn("space-y-3", className)}>
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      );

    case "list":
      return (
        <div className={cn("space-y-3", className)}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      );

    case "table":
      return (
        <div className={cn("space-y-2", className)}>
          {/* Header */}
          <div className="flex gap-4 p-3 border-b">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
          </div>
          {/* Rows */}
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex gap-4 p-3">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          ))}
        </div>
      );

    case "form":
      return (
        <div className={cn("space-y-4", className)}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-32 mt-4" />
        </div>
      );

    case "profile":
      return (
        <div className={cn("flex flex-col items-center gap-4", className)}>
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-4 mt-4">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      );

    case "stats":
      return (
        <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-4", className)}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 border rounded-lg space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      );

    default:
      return <Skeleton className={cn("h-32 w-full", className)} />;
  }
}

/**
 * Full page loading state.
 * Use when an entire page is loading.
 */
export function PageLoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("p-6 space-y-6", className)}>
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      
      {/* Stats row */}
      <LoadingSkeleton variant="stats" />
      
      {/* Main content */}
      <div className="grid gap-6 md:grid-cols-2">
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="card" />
      </div>
      
      {/* Table */}
      <LoadingSkeleton variant="table" count={5} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * CC6 — layout-shaped shells.
 *
 * The coach side was spinner-only (53 files on Loader2, 4 on Skeleton). A
 * centered spinner tells the user nothing about what is coming and causes a
 * layout jump when it resolves. These mirror the real components' boxes so the
 * content lands in the space the skeleton was already holding.
 *
 * Build 3 shells and swap; do NOT hand-write a skeleton per file.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Mirrors the CC1 MetricCard grid: label bar · hero number · sparkline strip. */
export function MetricCardGridSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-3 h-6 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors a roster row: avatar · name + meta · trailing pill. */
export function RosterRowSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors a tab/panel shell: header bar + stacked cards. */
export function TabShellSkeleton({
  cards = 3,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
