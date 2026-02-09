import { useState, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { X, GripVertical } from "lucide-react";
import { ColumnConfig, reorderColumns } from "@/types/workout-builder";
import { AddColumnDropdown } from "./AddColumnDropdown";

interface ColumnCategoryHeaderProps {
  prescriptionColumns: ColumnConfig[];
  inputColumns: ColumnConfig[];
  onAddPrescriptionColumn: (column: ColumnConfig) => void;
  onAddInputColumn: (column: ColumnConfig) => void;
  onRemoveColumn: (columnId: string) => void;
  onReorderPrescriptionColumns: (columns: ColumnConfig[]) => void;
  onReorderInputColumns: (columns: ColumnConfig[]) => void;
  isReadOnly?: boolean;
}

export const ColumnCategoryHeader = memo(function ColumnCategoryHeader({
  prescriptionColumns,
  inputColumns,
  onAddPrescriptionColumn,
  onAddInputColumn,
  onRemoveColumn,
  onReorderPrescriptionColumns,
  onReorderInputColumns,
  isReadOnly,
}: ColumnCategoryHeaderProps) {
  const [dragState, setDragState] = useState<{
    category: "prescription" | "input";
    fromIndex: number;
  } | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const visiblePrescriptionCols = useMemo(
    () =>
      prescriptionColumns
        .filter((c) => c.visible && c.type !== "sets")
        .sort((a, b) => a.order - b.order),
    [prescriptionColumns]
  );

  const visibleInputCols = useMemo(
    () =>
      inputColumns
        .filter((c) => c.visible)
        .sort((a, b) => a.order - b.order),
    [inputColumns]
  );

  const handleDragStart = (
    e: React.DragEvent,
    category: "prescription" | "input",
    index: number
  ) => {
    setDragState({ category, fromIndex: index });
    e.dataTransfer.effectAllowed = "move";
    // Needed for Firefox
    e.dataTransfer.setData("text/plain", "");
  };

  const handleDragOver = (
    e: React.DragEvent,
    category: "prescription" | "input",
    index: number
  ) => {
    e.preventDefault();
    if (!dragState || dragState.category !== category) return;
    e.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  };

  const handleDrop = (
    e: React.DragEvent,
    category: "prescription" | "input",
    index: number
  ) => {
    e.preventDefault();
    if (!dragState || dragState.category !== category) return;

    if (dragState.fromIndex !== index) {
      if (category === "prescription") {
        onReorderPrescriptionColumns(
          reorderColumns(visiblePrescriptionCols, dragState.fromIndex, index)
        );
      } else {
        onReorderInputColumns(
          reorderColumns(visibleInputCols, dragState.fromIndex, index)
        );
      }
    }

    setDragState(null);
    setDropTargetIndex(null);
  };

  const handleDragEnd = () => {
    setDragState(null);
    setDropTargetIndex(null);
  };

  const renderColumnHeader = (
    col: ColumnConfig,
    index: number,
    category: "prescription" | "input"
  ) => {
    const isDragging =
      dragState?.category === category && dragState.fromIndex === index;
    const isDropTarget =
      dragState?.category === category && dropTargetIndex === index && dragState.fromIndex !== index;

    const bgClass =
      category === "prescription"
        ? "bg-muted/20"
        : "bg-emerald-50/20 dark:bg-emerald-950/5";

    return (
      <TableHead
        key={col.id}
        draggable={!isReadOnly}
        onDragStart={(e) => handleDragStart(e, category, index)}
        onDragOver={(e) => handleDragOver(e, category, index)}
        onDrop={(e) => handleDrop(e, category, index)}
        onDragEnd={handleDragEnd}
        className={`text-[10px] font-medium text-muted-foreground text-center px-1 py-1 min-w-[70px] transition-all ${bgClass} ${
          isDragging ? "opacity-40" : ""
        } ${isDropTarget ? "ring-2 ring-primary ring-inset" : ""} ${
          !isReadOnly ? "cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        <div className="flex items-center justify-center gap-0.5 group">
          {!isReadOnly && (
            <GripVertical className="h-2.5 w-2.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 shrink-0" />
          )}
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
              onClick={(e) => {
                e.stopPropagation();
                onRemoveColumn(col.id);
              }}
            >
              <X className="h-2.5 w-2.5" />
            </Button>
          )}
        </div>
      </TableHead>
    );
  };

  return (
    <TableHeader>
      {/* Row 1: Category spans */}
      <TableRow className="border-b-0">
        <TableHead
          className="w-10 text-center text-[10px] font-medium text-muted-foreground"
          rowSpan={2}
        >
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

      {/* Row 2: Draggable individual column names */}
      <TableRow>
        {visiblePrescriptionCols.map((col, index) =>
          renderColumnHeader(col, index, "prescription")
        )}
        {visibleInputCols.map((col, index) =>
          renderColumnHeader(col, index, "input")
        )}
      </TableRow>
    </TableHeader>
  );
});
