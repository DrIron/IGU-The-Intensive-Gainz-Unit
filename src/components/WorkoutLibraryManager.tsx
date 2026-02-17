import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, X, Youtube, Pencil, Zap, Trash2, List, Eye, EyeOff, Power, Loader2 } from "lucide-react";
import { ExerciseQuickAdd } from "@/components/admin/ExerciseQuickAdd";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';

interface QuickAddEntry {
  name: string;
  youtube_url: string;
  primary_muscle: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
}

interface Exercise {
  id: string;
  name: string;
  muscle_groups: string[];
  muscle_subdivisions: Record<string, string[]>;
  difficulty: string;
  youtube_url: string | null;
  setup_instructions: string[];
  execution_instructions: string[];
  pitfalls: string[];
  created_at: string;
  is_active: boolean;
  source_table: "exercises" | "exercise_library";
}

const MUSCLE_GROUPS = {
  "Pecs": ["Clavicular", "Sternal", "Costal"],
  "Lats": ["Thoracic", "Lumbar", "Iliac"],
  "Mid-back": [],
  "Upper Back": [],
  "Shoulders": ["Anterior", "Lateral", "Posterior"],
  "Quads": ["Rectus Femoris focused"],
  "Hamstrings": [],
  "Glutes": ["Maximus", "Medius", "Minimus"],
  "Calves": [],
  "Adductors": [],
  "Abductors": [],
  "Hip Flexors": [],
  "Elbow Flexors": ["Biceps - Short Head", "Biceps - Long Head", "Brachialis", "Brachioradialis"],
  "Triceps": ["Long", "Short", "Lateral"],
  "Forearm": ["Flexors", "Extensors"],
} as const;

