import { useState, useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Edit2, Search, Video } from 'lucide-react';
import {
  MUSCLE_GROUPS,
  SUBDIVISIONS_BY_PARENT,
  getMuscleDisplay,
  EQUIPMENT_MAP,
} from '@/types/muscle-builder';

// ---------------------------------------------------------------------------
// Types (match ExerciseLibraryManager)
// ---------------------------------------------------------------------------

interface ExerciseRow {
  id: string;
  name: string;
  primary_muscle: string | null;
  muscle_group: string | null;
  subdivision: string | null;
  movement_pattern: string | null;
  equipment: string | null;
  machine_brand: string | null;
  resistance_profiles: string[] | null;
  category: string;
  secondary_muscles: string[] | null;
  default_video_url: string | null;
  setup_instructions: string | null;
  tags: string[] | null;
  is_active: boolean;
  is_global: boolean;
}

interface MovementPattern {
  id: string;
  muscle_group: string;
  subdivision: string | null;
  movement: string;
  execution_text: string | null;
}

interface ExerciseCatalogViewProps {
  exercises: ExerciseRow[];
  patterns: MovementPattern[];
  onEditExercise: (exercise: ExerciseRow) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROFILE_BADGE_COLORS: Record<string, string> = {
  '(L)': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  '(M)': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  '(S)': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

function profileShort(p: string): string {
  if (p.startsWith('Lengt')) return '(L)';
  if (p.startsWith('Mid')) return '(M)';
  if (p.startsWith('Short')) return '(S)';
  return p;
}

// Group exercises by muscle_group -> subdivision -> movement_pattern
interface GroupedMovement {
  patternName: string;
  executionText: string | null;
  exercises: ExerciseRow[];
}

interface GroupedSubdivision {
  subdivisionId: string | null;
  subdivisionLabel: string;
  movements: GroupedMovement[];
}

interface GroupedMuscle {
  muscleId: string;
  muscleLabel: string;
  colorHex: string;
  subdivisions: GroupedSubdivision[];
  totalCount: number;
}

function buildCatalog(
  exercises: ExerciseRow[],
  patterns: MovementPattern[],
): GroupedMuscle[] {
  const patternMap = new Map<string, MovementPattern>();
  for (const p of patterns) {
    // Key by muscle_group + subdivision + movement for lookup
    const key = `${p.muscle_group}|${p.subdivision ?? ''}|${p.movement}`;
    patternMap.set(key, p);
  }

  const result: GroupedMuscle[] = [];

  for (const mg of MUSCLE_GROUPS) {
    const mgExercises = exercises.filter((e) => e.muscle_group === mg.id);
    if (mgExercises.length === 0) continue;

    const subdivisions: GroupedSubdivision[] = [];
    const subDefs = SUBDIVISIONS_BY_PARENT.get(mg.id) || [];

    // Exercises with a specific subdivision
    const usedSubIds = new Set<string>();
    for (const subDef of subDefs) {
      const subExercises = mgExercises.filter(
        (e) => e.subdivision === subDef.id,
      );
      if (subExercises.length === 0) continue;
      usedSubIds.add(subDef.id);
      subdivisions.push(
        buildSubdivisionGroup(
          subDef.id,
          subDef.label,
          subExercises,
          mg.id,
          patternMap,
        ),
      );
    }

    // Exercises with no subdivision -> "(General)"
    const generalExercises = mgExercises.filter(
      (e) => !e.subdivision || !usedSubIds.has(e.subdivision),
    );
    if (generalExercises.length > 0) {
      subdivisions.unshift(
        buildSubdivisionGroup(null, '(General)', generalExercises, mg.id, patternMap),
      );
    }

    result.push({
      muscleId: mg.id,
      muscleLabel: mg.label,
      colorHex: mg.colorHex,
      subdivisions,
      totalCount: mgExercises.length,
    });
  }

  return result;
}

function buildSubdivisionGroup(
  subdivisionId: string | null,
  subdivisionLabel: string,
  exercises: ExerciseRow[],
  muscleGroupId: string,
  patternMap: Map<string, MovementPattern>,
): GroupedSubdivision {
  const byMovement = new Map<string, ExerciseRow[]>();

  for (const ex of exercises) {
    const key = ex.movement_pattern ?? '(Uncategorized)';
    const arr = byMovement.get(key) || [];
    arr.push(ex);
    byMovement.set(key, arr);
  }

  const movements: GroupedMovement[] = [];

  for (const [patternName, exList] of byMovement) {
    // Look up execution_text from patterns
    const lookupKey = `${muscleGroupId}|${subdivisionId ?? ''}|${patternName}`;
    const match = patternMap.get(lookupKey);

    movements.push({
      patternName,
      executionText: match?.execution_text ?? null,
      exercises: exList.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  // Sort movements alphabetically, but push "(Uncategorized)" to end
  movements.sort((a, b) => {
    if (a.patternName === '(Uncategorized)') return 1;
    if (b.patternName === '(Uncategorized)') return -1;
    return a.patternName.localeCompare(b.patternName);
  });

  return { subdivisionId, subdivisionLabel, movements };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExerciseCatalogView({
  exercises,
  patterns,
  onEditExercise,
}: ExerciseCatalogViewProps) {
  const [search, setSearch] = useState('');

  const filteredExercises = useMemo(() => {
    if (!search.trim()) return exercises;
    const q = search.toLowerCase();
    return exercises.filter((e) => {
      const equipLabel = e.equipment ? (EQUIPMENT_MAP.get(e.equipment) ?? e.equipment) : '';
      const muscleLabel = e.muscle_group
        ? (getMuscleDisplay(e.muscle_group)?.label ?? e.muscle_group)
        : '';
      return (
        e.name.toLowerCase().includes(q) ||
        muscleLabel.toLowerCase().includes(q) ||
        equipLabel.toLowerCase().includes(q) ||
        (e.primary_muscle ?? '').toLowerCase().includes(q)
      );
    });
  }, [exercises, search]);

  const catalog = useMemo(
    () => buildCatalog(filteredExercises, patterns),
    [filteredExercises, patterns],
  );

  const isSearching = search.trim().length > 0;

  // When searching, auto-expand everything
  const allMuscleKeys = useMemo(
    () => catalog.map((g) => g.muscleId),
    [catalog],
  );

  const [openMuscles, setOpenMuscles] = useState<string[]>([]);
  const [openSubs, setOpenSubs] = useState<string[]>([]);

  // Derive effective open state
  const effectiveOpenMuscles = isSearching ? allMuscleKeys : openMuscles;
  const allSubKeys = useMemo(() => {
    const keys: string[] = [];
    for (const g of catalog) {
      for (const s of g.subdivisions) {
        keys.push(`${g.muscleId}__${s.subdivisionId ?? 'general'}`);
      }
    }
    return keys;
  }, [catalog]);
  const effectiveOpenSubs = isSearching ? allSubKeys : openSubs;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises by name, muscle, or equipment..."
          className="pl-10 bg-muted/50 border-border"
        />
        {isSearching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {filteredExercises.length} result{filteredExercises.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {catalog.length === 0 && (
        <p className="text-center text-muted-foreground py-12 text-sm">
          {search ? `No exercises found matching "${search}"` : 'No exercises found'}
        </p>
      )}

      {/* Muscle group accordions */}
      <ScrollArea className="h-[calc(100vh-16rem)]">
        <Accordion
          type="multiple"
          value={effectiveOpenMuscles}
          onValueChange={(v) => setOpenMuscles(v)}
        >
          {catalog.map((group) => (
            <AccordionItem key={group.muscleId} value={group.muscleId} className="border-border">
              <AccordionTrigger className="hover:no-underline py-3 px-1">
                <div className="flex items-center gap-3">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: group.colorHex }}
                  />
                  <span className="font-display text-lg tracking-wide text-primary">
                    {group.muscleLabel}
                  </span>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {group.totalCount}
                  </Badge>
                </div>
              </AccordionTrigger>

              <AccordionContent className="pb-2">
                {/* Subdivision sub-accordions */}
                <Accordion
                  type="multiple"
                  value={effectiveOpenSubs}
                  onValueChange={(v) => setOpenSubs(v)}
                  className="pl-4"
                >
                  {group.subdivisions.map((sub) => {
                    const subKey = `${group.muscleId}__${sub.subdivisionId ?? 'general'}`;
                    const subCount = sub.movements.reduce(
                      (sum, m) => sum + m.exercises.length,
                      0,
                    );
                    return (
                      <AccordionItem key={subKey} value={subKey} className="border-border/50">
                        <AccordionTrigger className="hover:no-underline py-2 px-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-semibold text-foreground">
                              {sub.subdivisionLabel}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {subCount}
                            </Badge>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent className="pb-1 pl-2 space-y-4">
                          {sub.movements.map((mv) => (
                            <div key={mv.patternName} className="space-y-2">
                              {/* Movement header */}
                              <div className="flex items-center gap-2 border-l-2 border-primary pl-3">
                                <span className="text-sm font-medium text-muted-foreground">
                                  {mv.patternName}
                                </span>
                                <Badge variant="outline" className="text-[10px] font-mono opacity-60">
                                  {mv.exercises.length}
                                </Badge>
                              </div>

                              {/* Execution text blockquote */}
                              {mv.executionText && (
                                <blockquote className="border-l-2 border-primary/40 bg-muted/50 px-3 py-2 ml-3 rounded-r text-sm italic text-muted-foreground leading-relaxed">
                                  {mv.executionText}
                                </blockquote>
                              )}

                              {/* Exercise table */}
                              <div className="ml-3 rounded border border-border overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-muted/60 text-muted-foreground">
                                      <th className="px-2 py-1.5 text-left font-medium w-8">#</th>
                                      <th className="px-2 py-1.5 text-left font-medium">Exercise Name</th>
                                      <th className="px-2 py-1.5 text-left font-medium">Equipment</th>
                                      <th className="px-2 py-1.5 text-left font-medium">Profile</th>
                                      <th className="px-2 py-1.5 text-left font-medium hidden sm:table-cell">
                                        Secondary Muscles
                                      </th>
                                      <th className="px-2 py-1.5 text-center font-medium w-10">
                                        <Video className="h-3 w-3 mx-auto" />
                                      </th>
                                      <th className="px-2 py-1.5 text-center font-medium w-10" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {mv.exercises.map((ex, idx) => (
                                      <tr
                                        key={ex.id}
                                        className="border-t border-border/50 hover:bg-muted/30 transition-colors"
                                      >
                                        <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                                          {idx + 1}
                                        </td>
                                        <td className="px-2 py-1.5 font-medium text-foreground">
                                          {ex.name}
                                          {!ex.is_active && (
                                            <Badge
                                              variant="outline"
                                              className="ml-1.5 text-[9px] text-destructive border-destructive/30"
                                            >
                                              Inactive
                                            </Badge>
                                          )}
                                        </td>
                                        <td className="px-2 py-1.5">
                                          {ex.equipment ? (
                                            <Badge
                                              variant="secondary"
                                              className="text-[10px] font-normal"
                                            >
                                              {EQUIPMENT_MAP.get(ex.equipment) ?? ex.equipment}
                                            </Badge>
                                          ) : (
                                            <span className="text-muted-foreground/50">--</span>
                                          )}
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <div className="flex gap-1 flex-wrap">
                                            {ex.resistance_profiles?.map((rp) => {
                                              const short = profileShort(rp);
                                              const cls =
                                                PROFILE_BADGE_COLORS[short] ??
                                                'bg-muted text-muted-foreground';
                                              return (
                                                <span
                                                  key={rp}
                                                  className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-mono border ${cls}`}
                                                >
                                                  {short}
                                                </span>
                                              );
                                            }) ?? (
                                              <span className="text-muted-foreground/50">--</span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-2 py-1.5 hidden sm:table-cell">
                                          {ex.secondary_muscles && ex.secondary_muscles.length > 0 ? (
                                            <span className="text-muted-foreground">
                                              {ex.secondary_muscles.join(', ')}
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground/50">--</span>
                                          )}
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          {ex.default_video_url ? (
                                            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
                                          ) : (
                                            <span className="text-muted-foreground/30">--</span>
                                          )}
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => onEditExercise(ex)}
                                          >
                                            <Edit2 className="h-3 w-3" />
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </ScrollArea>
    </div>
  );
}
