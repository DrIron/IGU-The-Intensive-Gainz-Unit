import { useEffect, useMemo, useState } from "react";
import { CardContent } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Info, Dumbbell, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ExerciseRow } from "@/hooks/useExerciseLibrary";
import { useExerciseTaxonomy } from "@/hooks/useExerciseTaxonomy";
import { equipmentLabel } from "@/lib/equipmentLabels";
import { getExerciseDisplayName, type ExerciseNameAudience } from "@/lib/exerciseDisplay";
import { muscleSynonyms } from "@/lib/muscleSynonyms";
import { EXERCISE_CATEGORIES, ALL_CATEGORY } from "@/lib/exerciseCategories";

/**
 * ExerciseBrowse — the shared anatomical region → muscle → exercise drill (slice 2b).
 *
 * ONE surface for the client Learn tab, the coach library, and the coach picker: a category strip +
 * region-card grid (live in-memory counts) → muscle list → exercise rows with subdivision/resistance
 * filter chips.
 *
 * - `mode="browse"`: a row's primary action is ⓘ → `onInfo` (the caller opens the ExerciseDemoCard).
 * - `mode="picker"`: a row tap fires `onSelect` (single) or `onToggle` + a checkbox (multiSelect).
 * - `audience`: which label column headlines a row — `"coach"` shows the dense `name`, `"client"`
 *   shows the friendly `client_name ?? name` (see lib/exerciseDisplay). Mode does NOT imply audience:
 *   both the client Learn tab and the coach library use `mode="browse"`.
 *
 * The caller supplies the (scoped) `rows`, `search`, and load state; taxonomy comes from the cached
 * `useExerciseTaxonomy`. `sourceMuscleId` (a taxonomy muscle id) deep-links straight to that muscle's
 * Level-C list, with the breadcrumb as the "browse other muscles" escape.
 */

export type ExerciseBrowseMode = "browse" | "picker";

export interface ExerciseBrowseProps {
  rows: ExerciseRow[];
  search?: string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  mode?: ExerciseBrowseMode;
  /** Which label column headlines a row (see lib/exerciseDisplay). Independent of `mode`. */
  audience?: ExerciseNameAudience;
  /** picker single-select: a row tap fires this. */
  onSelect?: (exercise: ExerciseRow) => void;
  /** picker replacement mode: rows become checkboxes toggling `onToggle`. */
  multiSelect?: boolean;
  selectedIds?: Set<string>;
  onToggle?: (exercise: ExerciseRow) => void;
  /** A taxonomy `muscles.id` to deep-link straight to that muscle's exercise list. */
  sourceMuscleId?: string | null;
  /** browse: the row opens the demo card via `onInfo`. */
  showInfo?: boolean;
  onInfo?: (exercise: ExerciseRow) => void;
  /** picker: render a trailing badge on a row (e.g. "Custom" for non-global). */
  renderRowBadge?: (exercise: ExerciseRow) => React.ReactNode;
  /** When set, forces the browse to this category and hides the internal category strip.
   *  The parent surface (e.g. the planning "+" picker) owns category selection. */
  lockedCategory?: string;
  /** Force a single FLAT list of `rows` (already scoped by the caller) instead of the region→muscle
   *  tree — regardless of category/search. Used for the 3b group fill-later, where `rows` is exactly
   *  the picked movement group's variations and the muscle tree would scatter them. Skips the internal
   *  category filter too (the caller owns scope). */
  forceFlat?: boolean;
}

// Single source of truth (lib/exerciseCategories) + an "All" lead — no local copy to drift.
const CATEGORY_STRIP = [ALL_CATEGORY, ...EXERCISE_CATEGORIES];

/** Punctuation-stripped, lowercased form so a hyphenated equipment code also matches its run-together
 *  spelling ("C-AA" → "caa"). */
const stripPunct = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * A row's search haystack: every label a coach or client might type, lowercased and space-joined.
 * Pulls BOTH name columns, the muscle from every angle (legacy text + group + FK display name +
 * subdivision + anatomical), the equipment (raw code + de-hyphenated + the friendly word via
 * `equipmentLabel`, e.g. "BB"/"barbell", "C-AA"/"caa"/"cable"), the movement pattern, and category —
 * so token-AND matching below can hit any of them, order-independently.
 *
 * Each muscle value (group + FK display name + subdivision) is ALSO expanded through
 * `muscleSynonyms` so anatomical / common-usage / region terms match the short stored lay names
 * ("quads" → "quadriceps"/"legs", "elbow flexors" → "biceps"/"arms").
 */
