import { useCallback, useMemo, memo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { X } from "lucide-react";
import {
  ColumnConfig,
  SetPrescription,
  PrescriptionColumnType,
  getSetColumnValue,
  setSetColumnValue,
} from "@/types/workout-builder";

interface SetRowEditorProps {
  set: SetPrescription;
  setIndex: number;
  prescriptionColumns: ColumnConfig[];
  inputColumns: ColumnConfig[];
  onSetChange: (updated: SetPrescription) => void;
  onDeleteSet: () => void;
  isReadOnly?: boolean;
}

export const SetRowEditor = memo(function SetRowEditor({
  set,
  setIndex,
  prescriptionColumns,
  inputColumns,
  onSetChange,
  onDeleteSet,
  isReadOnly,
}: SetRowEditorProps) {
  const handleValueChange = useCallback(
    (columnType: PrescriptionColumnType, value: string | number | null) => {
      const updated = setSetColumnValue(set, columnType, value);
      onSetChange(updated);
    },
    [set, onSetChange]
  );

  const renderPrescriptionInput = (column: ColumnConfig) => {
    const colType = column.type as PrescriptionColumnType;
    const isRepRange = colType === "rep_range";
    const isNumeric = [
      "reps", "weight", "rir", "rpe", "percent_1rm", "rest", "time", "distance",
    ].includes(colType);
    const isText = ["tempo", "band_resistance", "notes"].includes(colType);

    if (isRepRange) {
      return (
        <div className="flex items-center gap-0.5">
          <Input
            type="number"
            min={1}
            value={set.rep_range_min ?? ""}
            onChange={(e) =>
              onSetChange({
                ...set,
                rep_range_min: parseInt(e.target.value) || undefined,
              })
            }
            className="h-7 text-xs w-12 text-center px-1"
            placeholder="Min"
            disabled={isReadOnly}
          />
          <span className="text-muted-foreground text-[10px]">-</span>
          <Input
            type="number"
            min={1}
            value={set.rep_range_max ?? ""}
            onChange={(e) =>
              onSetChange({
                ...set,
                rep_range_max: parseInt(e.target.value) || undefined,
              })
            }
            className="h-7 text-xs w-12 text-center px-1"
            placeholder="Max"
            disabled={isReadOnly}
          />
        </div>
      );
    }

    const value = getSetColumnValue(set, colType);

    return (
      <div className="relative">
        <Input
          type={isNumeric ? "number" : "text"}
          value={value?.toString() ?? ""}
          onChange={(e) =>
            handleValueChange(
              colType,
              isNumeric
                ? parseFloat(e.target.value) || null
                : e.target.value || null
            )
          }
          className={`h-7 text-xs ${column.unit ? "pr-8" : ""}`}
          placeholder={column.placeholder || column.label}
          disabled={isReadOnly}
        />
        {column.unit && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
            {column.unit}
          </span>
        )}
      </div>
    );
  };

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

  return (
    <TableRow className="hover:bg-muted/20">
      {/* Set number */}
      <TableCell className="font-bold text-center text-xs w-10 py-1">
        {set.set_number}
      </TableCell>

      {/* Prescription columns */}
      {visiblePrescriptionCols.map((col) => (
        <TableCell key={col.id} className="py-1 px-1 bg-muted/10">
          {renderPrescriptionInput(col)}
        </TableCell>
      ))}

      {/* Visual separator */}
      <TableCell className="w-1 p-0 bg-border/50" />

      {/* Input columns (empty/placeholder in coach view) */}
      {visibleInputCols.map((col) => (
        <TableCell
          key={col.id}
          className="py-1 px-1 bg-emerald-50/30 dark:bg-emerald-950/10"
        >
          <Input
            type="number"
            className="h-7 text-xs bg-emerald-50/20 dark:bg-emerald-950/5 border-emerald-200/30"
            placeholder="—"
            disabled
          />
        </TableCell>
      ))}

      {/* Delete set button */}
      {!isReadOnly && (
        <TableCell className="w-8 py-1 px-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDeleteSet}
          >
            <X className="h-3 w-3" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}, (prevProps, nextProps) => {
  // Custom comparator: skip re-render if these key values haven't changed
  return (
    prevProps.set.set_number === nextProps.set.set_number &&
    prevProps.set === nextProps.set &&
    prevProps.prescriptionColumns === nextProps.prescriptionColumns &&
    prevProps.inputColumns === nextProps.inputColumns &&
    prevProps.isReadOnly === nextProps.isReadOnly &&
    prevProps.onSetChange === nextProps.onSetChange &&
    prevProps.onDeleteSet === nextProps.onDeleteSet
  );
});
