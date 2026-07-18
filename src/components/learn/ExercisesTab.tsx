import { useMemo, useState } from "react";
import { CardContent } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Info, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExerciseLibraryData, type ExerciseRow } from "@/hooks/useExerciseLibrary";
import { useExerciseTaxonomy } from "@/hooks/useExerciseTaxonomy";
import { equipmentLabel } from "@/lib/equipmentLabels";
import { ExerciseDemoCard, type ExerciseDemoData } from "@/components/exercise/ExerciseDemoCard";
import { SwapExerciseDialog } from "@/components/coach/programs/SwapExerciseDialog";

/**
 * Exercises tab of the Learn hub (slice 2 of the exercise-library epic). An anatomical
 * region → muscle → exercise drill with LIVE counts, replacing the old dropdown-facet browse.
 *
 * - Level A: a category strip (All / Strength / Cardio / … / Systemic / Powerlifting) + a region
 *   card grid for Strength (the only category with a muscle→region anatomy). Non-strength
 *   categories, and an active search, skip the grid and show a flat exercise list.
 * - Level B: region → muscle rows.
 * - Level C: muscle → exercise rows, with subdivision + resistance FILTER chips (not drill levels).
 *
 * Counts are computed in-memory from the once-loaded useExerciseLibraryData rows (no new RPC).
 * Client-facing everywhere: rows show `client_name ?? name`. A row's ⓘ opens the shared
 * ExerciseDemoCard.
 */

const CATEGORY_STRIP: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "mobility", label: "Mobility" },
  { value: "physio", label: "Physio" },
  { value: "warmup", label: "Warmup" },
  { value: "cooldown", label: "Cooldown" },
  { value: "sport_specific", label: "Sport-Specific" },
  { value: "systemic", label: "Systemic" },
  { value: "powerlifting", label: "Powerlifting" },
];

const rowName = (r: ExerciseRow): string => r.client_name ?? r.name;

/** Search matches the FRIENDLY name (what the client sees) plus the dense name / muscle / equipment. */
function searchMatch(r: ExerciseRow, q: string): boolean {
  return (
    rowName(r).toLowerCase().includes(q) ||
    r.name.toLowerCase().includes(q) ||
    (r.primary_muscle ?? "").toLowerCase().includes(q) ||
    (r.equipment ?? "").toLowerCase().includes(q)
  );
}

const byName = (a: ExerciseRow, b: ExerciseRow) => rowName(a).localeCompare(rowName(b));

