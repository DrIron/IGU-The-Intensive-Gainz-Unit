import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Copy, Edit, MoreVertical, BookOpen, Tag } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tables } from "@/integrations/supabase/types";

type ProgramTemplate = Tables<"program_templates"> & {
  program_template_days?: { id: string }[];
};

interface ProgramLibraryProps {
  coachUserId: string;
  onCreateProgram: () => void;
  onEditProgram: (programId: string) => void;
}

export function ProgramLibrary({ coachUserId, onCreateProgram, onEditProgram }: ProgramLibraryProps) {
  const [programs, setPrograms] = useState<ProgramTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadPrograms();
  }, [coachUserId]);

  const loadPrograms = async () => {
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
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
              title: mod.title,
              sort_order: mod.sort_order,
              status: "draft" as const,
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
        description: error.message,
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
        <Button onClick={onCreateProgram}>
          <Plus className="h-4 w-4 mr-2" />
          Create Program
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search programs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
              onClick={() =>
                setSelectedTags((prev) =>
                  prev.includes(tag)
                    ? prev.filter((t) => t !== tag)
                    : [...prev, tag]
                )
              }
            >
              <Tag className="h-3 w-3 mr-1" />
              {tag}
            </Badge>
          ))}
          {selectedTags.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedTags([])}
            >
              Clear
            </Button>
          )}
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPrograms.map((program) => (
            <Card key={program.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg line-clamp-1">{program.title}</CardTitle>
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
                  {program.visibility === "shared" && (
                    <>
                      <span>•</span>
                      <Badge variant="outline">Shared</Badge>
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
      )}
    </div>
  );
}
