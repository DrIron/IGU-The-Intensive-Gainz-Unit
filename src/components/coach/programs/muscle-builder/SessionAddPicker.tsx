import { memo, useMemo, useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search, History } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MUSCLE_GROUPS,
  MUSCLE_MAP,
  SUBDIVISIONS,
  SUBDIVISIONS_BY_PARENT,
  SUBDIVISION_MAP,
  BODY_REGIONS,
  BODY_REGION_LABELS,
  ACTIVITIES_BY_CATEGORY,
  type ActivityType,
} from "@/types/muscle-builder";

interface SessionAddPickerProps {
  sessionType: ActivityType;
  /** Map of muscleId → times placed across the current week (drives the small badge). */
  placementCounts?: Map<string, number>;
  /** Recently-added muscle ids in the current plan, most recent first. Caller already de-dupes / slices. */
  recentMuscleIds?: string[];
  onAddMuscle: (muscleId: string) => void;
  onAddActivity: (activityId: string) => void;
  /** "compact" — desktop popover (rows). "roomy" — mobile drawer (chips). */
  variant: "compact" | "roomy";
  /** Auto-focus the search input when picker mounts (mobile drawer wants this; desktop popover doesn't). */
  autoFocusSearch?: boolean;
}

/**
 * Shared picker that the desktop SessionBlock popover and the mobile
 * MobileDayDetail inline picker both render. Replaced the old right-rail
 * MusclePalette + each component's bespoke list. Adds search, recents, and
 * placement-count badges in one place so future tweaks land everywhere at once.
 *
 * Strength sessions get the muscle picker (region accordion + subdivisions).
 * Other types list activities scoped to that session type so a coach can't
 * accidentally drop a HIIT activity into a Recovery session.
 */
