import { memo, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionAddPicker } from "./SessionAddPicker";
import {
  ACTIVITY_TYPE_COLORS,
  exerciseCategoryToActivityType,
  type ActivityType,
} from "@/types/muscle-builder";
import { useExerciseLibraryData, filterExercises } from "@/hooks/useExerciseLibrary";
import { useExerciseTaxonomy } from "@/hooks/useExerciseTaxonomy";

/**
 * UnifiedSessionPicker — the single "+ add to session" picker (5g).
 *
 * A session is now an unconstrained container, so this picker lets a coach add
 * from ANY category regardless of the session's focus label:
 *  - Strength tab → the existing muscle picker (region → muscle → subdivision)
 *    via the shared SessionAddPicker, which fires `onAddMuscle` → ADD_MUSCLE so
 *    useMusclePlanVolume keeps working on a real muscleId.
 *  - Every other tab → a faceted `exercise_library` browse (shared taxonomy +
 *    filterExercises). Selecting an exercise fires `onAddExercise` with the real
 *    library row + a derived ActivityType, so the slot stores a real exercise.
 *
 * Replaces the old type-scoped SessionAddPicker call site. The session's `type`
 * no longer scopes what can be added.
 */

const PICKER_CATEGORY_TABS: { value: string; label: string; activity: ActivityType }[] = [
  { value: "strength", label: "Strength", activity: "strength" },
  { value: "cardio", label: "Cardio", activity: "cardio" },
  { value: "mobility", label: "Mobility", activity: "yoga_mobility" },
  { value: "warmup", label: "Warmup", activity: "yoga_mobility" },
  { value: "cooldown", label: "Cooldown", activity: "recovery" },
  { value: "physio", label: "Physio", activity: "recovery" },
  { value: "sport_specific", label: "Sport", activity: "sport_specific" },
];

const MOBILITY_LIKE = ["mobility", "warmup", "cooldown"];

interface UnifiedSessionPickerProps {
  placementCounts?: Map<string, number>;
  recentMuscleIds?: string[];
  onAddMuscle: (muscleId: string) => void;
  onAddExercise: (exercise: { exerciseId: string; name: string }, activityType: ActivityType) => void;
  variant: "compact" | "roomy";
  autoFocusSearch?: boolean;
  /** Tab to open on first render. Defaults to "strength". */
  initialCategory?: string;
}

export const UnifiedSessionPicker = memo(function UnifiedSessionPicker({
  placementCounts,
  recentMuscleIds,
  onAddMuscle,
  onAddExercise,
  variant,
  autoFocusSearch = false,
  initialCategory = "strength",
}: UnifiedSessionPickerProps) {
  const [category, setCategory] = useState<string>(initialCategory);
  const isRoomy = variant === "roomy";

  return (
    <div className={cn("space-y-2", isRoomy && "space-y-3")}>
      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        {PICKER_CATEGORY_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setCategory(t.value)}
            className={cn(
              "whitespace-nowrap rounded-md border px-2 py-1 text-[11px] transition-colors",
              category === t.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card/50 text-muted-foreground border-border/50 hover:bg-card",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {category === "strength" ? (
        // Reuse the muscle picker for the strength tab (region/muscle/subdivision).
        <SessionAddPicker
          sessionType="strength"
          placementCounts={placementCounts}
          recentMuscleIds={recentMuscleIds}
          onAddMuscle={onAddMuscle}
          // Non-strength activities are handled by the library browse below;
          // strength never calls onAddActivity.
          onAddActivity={() => {}}
          variant={variant}
          autoFocusSearch={autoFocusSearch}
        />
      ) : (
        <LibraryBrowse
          category={category}
          isRoomy={isRoomy}
          autoFocusSearch={autoFocusSearch}
          onPick={(exerciseId, name, exCategory) =>
            onAddExercise({ exerciseId, name }, exerciseCategoryToActivityType(exCategory))
          }
        />
      )}
    </div>
  );
});

