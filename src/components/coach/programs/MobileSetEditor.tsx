import { useCallback, useMemo, memo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  ColumnConfig,
  SetPrescription,
  PrescriptionColumnType,
  getSetColumnValue,
  setSetColumnValue,
} from "@/types/workout-builder";

interface MobileSetEditorProps {
  set: SetPrescription;
  prescriptionColumns: ColumnConfig[];
  inputColumns: ColumnConfig[];
  onSetChange: (updated: SetPrescription) => void;
  onDeleteSet: () => void;
  canDelete: boolean;
  isReadOnly?: boolean;
}

export const MobileSetEditor = memo(function MobileSetEditor({
  set,
  prescriptionColumns,
  inputColumns,
  onSetChange,
  onDeleteSet,
  canDelete,
  isReadOnly,
}: MobileSetEditorProps) {
  const handleValueChange = useCallback(
    (columnType: PrescriptionColumnType, value: string | number | null) => {
      onSetChange(setSetColumnValue(set, columnType, value));
    },
    [set, onSetChange]
  );

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

  const renderField = (column: ColumnConfig) => {
    const colType = column.type as PrescriptionColumnType;
    const isRepRange = colType === "rep_range";
    const isNumeric = [
      "reps", "weight", "rir", "rpe", "percent_1rm", "rest", "time", "distance",
    ].includes(colType);

    if (isRepRange) {
      return (
        <div key={column.id} className="space-y-1">
          <label className="text-xs text-muted-foreground">{column.label}</label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={set.rep_range_min ?? ""}
              onChange={(e) =>
                onSetChange({
                  ...set,
                  rep_range_min: parseInt(e.target.value) || undefined,
                })
              }
              className="h-10 text-base text-center"
              placeholder="Min"
              disabled={isReadOnly}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={set.rep_range_max ?? ""}
              onChange={(e) =>
                onSetChange({
                  ...set,
                  rep_range_max: parseInt(e.target.value) || undefined,
                })
              }
              className="h-10 text-base text-center"
              placeholder="Max"
              disabled={isReadOnly}
            />
          </div>
        </div>
      );
    }

    const value = getSetColumnValue(set, colType);

    return (
      <div key={column.id} className="space-y-1">
        <label className="text-xs text-muted-foreground">
          {column.label}
          {column.unit && <span className="ml-1">({column.unit})</span>}
        </label>
        <Input
          type={isNumeric ? "number" : "text"}
          inputMode={isNumeric ? "decimal" : undefined}
          value={value?.toString() ?? ""}
          onChange={(e) =>
            handleValueChange(
              colType,
              isNumeric
                ? parseFloat(e.target.value) || null
                : e.target.value || null
            )
          }
          className="h-10 text-base"
          placeholder={column.placeholder || "—"}
          disabled={isReadOnly}
        />
      </div>
    );
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      {/* Header: set number + delete */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Set {set.set_number}</span>
        {!isReadOnly && canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDeleteSet}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Prescription fields */}
      {visiblePrescriptionCols.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {visiblePrescriptionCols.map(renderField)}
        </div>
      )}

      {/* Client input placeholders */}
      {visibleInputCols.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
            Client logs
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleInputCols.map((col) => (
              <span
                key={col.id}
                className="text-[11px] px-2 py-1 rounded-md border border-emerald-200/40 bg-emerald-50/30 dark:bg-emerald-950/10 text-muted-foreground"
              >
                {col.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
