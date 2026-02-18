import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Plus, Search, Copy, Edit, MoreVertical, BookOpen, Tag, Dumbbell, Trash2, X, User, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SimplePagination, createPagination } from "@/components/ui/simple-pagination";
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
import { Tables } from "@/integrations/supabase/types";
import { AssignFromLibraryDialog } from "./AssignFromLibraryDialog";

type ProgramTemplate = Tables<"program_templates"> & {
  program_template_days?: { id: string }[];
};

interface ProgramLibraryProps {
  coachUserId: string;
  onCreateProgram: () => void;
  onEditProgram: (programId: string) => void;
  onMuscleBuilder?: () => void;
}

export function ProgramLibrary({ coachUserId, onCreateProgram, onEditProgram, onMuscleBuilder }: ProgramLibraryProps) {
  const [programs, setPrograms] = useState<ProgramTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ProgramTemplate | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ programId: string; programTitle: string; mode: "client" | "team" } | null>(null);
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
      setPrograms(data || []);
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

  useEffect(() => {
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
      toast({
        title: "Error deleting program",
        description: sanitizeErrorForUser(error),
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
      const { error } = await supabase
        .from("program_templates")
        .delete()
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      toast({
        title: "Programs deleted",
        description: `${selectedIds.size} program${selectedIds.size > 1 ? "s" : ""} deleted.`,
      });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      loadPrograms();
    } catch (error: any) {
      toast({
        title: "Error deleting programs",
        description: sanitizeErrorForUser(error),
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold">Program Library</h2>
          <p className="text-muted-foreground">Create and manage your workout program templates</p>
        </div>
        <div className="flex gap-2">
          {onMuscleBuilder && (
            <Button variant="outline" onClick={onMuscleBuilder}>
              <Dumbbell className="h-4 w-4 mr-2" />
              Planning Board
            </Button>
          )}
          <Button onClick={onCreateProgram}>
            <Plus className="h-4 w-4 mr-2" />
            Create Program
          </Button>
        </div>
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
                  <span>{program.program_template_days?.length || 0} days</span>
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
