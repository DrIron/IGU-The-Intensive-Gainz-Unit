import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dumbbell, Search, Plus, X, Youtube, Pencil, ChevronDown, ChevronUp, AlertCircle, Loader2 } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useClientAccess, getAccessDeniedMessage } from "@/hooks/useClientAccess";

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

export default function WorkoutLibrary() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const access = useClientAccess();
  const hasRedirected = useRef(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMuscleGroups, setSelectedMuscleGroups] = useState<string[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exercisesLoaded, setExercisesLoaded] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    difficulty: "Beginner" as "Beginner" | "Intermediate" | "Advanced",
    youtube_url: "",
    selectedMuscles: {} as Record<string, string[]>,
    setup_instructions: [""],
    execution_instructions: [""],
    pitfalls: [""],
  });

  // Handle access control
  useEffect(() => {
    if (access.loading || hasRedirected.current) return;

    // Check if user has access
    const canAccess = access.isStaff || access.hasActiveSubscription;

    if (!canAccess) {
      hasRedirected.current = true;
      toast({
        variant: "destructive",
        title: "Access not available",
        description: getAccessDeniedMessage(access),
      });
      navigate("/dashboard");
    }
  }, [access, navigate, toast]);

  const fetchExercises = useCallback(async () => {
    // Read from both tables: exercise_library (107 seeded) and exercises (legacy coach-added)
    const [libRes, legacyRes] = await Promise.all([
      supabase
        .from("exercise_library")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("exercises")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (libRes.error && legacyRes.error) {
      toast({
        title: "Error loading exercises",
        description: sanitizeErrorForUser(libRes.error),
        variant: "destructive",
      });
      return;
    }

    // Map exercise_library rows to the Exercise display interface
    const libraryExercises: Exercise[] = (libRes.data || []).map(ex => ({
      id: ex.id,
      name: ex.name,
      muscle_groups: [ex.primary_muscle, ...(ex.secondary_muscles || [])],
      muscle_subdivisions: {} as Record<string, string[]>,
      difficulty: ex.category === 'cardio' ? 'Beginner' : ex.category === 'mobility' ? 'Beginner' : 'Intermediate',
      youtube_url: ex.default_video_url || null,
      setup_instructions: [],
      execution_instructions: [],
      pitfalls: [],
      created_at: ex.created_at,
    }));

    // Legacy exercises keep their original format
    const legacyExercises: Exercise[] = (legacyRes.data || []).map(ex => ({
      ...ex,
      muscle_subdivisions: ex.muscle_subdivisions as Record<string, string[]>,
      youtube_url: ex.youtube_url || null,
    }));

    setExercises([...libraryExercises, ...legacyExercises]);
  }, [toast]);

  // Load exercises when access is granted
  useEffect(() => {
    const canAccess = access.isStaff || access.hasActiveSubscription;
    if (!access.loading && canAccess && !exercisesLoaded) {
      fetchExercises();
      setExercisesLoaded(true);
    }
  }, [access.loading, access.isStaff, access.hasActiveSubscription, exercisesLoaded, fetchExercises]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const muscleGroups = Object.keys(formData.selectedMuscles);
      const muscleSubdivisions = formData.selectedMuscles;

      const authResult = await supabase.auth.getUser();
      const user = authResult.data?.user;
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
        title: editingExercise ? "Exercise updated" : "Exercise added",
        description: editingExercise ? "The exercise has been updated successfully." : "The exercise has been added to the library.",
      });

      fetchExercises();
      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(err),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setFormData({
      name: exercise.name,
      difficulty: exercise.difficulty as "Beginner" | "Intermediate" | "Advanced",
      youtube_url: exercise.youtube_url || "",
      selectedMuscles: exercise.muscle_subdivisions,
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

  const toggleMuscleGroup = (muscle: string) => {
    setFormData(prev => {
      const newMuscles = { ...prev.selectedMuscles };
      if (newMuscles[muscle]) {
        delete newMuscles[muscle];
      } else {
        newMuscles[muscle] = [];
      }
      return { ...prev, selectedMuscles: newMuscles };
    });
  };

  const toggleSubdivision = (muscle: string, subdivision: string) => {
    setFormData(prev => {
      const newMuscles = { ...prev.selectedMuscles };
      if (!newMuscles[muscle]) {
        newMuscles[muscle] = [subdivision];
      } else {
        const subs = newMuscles[muscle];
        if (subs.includes(subdivision)) {
          newMuscles[muscle] = subs.filter(s => s !== subdivision);
        } else {
          newMuscles[muscle] = [...subs, subdivision];
        }
      }
      return { ...prev, selectedMuscles: newMuscles };
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

  const toggleMuscleFilter = (muscle: string) => {
    setSelectedMuscleGroups(prev =>
      prev.includes(muscle)
        ? prev.filter(m => m !== muscle)
        : [...prev, muscle]
    );
  };

  const clearAllFilters = () => {
    setSelectedMuscleGroups([]);
    setSearchTerm("");
  };

  const filteredExercises = exercises.filter((exercise) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = searchTerm === "" || (
      exercise.name.toLowerCase().includes(search) ||
      exercise.muscle_groups.some(mg => mg.toLowerCase().includes(search)) ||
      Object.keys(exercise.muscle_subdivisions).some(muscle =>
        exercise.muscle_subdivisions[muscle].some(sub => sub.toLowerCase().includes(search))
      )
    );

    const matchesMuscleGroup = selectedMuscleGroups.length === 0 ||
      selectedMuscleGroups.some(selectedMuscle =>
        exercise.muscle_groups.includes(selectedMuscle)
      );

    return matchesSearch && matchesMuscleGroup;
  });

  const toggleCardExpansion = (exerciseId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(exerciseId)) {
        newSet.delete(exerciseId);
      } else {
        newSet.add(exerciseId);
      }
      return newSet;
    });
  };

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

  // Loading state
  if (access.loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <main className="container mx-auto px-4 pt-24 pb-12 max-w-7xl">
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (access.error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <main className="container mx-auto px-4 pt-24 pb-12 max-w-7xl">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-muted-foreground">Unable to load your access information. Please refresh the page.</p>
            <Button onClick={() => window.location.reload()} className="mt-4">
              Refresh Page
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Coach/Admin can edit exercises
  const isCoach = access.isStaff;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      
      <main className="container mx-auto px-4 pt-24 pb-12 max-w-7xl">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-gradient-to-r from-primary to-accent">
              <Dumbbell className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Exercise Library</h1>
          <p className="text-xl text-muted-foreground">
            Browse exercises with detailed instructions and video guides
          </p>
        </div>

        <div className="mb-8 space-y-4">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search exercises, muscle groups, or subdivisions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {(selectedMuscleGroups.length > 0 || searchTerm) && (
              <Button
                variant="outline"
                onClick={clearAllFilters}
                className="whitespace-nowrap"
              >
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            )}
            
            {isCoach && (
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Exercise
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              Filter by muscle group:
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(MUSCLE_GROUPS).map((muscle) => (
                <Badge
                  key={muscle}
                  variant={selectedMuscleGroups.includes(muscle) ? "default" : "outline"}
                  className="cursor-pointer transition-all hover:scale-105"
                  onClick={() => toggleMuscleFilter(muscle)}
                >
                  {muscle}
                  {selectedMuscleGroups.includes(muscle) && (
                    <X className="h-3 w-3 ml-1" />
                  )}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-6 text-sm text-muted-foreground">
          Showing {filteredExercises.length} of {exercises.length} exercises
        </div>

        {isCoach && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingExercise ? "Edit Exercise" : "Add New Exercise"}</DialogTitle>
                <DialogDescription>
                  {editingExercise ? "Update the exercise details" : "Add a new exercise with detailed instructions and video guide"}
                </DialogDescription>
              </DialogHeader>

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
                  <Label>Target Muscle Groups *</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {Object.entries(MUSCLE_GROUPS).map(([muscle, subdivisions]) => (
                      <div key={muscle} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={muscle}
                            checked={muscle in formData.selectedMuscles}
                            onCheckedChange={() => toggleMuscleGroup(muscle)}
                          />
                          <Label htmlFor={muscle} className="font-medium cursor-pointer">
                            {muscle}
                          </Label>
                        </div>
                        {muscle in formData.selectedMuscles && subdivisions.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {subdivisions.map((sub) => (
                              <div key={sub} className="flex items-center gap-2">
                                <Checkbox
                                  id={`${muscle}-${sub}`}
                                  checked={formData.selectedMuscles[muscle]?.includes(sub)}
                                  onCheckedChange={() => toggleSubdivision(muscle, sub)}
                                />
                                <Label htmlFor={`${muscle}-${sub}`} className="text-sm cursor-pointer">
                                  {sub}
                                </Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Setup Instructions</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => addInstruction('setup_instructions')}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {formData.setup_instructions.map((instruction, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="text-sm text-muted-foreground mt-2">{index + 1}.</span>
                      <Input
                        value={instruction}
                        onChange={(e) => updateInstruction('setup_instructions', index, e.target.value)}
                        placeholder="e.g., Lie flat on bench with feet firmly planted"
                      />
                      {formData.setup_instructions.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeInstruction('setup_instructions', index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Execution Instructions</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => addInstruction('execution_instructions')}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {formData.execution_instructions.map((instruction, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="text-sm text-muted-foreground mt-2">{index + 1}.</span>
                      <Input
                        value={instruction}
                        onChange={(e) => updateInstruction('execution_instructions', index, e.target.value)}
                        placeholder="e.g., Lower the bar to mid-chest level"
                      />
                      {formData.execution_instructions.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeInstruction('execution_instructions', index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Common Pitfalls</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => addInstruction('pitfalls')}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {formData.pitfalls.map((pitfall, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="text-sm text-muted-foreground mt-2">{index + 1}.</span>
                      <Input
                        value={pitfall}
                        onChange={(e) => updateInstruction('pitfalls', index, e.target.value)}
                        placeholder="e.g., Bouncing bar off chest"
                      />
                      {formData.pitfalls.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeInstruction('pitfalls', index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingExercise ? "Save Changes" : "Add Exercise"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {filteredExercises.length === 0 ? (
          <div className="text-center py-12">
            <Dumbbell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No exercises found</h3>
            <p className="text-muted-foreground">
              {searchTerm || selectedMuscleGroups.length > 0
                ? "Try adjusting your search or filters"
                : "No exercises have been added yet"}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredExercises.map((exercise) => {
              const isExpanded = expandedCards.has(exercise.id);
              
              return (
                <Card key={exercise.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg">{exercise.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        {isCoach && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(exercise)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge className={getDifficultyColor(exercise.difficulty)}>
                        {exercise.difficulty}
                      </Badge>
                      {exercise.muscle_groups.map((mg) => (
                        <Badge key={mg} variant="outline" className="text-xs">
                          {mg}
                        </Badge>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {exercise.youtube_url && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => window.open(exercise.youtube_url!, '_blank')}
                      >
                        <Youtube className="h-4 w-4 mr-2 text-red-500" />
                        Watch Video
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      className="w-full justify-between"
                      onClick={() => toggleCardExpansion(exercise.id)}
                    >
                      <span>Instructions</span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>

                    {isExpanded && (
                      <div className="space-y-4 text-sm">
                        {exercise.setup_instructions.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2">Setup</h4>
                            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                              {exercise.setup_instructions.map((instruction, i) => (
                                <li key={i}>{instruction}</li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {exercise.execution_instructions.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2">Execution</h4>
                            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                              {exercise.execution_instructions.map((instruction, i) => (
                                <li key={i}>{instruction}</li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {exercise.pitfalls.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2 text-amber-500">Common Pitfalls</h4>
                            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                              {exercise.pitfalls.map((pitfall, i) => (
                                <li key={i}>{pitfall}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {Object.entries(exercise.muscle_subdivisions).some(([_, subs]) => subs.length > 0) && (
                          <div>
                            <h4 className="font-semibold mb-2">Target Areas</h4>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(exercise.muscle_subdivisions).map(([muscle, subs]) =>
                                subs.map((sub) => (
                                  <Badge key={`${muscle}-${sub}`} variant="secondary" className="text-xs">
                                    {muscle}: {sub}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
