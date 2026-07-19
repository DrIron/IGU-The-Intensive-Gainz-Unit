import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Search, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerScrollArea,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Enums } from "@/integrations/supabase/types";
import { resolveParentMuscleId } from "@/types/muscle-builder";
import { useExerciseLibraryData, type ExerciseRow } from "@/hooks/useExerciseLibrary";
import { useExerciseTaxonomy } from "@/hooks/useExerciseTaxonomy";
import { ExerciseBrowse } from "@/components/exercise/ExerciseBrowse";

interface ExercisePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectExercise: (exerciseId: string, section: Enums<"exercise_section">, exerciseName?: string) => void;
  coachUserId: string;
  /** Muscle-builder muscle id (from a program slot). Deep-links the browse to that muscle. */
  sourceMuscleId?: string | null;
  /**
   * When true, the picker becomes a checkbox multiselect with batch commit
   * (used for replacement-exercise selection). Rows toggle instead of
   * firing+closing; a sticky footer commits all checked rows at once via
   * `onSelectMany`. Default false → single-select tap-to-select-and-close.
   */
  multiSelect?: boolean;
  onSelectMany?: (
    picks: { exerciseId: string; section: Enums<"exercise_section">; exerciseName: string }[]
  ) => void;
}

/** Program section the picked exercise is added to (warmup/main/accessory/cooldown). */
const SECTIONS: { value: Enums<"exercise_section">; label: string }[] = [
  { value: "warmup", label: "Warm-up" },
  { value: "main", label: "Main Work" },
  { value: "accessory", label: "Accessory" },
  { value: "cooldown", label: "Cool-down" },
];

