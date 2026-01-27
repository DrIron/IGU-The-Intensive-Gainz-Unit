import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dumbbell, Video } from "lucide-react";
import WorkoutLibraryManager from "@/components/WorkoutLibraryManager";
import { EducationalVideosManager } from "@/components/EducationalVideosManager";

type ContentTab = "workouts" | "education";

export function ContentLibraryPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<ContentTab>("workouts");

  // Read tab from query params on mount
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "education" || tabParam === "educational-videos") {
      setActiveTab("education");
    } else if (tabParam === "workouts" || tabParam === "workout-library") {
      setActiveTab("workouts");
    }
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    const newTab = value as ContentTab;
    setActiveTab(newTab);
    // Update URL without triggering navigation
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", newTab);
    setSearchParams(newParams, { replace: true });
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="workouts" className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4" />
            Workout Library
          </TabsTrigger>
          <TabsTrigger value="education" className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Educational Videos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workouts" className="mt-6">
          <WorkoutLibraryManager />
        </TabsContent>

        <TabsContent value="education" className="mt-6">
          <EducationalVideosManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