export function ExercisesTab({ search }: { search: string }) {
  // CC10 split: distinguish a failed read from a genuinely empty result.
  const { data: rows = [], isLoading, isError, refetch } = useExerciseLibraryData();
  const { data: taxonomy } = useExerciseTaxonomy();

  const [category, setCategory] = useState<string>("strength");
  const [regionId, setRegionId] = useState("");
  const [muscleId, setMuscleId] = useState("");
  const [subFilter, setSubFilter] = useState(""); // subdivision_id chip
  const [resFilter, setResFilter] = useState(""); // resistance-profile chip
  const [demoTarget, setDemoTarget] = useState<ExerciseRow | null>(null);
  const [similarTarget, setSimilarTarget] = useState<{ id: string; name: string } | null>(null);

  const q = search.trim().toLowerCase();

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

  // muscle_id → region_id, for the in-memory region grouping.
  const muscleToRegion = useMemo(() => {
    const m = new Map<string, string>();
    for (const mu of taxonomy?.muscles ?? []) m.set(mu.id, mu.primary_region_id);
    return m;
  }, [taxonomy]);

  // Strength rows are the anatomical set (they carry a muscle_id → region). Systemic/Powerlifting/
  // cardio rows are a different category and never appear in the region grid.
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

  // Flat list — used when searching OR when a non-strength category is selected.
  const flatList = useMemo(() => {
    let out = rows;
    if (category !== "all") out = out.filter((r) => r.category === category);
    if (q) out = out.filter((r) => searchMatch(r, q));
    return out.slice().sort(byName);
  }, [rows, category, q]);

  // Level C — the selected muscle's exercises, narrowed by the chip filters.
  const rowsForMuscle = useMemo(
    () => strengthRows.filter((r) => r.muscle_id === muscleId),
    [strengthRows, muscleId],
  );
  const muscleExercises = useMemo(() => {
    let out = rowsForMuscle;
    if (subFilter) out = out.filter((r) => r.subdivision_id === subFilter);
    if (resFilter) out = out.filter((r) => (r.resistance_profiles ?? []).includes(resFilter));
    return out.slice().sort(byName);
  }, [rowsForMuscle, subFilter, resFilter]);

  const resistanceOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rowsForMuscle) for (const rp of r.resistance_profiles ?? []) s.add(rp);
    return [...s].sort();
  }, [rowsForMuscle]);

  const openDemo = (row: ExerciseRow) => setDemoTarget(row);
  const region = taxonomy?.regions.find((r) => r.id === regionId);
  const muscle = taxonomy?.muscles.find((m) => m.id === muscleId);

  // Which view: search or non-strength → flat; else the region → muscle → exercise drill.
  const showFlat = !!q || category !== "strength";

  return (
    <div className="space-y-4">
      {/* Category strip */}
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

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <LoadError
          message="We couldn't load the exercise library. Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : rows.length === 0 ? (
        // A genuinely empty library (CC10): EmptyState, never a blank grid — and never `matching ""`.
        <EmptyState
          icon={Dumbbell}
          title={q ? `No exercises matching "${search}"` : "No exercises found"}
          description={q ? "Try a different search." : "The exercise library is empty."}
        />
      ) : showFlat ? (
        // Flat list (search results, or a non-strength category with no anatomy grid).
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
            {flatList.map((r) => (
              <ExerciseListRow key={r.id} row={r} onOpen={() => openDemo(r)} />
            ))}
          </div>
        )
      ) : !taxonomy ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : !regionId ? (
        // Level A — region grid (live counts, anatomical regions only).
        taxonomy.regions.filter((r) => (regionCounts.get(r.id) ?? 0) > 0).length === 0 ? (
          <EmptyState icon={Dumbbell} title="No exercises found" description="No strength exercises in the library yet." />
        ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          {taxonomy.regions
            .filter((r) => (regionCounts.get(r.id) ?? 0) > 0)
            .map((r) => {
              const count = regionCounts.get(r.id) ?? 0;
              return (
                <ClickableCard
                  key={r.id}
                  ariaLabel={`Browse ${r.display_name} exercises`}
                  onClick={() => selectRegion(r.id)}
                >
                  <CardContent className="p-4">
                    {/* MuscleMap thumb slot — reserved for a future anatomy render (no fake art). */}
                    <div
                      className="mb-3 aspect-[4/3] rounded-lg border border-dashed border-border bg-muted/20"
                      aria-hidden
                    />
                    <p className="font-semibold leading-tight">{r.display_name}</p>
                    <p className="text-sm text-muted-foreground">{count} exercises</p>
                  </CardContent>
                </ClickableCard>
              );
            })}
        </div>
        )
      ) : !muscleId ? (
        // Level B — muscles in the region.
        <div className="space-y-3">
          <Breadcrumb items={[{ label: "Regions", onClick: () => selectRegion("") }, { label: region?.display_name ?? "" }]} />
          <div className="space-y-2">
            {(taxonomy.musclesByRegion.get(regionId) ?? [])
              .filter((m) => (muscleCount.get(m.id) ?? 0) > 0)
              .map((m) => (
                <ClickableCard
                  key={m.id}
                  ariaLabel={`Browse ${m.display_name} exercises`}
                  onClick={() => selectMuscle(m.id)}
                >
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
        // Level C — the muscle's exercises + subdivision / resistance filter chips.
        <div className="space-y-3">
          <Breadcrumb
            items={[
              { label: "Regions", onClick: () => selectRegion("") },
              { label: region?.display_name ?? "", onClick: () => selectMuscle("") },
              { label: muscle?.display_name ?? "" },
            ]}
          />

          {/* Filter chips */}
          <div className="flex flex-col gap-2">
            {(taxonomy.subdivisionsByMuscle.get(muscleId) ?? []).some(
              (sd) => rowsForMuscle.some((r) => r.subdivision_id === sd.id),
            ) && (
              <ChipRow label="Head">
                <Chip active={!subFilter} onClick={() => setSubFilter("")}>
                  All
                </Chip>
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
                <Chip active={!resFilter} onClick={() => setResFilter("")}>
                  All
                </Chip>
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
            <div className="space-y-2">
              {muscleExercises.map((r) => (
                <ExerciseListRow key={r.id} row={r} onOpen={() => openDemo(r)} />
              ))}
            </div>
          )}
        </div>
      )}

      {demoTarget && (
        <ExerciseDemoCard
          exercise={demoTarget as ExerciseDemoData}
          context="library"
          open={!!demoTarget}
          onOpenChange={(o) => !o && setDemoTarget(null)}
          onFindSimilar={() => {
            const t = demoTarget;
            setDemoTarget(null);
            if (t) setSimilarTarget({ id: t.id, name: rowName(t) });
          }}
        />
      )}

      <SwapExerciseDialog
        open={!!similarTarget}
        onOpenChange={(o) => !o && setSimilarTarget(null)}
        exerciseId={similarTarget?.id ?? null}
        exerciseName={similarTarget?.name}
        viewOnly
      />
    </div>
  );
}

/** One exercise row — client_name, a friendly "equipment · resistance" mono line, UNI chip, ⓘ. */
function ExerciseListRow({ row, onOpen }: { row: ExerciseRow; onOpen: () => void }) {
  const isUnilateral = !!row.laterality && row.laterality !== "bi";
  const meta = [equipmentLabel(row.equipment), (row.resistance_profiles ?? []).join(", ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <ClickableCard ariaLabel={`View ${rowName(row)}`} onClick={onOpen}>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{rowName(row)}</p>
          {meta && <p className="truncate font-mono text-xs text-muted-foreground">{meta}</p>}
        </div>
        {isUnilateral && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
            UNI
          </span>
        )}
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
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
