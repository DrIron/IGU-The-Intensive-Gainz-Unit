import { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { Dumbbell, Youtube, ChevronDown, ChevronUp, Shuffle } from "lucide-react";
import { useExerciseLibraryData, filterExercises, type ExerciseRow } from "@/hooks/useExerciseLibrary";
import { useExerciseTaxonomy } from "@/hooks/useExerciseTaxonomy";
import { SwapExerciseDialog } from "@/components/coach/programs/SwapExerciseDialog";

/** Library category tabs (faceting axis). Mirrors the coach picker. */
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

/**
 * Exercises tab of the unified Learn area. Ported from the old WorkoutLibrary
 * page; the search box is now owned by the Learn shell and passed in via
 * `search` so it's shared across tabs. Category + taxonomy facets stay local.
 */
export function ExercisesTab({ search }: { search: string }) {
  // CC10 SPLIT: previously only { data, isLoading } was destructured, so a query
  // error yielded rows=[] and rendered the EMPTY state — telling the client the
  // library is empty when we simply failed to read it. Empty != error.
  const { data: rows = [], isLoading: rowsLoading, isError, refetch } = useExerciseLibraryData();
  const { data: taxonomy } = useExerciseTaxonomy();

  const [category, setCategory] = useState<string>("strength");

  // Per-category facets. regionId is UI-only (drives the strength cascade).
  const [regionId, setRegionId] = useState("");
  const [muscleId, setMuscleId] = useState("");
  const [subdivisionId, setSubdivisionId] = useState("");
  const [cardioMovementId, setCardioMovementId] = useState("");
  const [techniqueId, setTechniqueId] = useState("");
  const [targetRegionId, setTargetRegionId] = useState("");
  const [physioPurposeId, setPhysioPurposeId] = useState("");

  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [similarTarget, setSimilarTarget] = useState<{ id: string; name: string } | null>(null);

  const handleCategoryChange = useCallback((next: string) => {
    setCategory(next);
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

  const clearFacets = useCallback(() => {
    handleCategoryChange(category); // resets facets, keeps current tab
  }, [category, handleCategoryChange]);

  const filteredExercises = useMemo(() => {
    const isStrength = category === "strength";
    const isCardio = category === "cardio";
    const isMobilityLike = MOBILITY_LIKE_CATEGORIES.includes(category);
    const isPhysio = category === "physio";

    return filterExercises(rows, {
      category,
      search,
      muscleId: isStrength ? muscleId || undefined : undefined,
      subdivisionId: isStrength ? subdivisionId || undefined : undefined,
      cardioMovementId: isCardio ? cardioMovementId || undefined : undefined,
      techniqueId: isMobilityLike ? techniqueId || undefined : undefined,
      targetRegionId: isMobilityLike || isPhysio ? targetRegionId || undefined : undefined,
      physioPurposeId: isPhysio ? physioPurposeId || undefined : undefined,
    });
  }, [rows, category, search, muscleId, subdivisionId, cardioMovementId, techniqueId, targetRegionId, physioPurposeId]);

  const facetsActive =
    !!muscleId || !!subdivisionId || !!cardioMovementId || !!techniqueId || !!targetRegionId || !!physioPurposeId;

  const toggleCardExpansion = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const taxonomySelect = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { id: string; display_name: string }[],
    disabled = false,
  ) => (
    <div key={key} className="space-y-1 min-w-[170px]">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)} disabled={disabled}>
        <SelectTrigger className="h-9">
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
    <div className="flex flex-wrap gap-3">
      {category === "strength" && (
        <>
          {taxonomySelect("region", "Region", regionId, handleRegionChange, taxonomy.regions)}
          {taxonomySelect("muscle", "Muscle", muscleId, handleMuscleChange, regionId ? taxonomy.musclesByRegion.get(regionId) ?? [] : [], !regionId)}
          {taxonomySelect("subdivision", "Subdivision", subdivisionId, setSubdivisionId, muscleId ? taxonomy.subdivisionsByMuscle.get(muscleId) ?? [] : [], !muscleId)}
        </>
      )}

      {category === "cardio" && taxonomySelect("cardio", "Cardio Movement", cardioMovementId, setCardioMovementId, taxonomy.cardioMovements)}

      {MOBILITY_LIKE_CATEGORIES.includes(category) && (
        <>
          {taxonomySelect("technique", "Technique", techniqueId, setTechniqueId, taxonomy.techniques)}
          {taxonomySelect("target", "Target Region", targetRegionId, setTargetRegionId, taxonomy.targetRegions)}
        </>
      )}

      {category === "physio" && (
        <>
          {taxonomySelect("purpose", "Physio Purpose", physioPurposeId, setPhysioPurposeId, taxonomy.physioPurposes)}
          {taxonomySelect("target", "Target Region", targetRegionId, setTargetRegionId, taxonomy.targetRegions)}
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CATEGORY_TABS.map((t) => (
          <Button
            key={t.value}
            type="button"
            variant={category === t.value ? "default" : "outline"}
            size="sm"
            className="whitespace-nowrap"
            onClick={() => handleCategoryChange(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {/* Facets */}
      <div className="space-y-3">
        {facets}
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Showing {filteredExercises.length} exercise{filteredExercises.length === 1 ? "" : "s"}
          </p>
          {facetsActive && (
            <Button variant="ghost" size="sm" onClick={clearFacets} className="whitespace-nowrap">
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {rowsLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <LoadError
          message="We couldn't load the exercise library. Check your connection and try again."
          onRetry={() => { void refetch(); }}
        />
      ) : filteredExercises.length === 0 ? (
        // CC8: this hand-rolled block duplicated EmptyState exactly (icon + title +
        // description). Use the primitive. Empty-search guard per CLAUDE.md.
        <EmptyState
          icon={Dumbbell}
          title={search ? `No exercises matching "${search}"` : "No exercises found"}
          description={
            search || facetsActive
              ? "Try adjusting your search or filters."
              : "No exercises in this category yet."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredExercises.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              expanded={expandedCards.has(exercise.id)}
              onToggle={() => toggleCardExpansion(exercise.id)}
              onFindSimilar={() => setSimilarTarget({ id: exercise.id, name: exercise.name })}
            />
          ))}
        </div>
      )}

      <SwapExerciseDialog
        open={!!similarTarget}
        onOpenChange={(o) => {
          if (!o) setSimilarTarget(null);
        }}
        exerciseId={similarTarget?.id ?? null}
        exerciseName={similarTarget?.name}
        viewOnly
      />
    </div>
  );
}

interface ExerciseCardProps {
  exercise: ExerciseRow;
  expanded: boolean;
  onToggle: () => void;
  onFindSimilar: () => void;
}

function ExerciseCard({ exercise, expanded, onToggle, onFindSimilar }: ExerciseCardProps) {
  const muscles = [exercise.primary_muscle, ...(exercise.secondary_muscles ?? [])].filter(Boolean) as string[];
  const setupPoints = exercise.setup_points ?? [];
  const hasDetails = setupPoints.length > 0 || !!exercise.setup_instructions || !!exercise.description;

  return (
    <Card className="overflow-hidden flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{exercise.name}</CardTitle>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="secondary" className="text-xs capitalize">
            {exercise.category}
          </Badge>
          {Array.from(new Set(muscles)).map((mg) => (
            <Badge key={mg} variant="outline" className="text-xs capitalize">
              {mg}
            </Badge>
          ))}
          {exercise.equipment && (
            <Badge variant="outline" className="text-xs">
              {exercise.equipment}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 mt-auto">
        {exercise.default_video_url && (
          <Button variant="outline" className="w-full" onClick={() => window.open(exercise.default_video_url!, "_blank")}>
            <Youtube className="h-4 w-4 mr-2 text-red-500" />
            Watch Video
          </Button>
        )}

        <Button variant="ghost" className="w-full justify-between" onClick={onFindSimilar}>
          <span className="flex items-center">
            <Shuffle className="h-4 w-4 mr-2" />
            Find similar
          </span>
        </Button>

        {hasDetails && (
          <>
            <Button variant="ghost" className="w-full justify-between" onClick={onToggle}>
              <span>Instructions</span>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {expanded && (
              <div className="space-y-4 text-sm">
                {setupPoints.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Setup</h4>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      {setupPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {!setupPoints.length && exercise.setup_instructions && (
                  <div>
                    <h4 className="font-semibold mb-2">Setup</h4>
                    <p className="text-muted-foreground whitespace-pre-line">{exercise.setup_instructions}</p>
                  </div>
                )}

                {exercise.description && (
                  <div>
                    <h4 className="font-semibold mb-2">Execution</h4>
                    <p className="text-muted-foreground whitespace-pre-line">{exercise.description}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
