import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

interface Column<T> {
  /** Column header text */
  header: string;
  /** Key to access data from row object */
  accessorKey: keyof T;
  /** Custom cell renderer */
  cell?: (row: T) => ReactNode;
  /** CSS class for the cell */
  className?: string;
  /** If true, this column is hidden on mobile card view */
  hideOnMobile?: boolean;
  /** If true, this column becomes the card title on mobile */
  isTitle?: boolean;
}

interface ResponsiveTableProps<T> {
  /** Data rows to display */
  data: T[];
  /** Column definitions */
  columns: Column<T>[];
  /** Function to get unique key for each row */
  getRowKey: (row: T) => string;
  /** Additional CSS classes */
  className?: string;
  /** Empty state message */
  emptyMessage?: string;
  /** Callback when a row is clicked */
  onRowClick?: (row: T) => void;
}

/**
 * Responsive table component that displays as:
 * - Desktop (>= md): Standard table
 * - Mobile (< md): Stacked cards
 * 
 * @example
 * ```tsx
 * <ResponsiveTable
 *   data={clients}
 *   columns={[
 *     { header: "Name", accessorKey: "name", isTitle: true },
 *     { header: "Email", accessorKey: "email" },
 *     { header: "Status", accessorKey: "status", cell: (row) => <Badge>{row.status}</Badge> },
 *     { header: "Actions", accessorKey: "id", hideOnMobile: true, cell: (row) => <Button>Edit</Button> },
 *   ]}
 *   getRowKey={(row) => row.id}
 *   onRowClick={(row) => navigate(`/client/${row.id}`)}
 * />
 * ```
 */
export function ResponsiveTable<T extends Record<string, any>>({
  data,
  columns,
  getRowKey,
  className,
  emptyMessage = "No data available",
  onRowClick,
}: ResponsiveTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  // Find title column for mobile cards
  const titleColumn = columns.find(col => col.isTitle);
  const mobileColumns = columns.filter(col => !col.hideOnMobile && !col.isTitle);

  return (
    <div className={cn(className)}>
      {/* Desktop Table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={String(column.accessorKey)} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow
                key={getRowKey(row)}
                className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column) => (
                  <TableCell key={String(column.accessorKey)} className={column.className}>
                    {column.cell ? column.cell(row) : String(row[column.accessorKey] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {data.map((row) => (
          <Card
            key={getRowKey(row)}
            className={cn(
              "transition-colors",
              onRowClick && "cursor-pointer hover:bg-muted/50 active:bg-muted"
            )}
            onClick={() => onRowClick?.(row)}
          >
            {titleColumn && (
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {titleColumn.cell 
                    ? titleColumn.cell(row) 
                    : String(row[titleColumn.accessorKey] ?? "")
                  }
                </CardTitle>
              </CardHeader>
            )}
            <CardContent className={titleColumn ? "pt-0" : ""}>
              <dl className="space-y-2">
                {mobileColumns.map((column) => (
                  <div key={String(column.accessorKey)} className="flex justify-between gap-2">
                    <dt className="text-sm text-muted-foreground">{column.header}</dt>
                    <dd className="text-sm font-medium text-right">
                      {column.cell ? column.cell(row) : String(row[column.accessorKey] ?? "")}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Simple wrapper to hide content on mobile.
 * Useful for action columns or dense data.
 */
export function HideOnMobile({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("hidden md:block", className)}>{children}</div>;
}

/**
 * Simple wrapper to hide content on desktop.
 * Useful for mobile-specific UI.
 */
export function HideOnDesktop({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("md:hidden", className)}>{children}</div>;
}
