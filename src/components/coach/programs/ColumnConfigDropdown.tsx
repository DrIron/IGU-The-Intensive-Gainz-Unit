// src/components/coach/programs/ColumnConfigDropdown.tsx
// Dropdown for configuring exercise prescription columns

import { useState, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, Plus, X, GripVertical, Settings2, Save, Trash2 } from "lucide-react";
import {
  ColumnConfig,
  PrescriptionColumnType,
  AVAILABLE_PRESCRIPTION_COLUMNS,
  generateColumnId,
} from "@/types/workout-builder";

interface ColumnConfigDropdownProps {
  columns: ColumnConfig[];
  onColumnsChange: (columns: ColumnConfig[]) => void;
  onSavePreset?: (name: string, columns: ColumnConfig[]) => void;
  presets?: { id: string; name: string; column_config: ColumnConfig[] }[];
  onLoadPreset?: (presetId: string) => void;
}

export const ColumnConfigDropdown = memo(function ColumnConfigDropdown({
  columns,
  onColumnsChange,
  onSavePreset,
  presets = [],
  onLoadPreset,
}: ColumnConfigDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customUnit, setCustomUnit] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);
  const hiddenColumns = useMemo(() => columns.filter((c) => !c.visible), [columns]);

  // Get available columns that aren't already added
  const availableToAdd = useMemo(
    () =>
      AVAILABLE_PRESCRIPTION_COLUMNS.filter(
        (available) => !columns.some((c) => c.type === available.type && c.type !== 'custom')
      ),
    [columns]
  );

  const addColumn = (type: PrescriptionColumnType, label: string, unit?: string) => {
    const newColumn: ColumnConfig = {
      id: generateColumnId(),
      type,
      label,
      visible: true,
      order: columns.length,
      unit,
    };
    onColumnsChange([...columns, newColumn]);
  };

  const addCustomColumn = () => {
    if (!customLabel.trim()) return;

    const newColumn: ColumnConfig = {
      id: generateColumnId(),
      type: 'custom',
      label: customLabel.trim(),
      customLabel: customLabel.trim(),
      visible: true,
      order: columns.length,
      unit: customUnit.trim() || undefined,
    };
    onColumnsChange([...columns, newColumn]);
    setCustomLabel("");
    setCustomUnit("");
    setShowCustomDialog(false);
  };

  const toggleColumn = (columnId: string) => {
    onColumnsChange(
      columns.map((c) =>
        c.id === columnId ? { ...c, visible: !c.visible } : c
      )
    );
  };

  const removeColumn = (columnId: string) => {
    onColumnsChange(columns.filter((c) => c.id !== columnId));
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newColumns = [...columns];
    const [draggedColumn] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(index, 0, draggedColumn);

    // Update order values
    const reorderedColumns = newColumns.map((col, i) => ({ ...col, order: i }));
    onColumnsChange(reorderedColumns);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSavePreset = () => {
    if (!presetName.trim() || !onSavePreset) return;
    onSavePreset(presetName.trim(), columns);
    setPresetName("");
    setShowSaveDialog(false);
  };

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Settings2 className="h-4 w-4" />
            Columns
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {visibleColumns.length}
            </Badge>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80" align="end">
          {/* Active Columns */}
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Active Columns</span>
            <span className="text-xs text-muted-foreground font-normal">
              Drag to reorder
            </span>
          </DropdownMenuLabel>
          <div className="px-2 py-1 space-y-1 max-h-48 overflow-y-auto">
            {visibleColumns
              .sort((a, b) => a.order - b.order)
              .map((column, index) => (
                <div
                  key={column.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 cursor-move group ${
                    draggedIndex === index ? "opacity-50" : ""
                  }`}
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                  <span className="flex-1 text-sm">{column.label}</span>
                  {column.unit && (
                    <span className="text-xs text-muted-foreground">
                      ({column.unit})
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleColumn(column.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            {visibleColumns.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No columns visible
              </p>
            )}
          </div>

          <DropdownMenuSeparator />

          {/* Hidden Columns */}
          {hiddenColumns.length > 0 && (
            <>
              <DropdownMenuLabel>Hidden Columns</DropdownMenuLabel>
              <DropdownMenuGroup>
                {hiddenColumns.map((column) => (
                  <DropdownMenuItem
                    key={column.id}
                    onClick={() => toggleColumn(column.id)}
                    className="flex items-center justify-between"
                  >
                    <span>{column.label}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeColumn(column.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Add New Column */}
          <DropdownMenuLabel>Add Column</DropdownMenuLabel>
          <DropdownMenuGroup>
            {availableToAdd.slice(0, 5).map((col) => (
              <DropdownMenuItem
                key={col.type}
                onClick={() => addColumn(col.type, col.label, col.unit)}
              >
                <Plus className="h-4 w-4 mr-2" />
                {col.label}
              </DropdownMenuItem>
            ))}
            {availableToAdd.length > 5 && (
              <DropdownMenuItem disabled className="text-muted-foreground">
                +{availableToAdd.length - 5} more options
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setShowCustomDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Custom Field...
            </DropdownMenuItem>
          </DropdownMenuGroup>

          {/* Presets */}
          {(presets.length > 0 || onSavePreset) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Presets</DropdownMenuLabel>
              <DropdownMenuGroup>
                {presets.map((preset) => (
                  <DropdownMenuItem
                    key={preset.id}
                    onClick={() => onLoadPreset?.(preset.id)}
                  >
                    {preset.name}
                  </DropdownMenuItem>
                ))}
                {onSavePreset && (
                  <DropdownMenuItem onClick={() => setShowSaveDialog(true)}>
                    <Save className="h-4 w-4 mr-2" />
                    Save as Preset...
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save Preset Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Column Preset</DialogTitle>
            <DialogDescription>
              Save this column configuration as a preset to quickly apply it to
              other exercises.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="preset-name">Preset Name</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g., Strength Training Default"
              />
            </div>
            <div className="space-y-2">
              <Label>Columns to Save</Label>
              <div className="flex flex-wrap gap-1">
                {visibleColumns.map((col) => (
                  <Badge key={col.id} variant="secondary">
                    {col.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Column Dialog */}
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
              <Label htmlFor="custom-label">Column Label *</Label>
              <Input
                id="custom-label"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g., Cadence, Heart Rate, Power"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-unit">Unit (optional)</Label>
              <Input
                id="custom-unit"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="e.g., rpm, bpm, watts"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addCustomColumn} disabled={!customLabel.trim()}>
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

export default ColumnConfigDropdown;