function buildHaystack(
  r: ExerciseRow,
  muscleName: Map<string, string>,
  subName: Map<string, string>,
): string {
  const equip = r.equipment ?? "";
  const muscleDisplay = r.muscle_id ? muscleName.get(r.muscle_id) : "";
  const subDisplay = r.subdivision_id ? subName.get(r.subdivision_id) : "";
  const parts = [
    r.name,
    r.client_name,
    r.primary_muscle,
    r.muscle_group,
    r.anatomical_name,
    muscleDisplay,
    r.subdivision,
    subDisplay,
    // Anatomical / lay / region synonyms for whichever muscle terms this row carries.
    ...muscleSynonyms(r.muscle_group),
    ...muscleSynonyms(muscleDisplay),
    ...muscleSynonyms(r.subdivision),
    ...muscleSynonyms(subDisplay),
    equip,
    stripPunct(equip),
    equipmentLabel(equip),
    r.movement_pattern,
    r.category,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/** Token-AND: the row matches iff EVERY query term is a substring of its haystack (order-independent). */
const matchesAllTerms = (haystack: string, terms: string[]): boolean =>
  terms.every((t) => haystack.includes(t));

export function ExerciseBrowse({
  rows,
  search = "",
  loading = false,
  error = false,
  onRetry,
  mode = "browse",
  audience = "client",
  onSelect,
  multiSelect = false,
  selectedIds,
  onToggle,
  sourceMuscleId,
  showInfo = false,
  onInfo,
  renderRowBadge,
  lockedCategory,
  forceFlat = false,
}: ExerciseBrowseProps) {
  const { data: taxonomy } = useExerciseTaxonomy();

  // Headline the audience-appropriate column; sort rows by what's actually shown.
  const display = (r: ExerciseRow) => getExerciseDisplayName(r, audience);
  const byDisplay = (a: ExerciseRow, b: ExerciseRow) => display(a).localeCompare(display(b));

  const [category, setCategory] = useState<string>("strength");
  // When locked, the parent owns category selection and the internal strip is hidden.
  const effectiveCategory = lockedCategory ?? category;
  const [regionId, setRegionId] = useState("");
  const [muscleId, setMuscleId] = useState("");
  const [subFilter, setSubFilter] = useState(""); // subdivision_id chip
  const [resFilter, setResFilter] = useState(""); // resistance-profile chip

  const q = search.trim().toLowerCase();
  // Query → terms (whitespace-split); a row matches iff every term is in its haystack (AND).
  const terms = useMemo(() => q.split(/\s+/).filter(Boolean), [q]);

  // Per-row search haystack, rebuilt only when the rows or taxonomy change (not per keystroke).
  const searchIndex = useMemo(() => {
    const muscleName = new Map((taxonomy?.muscles ?? []).map((m) => [m.id, m.display_name]));
    const subName = new Map((taxonomy?.subdivisions ?? []).map((s) => [s.id, s.display_name]));
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.id, buildHaystack(r, muscleName, subName));
    return map;
  }, [rows, taxonomy]);

  const selectCategory = (v: string) => {
    setCategory(v);
    setRegionId("");
    setMuscleId("");
    setSubFilter("");
    setResFilter("");
  };
  const selectRegion = (id: string) => {
    setRegionId(id);
    setMuscleId("");
    setSubFilter("");
    setResFilter("");
  };
  const selectMuscle = (id: string) => {
    setMuscleId(id);
    setSubFilter("");
    setResFilter("");
  };

  // Deep-link: open straight at the source muscle's Level-C list (breadcrumb escapes back up).
  useEffect(() => {
    if (!sourceMuscleId || !taxonomy) return;
    const m = taxonomy.muscles.find((mm) => mm.id === sourceMuscleId);
    if (m) {
      setCategory("strength");
      setRegionId(m.primary_region_id);
      setMuscleId(m.id);
    }
  }, [sourceMuscleId, taxonomy]);

  const muscleToRegion = useMemo(() => {
    const m = new Map<string, string>();
    for (const mu of taxonomy?.muscles ?? []) m.set(mu.id, mu.primary_region_id);
    return m;
  }, [taxonomy]);

  // Anatomical set: strength rows carry a muscle_id → region. Non-strength categories flat-list.
  const strengthRows = useMemo(
    () => rows.filter((r) => r.category === "strength" && r.muscle_id),
    [rows],
  );

  const regionCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of strengthRows) {
      const reg = muscleToRegion.get(r.muscle_id as string);
      if (reg) c.set(reg, (c.get(reg) ?? 0) + 1);
    }
    return c;
  }, [strengthRows, muscleToRegion]);

  const muscleCount = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of strengthRows) c.set(r.muscle_id as string, (c.get(r.muscle_id as string) ?? 0) + 1);
    return c;
  }, [strengthRows]);

  const flatList = useMemo(() => {
    let out = rows;
    // forceFlat: `rows` is already scoped by the caller (e.g. a movement group's variations) — don't
    // re-filter by the internal category, which would drop cross-category variations.
    if (!forceFlat && effectiveCategory !== "all") out = out.filter((r) => r.category === effectiveCategory);
    if (terms.length) out = out.filter((r) => matchesAllTerms(searchIndex.get(r.id) ?? "", terms));
    return out.slice().sort(byDisplay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, effectiveCategory, terms, searchIndex, audience, forceFlat]);

  const rowsForMuscle = useMemo(
    () => strengthRows.filter((r) => r.muscle_id === muscleId),
    [strengthRows, muscleId],
  );
  const muscleExercises = useMemo(() => {
    let out = rowsForMuscle;
    if (subFilter) out = out.filter((r) => r.subdivision_id === subFilter);
    if (resFilter) out = out.filter((r) => (r.resistance_profiles ?? []).includes(resFilter));
    return out.slice().sort(byDisplay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsForMuscle, subFilter, resFilter, audience]);

  const resistanceOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rowsForMuscle) for (const rp of r.resistance_profiles ?? []) s.add(rp);
    return [...s].sort();
  }, [rowsForMuscle]);

  const region = taxonomy?.regions.find((r) => r.id === regionId);
  const muscle = taxonomy?.muscles.find((m) => m.id === muscleId);
  const showFlat = forceFlat || !!q || effectiveCategory !== "strength";

  const renderRow = (r: ExerciseRow) => (
    <BrowseRow
      key={r.id}
      row={r}
      mode={mode}
      audience={audience}
      multiSelect={multiSelect}
      checked={selectedIds?.has(r.id) ?? false}
      showInfo={showInfo}
      badge={renderRowBadge?.(r)}
      onPrimary={() => {
        if (mode === "picker") {
          if (multiSelect) onToggle?.(r);
          else onSelect?.(r);
        } else {
          onInfo?.(r);
        }
      }}
    />
  );

  return (
    <div className="space-y-4">
      {/* Category strip — hidden when the parent locks the category (planning "+" picker) or forces a
          flat scoped list (3b group fill: the strip would be inert against the caller's fixed scope). */}
      {!lockedCategory && !forceFlat && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Exercise categories">
          {CATEGORY_STRIP.map((c) => (
            <Button
              key={c.value}
              type="button"
              size="sm"
              variant={category === c.value ? "default" : "outline"}
              className="whitespace-nowrap"
              onClick={() => selectCategory(c.value)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <LoadError
          message="We couldn't load the exercise library. Check your connection and try again."
          onRetry={onRetry}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={q ? `No exercises matching "${search}"` : "No exercises found"}
          description={q ? "Try a different search." : "The exercise library is empty."}
        />
      ) : showFlat ? (
        flatList.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title={q ? `No exercises matching "${search}"` : "No exercises found"}
            description={q ? "Try a different search." : "No exercises in this category yet."}
          />
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {flatList.length} exercise{flatList.length === 1 ? "" : "s"}
            </p>
            {flatList.map(renderRow)}
          </div>
        )
      ) : !taxonomy ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : !regionId ? (
        taxonomy.regions.filter((r) => (regionCounts.get(r.id) ?? 0) > 0).length === 0 ? (
          <EmptyState icon={Dumbbell} title="No exercises found" description="No strength exercises in the library yet." />
        ) : (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            {taxonomy.regions
              .filter((r) => (regionCounts.get(r.id) ?? 0) > 0)
              .map((r) => (
                <ClickableCard
                  key={r.id}
                  ariaLabel={`Browse ${r.display_name} exercises`}
                  onClick={() => selectRegion(r.id)}
                >
                  <CardContent className="p-4">
                    {/* MuscleMap thumb slot — reserved for a future anatomy render (no fake art). */}
                    <div className="mb-3 aspect-[4/3] rounded-lg border border-dashed border-border bg-muted/20" aria-hidden />
                    <p className="font-semibold leading-tight">{r.display_name}</p>
                    <p className="text-sm text-muted-foreground">{regionCounts.get(r.id) ?? 0} exercises</p>
                  </CardContent>
                </ClickableCard>
              ))}
          </div>
        )
      ) : !muscleId ? (
        <div className="space-y-3">
          <Breadcrumb items={[{ label: "Regions", onClick: () => selectRegion("") }, { label: region?.display_name ?? "" }]} />
          <div className="space-y-2">
            {(taxonomy.musclesByRegion.get(regionId) ?? [])
              .filter((m) => (muscleCount.get(m.id) ?? 0) > 0)
              .map((m) => (
                <ClickableCard key={m.id} ariaLabel={`Browse ${m.display_name} exercises`} onClick={() => selectMuscle(m.id)}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="font-medium">{m.display_name}</p>
                      <p className="text-xs text-muted-foreground">{muscleCount.get(m.id) ?? 0} exercises</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </CardContent>
                </ClickableCard>
              ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Breadcrumb
            items={[
              { label: "Regions", onClick: () => selectRegion("") },
              { label: region?.display_name ?? "", onClick: () => selectMuscle("") },
              { label: muscle?.display_name ?? "" },
            ]}
          />

          <div className="flex flex-col gap-2">
            {(taxonomy.subdivisionsByMuscle.get(muscleId) ?? []).some((sd) => rowsForMuscle.some((r) => r.subdivision_id === sd.id)) && (
              <ChipRow label="Head">
                <Chip active={!subFilter} onClick={() => setSubFilter("")}>All</Chip>
                {(taxonomy.subdivisionsByMuscle.get(muscleId) ?? [])
                  .filter((sd) => rowsForMuscle.some((r) => r.subdivision_id === sd.id))
                  .map((sd) => (
                    <Chip key={sd.id} active={subFilter === sd.id} onClick={() => setSubFilter(subFilter === sd.id ? "" : sd.id)}>
                      {sd.display_name}
                    </Chip>
                  ))}
              </ChipRow>
            )}

            {resistanceOptions.length > 0 && (
              <ChipRow label="Resistance">
                <Chip active={!resFilter} onClick={() => setResFilter("")}>All</Chip>
                {resistanceOptions.map((rp) => (
                  <Chip key={rp} active={resFilter === rp} onClick={() => setResFilter(resFilter === rp ? "" : rp)}>
                    {rp}
                  </Chip>
                ))}
              </ChipRow>
            )}
          </div>

          {muscleExercises.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title={subFilter || resFilter ? "No exercises match these filters" : "No exercises here yet"}
              description={subFilter || resFilter ? "Try clearing a filter." : undefined}
            />
          ) : (
            <div className="space-y-2">{muscleExercises.map(renderRow)}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** One exercise row — the audience-appropriate headline, a friendly "equipment · resistance" mono
 *  line, UNI chip, and a mode-specific trailing affordance (ⓘ / + / checkbox). */
function BrowseRow({
  row,
  mode,
  audience,
  multiSelect,
  checked,
  showInfo,
  badge,
  onPrimary,
}: {
  row: ExerciseRow;
  mode: ExerciseBrowseMode;
  audience: ExerciseNameAudience;
  multiSelect: boolean;
  checked: boolean;
  showInfo: boolean;
  badge?: React.ReactNode;
  onPrimary: () => void;
}) {
  const isUnilateral = !!row.laterality && row.laterality !== "bi";
  const meta = [equipmentLabel(row.equipment), (row.resistance_profiles ?? []).join(", ")].filter(Boolean).join(" · ");
  const isCheckbox = mode === "picker" && multiSelect;
  const label = getExerciseDisplayName(row, audience);

  return (
    <ClickableCard
      ariaLabel={mode === "picker" ? `Select ${label}` : `View ${label}`}
      onClick={onPrimary}
      className={isCheckbox && checked ? "border-primary/40 bg-primary/5" : undefined}
      {...(isCheckbox ? { role: "checkbox", "aria-checked": checked } : {})}
    >
      <CardContent className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{label}</p>
          {meta && <p className="truncate font-mono text-xs text-muted-foreground">{meta}</p>}
        </div>
        {isUnilateral && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
            UNI
          </span>
        )}
        {badge}
        {isCheckbox ? (
          <div
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
              checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
            )}
          >
            {checked && <Check className="h-3.5 w-3.5" />}
          </div>
        ) : mode === "picker" ? (
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : showInfo ? (
          <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
      </CardContent>
    </ClickableCard>
  );
}

function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
          {it.onClick ? (
            <button type="button" onClick={it.onClick} className="text-primary hover:underline">
              {it.label}
            </button>
          ) : (
            <span className="font-medium text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <div className="flex gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50",
      )}
    >
      {children}
    </button>
  );
}
