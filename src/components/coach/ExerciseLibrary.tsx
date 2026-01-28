import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Play, Dumbbell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Exercise {
  id: string;
  name: string;
  anatomical_name: string | null;
  primary_muscle: string;
  secondary_muscles: string[] | null;
  equipment: string | null;
  category: string;
  default_video_url: string | null;
  tags: string[] | null;
}

export function ExerciseLibrary() {
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string>("all");
  const [equipmentFilter, setEquipmentFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  const { data: exercises, isLoading } = useQuery({
    queryKey: ["exercise-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercise_library")
        .select("*")
        .eq("is_active", true)
        .order("primary_muscle")
        .order("name");

      if (error) throw error;
      return data as unknown as Exercise[];
    },
  });

  // Get unique filter options from data
  const muscles = [...new Set(exercises?.map((e) => e.primary_muscle) || [])].sort();
  const equipment = [...new Set(exercises?.map((e) => e.equipment).filter(Boolean) || [])].sort();
  const categories = [...new Set(exercises?.map((e) => e.category) || [])].sort();

  // Filter exercises
  const filteredExercises = exercises?.filter((exercise) => {
    const matchesSearch =
      search === "" ||
      exercise.name.toLowerCase().includes(search.toLowerCase()) ||
      exercise.anatomical_name?.toLowerCase().includes(search.toLowerCase()) ||
      exercise.tags?.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));

    const matchesMuscle = muscleFilter === "all" || exercise.primary_muscle === muscleFilter;
    const matchesEquipment = equipmentFilter === "all" || exercise.equipment === equipmentFilter;
    const matchesCategory = categoryFilter === "all" || exercise.category === categoryFilter;

    return matchesSearch && matchesMuscle && matchesEquipment && matchesCategory;
  });

  // Convert YouTube URL to embed URL
  const getEmbedUrl = (url: string) => {
    if (url.includes("youtu.be/")) {
      const videoId = url.split("youtu.be/")[1]?.split("?")[0];
      return `https://www.youtube.com/embed/${videoId}`;
    }
    if (url.includes("youtube.com/watch")) {
      const videoId = new URL(url).searchParams.get("v");
      return `https://www.youtube.com/embed/${videoId}`;
    }
    return url;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading exercises...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Exercise Library</h2>
        <p className="text-muted-foreground">Browse and search exercises for your programs</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises, muscles, or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={muscleFilter} onValueChange={setMuscleFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Muscle Group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Muscles</SelectItem>
            {muscles.map((muscle) => (
              <SelectItem key={muscle} value={muscle} className="capitalize">
                {muscle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Equipment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Equipment</SelectItem>
            {equipment.map((eq) => (
              <SelectItem key={eq} value={eq!} className="capitalize">
                {eq}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat} className="capitalize">
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        Showing {filteredExercises?.length || 0} of {exercises?.length || 0} exercises
      </p>

      {/* Exercise Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredExercises?.map((exercise) => (
          <Card
            key={exercise.id}
            className="hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => setSelectedExercise(exercise)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base leading-tight">{exercise.name}</CardTitle>
                {exercise.default_video_url && (
                  <Play className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>
              {exercise.anatomical_name && exercise.anatomical_name !== exercise.name && (
                <p className="text-xs text-muted-foreground">{exercise.anatomical_name}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="capitalize">
                  {exercise.primary_muscle}
                </Badge>
                {exercise.equipment && (
                  <Badge variant="outline" className="capitalize">
                    {exercise.equipment}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`capitalize ${
                    exercise.category === "strength"
                      ? "border-blue-500/50 text-blue-600"
                      : exercise.category === "mobility"
                      ? "border-green-500/50 text-green-600"
                      : ""
                  }`}
                >
                  {exercise.category}
                </Badge>
              </div>
              {exercise.secondary_muscles && exercise.secondary_muscles.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Also targets: {exercise.secondary_muscles.join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      {filteredExercises?.length === 0 && (
        <div className="text-center py-12">
          <Dumbbell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-lg">No exercises found</h3>
          <p className="text-muted-foreground">Try adjusting your search or filters</p>
        </div>
      )}

      {/* Exercise Detail Dialog */}
      <Dialog open={!!selectedExercise} onOpenChange={(open) => !open && setSelectedExercise(null)}>
        <DialogContent className="max-w-2xl">
          {selectedExercise && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedExercise.name}</DialogTitle>
                {selectedExercise.anatomical_name &&
                  selectedExercise.anatomical_name !== selectedExercise.name && (
                    <p className="text-sm text-muted-foreground">{selectedExercise.anatomical_name}</p>
                  )}
              </DialogHeader>

              <div className="space-y-4">
                {/* Video */}
                {selectedExercise.default_video_url && (
                  <div className="aspect-video rounded-lg overflow-hidden bg-black">
                    <iframe
                      src={getEmbedUrl(selectedExercise.default_video_url)}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}

                {/* Details */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Primary Muscle:</span>
                    <p className="font-medium capitalize">{selectedExercise.primary_muscle}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Equipment:</span>
                    <p className="font-medium capitalize">{selectedExercise.equipment || "None"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Category:</span>
                    <p className="font-medium capitalize">{selectedExercise.category}</p>
                  </div>
                  {selectedExercise.secondary_muscles && selectedExercise.secondary_muscles.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Secondary Muscles:</span>
                      <p className="font-medium capitalize">
                        {selectedExercise.secondary_muscles.join(", ")}
                      </p>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {selectedExercise.tags && selectedExercise.tags.length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">Tags:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {selectedExercise.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}