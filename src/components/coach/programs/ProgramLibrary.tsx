import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Plus, Search, Copy, Edit, MoreVertical, BookOpen, Tag, Trash2, X, User, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SimplePagination, createPagination } from "@/components/ui/simple-pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarRange, Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tables } from "@/integrations/supabase/types";
import { AssignFromLibraryDialog } from "./AssignFromLibraryDialog";

type ProgramTemplate = Tables<"program_templates"> & {
  program_template_days?: { id: string }[];
  /** When set, this program was converted from a Planning Board muscle plan
   *  and can be reopened via "Edit in Planning Board". Populated client-side
   *  from a reverse lookup on muscle_program_templates.converted_program_id. */
  source_muscle_plan_id?: string | null;
};

interface MacrocycleOption {
  id: string;
  name: string;
}

interface ProgramLibraryProps {
  coachUserId: string;
  onCreateProgram: () => void;
  onEditProgram: (programId: string) => void;
  /** When provided, shows the "Edit in Planning Board" menu item on programs
   *  that have a source muscle plan. The handler receives the muscle plan id
   *  (not the program id) and is expected to open Planning Board on a
   *  duplicate of that plan. */
  onEditInPlanningBoard?: (musclePlanId: string) => void;
}

export function ProgramLibrary({ coachUserId, onCreateProgram, onEditProgram, onEditInPlanningBoard }: ProgramLibraryProps) {
  const [programs, setPrograms] = useState<ProgramTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ProgramTemplate | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ programId: string; programTitle: string; mode: "client" | "team" } | null>(null);
  const [macrocycleOptions, setMacrocycleOptions] = useState<MacrocycleOption[]>([]);
  const { toast } = useToast();
  const PAGE_SIZE = 12;

  const loadPrograms = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("program_templates")
        .select(`
          *,
          program_template_days(id)
        `)
        .eq("owner_coach_id", coachUserId)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Reverse-lookup each program's source muscle plan (if any). This powers
      // the "Edit in Planning Board" action — hidden when no source plan exists.
      const ids = (data ?? []).map(p => p.id);
      const reverseMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data: plans, error: planErr } = await supabase
          .from("muscle_program_templates")
          .select("id, converted_program_id")
          .in("converted_program_id", ids);
        if (!planErr) {
          for (const plan of plans ?? []) {
            if (plan.converted_program_id) reverseMap.set(plan.converted_program_id, plan.id);
          }
        }
      }

      // Load macrocycle options for the "Add to macrocycle..." submenu.
      try {
        const { data: macros } = await supabase
          // @ts-expect-error macrocycles types not yet regenerated
          .from("macrocycles")
          .select("id, name")
          .eq("coach_id", coachUserId)
          .order("updated_at", { ascending: false });
        setMacrocycleOptions(((macros as Array<{ id: string; name: string }>) ?? []));
      } catch {
        // Macrocycles migration not applied yet -- gracefully empty.
        setMacrocycleOptions([]);
      }

      setPrograms(
        (data ?? []).map(p => ({
          ...p,
          source_muscle_plan_id: reverseMap.get(p.id) ?? null,
        })),
      );
    } catch (error: any) {
      toast({
        title: "Error loading programs",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  /** Append this program as the next mesocycle of a macrocycle.
   *  If macrocycleId is null, we create a new macrocycle named after the program
   *  and add this as its first block. */
  const addToMacrocycle = useCallback(
    async (programId: string, programTitle: string, macrocycleId: string | null) => {
      try {
        let targetId = macrocycleId;
        if (!targetId) {
          const { data: newMacro, error: createErr } = await supabase
            // @ts-expect-error types not regenerated
            .from("macrocycles")
            .insert({ coach_id: coachUserId, name: programTitle, description: null })
            .select("id")
            .single();
          if (createErr) throw createErr;
          targetId = (newMacro as { id: string }).id;
        }

        // Find next sequence in the target macrocycle.
        const { data: existing } = await supabase
          // @ts-expect-error types not regenerated
          .from("macrocycle_mesocycles")
          .select("sequence, program_template_id")
          .eq("macrocycle_id", targetId);
        const rows = (existing ?? []) as Array<{ sequence: number; program_template_id: string }>;
        if (rows.some(r => r.program_template_id === programId)) {
          toast({ title: "Already in that macrocycle" });
          return;
        }
        const nextSeq = rows.length === 0 ? 0 : Math.max(...rows.map(r => r.sequence)) + 1;

        const { error: insertErr } = await supabase
          // @ts-expect-error types not regenerated
          .from("macrocycle_mesocycles")
          .insert({ macrocycle_id: targetId, program_template_id: programId, sequence: nextSeq });
        if (insertErr) throw insertErr;

        toast({ title: "Added to macrocycle" });
        loadPrograms();
      } catch (e: any) {
        toast({
          title: "Error adding to macrocycle",
          description: sanitizeErrorForUser(e),
          variant: "destructive",
        });
      }
    },
    [coachUserId, toast, loadPrograms],
  );

  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadPrograms();
  }, [loadPrograms]);

  const duplicateProgram = async (program: ProgramTemplate) => {
    try {
      // Create new template
      const { data: newTemplate, error: templateError } = await supabase
        .from("program_templates")
        .insert({
          owner_coach_id: coachUserId,
          title: `${program.title} (Copy)`,
          description: program.description,
          level: program.level,
          tags: program.tags,
          visibility: "private",
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Get days from original
      const { data: originalDays, error: daysError } = await supabase
        .from("program_template_days")
        .select("*")
        .eq("program_template_id", program.id);

      if (daysError) throw daysError;

      if (originalDays && originalDays.length > 0) {
        // Create new days
        const newDays = originalDays.map((day) => ({
          program_template_id: newTemplate.id,
          day_index: day.day_index,
          day_title: day.day_title,
          notes: day.notes,
        }));

        const { data: createdDays, error: createDaysError } = await supabase
          .from("program_template_days")
          .insert(newDays)
          .select();

        if (createDaysError) throw createDaysError;

        // For each day, copy modules
        for (let i = 0; i < originalDays.length; i++) {
          const { data: originalModules } = await supabase
            .from("day_modules")
            .select("*")
            .eq("program_template_day_id", originalDays[i].id);

          if (originalModules && originalModules.length > 0 && createdDays) {
            const newModules = originalModules.map((mod) => ({
              program_template_day_id: createdDays[i].id,
              module_owner_coach_id: mod.module_owner_coach_id,
              module_type: mod.module_type,
              session_type: mod.session_type,
              session_timing: mod.session_timing,
              title: mod.title,
              sort_order: mod.sort_order,
              status: "draft" as const,
              source_muscle_id: mod.source_muscle_id,
            }));

            const { data: createdModules, error: modError } = await supabase
              .from("day_modules")
              .insert(newModules)
              .select();

            if (modError) throw modError;

            // For each module, copy exercises and prescriptions
            if (createdModules) {
              for (let j = 0; j < originalModules.length; j++) {
                const { data: originalExercises } = await supabase
                  .from("module_exercises")
                  .select("*, exercise_prescriptions(*)")
                  .eq("day_module_id", originalModules[j].id);

                if (originalExercises && originalExercises.length > 0) {
                  for (const exercise of originalExercises) {
                    const { data: newExercise, error: exError } = await supabase
                      .from("module_exercises")
                      .insert({
                        day_module_id: createdModules[j].id,
                        exercise_id: exercise.exercise_id,
                        section: exercise.section,
                        sort_order: exercise.sort_order,
                        instructions: exercise.instructions,
                      })
                      .select()
                      .single();

                    if (exError) throw exError;

                    // Copy prescription
                    if (exercise.exercise_prescriptions && exercise.exercise_prescriptions.length > 0) {
                      const prescription = exercise.exercise_prescriptions[0];
                      await supabase.from("exercise_prescriptions").insert({
                        module_exercise_id: newExercise.id,
                        set_count: prescription.set_count,
                        rep_range_min: prescription.rep_range_min,
                        rep_range_max: prescription.rep_range_max,
                        tempo: prescription.tempo,
                        rest_seconds: prescription.rest_seconds,
                        intensity_type: prescription.intensity_type,
                        intensity_value: prescription.intensity_value,
                        column_config: prescription.column_config,
                        sets_json: prescription.sets_json,
                        warmup_sets_json: prescription.warmup_sets_json,
                        custom_fields_json: prescription.custom_fields_json,
                        progression_notes: prescription.progression_notes,
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }

      toast({
        title: "Program duplicated",
        description: "Program has been copied successfully.",
      });
      loadPrograms();
    } catch (error: any) {
      toast({
        title: "Error duplicating program",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const deleteProgram = async () => {
    if (!deleteTarget) return;
    try {
      // A program_template can be referenced by two upstream tables:
      //  - muscle_program_templates.converted_program_id (the muscle plan that generated it)
      //  - coach_teams.current_program_template_id (teams using this as their current program)
      // Clear both links first so the DELETE doesn't 409.
      // Client_programs are independent copies and survive (see modal copy).
      const [{ error: unlinkMuscleError }, { error: unlinkTeamError }] = await Promise.all([
        supabase
          .from("muscle_program_templates")
          .update({ converted_program_id: null })
          .eq("converted_program_id", deleteTarget.id),
        supabase
          .from("coach_teams")
          .update({ current_program_template_id: null })
          .eq("current_program_template_id", deleteTarget.id),
      ]);
      if (unlinkMuscleError) throw unlinkMuscleError;
      if (unlinkTeamError) throw unlinkTeamError;

      const { error } = await supabase
        .from("program_templates")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;

      toast({
        title: "Program deleted",
        description: `"${deleteTarget.title}" has been deleted.`,
      });
      setDeleteTarget(null);
      loadPrograms();
    } catch (error: any) {
      // Surface the Postgres FK detail so the coach knows why (e.g. "still assigned to N clients").
      const detail = error?.message || error?.details || sanitizeErrorForUser(error);
      toast({
        title: "Error deleting program",
        description: detail,
        variant: "destructive",
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pagePrograms.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagePrograms.map(p => p.id)));
    }
  };

  const bulkDeletePrograms = async () => {
    try {
      const ids = Array.from(selectedIds);

      // Clear upstream references to avoid FK 409s.
      const [{ error: unlinkMuscleError }, { error: unlinkTeamError }] = await Promise.all([
        supabase
          .from("muscle_program_templates")
          .update({ converted_program_id: null })
          .in("converted_program_id", ids),
        supabase
          .from("coach_teams")
          .update({ current_program_template_id: null })
          .in("current_program_template_id", ids),
      ]);
      if (unlinkMuscleError) throw unlinkMuscleError;
      if (unlinkTeamError) throw unlinkTeamError;

      const { error } = await supabase
        .from("program_templates")
        .delete()
        .in("id", ids);

      if (error) throw error;

      toast({
        title: "Programs deleted",
        description: `${selectedIds.size} program${selectedIds.size > 1 ? "s" : ""} deleted.`,
      });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      loadPrograms();
    } catch (error: any) {
      const detail = error?.message || error?.details || sanitizeErrorForUser(error);
      toast({
        title: "Error deleting programs",
        description: detail,
        variant: "destructive",
      });
    }
  };

  // Get all unique tags
  const allTags = Array.from(
    new Set(programs.flatMap((p) => p.tags || []))
  ).filter(Boolean);

  // Filter programs
  const filteredPrograms = programs.filter((program) => {
    const matchesSearch =
      searchQuery === "" ||
      program.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (program.description || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTags =
      selectedTags.length === 0 ||
      selectedTags.some((tag) => (program.tags || []).includes(tag));

    return matchesSearch && matchesTags;
  });

  // Paginate filtered results
  const { paginate } = createPagination(filteredPrograms, PAGE_SIZE);
  const { paginatedItems: pagePrograms, totalPages, totalItems, pageSize } = paginate(currentPage);

  // Reset to page 1 when filters change
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    setCurrentPage(1);
  };

  const handleClearTags = () => {
    setSelectedTags([]);
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading programs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header — the outer hub already provides title + primary action,
          so we keep this lean. Empty-state CTA still offers Create. */}
      <div>
        <p className="text-sm text-muted-foreground">
          Completed mesocycles (multi-week program templates). Reuse them inside macrocycles or
          assign standalone.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search programs..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tags filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <Badge
              key={tag}
              variant={selectedTags.includes(tag) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => handleTagToggle(tag)}
            >
              <Tag className="h-3 w-3 mr-1" />
              {tag}
            </Badge>
          ))}
          {selectedTags.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearTags}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Bulk selection bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
          <Checkbox
            checked={selectedIds.size === pagePrograms.length}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      )}

      {/* Programs Grid */}
      {filteredPrograms.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No programs yet"
          description="Create your first program template to get started"
          action={
            <Button onClick={onCreateProgram}>
              <Plus className="h-4 w-4 mr-2" />
              Create Program
            </Button>
          }
        />
      ) : (
        <>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pagePrograms.map((program) => (
            <Card key={program.id} className={`group hover:shadow-md transition-shadow ${selectedIds.has(program.id) ? "ring-2 ring-primary" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={selectedIds.has(program.id)}
                      onCheckedChange={() => toggleSelect(program.id)}
                      className="shrink-0"
                    />
                    <CardTitle className="text-lg line-clamp-1">{program.title}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditProgram(program.id)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {/* Shown only when this program was originally converted from a
                          Planning Board muscle plan AND the parent page wants this option. */}
                      {onEditInPlanningBoard && program.source_muscle_plan_id && (
                        <DropdownMenuItem
                          onClick={() => onEditInPlanningBoard(program.source_muscle_plan_id!)}
                        >
                          <Layers className="h-4 w-4 mr-2" />
                          Edit in Planning Board
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => duplicateProgram(program)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setAssignTarget({ programId: program.id, programTitle: program.title, mode: "client" })}>
                        <User className="h-4 w-4 mr-2" />
                        Assign to Client
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setAssignTarget({ programId: program.id, programTitle: program.title, mode: "team" })}>
                        <Users className="h-4 w-4 mr-2" />
                        Assign to Team
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <CalendarRange className="h-4 w-4 mr-2" />
                          Add to macrocycle
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem
                            onClick={() => addToMacrocycle(program.id, program.title, null)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            New macrocycle with this
                          </DropdownMenuItem>
                          {macrocycleOptions.length > 0 && <DropdownMenuSeparator />}
                          {macrocycleOptions.map(m => (
                            <DropdownMenuItem
                              key={m.id}
                              onClick={() => addToMacrocycle(program.id, program.title, m.id)}
                            >
                              {m.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(program)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {program.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {program.description}
                  </p>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{(program.program_template_days?.length || 0) === 1 ? '1 day' : `${program.program_template_days?.length || 0} days`}</span>
                  {program.level && (
                    <>
                      <span>•</span>
                      <Badge variant="secondary" className="capitalize">
                        {program.level}
                      </Badge>
                    </>
                  )}
                </div>
                {program.tags && program.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {program.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {program.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{program.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onEditProgram(program.id)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Program
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <SimplePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={totalItems}
          pageSize={pageSize}
        />
        </>
      )}
      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} program{selectedIds.size > 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              This cannot be undone. All days, modules, and exercises in the selected programs will be deleted.
              Client copies will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={bulkDeletePrograms}>
              Delete {selectedIds.size} Program{selectedIds.size > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete program?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be permanently deleted. This cannot be undone.
              All days, modules, and exercises in this program will be deleted.
              Client copies will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteProgram}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign from library dialog */}
      {assignTarget && (
        <AssignFromLibraryDialog
          open={!!assignTarget}
          onOpenChange={(open) => !open && setAssignTarget(null)}
          programId={assignTarget.programId}
          programTitle={assignTarget.programTitle}
          coachUserId={coachUserId}
          mode={assignTarget.mode}
          onAssigned={loadPrograms}
        />
      )}
    </div>
  );
}
