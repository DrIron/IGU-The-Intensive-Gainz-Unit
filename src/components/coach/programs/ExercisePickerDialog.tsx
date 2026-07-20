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
import { useSubstituteExercises } from "@/hooks/useSubstituteExercises";
import { getExerciseDisplayName } from "@/lib/exerciseDisplay";
import { tierOf, type SubstituteExercise } from "@/lib/substituteMatch";
import { ExerciseBrowse } from "@/components/exercise/ExerciseBrowse";
import { MatchChips, MatchTierBadge } from "@/components/exercise/MatchIndicators";
import { ClickableCard } from "@/components/ui/clickable-card";

interface ExercisePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectExercise: (exerciseId: string, section: Enums<"exercise_section">, exerciseName?: string) => void;
  coachUserId: string;
  /** Muscle-builder muscle id (from a program slot). Deep-links the browse to that muscle. */
  sourceMuscleId?: string | null;
  /** Library id of the slot's CURRENT exercise, when replacing/filling. When set, a ranked
   *  "Best replacements" shelf renders above the browse. Omit when adding fresh (no shelf). */
  sourceExerciseId?: string | null;
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
  sourceExerciseId,
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

  const toggleById = useCallback(
    (id: string, name: string) => {
      setCheckedRows((prev) => {
        const next = new Map(prev);
        if (next.has(id)) next.delete(id);
        else next.set(id, { section: selectedSection, name });
        return next;
      });
    },
    [selectedSection]
  );
  const toggleChecked = useCallback((exercise: ExerciseRow) => toggleById(exercise.id, exercise.name), [toggleById]);

  // "Best replacements" shelf: the weighted RPC for the slot's current exercise (only when replacing).
  const { result: subResult } = useSubstituteExercises(sourceExerciseId, open && !!sourceExerciseId);
  const shelfSubs = useMemo(() => (subResult?.substitutes ?? []).slice(0, 6), [subResult]);
  const subName = useMemo(
    () => new Map((taxonomy?.subdivisions ?? []).map((s) => [s.id, s.display_name])),
    [taxonomy]
  );

  // Shelf pick feeds the SAME path as ExerciseBrowse: toggle in multiSelect, else select-and-let-parent-close.
  const handleShelfPick = useCallback(
    (sub: SubstituteExercise) => {
      if (multiSelect) toggleById(sub.id, sub.name);
      else onSelectExercise(sub.id, selectedSection, sub.name);
    },
    [multiSelect, toggleById, onSelectExercise, selectedSection]
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

  // Ranked "Best replacements" shelf — only when replacing a slot's current exercise. Selecting from
  // it goes through the same path as an ExerciseBrowse row (toggle in multiSelect, else select).
  const shelf =
    shelfSubs.length > 0 ? (
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Best replacements</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shelfSubs.map((sub) => {
            const checked = checkedIds.has(sub.id);
            const label = getExerciseDisplayName(sub, "coach");
            return (
              <ClickableCard
                key={sub.id}
                ariaLabel={`${multiSelect ? "Select" : "Add"} ${label}`}
                onClick={() => handleShelfPick(sub)}
                className={`w-44 shrink-0 border ${checked ? "border-primary/40 bg-primary/5" : ""}`}
                {...(multiSelect ? { role: "checkbox", "aria-checked": checked } : {})}
              >
                <div className="p-2.5">
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                    <MatchTierBadge tier={tierOf(sub)} />
                  </div>
                  {sub.equipment && (
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{sub.equipment}</p>
                  )}
                  <div className="mt-1.5">
                    <MatchChips
                      dimensions={sub.matched_dimensions}
                      equipment={sub.equipment}
                      subdivisionName={sub.subdivision_id ? subName.get(sub.subdivision_id) : null}
                      max={3}
                    />
                  </div>
                </div>
              </ClickableCard>
            );
          })}
        </div>
      </div>
    ) : null;

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
            {shelf}
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
