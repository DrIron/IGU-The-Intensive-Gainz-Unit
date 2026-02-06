import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tables, Enums } from "@/integrations/supabase/types";

type Exercise = Tables<"exercise_library">;

interface ExercisePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectExercise: (exerciseId: string, section: Enums<"exercise_section">) => void;
  coachUserId: string;
}

const SECTIONS: { value: Enums<"exercise_section">; label: string }[] = [
  { value: "warmup", label: "Warm-up" },
  { value: "main", label: "Main Work" },
  { value: "accessory", label: "Accessory" },
  { value: "cooldown", label: "Cool-down" },
];

export function ExercisePickerDialog({
  open,
  onOpenChange,
  onSelectExercise,
  coachUserId,
}: ExercisePickerDialogProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<Enums<"exercise_section">>("main");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const { toast } = useToast();

  const loadExercises = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("exercise_library")
        .select("*")
        .eq("is_active", true)
        .or(`is_global.eq.true,created_by_coach_id.eq.${coachUserId}`)
        .order("name");

      if (error) throw error;
      setExercises(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading exercises",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  useEffect(() => {
    if (open) {
      loadExercises();
    }
  }, [open, loadExercises]);

  const filteredExercises = exercises.filter((exercise) => {
    const matchesSearch =
      searchQuery === "" ||
      exercise.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exercise.primary_muscle || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exercise.equipment || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || exercise.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = Array.from(new Set(exercises.map((e) => e.category))).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Add Exercise</DialogTitle>
          <DialogDescription>
            Select an exercise from the library to add to this module.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Section selector */}
          <div className="space-y-2">
            <Label>Add to Section</Label>
            <Select
              value={selectedSection}
              onValueChange={(v) => setSelectedSection(v as Enums<"exercise_section">)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTIONS.map((section) => (
                  <SelectItem key={section.value} value={section.value}>
                    {section.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search exercises..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category} className="capitalize">
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Exercise list */}
          <ScrollArea className="h-[400px] border rounded-md">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-muted-foreground">Loading exercises...</span>
              </div>
            ) : filteredExercises.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-muted-foreground">No exercises found</span>
              </div>
            ) : (
              <div className="divide-y">
                {filteredExercises.map((exercise) => (
                  <div
                    key={exercise.id}
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onSelectExercise(exercise.id, selectedSection)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectExercise(exercise.id, selectedSection);
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{exercise.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs capitalize">
                          {exercise.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground capitalize">
                          {exercise.primary_muscle}
                        </span>
                        {exercise.equipment && (
                          <span className="text-xs text-muted-foreground">
                            • {exercise.equipment}
                          </span>
                        )}
                      </div>
                    </div>
                    {!exercise.is_global && (
                      <Badge variant="secondary" className="text-xs">
                        Custom
                      </Badge>
                    )}
                    <div className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted">
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
