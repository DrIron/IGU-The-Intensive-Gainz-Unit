import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SimplePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Items per page label e.g. "Showing 1-20 of 150" */
  totalItems?: number;
  pageSize?: number;
}

export function SimplePagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
}: SimplePaginationProps) {
  if (totalPages <= 1) return null;

  const start = totalItems != null && pageSize != null ? (currentPage - 1) * pageSize + 1 : null;
  const end = totalItems != null && pageSize != null ? Math.min(currentPage * pageSize, totalItems) : null;

  return (
    <div className="flex items-center justify-between gap-4 pt-4">
      <div className="text-sm text-muted-foreground">
        {start != null && end != null && totalItems != null
          ? `Showing ${start}–${end} of ${totalItems}`
          : `Page ${currentPage} of ${totalPages}`}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {getPageNumbers(currentPage, totalPages).map((page, i) =>
          page === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-sm">
              ...
            </span>
          ) : (
            <Button
              key={page}
              variant={page === currentPage ? "default" : "outline"}
              size="sm"
              className="min-w-[2rem]"
              onClick={() => onPageChange(page as number)}
            >
              {page}
            </Button>
          )
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Generate page numbers with ellipsis for large page counts */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [1];

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("...");

  pages.push(total);
  return pages;
}

/** Hook-like helper: returns paginated slice + controls */
export function usePagination<T>(items: T[], pageSize: number = 20) {
  // This is a pure function helper, not a hook — call it in render
  return {
    paginate: (page: number) => {
      const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
      const safePage = Math.max(1, Math.min(page, totalPages));
      const start = (safePage - 1) * pageSize;
      return {
        paginatedItems: items.slice(start, start + pageSize),
        totalPages,
        currentPage: safePage,
        totalItems: items.length,
        pageSize,
      };
    },
  };
}