/* ─── Faceted exercise_library browse (non-strength tabs) ───────── */

function LibraryBrowse({
  category,
  isRoomy,
  autoFocusSearch,
  onPick,
}: {
  category: string;
  isRoomy: boolean;
  autoFocusSearch: boolean;
  onPick: (exerciseId: string, name: string, category: string) => void;
}) {
  const { data: rows = [], isLoading } = useExerciseLibraryData();
  const { data: taxonomy } = useExerciseTaxonomy();

  const [search, setSearch] = useState("");
  const [cardioMovementId, setCardioMovementId] = useState("");
  const [techniqueId, setTechniqueId] = useState("");
  const [targetRegionId, setTargetRegionId] = useState("");
  const [physioPurposeId, setPhysioPurposeId] = useState("");

  const isCardio = category === "cardio";
  const isMobilityLike = MOBILITY_LIKE.includes(category);
  const isPhysio = category === "physio";

  const results = useMemo(() => {
    const out = filterExercises(rows, {
      category,
      search,
      cardioMovementId: isCardio ? cardioMovementId || undefined : undefined,
      techniqueId: isMobilityLike ? techniqueId || undefined : undefined,
      targetRegionId: isMobilityLike || isPhysio ? targetRegionId || undefined : undefined,
      physioPurposeId: isPhysio ? physioPurposeId || undefined : undefined,
    });
    return out.slice(0, 60);
  }, [rows, category, search, isCardio, isMobilityLike, isPhysio, cardioMovementId, techniqueId, targetRegionId, physioPurposeId]);

  const facetSelect = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { id: string; display_name: string }[],
  ) => (
    <div key={key} className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
        <SelectTrigger className={isRoomy ? "h-9 text-sm" : "h-7 text-xs"}>
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

  return (
    <div className={cn("space-y-2", isRoomy && "space-y-3")}>
      <div className="relative">
        <Search
          className={cn(
            "absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground",
            isRoomy ? "h-4 w-4" : "h-3.5 w-3.5",
          )}
        />
        <Input
          autoFocus={autoFocusSearch}
          placeholder="Search exercises..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn("pl-8", isRoomy ? "h-10 text-base" : "h-8 text-sm")}
        />
      </div>

      {taxonomy && (
        <div className={cn("grid gap-2", isMobilityLike || isPhysio ? "grid-cols-2" : "grid-cols-1")}>
          {isCardio && facetSelect("cardio", "Movement", cardioMovementId, setCardioMovementId, taxonomy.cardioMovements)}
          {isMobilityLike && facetSelect("tech", "Technique", techniqueId, setTechniqueId, taxonomy.techniques)}
          {(isMobilityLike || isPhysio) &&
            facetSelect("target", "Target", targetRegionId, setTargetRegionId, taxonomy.targetRegions)}
          {isPhysio && facetSelect("purpose", "Purpose", physioPurposeId, setPhysioPurposeId, taxonomy.physioPurposes)}
        </div>
      )}

      <div className={cn("flex flex-col gap-0.5 max-h-60 overflow-y-auto", isRoomy && "gap-1")}>
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-2 px-1">Loading…</p>
        ) : results.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 px-1">
            {search ? `No matches for "${search}"` : "No exercises in this category"}
          </p>
        ) : (
          results.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => onPick(ex.id, ex.name, ex.category)}
              className={cn(
                "flex items-center gap-2 px-1.5 rounded hover:bg-muted/50 transition-colors text-left",
                isRoomy ? "py-2 text-sm" : "py-1 text-xs",
              )}
            >
              <div
                className={cn("rounded-full shrink-0 w-2 h-2", ACTIVITY_TYPE_COLORS[exerciseCategoryToActivityType(ex.category)].colorClass)}
              />
              <span className="flex-1 truncate">{ex.name}</span>
              {ex.equipment && (
                <span className="text-[9px] font-mono text-muted-foreground shrink-0">{ex.equipment}</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
