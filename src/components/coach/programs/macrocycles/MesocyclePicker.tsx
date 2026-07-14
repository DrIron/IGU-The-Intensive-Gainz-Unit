// src/components/coach/programs/macrocycles/MesocyclePicker.tsx
// Picker listing the coach's existing mesocycle programs, usable either
// as a right-rail pane (desktop) or inside a Drawer (mobile). Tap/drag
// one into the macrocycle editor's timeline.

import { memo, useEffect, useState, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DrawerScrollArea } from "@/components/ui/drawer";
import { Search, Plus, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { computeProgramWeeks } from "@/hooks/useMacrocycles";
import { cn } from "@/lib/utils";

interface MesocycleOption {
  id: string;
  title: string;
  description: string | null;
  weeks: number;
}

interface MesocyclePickerProps {
  coachUserId: string;
  excludeIds?: string[];       // already in the macrocycle
  onPick: (programTemplateId: string) => void;
  className?: string;
  compact?: boolean;            // dense card rows (drawer variant)
}

export const MesocyclePicker = memo(function MesocyclePicker({
  coachUserId,
  excludeIds = [],
  onPick,
  className,
  compact,
}: MesocyclePickerProps) {
  const [options, setOptions] = useState<MesocycleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const hasFetched = useRef(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: programs, error: pErr } = await supabase
        .from("program_templates")
        .select("id, title, description")
        .eq("owner_coach_id", coachUserId)
        .order("updated_at", { ascending: false });
      if (pErr) throw pErr;

      // ONE source of truth for counting a program's weeks: computeProgramWeeks
      // (canonical plan_weeks, legacy only as a fallback — see useMacrocycles).
      //
      // This used to be an inline COPY of the legacy `ceil(max(day_index)/7)` read.
      // PR #202 repointed the macrocycle list at canonical and missed this duplicate,
      // which had the identical silent-failure mode: after the legacy drop
      // program_template_days returns nothing, every count floors to 1, and the picker
      // would offer every 8-week mesocycle as "1 week". Never re-inline this.
      const ids = (programs ?? []).map(p => p.id);
      const weekMap = await computeProgramWeeks(ids);

      setOptions(
        (programs ?? []).map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          weeks: weekMap.get(p.id) ?? 1,
        })),
      );
    } catch (e: unknown) {
      toast({
        title: "Error loading mesocycles",
        description: sanitizeErrorForUser(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const excluded = new Set(excludeIds);
    const q = search.trim().toLowerCase();
    return options.filter(o => {
      if (excluded.has(o.id)) return false;
      if (!q) return true;
      return o.title.toLowerCase().includes(q) || (o.description ?? "").toLowerCase().includes(q);
    });
  }, [options, excludeIds, search]);

  return (
    <div className={cn("flex flex-col gap-3 min-h-0", className)}>
      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search mesocycles..."
          className="pl-8 h-9 text-sm"
        />
      </div>
      <DrawerScrollArea className="flex-1 min-h-0">
        {loading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center space-y-1">
            <BookOpen className="h-5 w-5 mx-auto opacity-40" />
            <p>
              {options.length === 0
                ? "No mesocycles yet. Build one in the Planning Board."
                : excludeIds.length === options.length
                  ? "All your mesocycles are already in this macrocycle."
                  : "No matches."}
            </p>
          </div>
        ) : (
          <div className={cn("space-y-1.5", compact && "space-y-1")}>
            {filtered.map(opt => (
              <button
                key={opt.id}
                onClick={() => onPick(opt.id)}
                className={cn(
                  "w-full text-left rounded-md border border-border/50 bg-card/50 hover:bg-card hover:border-border transition-colors",
                  compact ? "px-2.5 py-2" : "px-3 py-2.5",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium truncate", compact ? "text-sm" : "text-sm")}>{opt.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {opt.weeks} {opt.weeks === 1 ? "week" : "weeks"}
                      {opt.description ? ` · ${opt.description}` : ""}
                    </p>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </DrawerScrollArea>
    </div>
  );
});
