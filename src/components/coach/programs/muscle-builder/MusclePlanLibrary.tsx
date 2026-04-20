import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import {
  Plus,
  Search,
  Copy,
  Edit,
  Trash2,
  MoreVertical,
  Dumbbell,
  ArrowRightLeft,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getMuscleDisplay, type MuscleSlotData, type WeekData } from "@/types/muscle-builder";

interface MusclePlan {
  id: string;
  name: string;
  description: string | null;
  weeks: WeekData[];
  is_preset: boolean;
  converted_program_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MusclePlanLibraryProps {
  coachUserId: string;
  onNewPlan: () => void;
  onEditPlan: (templateId: string) => void;
  onBack: () => void;
}

function planStats(weeks: WeekData[]) {
  const firstWeekSlots = weeks[0]?.slots || [];
  const days = new Set(firstWeekSlots.map(s => s.dayIndex));
  const totalSets = firstWeekSlots.reduce((sum, s) => sum + s.sets, 0);
  const muscles = new Set(firstWeekSlots.map(s => s.muscleId));
  return { trainingDays: days.size, totalSets, muscleCount: muscles.size, weekCount: weeks.length };
}

function parseWeeksFromSlotConfig(raw: unknown): WeekData[] {
  if (Array.isArray(raw)) {
    return [{ slots: raw as MuscleSlotData[] }];
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if ('weeks' in obj && Array.isArray(obj.weeks)) {
      return (obj.weeks as WeekData[]).map(w => ({ slots: w.slots || [], label: w.label, isDeload: w.isDeload }));
    }
    if ('slots' in obj) {
      return [{ slots: (obj.slots as MuscleSlotData[]) || [] }];
    }
  }
  return [{ slots: [] }];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function MusclePlanLibrary({ coachUserId, onNewPlan, onEditPlan, onBack }: MusclePlanLibraryProps) {
  const [plans, setPlans] = useState<MusclePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MusclePlan | null>(null);
  const { toast } = useToast();

  const loadPlans = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("muscle_program_templates")
        .select("*")
        .eq("coach_id", coachUserId)
        .eq("is_preset", false)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setPlans(
        (data || []).map(d => ({
          ...d,
          weeks: parseWeeksFromSlotConfig(d.slot_config as unknown),
        }))
      );
    } catch (error: any) {
      toast({ title: "Error loading plans", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadPlans();
  }, [loadPlans]);

  const filteredPlans = useMemo(() => {
    if (!searchQuery) return plans;
    const q = searchQuery.toLowerCase();
    return plans.filter(
      p => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)
    );
  }, [plans, searchQuery]);

  const duplicatePlan = async (plan: MusclePlan) => {
    try {
      const { error } = await supabase
        .from("muscle_program_templates")
        .insert({
          coach_id: coachUserId,
          name: `${plan.name} (Copy)`,
          description: plan.description,
          slot_config: { weeks: plan.weeks } as unknown as Record<string, unknown>,
        });

      if (error) throw error;
      toast({ title: "Plan duplicated" });
      loadPlans();
    } catch (error: any) {
      toast({ title: "Error duplicating", description: sanitizeErrorForUser(error), variant: "destructive" });
    }
  };

  const deletePlan = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase
        .from("muscle_program_templates")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;
      toast({ title: "Plan deleted" });
      setDeleteTarget(null);
      loadPlans();
    } catch (error: any) {
      toast({ title: "Error deleting", description: sanitizeErrorForUser(error), variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading muscle plans...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header — the outer hub provides the title; this subheading is for context. */}
      <div>
        <p className="text-sm text-muted-foreground">
          Planning Board drafts. Each draft is a multi-week mesocycle you can convert into a program.
        </p>
      </div>

      {/* Search */}
      {plans.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search plans..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Plans Grid */}
      {filteredPlans.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={plans.length === 0 ? "No muscle plans yet" : "No matching plans"}
          description={
            plans.length === 0
              ? "Start a new plan to design workouts by muscle group"
              : "Try a different search term"
          }
          action={
            plans.length === 0 ? (
              <Button onClick={onNewPlan}>
                <Plus className="h-4 w-4 mr-2" />
                New Plan
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPlans.map(plan => {
            const stats = planStats(plan.weeks);
            const firstWeekSlots = plan.weeks[0]?.slots || [];
            // Get top 4 muscle labels for preview
            const muscleCounts = new Map<string, number>();
            for (const s of firstWeekSlots) {
              muscleCounts.set(s.muscleId, (muscleCounts.get(s.muscleId) || 0) + s.sets);
            }
            const topMuscles = [...muscleCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([id]) => ({ id, display: getMuscleDisplay(id) }));

            return (
              <Card key={plan.id} className="group hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg line-clamp-1">{plan.name}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditPlan(plan.id)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicatePlan(plan)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget(plan)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {plan.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{plan.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                    {stats.weekCount > 1 && (
                      <>
                        <span>{stats.weekCount} weeks</span>
                        <span>&middot;</span>
                      </>
                    )}
                    <span>{stats.trainingDays} days</span>
                    <span>&middot;</span>
                    <span>{stats.muscleCount} muscles</span>
                    <span>&middot;</span>
                    <span>{stats.totalSets} sets/wk</span>
                    {plan.converted_program_id && (
                      <>
                        <span>&middot;</span>
                        <Badge variant="secondary" className="text-[10px] py-0">
                          <ArrowRightLeft className="h-3 w-3 mr-1" />
                          Converted
                        </Badge>
                      </>
                    )}
                  </div>
                  {/* Muscle preview dots */}
                  {topMuscles.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {topMuscles.map(
                        ({ id, display }) =>
                          display && (
                            <Badge key={id} variant="outline" className="text-xs gap-1 py-0">
                              <div className={`w-2 h-2 rounded-full ${display.colorClass}`} />
                              {display.label}
                            </Badge>
                          )
                      )}
                      {muscleCounts.size > 4 && (
                        <span className="text-xs text-muted-foreground">
                          +{muscleCounts.size - 4} more
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{timeAgo(plan.updated_at)}</span>
                    <Button variant="outline" size="sm" onClick={() => onEditPlan(plan.id)}>
                      <Edit className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete muscle plan?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be permanently deleted. This cannot be undone.
              {deleteTarget?.converted_program_id &&
                " The converted program will not be affected."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deletePlan}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
