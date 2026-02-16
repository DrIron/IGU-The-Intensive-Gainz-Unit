import { memo, useState, useMemo } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Search } from "lucide-react";
import { DraggableMuscleChip } from "./DraggableMuscleChip";
import {
  MUSCLE_GROUPS,
  MUSCLE_MAP,
  SUBDIVISIONS,
  SUBDIVISIONS_BY_PARENT,
  BODY_REGIONS,
  BODY_REGION_LABELS,
  type BodyRegion,
} from "@/types/muscle-builder";

interface MusclePaletteProps {
  placementCounts: Map<string, number>;
}

// Build a flat ordered list of all chips (parents + subdivisions) for DnD indexing
const ALL_PALETTE_ITEMS: { id: string; parentId?: string }[] = [];
for (const m of MUSCLE_GROUPS) {
  ALL_PALETTE_ITEMS.push({ id: m.id });
  const subs = SUBDIVISIONS_BY_PARENT.get(m.id);
  if (subs) {
    for (const s of subs) {
      ALL_PALETTE_ITEMS.push({ id: s.id, parentId: s.parentId });
    }
  }
}
const PALETTE_INDEX = new Map(ALL_PALETTE_ITEMS.map((item, i) => [item.id, i]));

export const MusclePalette = memo(function MusclePalette({ placementCounts }: MusclePaletteProps) {
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    // Search parents
    const matchedParents = MUSCLE_GROUPS.filter(
      m => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    );
    // Search subdivisions
    const matchedSubs = SUBDIVISIONS.filter(
      s => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
    return { parents: matchedParents, subs: matchedSubs };
  }, [search]);

  const musclesByRegion = useMemo(() => {
    const map = new Map<BodyRegion, typeof MUSCLE_GROUPS>();
    for (const region of BODY_REGIONS) {
      map.set(region, MUSCLE_GROUPS.filter(m => m.bodyRegion === region));
    }
    return map;
  }, []);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Muscle Palette
      </h3>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search muscles..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      <Droppable droppableId="palette" isDropDisabled={true} type="MUSCLE_SLOT">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            {filteredItems ? (
              // Search results — flat list of matching parents + subdivisions
              <div className="flex flex-wrap gap-1.5">
                {filteredItems.parents.map((muscle) => (
                  <DraggableMuscleChip
                    key={muscle.id}
                    muscle={muscle}
                    index={PALETTE_INDEX.get(muscle.id)!}
                    placementCount={placementCounts.get(muscle.id) || 0}
                  />
                ))}
                {filteredItems.subs.map((sub) => {
                  const parent = MUSCLE_MAP.get(sub.parentId);
                  if (!parent) return null;
                  return (
                    <DraggableMuscleChip
                      key={sub.id}
                      muscle={{ id: sub.id, label: sub.label, colorClass: parent.colorClass, colorHex: parent.colorHex }}
                      index={PALETTE_INDEX.get(sub.id)!}
                      placementCount={placementCounts.get(sub.id) || 0}
                      isSubdivision
                    />
                  );
                })}
                {filteredItems.parents.length === 0 && filteredItems.subs.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">No muscles match "{search}"</p>
                )}
              </div>
            ) : (
              // Accordion by body region
              <Accordion type="multiple" defaultValue={BODY_REGIONS} className="space-y-0">
                {BODY_REGIONS.map(region => {
                  const muscles = musclesByRegion.get(region) || [];
                  return (
                    <AccordionItem key={region} value={region} className="border-b-0">
                      <AccordionTrigger className="py-2 text-sm font-medium hover:no-underline">
                        {BODY_REGION_LABELS[region]}
                        <span className="ml-auto mr-2 text-[10px] text-muted-foreground">
                          {muscles.length}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-2">
                        <div className="space-y-1">
                          {muscles.map(muscle => {
                            const subs = SUBDIVISIONS_BY_PARENT.get(muscle.id);
                            return (
                              <div key={muscle.id}>
                                <div className="flex flex-wrap gap-1.5">
                                  <DraggableMuscleChip
                                    muscle={muscle}
                                    index={PALETTE_INDEX.get(muscle.id)!}
                                    placementCount={placementCounts.get(muscle.id) || 0}
                                  />
                                </div>
                                {subs && subs.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {subs.map(sub => (
                                      <DraggableMuscleChip
                                        key={sub.id}
                                        muscle={{ id: sub.id, label: sub.label, colorClass: muscle.colorClass, colorHex: muscle.colorHex }}
                                        index={PALETTE_INDEX.get(sub.id)!}
                                        placementCount={placementCounts.get(sub.id) || 0}
                                        isSubdivision
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
});
