import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Search, Plus, X, Check } from "lucide-react";
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
import { MUSCLE_TO_EXERCISE_FILTER, getMuscleDisplay } from "@/types/muscle-builder";
import {
  useExerciseLibraryData,
  filterExercises,
  type ExerciseRow,
} from "@/hooks/useExerciseLibrary";
import { useExerciseTaxonomy } from "@/hooks/useExerciseTaxonomy";

interface ExercisePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectExercise: (exerciseId: string, section: Enums<"exercise_section">, exerciseName?: string) => void;
  coachUserId: string;
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

/** Library category tabs (faceting axis), distinct from the program section above. */
const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "mobility", label: "Mobility" },
  { value: "warmup", label: "Warmup" },
  { value: "cooldown", label: "Cooldown" },
  { value: "physio", label: "Physio" },
  { value: "sport_specific", label: "Sport-Specific" },
];

const MOBILITY_LIKE_CATEGORIES = ["mobility", "warmup", "cooldown"];

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

  // Shared data layer — one cached query for the whole library; faceting is in-memory.
  const {
    data: allRows = [],
    isLoading: rowsLoading,
    isError: rowsError,
    error: rowsErrObj,
  } = useExerciseLibraryData();
  const { data: taxonomy } = useExerciseTaxonomy();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<Enums<"exercise_section">>("main");
  const [category, setCategory] = useState<string>("strength");

  // Per-category facet selections. regionId is UI-only (drives the strength
  // Region -> Muscle cascade); it is not a stored column.
  const [regionId, setRegionId] = useState("");
  const [muscleId, setMuscleId] = useState("");
  const [subdivisionId, setSubdivisionId] = useState("");
  const [cardioMovementId, setCardioMovementId] = useState("");
  const [techniqueId, setTechniqueId] = useState("");
  const [targetRegionId, setTargetRegionId] = useState("");
  const [physioPurposeId, setPhysioPurposeId] = useState("");

  // Legacy muscle-scoped browse (when opened from a muscle slot). Independent of
  // the new category/facet axis; narrows results to the source muscle when active.
  const [muscleFilterActive, setMuscleFilterActive] = useState(true);

  // Multiselect (replacement mode): checked rows keyed by exercise id, with the
  // section + name captured at toggle time so the batch commit doesn't depend on
  // later section changes.
  const [checkedRows, setCheckedRows] = useState<
    Map<string, { section: Enums<"exercise_section">; name: string }>
  >(new Map());

  // Surface a data-load failure (RLS / network) the same way the old manual fetch did.
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
    if (open) {
      setMuscleFilterActive(true);
      setCheckedRows(new Map());
    }
  }, [open]);

  const handleCategoryChange = useCallback((next: string) => {
    setCategory(next);
    // Clear facets so a stale id from another category can't zero out results.
    setRegionId("");
    setMuscleId("");
    setSubdivisionId("");
    setCardioMovementId("");
    setTechniqueId("");
    setTargetRegionId("");
    setPhysioPurposeId("");
  }, []);

  const handleRegionChange = useCallback((v: string) => {
    setRegionId(v);
    setMuscleId("");
    setSubdivisionId("");
  }, []);

  const handleMuscleChange = useCallback((v: string) => {
    setMuscleId(v);
    setSubdivisionId("");
  }, []);

  const toggleChecked = useCallback(
    (exercise: ExerciseRow) => {
      setCheckedRows((prev) => {
        const next = new Map(prev);
        if (next.has(exercise.id)) {
          next.delete(exercise.id);
        } else {
          next.set(exercise.id, { section: selectedSection, name: exercise.name });
        }
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

  const muscleLabel = sourceMuscleId ? getMuscleDisplay(sourceMuscleId)?.label : null;
  const muscleFilterValues = sourceMuscleId ? MUSCLE_TO_EXERCISE_FILTER[sourceMuscleId] : null;
  const isMuscleMode = !!sourceMuscleId;

  // Access scoping: active rows (hook) + global-or-own (here). Belt-and-suspenders
  // with RLS so behavior is identical regardless of policy permissiveness.
  const scopedRows = useMemo(
    () => allRows.filter((r) => r.is_global || r.created_by_coach_id === coachUserId),
    [allRows, coachUserId]
  );

  const filteredExercises = useMemo(() => {
    const isStrength = category === "strength";
    const isCardio = category === "cardio";
    const isMobilityLike = MOBILITY_LIKE_CATEGORIES.includes(category);
    const isPhysio = category === "physio";

    // Everything the shared pure filter understands.
    let out = filterExercises(scopedRows, {
      category,
      search: searchQuery,
      muscleId: isStrength ? muscleId || undefined : undefined,
      subdivisionId: isStrength ? subdivisionId || undefined : undefined,
      cardioMovementId: isCardio ? cardioMovementId || undefined : undefined,
      techniqueId: isMobilityLike ? techniqueId || undefined : undefined,
      targetRegionId: isMobilityLike || isPhysio ? targetRegionId || undefined : undefined,
    });

    // filterExercises has no physio_purpose_id facet — apply it here.
    if (isPhysio && physioPurposeId) {
      out = out.filter((r) => r.physio_purpose_id === physioPurposeId);
    }

    // Legacy muscle-scoped narrowing (V2 column match first, then primary_muscle text).
    if (sourceMuscleId && muscleFilterActive) {
      out = out.filter(
        (ex) =>
          ex.muscle_group === sourceMuscleId ||
          ex.subdivision === sourceMuscleId ||
          (muscleFilterValues &&
            muscleFilterValues.some(
              (m) => m.toLowerCase() === (ex.primary_muscle || "").toLowerCase()
            ))
      );
    }

    return out;
  }, [
    scopedRows,
    category,
    searchQuery,
    muscleId,
    subdivisionId,
    cardioMovementId,
    techniqueId,
    targetRegionId,
    physioPurposeId,
    sourceMuscleId,
    muscleFilterActive,
    muscleFilterValues,
  ]);

  // Small render helper for a taxonomy facet <Select>. Options carry id + display_name.
  const taxonomySelect = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { id: string; display_name: string }[],
    disabled = false
  ) => (
    <div key={key} className={isMobile ? "space-y-1" : "space-y-1 flex-1 min-w-[150px]"}>
      <Label className="text-xs">{label}</Label>
      <Select
        value={value || "__all__"}
        onValueChange={(v) => onChange(v === "__all__" ? "" : v)}
        disabled={disabled}
      >
        <SelectTrigger className={isMobile ? "h-11 text-base" : "h-9"}>
          <SelectValue placeholder={`All ${label}s`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{`All ${label}s`}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const facets = !taxonomy ? null : (
    <div className={isMobile ? "space-y-2" : "flex flex-wrap gap-3"}>
      {category === "strength" && (
        <>
          {taxonomySelect("region", "Region", regionId, handleRegionChange, taxonomy.regions)}
          {taxonomySelect(
            "muscle",
            "Muscle",
            muscleId,
            handleMuscleChange,
            regionId ? taxonomy.musclesByRegion.get(regionId) ?? [] : [],
            !regionId
          )}
          {taxonomySelect(
            "subdivision",
            "Subdivision",
            subdivisionId,
            setSubdivisionId,
            muscleId ? taxonomy.subdivisionsByMuscle.get(muscleId) ?? [] : [],
            !muscleId
          )}
        </>
      )}

      {category === "cardio" &&
        taxonomySelect(
          "cardio",
          "Cardio Movement",
          cardioMovementId,
          setCardioMovementId,
          taxonomy.cardioMovements
        )}

      {MOBILITY_LIKE_CATEGORIES.includes(category) && (
        <>
          {taxonomySelect("technique", "Technique", techniqueId, setTechniqueId, taxonomy.techniques)}
          {taxonomySelect(
            "target",
            "Target Region",
            targetRegionId,
            setTargetRegionId,
            taxonomy.targetRegions
          )}
        </>
      )}

      {category === "physio" && (
        <>
          {taxonomySelect(
            "purpose",
            "Physio Purpose",
            physioPurposeId,
            setPhysioPurposeId,
            taxonomy.physioPurposes
          )}
          {taxonomySelect(
            "target",
            "Target Region",
            targetRegionId,
            setTargetRegionId,
            taxonomy.targetRegions
          )}
        </>
      )}
      {/* sport_specific: search only, no facets */}
    </div>
  );

  const body = (
    <div className="space-y-4">
      {/* Muscle filter banner */}
      {isMuscleMode && muscleFilterActive && muscleLabel && (
        <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-sm">
            Showing exercises for <strong>{muscleLabel}</strong>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMuscleFilterActive(false)}
          >
            Show All
            <X className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}

      {isMuscleMode && !muscleFilterActive && muscleLabel && (
        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-sm text-muted-foreground">Showing all exercises</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMuscleFilterActive(true)}
          >
            Filter to {muscleLabel}
          </Button>
        </div>
      )}

      {/* Section selector */}
      <div className="space-y-2">
        <Label>Add to Section</Label>
        <Select
          value={selectedSection}
          onValueChange={(v) => setSelectedSection(v as Enums<"exercise_section">)}
        >
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

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        {CATEGORY_TABS.map((t) => (
          <Button
            key={t.value}
            type="button"
            size="sm"
            variant={category === t.value ? "default" : "outline"}
            className={`whitespace-nowrap text-xs ${isMobile ? "h-10" : "h-8"}`}
            onClick={() => handleCategoryChange(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {/* Search + per-category facets */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`pl-10 ${isMobile ? "h-11 text-base" : ""}`}
          />
        </div>
        {facets}
      </div>
    </div>
  );

  // Both mobile and desktop bound the list to the available flex space and let
  // only the results region scroll -- a fixed desktop height overflowed
  // max-h-[80vh] on laptop viewports and pushed the footer out of bounds.
  const listHeightClass = "flex-1 min-h-0";

  const listArea = (
    <DrawerScrollArea className={`${listHeightClass} border rounded-md`}>
      {rowsLoading ? (
        <div className="flex items-center justify-center h-40">
          <span className="text-muted-foreground">Loading exercises...</span>
        </div>
      ) : filteredExercises.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <span className="text-muted-foreground">
            {searchQuery ? `No exercises found matching "${searchQuery}"` : "No exercises found"}
          </span>
        </div>
      ) : (
        <div className="divide-y">
          {filteredExercises.map((exercise) => {
            const isChecked = checkedRows.has(exercise.id);
            const activate = () =>
              multiSelect
                ? toggleChecked(exercise)
                : onSelectExercise(exercise.id, selectedSection, exercise.name);
            return (
              <div
                key={exercise.id}
                role={multiSelect ? "checkbox" : "button"}
                aria-checked={multiSelect ? isChecked : undefined}
                tabIndex={0}
                className={`flex items-center gap-3 ${isMobile ? "p-4 min-h-[56px]" : "p-3"} hover:bg-muted/50 active:bg-muted cursor-pointer transition-colors touch-manipulation ${
                  isChecked ? "bg-primary/5" : ""
                }`}
                onClick={activate}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activate();
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className={`font-medium ${isMobile ? "text-base" : "text-sm"}`}>{exercise.name}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-xs capitalize">
                      {exercise.category}
                    </Badge>
                    {exercise.primary_muscle && (
                      <span className="text-xs text-muted-foreground capitalize">
                        {exercise.primary_muscle}
                      </span>
                    )}
                    {exercise.equipment && (
                      <span className="text-xs text-muted-foreground">• {exercise.equipment}</span>
                    )}
                  </div>
                </div>
                {!exercise.is_global && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    Custom
                  </Badge>
                )}
                {multiSelect ? (
                  <div
                    className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isChecked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-input"
                    }`}
                  >
                    {isChecked && <Check className="h-3.5 w-3.5" />}
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0">
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
              {multiSelect
                ? "Tick exercises, then add them all at once."
                : "Select an exercise from the library."}
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

        {/* Bounded flex column: filters stay pinned, only the results list scrolls
            (mirrors the mobile drawer structure). */}
        <div className="flex flex-col flex-1 min-h-0 gap-4 overflow-hidden">
          {body}
          {listArea}
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  );
}
