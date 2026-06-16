import { memo, useMemo, useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExerciseTaxonomy } from "@/hooks/useExerciseTaxonomy";
import { MUSCLE_MAP, resolveParentMuscleId } from "@/types/muscle-builder";

/**
 * StrengthTaxonomyBrowse — strength tab of the planning-board add picker, sourced
 * from the DB taxonomy (body_regions → muscles → subdivisions) so it matches the
 * Workout Library breakdown exactly (7 anatomical regions, not the legacy
 * push/pull/legs/core split).
 *
 * Phase A: each node carries an editable `volume_key` (the legacy muscle-builder
 * slug). On select we emit that slug via onAddMuscle so ADD_MUSCLE /
 * useMusclePlanVolume / resolveParentMuscleId keep working unchanged. Nodes with
 * a NULL volume_key are intentionally not volume-tracked and are hidden here.
 * See docs/STRENGTH_PICKER_TAXONOMY_ALIGNMENT.md.
 */

interface StrengthTaxonomyBrowseProps {
  placementCounts?: Map<string, number>;
  onAddMuscle: (volumeKey: string) => void;
  variant: "compact" | "roomy";
  autoFocusSearch?: boolean;
}

const dotColor = (volumeKey: string) =>
  MUSCLE_MAP.get(resolveParentMuscleId(volumeKey))?.colorClass ?? "bg-zinc-400";

export const StrengthTaxonomyBrowse = memo(function StrengthTaxonomyBrowse({
  placementCounts,
  onAddMuscle,
  variant,
  autoFocusSearch = false,
}: StrengthTaxonomyBrowseProps) {
  const { data: taxonomy, isLoading } = useExerciseTaxonomy();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isRoomy = variant === "roomy";

  useEffect(() => {
    if (autoFocusSearch) inputRef.current?.focus();
  }, [autoFocusSearch]);

  const count = (k: string) => placementCounts?.get(k) ?? 0;

  // Flat search across muscles + subdivisions (only volume-tracked nodes).
  const searchResults = useMemo(() => {
    if (!taxonomy || !search.trim()) return null;
    const q = search.toLowerCase();
    const muscles = taxonomy.muscles.filter(
      (m) => m.volume_key && m.display_name.toLowerCase().includes(q),
    );
    const subs = taxonomy.subdivisions.filter(
      (s) => s.volume_key && s.display_name.toLowerCase().includes(q),
    );
    return { muscles, subs };
  }, [taxonomy, search]);

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
          ref={inputRef}
          placeholder="Search muscles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn("pl-8", isRoomy ? "h-10 text-base" : "h-8 text-sm")}
        />
      </div>

      {isLoading || !taxonomy ? (
        <p className="text-xs text-muted-foreground py-2 px-1">Loading…</p>
      ) : searchResults ? (
        searchResults.muscles.length === 0 && searchResults.subs.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 px-1">{`No matches for "${search}"`}</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {searchResults.muscles.map((m) => (
              <NodeRow
                key={m.id}
                label={m.display_name}
                volumeKey={m.volume_key!}
                count={count(m.volume_key!)}
                onClick={() => onAddMuscle(m.volume_key!)}
              />
            ))}
            {searchResults.subs.map((s) => (
              <NodeRow
                key={s.id}
                label={s.display_name}
                volumeKey={s.volume_key!}
                isSubdivision
                count={count(s.volume_key!)}
                onClick={() => onAddMuscle(s.volume_key!)}
              />
            ))}
          </div>
        )
      ) : (
        <div className={cn(isRoomy ? "space-y-3" : "space-y-2")}>
          {taxonomy.regions.map((region) => {
            const muscles = (taxonomy.musclesByRegion.get(region.id) ?? []).filter(
              (m) => m.volume_key,
            );
            if (muscles.length === 0) return null;
            return (
              <div key={region.id}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">
                  {region.display_name}
                </p>
                <div className="flex flex-col gap-0.5">
                  {muscles.map((muscle) => {
                    const subs = (taxonomy.subdivisionsByMuscle.get(muscle.id) ?? []).filter(
                      (s) => s.volume_key,
                    );
                    const isOpen = expanded === muscle.id;
                    return (
                      <div key={muscle.id}>
                        <NodeRow
                          label={muscle.display_name}
                          volumeKey={muscle.volume_key!}
                          count={count(muscle.volume_key!)}
                          onClick={() => onAddMuscle(muscle.volume_key!)}
                          expandable={subs.length > 0}
                          expanded={isOpen}
                          onToggleExpand={() => setExpanded(isOpen ? null : muscle.id)}
                        />
                        {isOpen && subs.length > 0 && (
                          <div className="ml-4 flex flex-col gap-0.5 mt-0.5">
                            {subs.map((sub) => (
                              <NodeRow
                                key={sub.id}
                                label={sub.display_name}
                                volumeKey={sub.volume_key!}
                                isSubdivision
                                count={count(sub.volume_key!)}
                                onClick={() => onAddMuscle(sub.volume_key!)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

function NodeRow({
  label,
  volumeKey,
  count,
  isSubdivision,
  onClick,
  expandable,
  expanded,
  onToggleExpand,
}: {
  label: string;
  volumeKey: string;
  count: number;
  isSubdivision?: boolean;
  onClick: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        className={cn(
          "flex-1 flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-muted/50 transition-colors text-left",
          isSubdivision ? "text-[11px] text-muted-foreground" : "text-xs",
        )}
        onClick={onClick}
      >
        <div
          className={cn(
            "rounded-full shrink-0",
            isSubdivision ? "w-1.5 h-1.5 opacity-70" : "w-2 h-2",
            dotColor(volumeKey),
          )}
        />
        <span className="flex-1 truncate">{label}</span>
        {count > 0 && (
          <span className="text-[9px] font-mono text-muted-foreground tabular-nums shrink-0">
            ×{count}
          </span>
        )}
      </button>
      {expandable && onToggleExpand && (
        <button
          type="button"
          className="p-0.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground"
          onClick={onToggleExpand}
          aria-label={expanded ? "Collapse subdivisions" : "Expand subdivisions"}
        >
          <span className={cn("block text-[10px] leading-none transition-transform", expanded && "rotate-90")}>
            ›
          </span>
        </button>
      )}
    </div>
  );
}
