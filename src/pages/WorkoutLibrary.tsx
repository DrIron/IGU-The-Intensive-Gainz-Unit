import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dumbbell, Search, Youtube, ChevronDown, ChevronUp, AlertCircle, Shuffle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useClientAccess, getAccessDeniedMessage } from "@/hooks/useClientAccess";
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

export default function WorkoutLibrary() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const access = useClientAccess();
  const hasRedirected = useRef(false);

  const { data: rows = [], isLoading: rowsLoading } = useExerciseLibraryData();
  const { data: taxonomy } = useExerciseTaxonomy();

  const [searchTerm, setSearchTerm] = useState("");
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

  // Access control — gate is staff OR active subscription (read-only browse).
  useEffect(() => {
    if (access.loading || hasRedirected.current) return;
    const canAccess = access.isStaff || access.hasActiveSubscription;
    if (!canAccess) {
      hasRedirected.current = true;
      toast({
        variant: "destructive",
        title: "Access not available",
        description: getAccessDeniedMessage(access),
      });
      navigate("/dashboard");
    }
  }, [access, navigate, toast]);

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

  const clearAllFilters = useCallback(() => {
    setSearchTerm("");
    handleCategoryChange(category); // resets facets, keeps current tab
  }, [category, handleCategoryChange]);

  const filteredExercises = useMemo(() => {
    const isStrength = category === "strength";
    const isCardio = category === "cardio";
    const isMobilityLike = MOBILITY_LIKE_CATEGORIES.includes(category);
    const isPhysio = category === "physio";

    return filterExercises(rows, {
      category,
      search: searchTerm,
      muscleId: isStrength ? muscleId || undefined : undefined,
      subdivisionId: isStrength ? subdivisionId || undefined : undefined,
      cardioMovementId: isCardio ? cardioMovementId || undefined : undefined,
      techniqueId: isMobilityLike ? techniqueId || undefined : undefined,
      targetRegionId: isMobilityLike || isPhysio ? targetRegionId || undefined : undefined,
      physioPurposeId: isPhysio ? physioPurposeId || undefined : undefined,
    });
  }, [
    rows,
    category,
    searchTerm,
    muscleId,
    subdivisionId,
    cardioMovementId,
    techniqueId,
    targetRegionId,
    physioPurposeId,
  ]);

  const facetsActive =
    !!muscleId ||
    !!subdivisionId ||
    !!cardioMovementId ||
    !!techniqueId ||
    !!targetRegionId ||
    !!physioPurposeId;

  const toggleCardExpansion = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Taxonomy facet <Select> helper.
  const taxonomySelect = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { id: string; display_name: string }[],
    disabled = false
  ) => (
    <div key={key} className="space-y-1 min-w-[170px]">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={value || "__all__"}
        onValueChange={(v) => onChange(v === "__all__" ? "" : v)}
        disabled={disabled}
      >
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
          {taxonomySelect("target", "Target Region", targetRegionId, setTargetRegionId, taxonomy.targetRegions)}
        </>
      )}

      {category === "physio" && (
        <>
          {taxonomySelect("purpose", "Physio Purpose", physioPurposeId, setPhysioPurposeId, taxonomy.physioPurposes)}
          {taxonomySelect("target", "Target Region", targetRegionId, setTargetRegionId, taxonomy.targetRegions)}
        </>
      )}
      {/* sport_specific: search only */}
    </div>
  );

  // ---- Page chrome / states ----------------------------------------------

  if (access.loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 pt-24 pb-12 max-w-7xl">
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  if (access.error) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 pt-24 pb-12 max-w-7xl">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-muted-foreground">Unable to load your access information. Please refresh the page.</p>
            <Button onClick={() => window.location.reload()} className="mt-4">
              Refresh Page
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="container mx-auto px-4 pt-24 pb-24 md:pb-12 max-w-7xl">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-gradient-to-r from-primary to-accent">
              <Dumbbell className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Exercise Library</h1>
          <p className="text-xl text-muted-foreground">
            Browse exercises with detailed instructions and video guides
          </p>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {CATEGORY_TABS.map((t) => (
            <Button
              key={t.value}
              type="button"
              variant={category === t.value ? "default" : "outline"}
              className="whitespace-nowrap"
              onClick={() => handleCategoryChange(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {/* Search + facets */}
        <div className="mb-6 space-y-4">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search exercises..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {(searchTerm || facetsActive) && (
              <Button variant="outline" onClick={clearAllFilters} className="whitespace-nowrap">
                Clear Filters
              </Button>
            )}
          </div>
          {facets}
        </div>

        <div className="mb-6 text-sm text-muted-foreground">
          Showing {filteredExercises.length} exercise{filteredExercises.length === 1 ? "" : "s"}
        </div>

        {rowsLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading exercises...</div>
        ) : filteredExercises.length === 0 ? (
          <div className="text-center py-12">
            <Dumbbell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No exercises found</h3>
            <p className="text-muted-foreground">
              {searchTerm || facetsActive
                ? "Try adjusting your search or filters"
                : "No exercises in this category yet"}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
      </main>

      {/* Read-only "Find similar" dialog (clients view alternatives, no editing) */}
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

// ---------------------------------------------------------------------------
// Read-only exercise card
// ---------------------------------------------------------------------------

interface ExerciseCardProps {
  exercise: ExerciseRow;
  expanded: boolean;
  onToggle: () => void;
  onFindSimilar: () => void;
}

function ExerciseCard({ exercise, expanded, onToggle, onFindSimilar }: ExerciseCardProps) {
  const muscles = [exercise.primary_muscle, ...(exercise.secondary_muscles ?? [])].filter(Boolean) as string[];
  const setupPoints = exercise.setup_points ?? [];
  const hasDetails =
    setupPoints.length > 0 || !!exercise.setup_instructions || !!exercise.description;

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
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.open(exercise.default_video_url!, "_blank")}
          >
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
