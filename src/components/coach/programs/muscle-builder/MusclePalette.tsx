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
  BODY_REGIONS,
  BODY_REGION_LABELS,
  type BodyRegion,
} from "@/types/muscle-builder";

interface MusclePaletteProps {
  placementCounts: Map<string, number>;
}

export const MusclePalette = memo(function MusclePalette({ placementCounts }: MusclePaletteProps) {
  const [search, setSearch] = useState("");

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return MUSCLE_GROUPS.filter(
      m => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    );
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

      <Droppable droppableId="palette" isDropDisabled={true}>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            {filteredGroups ? (
              // Search results — flat list
              <div className="flex flex-wrap gap-1.5">
                {filteredGroups.map((muscle) => {
                  const idx = MUSCLE_GROUPS.indexOf(muscle);
                  return (
                    <DraggableMuscleChip
                      key={muscle.id}
                      muscle={muscle}
                      index={idx}
                      placementCount={placementCounts.get(muscle.id) || 0}
                    />
                  );
                })}
                {filteredGroups.length === 0 && (
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
                        <div className="flex flex-wrap gap-1.5">
                          {muscles.map(muscle => {
                            const idx = MUSCLE_GROUPS.indexOf(muscle);
                            return (
                              <DraggableMuscleChip
                                key={muscle.id}
                                muscle={muscle}
                                index={idx}
                                placementCount={placementCounts.get(muscle.id) || 0}
                              />
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
