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
