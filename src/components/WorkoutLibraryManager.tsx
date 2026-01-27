import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, X, Youtube, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

export default function WorkoutLibraryManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
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

  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    const { data, error } = await supabase
      .from("exercises")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error loading exercises",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setExercises((data || []).map(ex => ({
      ...ex,
      muscle_subdivisions: ex.muscle_subdivisions as Record<string, string[]>,
      youtube_url: ex.youtube_url || null,
    })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const muscleGroups = Object.keys(formData.selectedMuscles);
    const muscleSubdivisions = formData.selectedMuscles;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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
      const result = await supabase
        .from("exercises")
        .update(exerciseData)
        .eq("id", editingExercise.id);
      error = result.error;
    } else {
      const result = await supabase
        .from("exercises")
        .insert({ ...exerciseData, created_by: user.id });
      error = result.error;
    }

    if (error) {
      toast({
        title: editingExercise ? "Error updating exercise" : "Error adding exercise",
        description: error.message,
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
    <div className="space-y-6">
      <div className="flex gap-4 items-center">
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
                <Button type="submit">{editingExercise ? "Update Exercise" : "Add Exercise"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredExercises.map((exercise) => (
          <Card key={exercise.id} className="border-border/50 hover:border-primary/50 transition-all duration-300">
            <CardHeader>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xl">{exercise.name}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(exercise)}
                    className="h-8 w-8"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <Badge variant="outline" className={getDifficultyColor(exercise.difficulty)}>
                  {exercise.difficulty}
                </Badge>
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
            No exercises found matching "{searchTerm}"
          </p>
        </div>
      )}
    </div>
  );
}
