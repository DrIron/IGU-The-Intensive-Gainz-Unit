import { memo, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionAddPicker } from "./SessionAddPicker";
import { StrengthTaxonomyBrowse } from "./StrengthTaxonomyBrowse";
import { exerciseCategoryToActivityType, MOVEMENT_GROUP_IDS, type ActivityType } from "@/types/muscle-builder";
import { useExerciseLibraryData } from "@/hooks/useExerciseLibrary";
import { useExerciseTaxonomy } from "@/hooks/useExerciseTaxonomy";
import { useMovementGroupConfig } from "@/hooks/useMovementGroupConfig";
import { EXERCISE_CATEGORIES } from "@/lib/exerciseCategories";
import { ExerciseBrowse } from "@/components/exercise/ExerciseBrowse";

/**
 * UnifiedSessionPicker — the single "+ add to session" picker (5g).
 *
 * A session is now an unconstrained container, so this picker lets a coach add
 * from ANY category regardless of the session's focus label:
 *  - Strength tab → the existing muscle picker (region → muscle → subdivision)
 *    via the shared SessionAddPicker, which fires `onAddMuscle` → ADD_MUSCLE so
 *    useMusclePlanVolume keeps working on a real muscleId.
 *  - Every other tab → the shared `ExerciseBrowse` (mode="picker") locked to the
 *    selected category, so quick-add rows are identical to /coach/exercises and the
 *    client Learn tab. Selecting a row fires `onAddExercise` with the real library
 *    row + a derived ActivityType, so the slot stores a real exercise.
 *
 * Replaces the old type-scoped SessionAddPicker call site. The session's `type`
 * no longer scopes what can be added.
 */

// Same source of truth as the library browse — no "All" tab (the picker is per-category). Strength
// routes to the muscle picker; EVERY other category (incl. powerlifting + systemic) → ExerciseBrowse
// via exerciseCategoryToActivityType.
const PICKER_CATEGORY_TABS = EXERCISE_CATEGORIES;

interface UnifiedSessionPickerProps {
  placementCounts?: Map<string, number>;
  recentMuscleIds?: string[];
  onAddMuscle: (muscleId: string) => void;
  onAddExercise: (exercise: { exerciseId: string; name: string }, activityType: ActivityType) => void;
  variant: "compact" | "roomy";
  autoFocusSearch?: boolean;
  /** Tab to open on first render. Defaults to "strength". */
  initialCategory?: string;
  /**
   * 3b (volume-first group-pick) — when true (canonical template authoring), the Powerlifting tab
   * leads with movement-group chips (Squat/Press/Hinge). Picking a group drops an UNFILLED lift-group
   * slot that counts in the movement lens immediately; the exact variation is chosen later on the
   * slot. Reuses `onAddMuscle` (the group id rides the same grouping-key field as a muscle id).
   * Off/absent → the Powerlifting tab is the plain exercise browse, byte-identical to before.
   */
  enableGroupPick?: boolean;
  /**
   * 3c — cardio group-pick. When `enableGroupPick`, the Cardio tab leads with modality chips
   * (Run/Walk/Row/…). Picking one drops an UNFILLED cardio group slot (duration 0) via
   * `onAddActivityGroup` → the modality shows in the minutes lens as a pending bucket; the exact
   * exercise + duration are filled later. Absent → the Cardio tab is the plain browse.
   */
  onAddActivityGroup?: (groupId: string, groupLabel: string, activityType: ActivityType) => void;
}

