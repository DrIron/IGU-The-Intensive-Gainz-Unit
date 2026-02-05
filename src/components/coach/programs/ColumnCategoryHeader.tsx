import { Button } from "@/components/ui/button";
import { TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { X } from "lucide-react";
import { ColumnConfig } from "@/types/workout-builder";
import { AddColumnDropdown } from "./AddColumnDropdown";

interface ColumnCategoryHeaderProps {
  prescriptionColumns: ColumnConfig[];
  inputColumns: ColumnConfig[];
  onAddPrescriptionColumn: (column: ColumnConfig) => void;
  onAddInputColumn: (column: ColumnConfig) => void;
  onRemoveColumn: (columnId: string) => void;
  isReadOnly?: boolean;
}

export function ColumnCategoryHeader({
  prescriptionColumns,
  inputColumns,
  onAddPrescriptionColumn,
  onAddInputColumn,
  onRemoveColumn,
  isReadOnly,
}: ColumnCategoryHeaderProps) {
  const visiblePrescriptionCols = prescriptionColumns
    .filter((c) => c.visible && c.type !== "sets")
    .sort((a, b) => a.order - b.order);

  const visibleInputCols = inputColumns
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <TableHeader>
      {/* Row 1: Category spans */}
      <TableRow className="border-b-0">
        <TableHead className="w-10 text-center text-[10px] font-medium text-muted-foreground" rowSpan={2}>
          Set
        </TableHead>
        <TableHead
          colSpan={visiblePrescriptionCols.length}
          className="text-center text-xs font-semibold bg-muted/30 border-b-0 py-1"
        >
          <div className="flex items-center justify-center gap-1">
            <span>Exercise Instructions</span>
            {!isReadOnly && (
              <AddColumnDropdown
                category="prescription"
                existingColumns={prescriptionColumns}
                onAddColumn={onAddPrescriptionColumn}
              />
            )}
          </div>
        </TableHead>
        {/* Separator */}
        <TableHead className="w-1 p-0 bg-border/50" rowSpan={2} />
        <TableHead
          colSpan={visibleInputCols.length}
          className="text-center text-xs font-semibold bg-emerald-50/30 dark:bg-emerald-950/10 border-b-0 py-1"
        >
          <div className="flex items-center justify-center gap-1">
            <span>Client Inputs</span>
            {!isReadOnly && (
              <AddColumnDropdown
                category="input"
                existingColumns={inputColumns}
                onAddColumn={onAddInputColumn}
              />
            )}
          </div>
        </TableHead>
        {!isReadOnly && <TableHead className="w-8" rowSpan={2} />}
      </TableRow>

      {/* Row 2: Individual column names */}
      <TableRow>
        {visiblePrescriptionCols.map((col) => (
          <TableHead
            key={col.id}
            className="text-[10px] font-medium text-muted-foreground text-center bg-muted/20 px-1 py-1 min-w-[70px]"
          >
            <div className="flex items-center justify-center gap-0.5 group">
              <span className="truncate">
                {col.label}
                {col.unit && (
                  <span className="text-[9px] ml-0.5">({col.unit})</span>
                )}
              </span>
              {!isReadOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={() => onRemoveColumn(col.id)}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              )}
            </div>
          </TableHead>
        ))}
        {visibleInputCols.map((col) => (
          <TableHead
            key={col.id}
            className="text-[10px] font-medium text-muted-foreground text-center bg-emerald-50/20 dark:bg-emerald-950/5 px-1 py-1 min-w-[70px]"
          >
            <div className="flex items-center justify-center gap-0.5 group">
              <span className="truncate">
                {col.label}
                {col.unit && (
                  <span className="text-[9px] ml-0.5">({col.unit})</span>
                )}
              </span>
              {!isReadOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={() => onRemoveColumn(col.id)}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              )}
            </div>
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}