export default function WorkoutLibraryManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Exercise | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeactivateOpen, setBulkDeactivateOpen] = useState(false);
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    difficulty: "Beginner" as "Beginner" | "Intermediate" | "Advanced",
    youtube_url: "",
    selectedMuscles: {} as Record<string, string[]>,
    setup_instructions: [""],
    execution_instructions: [""],
    pitfalls: [""],
  });

  // Quick Add state
  const [quickAddEntries, setQuickAddEntries] = useState<QuickAddEntry[]>([
    { name: "", youtube_url: "", primary_muscle: "", difficulty: "Beginner" },
  ]);
  const [isSubmittingQuickAdd, setIsSubmittingQuickAdd] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const fetchExercises = useCallback(async () => {
    // Fetch from both legacy `exercises` and main `exercise_library` tables
    const [legacyResult, libraryResult] = await Promise.all([
      supabase.from("exercises").select("*").order("created_at", { ascending: false }),
      supabase.from("exercise_library").select("*").order("name"),
    ]);

    if (legacyResult.error && libraryResult.error) {
      toast({
        title: "Error loading exercises",
        description: sanitizeErrorForUser(legacyResult.error),
        variant: "destructive",
      });
      return;
    }

    const legacyExercises: Exercise[] = (legacyResult.data || []).map(ex => ({
      ...ex,
      muscle_subdivisions: ex.muscle_subdivisions as Record<string, string[]>,
      youtube_url: ex.youtube_url || null,
      is_active: true,
      source_table: "exercises" as const,
    }));

    // Map exercise_library rows to the Exercise interface
    const libraryExercises: Exercise[] = (libraryResult.data || []).map(ex => ({
      id: ex.id,
      name: ex.name,
      muscle_groups: [ex.primary_muscle, ...(ex.secondary_muscles || [])],
      muscle_subdivisions: {},
      difficulty: "Intermediate",
      youtube_url: ex.default_video_url || null,
      setup_instructions: [],
      execution_instructions: ex.description ? [ex.description] : [],
      pitfalls: [],
      created_at: ex.created_at,
      is_active: ex.is_active,
      source_table: "exercise_library" as const,
    }));

    setExercises([...legacyExercises, ...libraryExercises]);
  }, [toast]);

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingForm(true);

    try {
      const muscleGroups = Object.keys(formData.selectedMuscles);
      const muscleSubdivisions = formData.selectedMuscles;

      const result = await supabase.auth.getUser();
      const user = result.data?.user;
      if (!user) {
        toast({
          title: "Not authenticated",
          description: "Please sign in and try again",
          variant: "destructive",
        });
        return;
      }

      const exerciseData = {
        name: formData.name,
        muscle_groups: muscleGroups,
        muscle_subdivisions: muscleSubdivisions,
        difficulty: formData.difficulty,
        youtube_url: formData.youtube_url || null,
        setup_instructions: formData.setup_instructions.filter(s => s.trim()),
        execution_instructions: formData.execution_instructions.filter(s => s.trim()),
        pitfalls: formData.pitfalls.filter(s => s.trim()),
      };

      let error;
      if (editingExercise) {
        const dbResult = await supabase
          .from("exercises")
          .update(exerciseData)
          .eq("id", editingExercise.id);
        error = dbResult.error;
      } else {
        const dbResult = await supabase
          .from("exercises")
          .insert({ ...exerciseData, created_by: user.id });
        error = dbResult.error;
      }

      if (error) {
        toast({
          title: editingExercise ? "Error updating exercise" : "Error adding exercise",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: editingExercise ? "Exercise updated successfully" : "Exercise added successfully",
      });

      setIsDialogOpen(false);
      setEditingExercise(null);
      fetchExercises();
      resetForm();
    } catch (err) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(err),
        variant: "destructive",
      });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleEdit = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setFormData({
      name: exercise.name,
      difficulty: exercise.difficulty as "Beginner" | "Intermediate" | "Advanced",
      youtube_url: exercise.youtube_url || "",
      selectedMuscles: exercise.muscle_subdivisions || exercise.muscle_groups.reduce((acc, mg) => ({ ...acc, [mg]: [] }), {}),
      setup_instructions: exercise.setup_instructions.length > 0 ? exercise.setup_instructions : [""],
      execution_instructions: exercise.execution_instructions.length > 0 ? exercise.execution_instructions : [""],
      pitfalls: exercise.pitfalls.length > 0 ? exercise.pitfalls : [""],
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      difficulty: "Beginner",
      youtube_url: "",
      selectedMuscles: {},
      setup_instructions: [""],
      execution_instructions: [""],
      pitfalls: [""],
    });
    setEditingExercise(null);
  };

  const toggleExerciseActive = async (exercise: Exercise, activate: boolean) => {
    try {
      const { error } = await supabase
        .from(exercise.source_table)
        .update({ is_active: activate })
        .eq("id", exercise.id);

      if (error) throw error;

      toast({
        title: activate ? "Exercise reactivated" : "Exercise deactivated",
        description: `"${exercise.name}" has been ${activate ? "reactivated" : "deactivated"}.`,
      });
      fetchExercises();
    } catch (error: any) {
      toast({
        title: "Error updating exercise",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const confirmDeactivate = async () => {
    if (!deleteTarget) return;
    await toggleExerciseActive(deleteTarget, false);
    setDeleteTarget(null);
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
    if (selectedIds.size === filteredExercises.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredExercises.map(e => e.id)));
    }
  };

  const bulkDeactivateExercises = async () => {
    try {
      const selected = exercises.filter(e => selectedIds.has(e.id));
      const libraryIds = selected.filter(e => e.source_table === "exercise_library").map(e => e.id);
      const legacyIds = selected.filter(e => e.source_table === "exercises").map(e => e.id);

      if (libraryIds.length > 0) {
        const { error } = await supabase
          .from("exercise_library")
          .update({ is_active: false })
          .in("id", libraryIds);
        if (error) throw error;
      }
      if (legacyIds.length > 0) {
        const { error } = await supabase
          .from("exercises")
          .update({ is_active: false } as any)
          .in("id", legacyIds);
        if (error) throw error;
      }

      toast({
        title: "Exercises deactivated",
        description: `${selectedIds.size} exercise${selectedIds.size > 1 ? "s" : ""} deactivated.`,
      });
      setSelectedIds(new Set());
      setBulkDeactivateOpen(false);
      fetchExercises();
    } catch (error: any) {
      toast({
        title: "Error deactivating exercises",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  // Quick Add functions
  const resetQuickAdd = () => {
    setQuickAddEntries([
      { name: "", youtube_url: "", primary_muscle: "", difficulty: "Beginner" },
    ]);
  };

  const addQuickAddRow = () => {
    setQuickAddEntries(prev => [
      ...prev,
      { name: "", youtube_url: "", primary_muscle: "", difficulty: "Beginner" },
    ]);
  };

  const removeQuickAddRow = (index: number) => {
    if (quickAddEntries.length > 1) {
      setQuickAddEntries(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateQuickAddEntry = (index: number, field: keyof QuickAddEntry, value: string) => {
    setQuickAddEntries(prev => prev.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry
    ));
  };

  const handleQuickAddSubmit = async () => {
    const validEntries = quickAddEntries.filter(e => e.name.trim() && e.primary_muscle);

    if (validEntries.length === 0) {
      toast({
        title: "No valid entries",
        description: "Please fill in at least one exercise with name and muscle group",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingQuickAdd(true);

    try {
      const result = await supabase.auth.getUser();
      const user = result.data?.user;
      if (!user) {
        toast({
          title: "Not authenticated",
          description: "Please sign in and try again",
          variant: "destructive",
        });
        return;
      }

      const exercisesToInsert = validEntries.map(entry => ({
        name: entry.name.trim(),
        muscle_groups: [entry.primary_muscle],
        muscle_subdivisions: { [entry.primary_muscle]: [] },
        difficulty: entry.difficulty,
        youtube_url: entry.youtube_url.trim() || null,
        setup_instructions: [],
        execution_instructions: [],
        pitfalls: [],
        created_by: user.id,
      }));

      const { error } = await supabase
        .from("exercises")
        .insert(exercisesToInsert);

      if (error) {
        toast({
          title: "Error adding exercises",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `Added ${validEntries.length} exercise${validEntries.length > 1 ? 's' : ''} successfully`,
      });

      setIsDialogOpen(false);
      resetQuickAdd();
      fetchExercises();
    } catch (err) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(err),
        variant: "destructive",
      });
    } finally {
      setIsSubmittingQuickAdd(false);
    }
  };

  const toggleMuscleGroup = (muscle: string) => {
    setFormData(prev => {
      const newSelected = { ...prev.selectedMuscles };
      if (newSelected[muscle]) {
        delete newSelected[muscle];
      } else {
        newSelected[muscle] = [];
      }
      return { ...prev, selectedMuscles: newSelected };
    });
  };

  const toggleSubdivision = (muscle: string, subdivision: string) => {
    setFormData(prev => {
      const newSelected = { ...prev.selectedMuscles };
      if (!newSelected[muscle]) newSelected[muscle] = [];
      
      const index = newSelected[muscle].indexOf(subdivision);
      if (index > -1) {
        newSelected[muscle] = newSelected[muscle].filter(s => s !== subdivision);
      } else {
        newSelected[muscle] = [...newSelected[muscle], subdivision];
      }
      
      return { ...prev, selectedMuscles: newSelected };
    });
  };

  const addInstruction = (type: 'setup_instructions' | 'execution_instructions' | 'pitfalls') => {
    setFormData(prev => ({
      ...prev,
      [type]: [...prev[type], ""],
    }));
  };

  const updateInstruction = (type: 'setup_instructions' | 'execution_instructions' | 'pitfalls', index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      [type]: prev[type].map((item, i) => i === index ? value : item),
    }));
  };

  const removeInstruction = (type: 'setup_instructions' | 'execution_instructions' | 'pitfalls', index: number) => {
    setFormData(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index),
    }));
  };

  const filteredExercises = exercises.filter((exercise) => {
    if (!showInactive && !exercise.is_active) return false;
    const search = searchTerm.toLowerCase();
    return (
      exercise.name.toLowerCase().includes(search) ||
      exercise.muscle_groups.some(mg => mg.toLowerCase().includes(search)) ||
      Object.keys(exercise.muscle_subdivisions).some(muscle =>
        exercise.muscle_subdivisions[muscle].some(sub => sub.toLowerCase().includes(search))
      )
    );
  });

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "Intermediate":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "Advanced":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Tabs defaultValue="library" className="space-y-6">
      <TabsList>
        <TabsTrigger value="library" className="flex items-center gap-2">
          <List className="h-4 w-4" />
          Exercise Library
        </TabsTrigger>
        <TabsTrigger value="quick-add" className="flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Quick Add
        </TabsTrigger>
      </TabsList>

      <TabsContent value="library" className="space-y-6">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search exercises, muscle groups, or subdivisions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Button
            variant={showInactive ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
          >
            {showInactive ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
            {showInactive ? "Showing Inactive" : "Show Inactive"}
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Exercise
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingExercise ? "Edit Exercise" : "Add Exercises"}</DialogTitle>
              <DialogDescription>
                {editingExercise ? "Update the exercise details" : "Add exercises with full details or use Quick Add for rapid entry"}
              </DialogDescription>
            </DialogHeader>

            {editingExercise ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Exercise Name *</Label>
                <Input
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Barbell Bench Press"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty *</Label>
                <Select 
                  value={formData.difficulty}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: value as "Beginner" | "Intermediate" | "Advanced" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Beginner">Beginner</SelectItem>
                    <SelectItem value="Intermediate">Intermediate</SelectItem>
                    <SelectItem value="Advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="youtube">YouTube URL</Label>
                <Input
                  id="youtube"
                  type="url"
                  value={formData.youtube_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, youtube_url: e.target.value }))}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>

              <div className="space-y-4">
                <Label>Muscle Groups & Subdivisions *</Label>
                <div className="grid grid-cols-2 gap-4 max-h-60 overflow-y-auto border rounded-md p-4">
                  {Object.entries(MUSCLE_GROUPS).map(([muscle, subdivisions]) => (
                    <div key={muscle} className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={muscle}
                          checked={!!formData.selectedMuscles[muscle]}
                          onCheckedChange={() => toggleMuscleGroup(muscle)}
                        />
                        <label htmlFor={muscle} className="font-semibold text-sm cursor-pointer">
                          {muscle}
                        </label>
                      </div>
                      {subdivisions.length > 0 && formData.selectedMuscles[muscle] && (
                        <div className="ml-6 space-y-1">
                          {subdivisions.map(sub => (
                            <div key={sub} className="flex items-center space-x-2">
                              <Checkbox
                                id={`${muscle}-${sub}`}
                                checked={formData.selectedMuscles[muscle]?.includes(sub)}
                                onCheckedChange={() => toggleSubdivision(muscle, sub)}
                              />
                              <label htmlFor={`${muscle}-${sub}`} className="text-sm cursor-pointer">
                                {sub}
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Setup Instructions</Label>
                <div className="space-y-2">
                  {formData.setup_instructions.map((instruction, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="text-sm text-muted-foreground mt-2">{index + 1}.</span>
                      <Input
                        value={instruction}
                        onChange={(e) => updateInstruction('setup_instructions', index, e.target.value)}
                        placeholder="Enter setup step"
                      />
                      {formData.setup_instructions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeInstruction('setup_instructions', index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addInstruction('setup_instructions')}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Setup Step
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Execution Instructions</Label>
                <p className="text-sm text-muted-foreground">Describe the exercise intent and movement</p>
                <div className="space-y-2">
                  {formData.execution_instructions.map((instruction, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="text-sm text-muted-foreground mt-2">{index + 1}.</span>
                      <Textarea
                        value={instruction}
                        onChange={(e) => updateInstruction('execution_instructions', index, e.target.value)}
                        placeholder="Describe the movement and intent"
                      />
                      {formData.execution_instructions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeInstruction('execution_instructions', index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addInstruction('execution_instructions')}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Execution Step
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Common Pitfalls</Label>
                <div className="space-y-2">
                  {formData.pitfalls.map((pitfall, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="text-sm text-muted-foreground mt-2">•</span>
                      <Input
                        value={pitfall}
                        onChange={(e) => updateInstruction('pitfalls', index, e.target.value)}
                        placeholder="Describe a common mistake"
                      />
                      {formData.pitfalls.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeInstruction('pitfalls', index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addInstruction('pitfalls')}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Pitfall
                  </Button>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => {
                  setIsDialogOpen(false);
                  resetForm();
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmittingForm}>
                  {isSubmittingForm && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingExercise ? "Update Exercise" : "Add Exercise"}
                </Button>
              </div>
            </form>
            ) : (
            <Tabs defaultValue="quick" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="quick" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Quick Add
                </TabsTrigger>
                <TabsTrigger value="full">Full Form</TabsTrigger>
              </TabsList>

              <TabsContent value="quick" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">
                  Rapidly add exercises with just the essentials. You can add details later.
                </p>

                <div className="space-y-3">
                  {/* Header row - hidden on mobile */}
                  <div className="hidden md:grid grid-cols-[1fr_1fr_140px_140px_40px] gap-2 text-sm font-medium text-muted-foreground">
                    <span>Exercise Name *</span>
                    <span>YouTube URL</span>
                    <span>Muscle Group *</span>
                    <span>Difficulty</span>
                    <span></span>
                  </div>

                  {/* Entry rows - stacked on mobile, grid on desktop */}
                  {quickAddEntries.map((entry, index) => (
                    <div key={index} className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30 md:p-0 md:border-0 md:bg-transparent md:grid md:grid-cols-[1fr_1fr_140px_140px_40px] md:items-center">
                      <div>
                        <Label className="text-xs text-muted-foreground md:hidden">Exercise Name *</Label>
                        <Input
                          value={entry.name}
                          onChange={(e) => updateQuickAddEntry(index, 'name', e.target.value)}
                          placeholder="e.g., Bench Press"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground md:hidden">YouTube URL</Label>
                        <Input
                          value={entry.youtube_url}
                          onChange={(e) => updateQuickAddEntry(index, 'youtube_url', e.target.value)}
                          placeholder="https://youtube.com/..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 md:contents">
                        <div>
                          <Label className="text-xs text-muted-foreground md:hidden">Muscle Group *</Label>
                          <Select
                            value={entry.primary_muscle}
                            onValueChange={(value) => updateQuickAddEntry(index, 'primary_muscle', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.keys(MUSCLE_GROUPS).map(muscle => (
                                <SelectItem key={muscle} value={muscle}>{muscle}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground md:hidden">Difficulty</Label>
                          <Select
                            value={entry.difficulty}
                            onValueChange={(value) => updateQuickAddEntry(index, 'difficulty', value as QuickAddEntry['difficulty'])}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Beginner">Beginner</SelectItem>
                              <SelectItem value="Intermediate">Intermediate</SelectItem>
                              <SelectItem value="Advanced">Advanced</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeQuickAddRow(index)}
                        disabled={quickAddEntries.length === 1}
                        className="self-end md:self-auto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" onClick={addQuickAddRow}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Another Row
                </Button>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => {
                    setIsDialogOpen(false);
                    resetQuickAdd();
                  }}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleQuickAddSubmit}
                    disabled={isSubmittingQuickAdd}
                  >
                    {isSubmittingQuickAdd && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {isSubmittingQuickAdd ? "Adding..." : `Add ${quickAddEntries.filter(e => e.name.trim() && e.primary_muscle).length} Exercise(s)`}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="full" className="mt-4">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Exercise Name *</Label>
                    <Input
                      id="name"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Barbell Bench Press"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="difficulty">Difficulty *</Label>
                    <Select
                      value={formData.difficulty}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: value as "Beginner" | "Intermediate" | "Advanced" }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Beginner">Beginner</SelectItem>
                        <SelectItem value="Intermediate">Intermediate</SelectItem>
                        <SelectItem value="Advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="youtube">YouTube URL</Label>
                    <Input
                      id="youtube"
                      type="url"
                      value={formData.youtube_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, youtube_url: e.target.value }))}
                      placeholder="https://youtube.com/watch?v=..."
                    />
                  </div>

                  <div className="space-y-4">
                    <Label>Muscle Groups & Subdivisions *</Label>
                    <div className="grid grid-cols-2 gap-4 max-h-60 overflow-y-auto border rounded-md p-4">
                      {Object.entries(MUSCLE_GROUPS).map(([muscle, subdivisions]) => (
                        <div key={muscle} className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`full-${muscle}`}
                              checked={!!formData.selectedMuscles[muscle]}
                              onCheckedChange={() => toggleMuscleGroup(muscle)}
                            />
                            <label htmlFor={`full-${muscle}`} className="font-semibold text-sm cursor-pointer">
                              {muscle}
                            </label>
                          </div>
                          {subdivisions.length > 0 && formData.selectedMuscles[muscle] && (
                            <div className="ml-6 space-y-1">
                              {subdivisions.map(sub => (
                                <div key={sub} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`full-${muscle}-${sub}`}
                                    checked={formData.selectedMuscles[muscle]?.includes(sub)}
                                    onCheckedChange={() => toggleSubdivision(muscle, sub)}
                                  />
                                  <label htmlFor={`full-${muscle}-${sub}`} className="text-sm cursor-pointer">
                                    {sub}
                                  </label>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Setup Instructions</Label>
                    <div className="space-y-2">
                      {formData.setup_instructions.map((instruction, index) => (
                        <div key={index} className="flex gap-2">
                          <span className="text-sm text-muted-foreground mt-2">{index + 1}.</span>
                          <Input
                            value={instruction}
                            onChange={(e) => updateInstruction('setup_instructions', index, e.target.value)}
                            placeholder="Enter setup step"
                          />
                          {formData.setup_instructions.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeInstruction('setup_instructions', index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addInstruction('setup_instructions')}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Setup Step
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Execution Instructions</Label>
                    <p className="text-sm text-muted-foreground">Describe the exercise intent and movement</p>
                    <div className="space-y-2">
                      {formData.execution_instructions.map((instruction, index) => (
                        <div key={index} className="flex gap-2">
                          <span className="text-sm text-muted-foreground mt-2">{index + 1}.</span>
                          <Textarea
                            value={instruction}
                            onChange={(e) => updateInstruction('execution_instructions', index, e.target.value)}
                            placeholder="Describe the movement and intent"
                          />
                          {formData.execution_instructions.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeInstruction('execution_instructions', index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addInstruction('execution_instructions')}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Execution Step
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Common Pitfalls</Label>
                    <div className="space-y-2">
                      {formData.pitfalls.map((pitfall, index) => (
                        <div key={index} className="flex gap-2">
                          <span className="text-sm text-muted-foreground mt-2">•</span>
                          <Input
                            value={pitfall}
                            onChange={(e) => updateInstruction('pitfalls', index, e.target.value)}
                            placeholder="Describe a common mistake"
                          />
                          {formData.pitfalls.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeInstruction('pitfalls', index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addInstruction('pitfalls')}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Pitfall
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => {
                      setIsDialogOpen(false);
                      resetForm();
                    }}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmittingForm}>
                      {isSubmittingForm && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Add Exercise
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Bulk selection bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
          <Checkbox
            checked={selectedIds.size === filteredExercises.length}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeactivateOpen(true)}
          >
            <Power className="h-4 w-4 mr-2" />
            Deactivate Selected
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

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredExercises.map((exercise) => (
          <Card key={exercise.id} className={`border-border/50 hover:border-primary/50 transition-all duration-300 ${selectedIds.has(exercise.id) ? "ring-2 ring-primary" : ""}`}>
            <CardHeader>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIds.has(exercise.id)}
                    onCheckedChange={() => toggleSelect(exercise.id)}
                    className="shrink-0"
                  />
                  <CardTitle className={`text-xl ${!exercise.is_active ? "opacity-50" : ""}`}>{exercise.name}</CardTitle>
                  {!exercise.is_active && (
                    <Badge variant="outline" className="bg-muted text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className={getDifficultyColor(exercise.difficulty)}>
                    {exercise.difficulty}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(exercise)}
                    className="h-8 w-8"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {exercise.is_active ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(exercise)}
                      className="h-8 w-8"
                      title="Deactivate"
                    >
                      <Power className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleExerciseActive(exercise, true)}
                      className="h-8 w-8"
                      title="Reactivate"
                    >
                      <Power className="h-4 w-4 text-green-500" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {exercise.muscle_groups.map(muscle => (
                  <Badge key={muscle} variant="secondary">{muscle}</Badge>
                ))}
              </div>
              {Object.entries(exercise.muscle_subdivisions).length > 0 && (
                <div className="flex gap-1 flex-wrap mt-2">
                  {Object.entries(exercise.muscle_subdivisions).map(([muscle, subs]) =>
                    subs.map(sub => (
                      <Badge key={`${muscle}-${sub}`} variant="outline" className="text-xs">
                        {sub}
                      </Badge>
                    ))
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {exercise.youtube_url && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(exercise.youtube_url!, '_blank')}
                >
                  <Youtube className="h-4 w-4 mr-2" />
                  Watch Video
                </Button>
              )}

              {exercise.setup_instructions.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Setup</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    {exercise.setup_instructions.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {exercise.execution_instructions.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Execution</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    {exercise.execution_instructions.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {exercise.pitfalls.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2 text-destructive">Common Pitfalls</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    {exercise.pitfalls.map((pitfall, i) => (
                      <li key={i}>{pitfall}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        </div>

        {filteredExercises.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">
              {searchTerm
                ? `No exercises found matching "${searchTerm}"`
                : 'No exercises found'}
            </p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="quick-add">
        <ExerciseQuickAdd />
      </TabsContent>

      {/* Bulk deactivate confirmation */}
      <Dialog open={bulkDeactivateOpen} onOpenChange={setBulkDeactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {selectedIds.size} exercise{selectedIds.size > 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              The selected exercises will be hidden from coaches.
              Exercises already assigned to client programs will not be affected.
              You can reactivate them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeactivateOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={bulkDeactivateExercises}>
              Deactivate {selectedIds.size} Exercise{selectedIds.size > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate exercise?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be deactivated and hidden from coaches.
              Exercises already assigned to client programs will not be affected.
              You can reactivate it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeactivate}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