export const UnifiedSessionPicker = memo(function UnifiedSessionPicker({
  placementCounts,
  recentMuscleIds,
  onAddMuscle,
  onAddExercise,
  variant,
  autoFocusSearch = false,
  initialCategory = "strength",
  enableGroupPick = false,
  onAddActivityGroup,
}: UnifiedSessionPickerProps) {
  const [category, setCategory] = useState<string>(initialCategory);
  const [search, setSearch] = useState("");
  const isRoomy = variant === "roomy";

  // 3b: movement-group chips for the Powerlifting tab. Cached (staleTime Infinity) + `enabled`-gated,
  // so flag-OFF makes no fetch and the tab is unchanged.
  const { data: movementConfig } = useMovementGroupConfig(enableGroupPick);
  // The movement taxonomy now has six compound groups, but only the three barbell lifts are
  // powerlifting — scope the Powerlifting-tab chips to Squat/Press/Hinge (Pull/Core/Carry are not
  // powerlifting lifts). The movement LENS still shows all six; this is only the authoring chips.
  const powerliftingGroups = useMemo(
    () => (movementConfig?.groups ?? []).filter((g) => MOVEMENT_GROUP_IDS.has(g.id)),
    [movementConfig],
  );
  const showGroupPick = enableGroupPick && category === "powerlifting" && powerliftingGroups.length > 0;

  // Strength tab renders the DB taxonomy (7 regions / muscles / subdivisions) so
  // it matches the Workout Library breakdown. Fall back to the legacy hardcoded
  // SessionAddPicker only if the volume_key backfill migration hasn't landed yet
  // (no muscle has a volume_key) -- avoids an empty strength tab in that window.
  const { data: taxonomy } = useExerciseTaxonomy();
  const strengthUsesDbTaxonomy =
    !taxonomy || taxonomy.muscles.some((m) => m.volume_key != null);

  // Non-strength tabs share ExerciseBrowse. RLS scopes rows to global + own-coach.
  const { data: rows = [], isLoading, isError } = useExerciseLibraryData();

  // 3c: cardio modality chips (cardio_movement taxonomy). Counts come from the already-loaded rows.
  const cardioModalities = taxonomy?.cardioMovements ?? [];
  const cardioCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.cardio_movement_id) m.set(r.cardio_movement_id, (m.get(r.cardio_movement_id) ?? 0) + 1);
    return m;
  }, [rows]);
  const showCardioGroupPick =
    enableGroupPick && category === "cardio" && cardioModalities.length > 0 && !!onAddActivityGroup;

  return (
    <div className={cn("space-y-2", isRoomy && "space-y-3")}>
      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        {PICKER_CATEGORY_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setCategory(t.value);
              setSearch(""); // fresh search per category
            }}
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
        strengthUsesDbTaxonomy ? (
          // DB taxonomy tree (matches the Workout Library breakdown). Emits the
          // node's volume_key (legacy slug) so volume tracking is unchanged.
          <StrengthTaxonomyBrowse
            placementCounts={placementCounts}
            onAddMuscle={onAddMuscle}
            variant={variant}
            autoFocusSearch={autoFocusSearch}
          />
        ) : (
          // Fallback: legacy hardcoded muscle picker (pre-migration only).
          <SessionAddPicker
            sessionType="strength"
            placementCounts={placementCounts}
            recentMuscleIds={recentMuscleIds}
            onAddMuscle={onAddMuscle}
            onAddActivity={() => {}}
            variant={variant}
            autoFocusSearch={autoFocusSearch}
          />
        )
      ) : (
        // Every non-strength category: the shared ExerciseBrowse locked to this tab, so quick-add
        // rows match /coach/exercises and the client Learn tab (headline + equipment · resistance
        // line + UNI chip). The old bespoke facet dropdowns are intentionally gone — search + the
        // shared rich rows replace them, matching every other surface.
        <div className={cn("space-y-2", isRoomy && "space-y-3")}>
          {showGroupPick && (
            // Volume-first (3b): pick a lift group → an unfilled slot that counts in the movement lens
            // now; choose the exact variation on the slot later. The plain browse stays below for
            // coaches who prefer to add a specific lift directly.
            <div className="space-y-1.5 rounded-md border border-border/50 bg-card/40 p-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Add a lift group — fill the variation later
              </p>
              <div className="flex flex-wrap gap-1">
                {powerliftingGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onAddMuscle(g.id)}
                    className={cn(
                      "whitespace-nowrap rounded-md border border-border/60 bg-background px-2 py-1 text-[11px]",
                      "transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary",
                    )}
                  >
                    {g.label}
                    <span className="ml-1 text-muted-foreground">· {g.variationCount}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {showCardioGroupPick && (
            // Volume-first (3c): pick a cardio modality → an unfilled slot that shows in the minutes
            // lens (pending, 0 min) now; set the duration (and optionally the exact exercise) later.
            <div className="space-y-1.5 rounded-md border border-border/50 bg-card/40 p-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Add a cardio modality — set the duration later
              </p>
              <div className="flex flex-wrap gap-1">
                {cardioModalities.map((cm) => {
                  const n = cardioCounts.get(cm.id) ?? 0;
                  return (
                    <button
                      key={cm.id}
                      type="button"
                      onClick={() => onAddActivityGroup!(cm.id, cm.display_name, "cardio")}
                      className={cn(
                        "whitespace-nowrap rounded-md border border-border/60 bg-background px-2 py-1 text-[11px]",
                        "transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary",
                      )}
                    >
                      {cm.display_name}
                      {n > 0 && <span className="ml-1 text-muted-foreground">· {n}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
          <div className={cn("max-h-60 overflow-y-auto", isRoomy && "max-h-none")}>
            <ExerciseBrowse
              mode="picker"
              audience="coach"
              rows={rows}
              search={search}
              loading={isLoading}
              error={isError}
              lockedCategory={category}
              onSelect={(ex) =>
                onAddExercise({ exerciseId: ex.id, name: ex.name }, exerciseCategoryToActivityType(ex.category))
              }
            />
          </div>
        </div>
      )}
    </div>
  );
});
