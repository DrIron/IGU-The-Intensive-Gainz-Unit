import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tables, Enums } from "@/integrations/supabase/types";
import { MUSCLE_TO_EXERCISE_FILTER, getMuscleDisplay } from "@/types/muscle-builder";

type Exercise = Tables<"exercise_library">;

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
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<Enums<"exercise_section">>("main");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [muscleFilterActive, setMuscleFilterActive] = useState(true);
  // Multiselect (replacement mode): checked rows keyed by exercise id, with the
  // section + name captured at toggle time so the batch commit doesn't depend on
  // later section changes.
  const [checkedRows, setCheckedRows] = useState<
    Map<string, { section: Enums<"exercise_section">; name: string }>
  >(new Map());
  const hasFetchedExercises = useRef(false);
  const { toast } = useToast();

  const toggleChecked = useCallback(
    (exercise: Exercise) => {
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

  const loadExercises = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("exercise_library")
        .select("*")
        .eq("is_active", true)
        .or(`is_global.eq.true,created_by_coach_id.eq.${coachUserId}`)
        .order("name");

      if (error) throw error;
      setExercises(data || []);
    } catch (error: unknown) {
      toast({
        title: "Error loading exercises",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  useEffect(() => {
    if (open) {
      setMuscleFilterActive(true);
      setCheckedRows(new Map());
      if (hasFetchedExercises.current) return;
      hasFetchedExercises.current = true;
      loadExercises();
    }
  }, [open, loadExercises]);

  const filteredExercises = useMemo(() => exercises.filter((exercise) => {
    const matchesSearch =
      searchQuery === "" ||
      exercise.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exercise.primary_muscle || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exercise.equipment || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || exercise.category === selectedCategory;

    // Dual-filter: try muscle_group/subdivision column match first (V2 exercises),
    // then fall back to text-based primary_muscle matching (legacy exercises)
    const matchesMuscle =
      !muscleFilterActive || !sourceMuscleId || (
        // V2: direct match on muscle_group or subdivision column
        (exercise as any).muscle_group === sourceMuscleId ||
        (exercise as any).subdivision === sourceMuscleId ||
        // Legacy: text-based primary_muscle matching
        (muscleFilterValues && muscleFilterValues.some(m => m.toLowerCase() === (exercise.primary_muscle || "").toLowerCase()))
      );

    return matchesSearch && matchesCategory && matchesMuscle;
  }), [exercises, searchQuery, selectedCategory, muscleFilterActive, muscleFilterValues]);

  const categories = Array.from(new Set(exercises.map((e) => e.category))).filter(Boolean);

  const isMuscleMode = !!sourceMuscleId;

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
          <span className="text-sm text-muted-foreground">
            Showing all exercises
          </span>
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

      {/* Filters */}
      <div className={isMobile ? "space-y-2" : "flex gap-3"}>
        <div className={isMobile ? "relative" : "relative flex-1"}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`pl-10 ${isMobile ? "h-11 text-base" : ""}`}
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className={isMobile ? "w-full h-11 text-base" : "w-40"}>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category} className="capitalize">
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const listHeightClass = isMobile ? "flex-1 min-h-0" : "h-[400px]";

  const listArea = (
    <ScrollArea className={`${listHeightClass} border rounded-md`}>
      {loading ? (
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
                    <span className="text-xs text-muted-foreground capitalize">
                      {exercise.primary_muscle}
                    </span>
                    {exercise.equipment && (
                      <span className="text-xs text-muted-foreground">
                        • {exercise.equipment}
                      </span>
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
    </ScrollArea>
  );

  const footer = multiSelect ? (
    <div className="pt-1">
      <Button
        className="w-full"
        disabled={checkedRows.size === 0}
        onClick={handleCommitMany}
      >
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
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{multiSelect ? "Add Replacements" : "Add Exercise"}</DialogTitle>
          <DialogDescription>
            {multiSelect
              ? "Tick exercises, then add them all at once."
              : "Select an exercise from the library to add to this module."}
          </DialogDescription>
        </DialogHeader>

        {body}
        {listArea}
        {footer}
      </DialogContent>
    </Dialog>
  );
}