export const SessionAddPicker = memo(function SessionAddPicker({
  sessionType,
  placementCounts,
  recentMuscleIds,
  onAddMuscle,
  onAddActivity,
  variant,
  autoFocusSearch = false,
}: SessionAddPickerProps) {
  const [search, setSearch] = useState("");
  const [expandedParent, setExpandedParent] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusSearch) inputRef.current?.focus();
  }, [autoFocusSearch]);

  const isStrength = sessionType === "strength";
  const isRoomy = variant === "roomy";

  const filteredMuscles = useMemo(() => {
    if (!isStrength || !search.trim()) return null;
    const q = search.toLowerCase();
    const parents = MUSCLE_GROUPS.filter(
      m => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
    const subs = SUBDIVISIONS.filter(
      s => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    );
    return { parents, subs };
  }, [isStrength, search]);

  const filteredActivities = useMemo(() => {
    if (isStrength || !search.trim()) return null;
    const q = search.toLowerCase();
    return (ACTIVITIES_BY_CATEGORY.get(sessionType) || []).filter(
      a => a.label.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
    );
  }, [isStrength, search, sessionType]);

  const recents = useMemo(() => {
    if (!isStrength || !recentMuscleIds || recentMuscleIds.length === 0) return [];
    return recentMuscleIds
      .map(id => {
        const sub = SUBDIVISION_MAP.get(id);
        if (sub) {
          const parent = MUSCLE_MAP.get(sub.parentId);
          return parent
            ? { id, label: sub.label, colorClass: parent.colorClass, colorHex: parent.colorHex, isSubdivision: true }
            : null;
        }
        const muscle = MUSCLE_MAP.get(id);
        return muscle
          ? { id, label: muscle.label, colorClass: muscle.colorClass, colorHex: muscle.colorHex, isSubdivision: false }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [isStrength, recentMuscleIds]);

  const placementCount = (id: string) => placementCounts?.get(id) ?? 0;

  return (
    <div className={cn("space-y-2", isRoomy && "space-y-3")}>
      {/* Search — same input both variants, taller on roomy for touch */}
      <div className="relative">
        <Search
          className={cn(
            "absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground",
            isRoomy ? "h-4 w-4" : "h-3.5 w-3.5",
          )}
        />
        <Input
          ref={inputRef}
          placeholder={isStrength ? "Search muscles..." : "Search activities..."}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={cn("pl-8", isRoomy ? "h-10 text-base" : "h-8 text-sm")}
        />
      </div>

      {/* Recents — only on strength, only when nothing typed, only if there are any */}
      {isStrength && !search.trim() && recents.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground px-1">
            <History className="h-3 w-3" aria-hidden />
            Recently used
          </p>
          {isRoomy ? (
            <div className="flex flex-wrap gap-1.5">
              {recents.map(r => (
                <ChipButton
                  key={`recent-${r.id}`}
                  label={r.label}
                  colorClass={r.colorClass}
                  isSubdivision={r.isSubdivision}
                  count={placementCount(r.id)}
                  onClick={() => onAddMuscle(r.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {recents.map(r => (
                <RowButton
                  key={`recent-${r.id}`}
                  label={r.label}
                  colorClass={r.colorClass}
                  count={placementCount(r.id)}
                  onClick={() => onAddMuscle(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Body / activity content */}
      {isStrength ? (
        filteredMuscles ? (
          <SearchResults
            parents={filteredMuscles.parents}
            subs={filteredMuscles.subs}
            search={search}
            placementCount={placementCount}
            onAddMuscle={onAddMuscle}
            isRoomy={isRoomy}
          />
        ) : (
          <RegionList
            placementCount={placementCount}
            onAddMuscle={onAddMuscle}
            expandedParent={expandedParent}
            setExpandedParent={setExpandedParent}
            isRoomy={isRoomy}
          />
        )
      ) : (
        <ActivityList
          activities={filteredActivities ?? ACTIVITIES_BY_CATEGORY.get(sessionType) ?? []}
          search={search}
          onAddActivity={onAddActivity}
          isRoomy={isRoomy}
        />
      )}
    </div>
  );
});

/* ─── Sub-components ────────────────────────────────────────────── */

function SearchResults({
  parents,
  subs,
  search,
  placementCount,
  onAddMuscle,
  isRoomy,
}: {
  parents: typeof MUSCLE_GROUPS;
  subs: typeof SUBDIVISIONS;
  search: string;
  placementCount: (id: string) => number;
  onAddMuscle: (id: string) => void;
  isRoomy: boolean;
}) {
  if (parents.length === 0 && subs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2 px-1">
        {`No matches for "${search}"`}
      </p>
    );
  }
  if (isRoomy) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {parents.map(m => (
          <ChipButton
            key={m.id}
            label={m.label}
            colorClass={m.colorClass}
            count={placementCount(m.id)}
            onClick={() => onAddMuscle(m.id)}
          />
        ))}
        {subs.map(s => {
          const parent = MUSCLE_MAP.get(s.parentId);
          if (!parent) return null;
          return (
            <ChipButton
              key={s.id}
              label={s.label}
              colorClass={parent.colorClass}
              isSubdivision
              count={placementCount(s.id)}
              onClick={() => onAddMuscle(s.id)}
            />
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {parents.map(m => (
        <RowButton
          key={m.id}
          label={m.label}
          colorClass={m.colorClass}
          count={placementCount(m.id)}
          onClick={() => onAddMuscle(m.id)}
        />
      ))}
      {subs.map(s => {
        const parent = MUSCLE_MAP.get(s.parentId);
        if (!parent) return null;
        return (
          <RowButton
            key={s.id}
            label={s.label}
            colorClass={parent.colorClass}
            isSubdivision
            count={placementCount(s.id)}
            onClick={() => onAddMuscle(s.id)}
          />
        );
      })}
    </div>
  );
}

function RegionList({
  placementCount,
  onAddMuscle,
  expandedParent,
  setExpandedParent,
  isRoomy,
}: {
  placementCount: (id: string) => number;
  onAddMuscle: (id: string) => void;
  expandedParent: string | null;
  setExpandedParent: (id: string | null) => void;
  isRoomy: boolean;
}) {
  return (
    <div className={cn(isRoomy ? "space-y-3" : "space-y-2")}>
      {BODY_REGIONS.map(region => {
        const muscles = MUSCLE_GROUPS.filter(m => m.bodyRegion === region);
        return (
          <div key={region}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">
              {BODY_REGION_LABELS[region]}
            </p>
            {isRoomy ? (
              <div className="space-y-1">
                <div className="flex flex-wrap gap-1.5">
                  {muscles.map(muscle => (
                    <ChipButton
                      key={muscle.id}
                      label={muscle.label}
                      colorClass={muscle.colorClass}
                      count={placementCount(muscle.id)}
                      onClick={() => onAddMuscle(muscle.id)}
                    />
                  ))}
                </div>
                {muscles.map(muscle => {
                  const subs = SUBDIVISIONS_BY_PARENT.get(muscle.id);
                  if (!subs || subs.length === 0) return null;
                  return (
                    <div key={`${muscle.id}-subs`} className="flex flex-wrap gap-1 ml-2">
                      {subs.map(sub => (
                        <ChipButton
                          key={sub.id}
                          label={sub.label}
                          colorClass={muscle.colorClass}
                          isSubdivision
                          count={placementCount(sub.id)}
                          onClick={() => onAddMuscle(sub.id)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {muscles.map(muscle => {
                  const subs = SUBDIVISIONS_BY_PARENT.get(muscle.id);
                  const isExpanded = expandedParent === muscle.id;
                  return (
                    <div key={muscle.id}>
                      <RowButton
                        label={muscle.label}
                        colorClass={muscle.colorClass}
                        count={placementCount(muscle.id)}
                        onClick={() => onAddMuscle(muscle.id)}
                        expandable={subs && subs.length > 0}
                        expanded={isExpanded}
                        onToggleExpand={() => setExpandedParent(isExpanded ? null : muscle.id)}
                      />
                      {isExpanded && subs && (
                        <div className="ml-4 flex flex-col gap-0.5 mt-0.5">
                          {subs.map(sub => (
                            <RowButton
                              key={sub.id}
                              label={sub.label}
                              colorClass={muscle.colorClass}
                              isSubdivision
                              count={placementCount(sub.id)}
                              onClick={() => onAddMuscle(sub.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActivityList({
  activities,
  search,
  onAddActivity,
  isRoomy,
}: {
  activities: ReadonlyArray<{ id: string; label: string; colorClass: string }>;
  search: string;
  onAddActivity: (id: string) => void;
  isRoomy: boolean;
}) {
  if (activities.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2 px-1">
        {search ? `No activities match "${search}"` : "No activities for this session type"}
      </p>
    );
  }
  if (isRoomy) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {activities.map(a => (
          <ChipButton
            key={a.id}
            label={a.label}
            colorClass={a.colorClass}
            onClick={() => onAddActivity(a.id)}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {activities.map(a => (
        <RowButton
          key={a.id}
          label={a.label}
          colorClass={a.colorClass}
          onClick={() => onAddActivity(a.id)}
        />
      ))}
    </div>
  );
}

/* ─── Primitives ────────────────────────────────────────────────── */

interface ButtonBaseProps {
  label: string;
  colorClass: string;
  count?: number;
  isSubdivision?: boolean;
  onClick: () => void;
}

function RowButton({
  label,
  colorClass,
  count,
  isSubdivision,
  onClick,
  expandable,
  expanded,
  onToggleExpand,
}: ButtonBaseProps & {
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
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
            colorClass,
          )}
        />
        <span className="flex-1 truncate">{label}</span>
        {count != null && count > 0 && (
          <span className="text-[9px] font-mono text-muted-foreground tabular-nums shrink-0">
            ×{count}
          </span>
        )}
      </button>
      {expandable && onToggleExpand && (
        <button
          className="p-0.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground"
          onClick={onToggleExpand}
          aria-label={expanded ? "Collapse subdivisions" : "Expand subdivisions"}
        >
          <span
            className={cn(
              "block text-[10px] leading-none transition-transform",
              expanded && "rotate-90",
            )}
          >
            ›
          </span>
        </button>
      )}
    </div>
  );
}

function ChipButton({ label, colorClass, count, isSubdivision, onClick }: ButtonBaseProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-card/50 hover:bg-card border active:scale-95 transition-all",
        isSubdivision
          ? "px-2 py-1 text-xs border-dashed border-border/40"
          : "px-2.5 py-1.5 text-sm border-border/50",
      )}
    >
      <div
        className={cn(
          "rounded-full shrink-0",
          isSubdivision ? "w-2 h-2 opacity-70" : "w-2 h-2",
          colorClass,
        )}
      />
      <span className={isSubdivision ? "text-muted-foreground" : "text-foreground"}>
        {label}
      </span>
      {count != null && count > 0 && (
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
          ×{count}
        </span>
      )}
    </button>
  );
}
