import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import {
  ColumnConfig,
  PrescriptionColumnType,
  ClientInputColumnType,
  AVAILABLE_PRESCRIPTION_COLUMNS,
  AVAILABLE_CLIENT_COLUMNS,
  generateColumnId,
} from "@/types/workout-builder";

interface AddColumnDropdownProps {
  category: "prescription" | "input";
  existingColumns: ColumnConfig[];
  onAddColumn: (column: ColumnConfig) => void;
}

export function AddColumnDropdown({
  category,
  existingColumns,
  onAddColumn,
}: AddColumnDropdownProps) {
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customUnit, setCustomUnit] = useState("");

  const availableList =
    category === "prescription"
      ? AVAILABLE_PRESCRIPTION_COLUMNS
      : AVAILABLE_CLIENT_COLUMNS;

  const existingTypes = new Set(existingColumns.map((c) => c.type));

  // Filter out already-added types (except 'custom' which can be added multiple times)
  const filteredList = availableList.filter(
    (item) => !existingTypes.has(item.type) || item.type === "custom"
  );

  const handleAddColumn = (
    type: PrescriptionColumnType | ClientInputColumnType,
    label: string,
    unit?: string
  ) => {
    onAddColumn({
      id: generateColumnId(),
      type,
      label,
      visible: true,
      order: existingColumns.length,
      unit,
    });
  };

  const handleAddCustom = () => {
    if (!customLabel.trim()) return;
    onAddColumn({
      id: generateColumnId(),
      type: "custom",
      label: customLabel.trim(),
      customLabel: customLabel.trim(),
      visible: true,
      order: existingColumns.length,
      unit: customUnit.trim() || undefined,
    });
    setCustomLabel("");
    setCustomUnit("");
    setShowCustomDialog(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>
            Add {category === "prescription" ? "Instruction" : "Input"} Column
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {filteredList.map((col) => (
              <DropdownMenuItem
                key={col.type}
                onClick={() =>
                  col.type === "custom"
                    ? setShowCustomDialog(true)
                    : handleAddColumn(col.type, col.label, col.unit)
                }
              >
                <Plus className="h-3.5 w-3.5 mr-2" />
                {col.label}
                {col.unit && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {col.unit}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {category === "prescription" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowCustomDialog(true)}>
                <Plus className="h-3.5 w-3.5 mr-2" />
                Custom Field...
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Column</DialogTitle>
            <DialogDescription>
              Create a custom column with your own label and unit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-custom-label">Column Label *</Label>
              <Input
                id="add-custom-label"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g., Cadence, Heart Rate, Power"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-custom-unit">Unit (optional)</Label>
              <Input
                id="add-custom-unit"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="e.g., rpm, bpm, watts"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCustomDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAddCustom} disabled={!customLabel.trim()}>
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