export function ExercisePickerDialog({
  open,
  onOpenChange,
  onSelectExercise,
  coachUserId,
  sourceMuscleId,
  multiSelect = false,
  onSelectMany,
}: ExercisePickerDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();

  // Shared data layer — one cached query for the whole library; the browse facets in-memory.
  const {
    data: allRows = [],
    isLoading: rowsLoading,
    isError: rowsError,
    error: rowsErrObj,
  } = useExerciseLibraryData();
  const { data: taxonomy } = useExerciseTaxonomy();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<Enums<"exercise_section">>("main");

  // Multiselect (replacement mode): checked rows keyed by exercise id, with the section + DENSE
  // name captured at toggle time so the batch commit doesn't depend on later section changes.
  const [checkedRows, setCheckedRows] = useState<
    Map<string, { section: Enums<"exercise_section">; name: string }>
  >(new Map());

  // Surface a data-load failure (RLS / network) the way the old picker did (browse also shows it inline).
  useEffect(() => {
    if (rowsError) {
      toast({
        title: "Error loading exercises",
        description: sanitizeErrorForUser(rowsErrObj),
        variant: "destructive",
      });
    }
  }, [rowsError, rowsErrObj, toast]);

  // Reset transient state each time the picker opens (matches prior behavior).
  useEffect(() => {
    if (open) setCheckedRows(new Map());
  }, [open]);

  // Access scoping: active rows (hook) + global-or-own (here). Belt-and-suspenders with RLS so
  // behavior is identical regardless of policy permissiveness.
  const scopedRows = useMemo(
    () => allRows.filter((r) => r.is_global || r.created_by_coach_id === coachUserId),
    [allRows, coachUserId]
  );

  // Translate the muscle-builder `sourceMuscleId` → a taxonomy `muscles.id` for the browse deep-link.
  // The taxonomy muscle's `volume_key` is the muscle-builder id; a subdivision resolves to its parent.
  // Where two taxonomy muscles share a key (legacy + rebuilt), pick the one with the most active rows.
  const sourceTaxonomyMuscleId = useMemo(() => {
    if (!sourceMuscleId || !taxonomy) return undefined;
    const parent = resolveParentMuscleId(sourceMuscleId);
    const candidates = taxonomy.muscles.filter(
      (m) => m.volume_key === parent || m.volume_key === sourceMuscleId || m.slug === parent || m.slug === sourceMuscleId,
    );
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0].id;
    const countByMuscle = new Map<string, number>();
    for (const r of scopedRows) if (r.muscle_id) countByMuscle.set(r.muscle_id, (countByMuscle.get(r.muscle_id) ?? 0) + 1);
    return candidates.slice().sort((a, b) => (countByMuscle.get(b.id) ?? 0) - (countByMuscle.get(a.id) ?? 0))[0].id;
  }, [sourceMuscleId, taxonomy, scopedRows]);

  const toggleChecked = useCallback(
    (exercise: ExerciseRow) => {
      setCheckedRows((prev) => {
        const next = new Map(prev);
        if (next.has(exercise.id)) next.delete(exercise.id);
        else next.set(exercise.id, { section: selectedSection, name: exercise.name });
        return next;
      });
    },
    [selectedSection]
  );

  const handleCommitMany = useCallback(() => {
    if (checkedRows.size === 0) return;
    const picks = Array.from(checkedRows.entries()).map(([exerciseId, v]) => ({
      exerciseId,
      section: v.section,
      exerciseName: v.name,
    }));
    onSelectMany?.(picks);
    onOpenChange(false);
  }, [checkedRows, onSelectMany, onOpenChange]);

  const checkedIds = useMemo(() => new Set(checkedRows.keys()), [checkedRows]);

  const body = (
    <div className="space-y-4">
      {/* Section selector */}
      <div className="space-y-2">
        <Label>Add to Section</Label>
        <Select value={selectedSection} onValueChange={(v) => setSelectedSection(v as Enums<"exercise_section">)}>
          <SelectTrigger className={isMobile ? "h-11 text-base" : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map((section) => (
              <SelectItem key={section.value} value={section.value}>
                {section.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`pl-10 ${isMobile ? "h-11 text-base" : ""}`}
        />
      </div>
    </div>
  );

  const listArea = (
    <DrawerScrollArea className="flex-1 min-h-0 rounded-md border p-3">
      <ExerciseBrowse
        mode="picker"
        audience="coach"
        rows={scopedRows}
        search={searchQuery}
        loading={rowsLoading}
        error={rowsError}
        sourceMuscleId={sourceTaxonomyMuscleId}
        onSelect={(ex) => onSelectExercise(ex.id, selectedSection, ex.name)}
        multiSelect={multiSelect}
        selectedIds={checkedIds}
        onToggle={toggleChecked}
        renderRowBadge={(r) =>
          !r.is_global ? (
            <Badge variant="secondary" className="shrink-0 text-xs">
              Custom
            </Badge>
          ) : null
        }
      />
    </DrawerScrollArea>
  );

  const footer = multiSelect ? (
    <div className="pt-1">
      <Button className="w-full" disabled={checkedRows.size === 0} onClick={handleCommitMany}>
        <Plus className="h-4 w-4 mr-1" />
        Add {checkedRows.size} replacement{checkedRows.size === 1 ? "" : "s"}
      </Button>
    </div>
  ) : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left px-4 pt-4 pb-2">
            <DrawerTitle>{multiSelect ? "Add Replacements" : "Add Exercise"}</DrawerTitle>
            <DrawerDescription>
              {multiSelect ? "Tick exercises, then add them all at once." : "Select an exercise from the library."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col flex-1 min-h-0 px-4 pb-[calc(env(safe-area-inset-bottom,0)+1rem)] gap-4 overflow-hidden">
            {body}
            {listArea}
            {footer}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{multiSelect ? "Add Replacements" : "Add Exercise"}</DialogTitle>
          <DialogDescription>
            {multiSelect
              ? "Tick exercises, then add them all at once."
              : "Select an exercise from the library to add to this module."}
          </DialogDescription>
        </DialogHeader>

        {/* Bounded flex column: section + search stay pinned, the browse list scrolls. */}
        <div className="flex flex-col flex-1 min-h-0 gap-4 overflow-hidden">
          {body}
          {listArea}
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  );
}
