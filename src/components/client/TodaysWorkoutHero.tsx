import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Play, Calendar, Clock, CheckCircle2, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

interface TodaysWorkoutHeroProps {
  userId: string;
}

interface TodayWorkout {
  dayId: string;
  dayTitle: string;
  dayNumber: number;
  programName: string;
  modules: {
    id: string;
    title: string;
    module_type: string;
    status: string;
    exercise_count: number;
  }[];
}

export function TodaysWorkoutHero({ userId }: TodaysWorkoutHeroProps) {
  const [workout, setWorkout] = useState<TodayWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTodayWorkout();
  }, [userId]);

  const fetchTodayWorkout = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // Get today's program day with program info
      const { data: dayData, error: dayError } = await supabase
        .from("client_program_days")
        .select(`
          id,
          title,
          day_number,
          client_program_id,
          client_programs!inner (
            user_id,
            status,
            programs (
              name
            )
          )
        `)
        .eq("date", today)
        .eq("client_programs.user_id", userId)
        .eq("client_programs.status", "active")
        .maybeSingle();

      if (dayError) throw dayError;

      if (!dayData) {
        setWorkout(null);
        setLoading(false);
        return;
      }

      // Get modules for today
      const { data: modulesData, error: modulesError } = await supabase
        .from("client_day_modules")
        .select(`
          id,
          title,
          module_type,
          status,
          sort_order,
          client_module_exercises (count)
        `)
        .eq("client_program_day_id", dayData.id)
        .order("sort_order");

      if (modulesError) throw modulesError;

      const modules = (modulesData || []).map((m: any) => ({
        id: m.id,
        title: m.title,
        module_type: m.module_type,
        status: m.status,
        exercise_count: m.client_module_exercises?.[0]?.count || 0,
      }));

      setWorkout({
        dayId: dayData.id,
        dayTitle: dayData.title || `Day ${dayData.day_number}`,
        dayNumber: dayData.day_number,
        programName: (dayData.client_programs as any)?.programs?.name || 'Your Program',
        modules,
      });
    } catch (error) {
      console.error("Error fetching today's workout:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartWorkout = () => {
    if (workout && workout.modules.length > 0) {
      // Find first incomplete module, or first module if all complete
      const incompleteModule = workout.modules.find(m => m.status !== 'completed');
      const targetModule = incompleteModule || workout.modules[0];
      navigate(`/client/workout/session/${targetModule.id}`);
    }
  };

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-12 w-40" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Rest day - no workout scheduled
  if (!workout) {
    return (
      <Card className="bg-gradient-to-br from-muted/50 via-background to-background border-border">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-full bg-muted">
                <Dumbbell className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</p>
                <h2 className="text-2xl font-bold">Rest Day</h2>
                <p className="text-muted-foreground">No workout scheduled for today. Enjoy your recovery!</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/client/workout/calendar')}>
              <Calendar className="h-4 w-4 mr-2" />
              View Week
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const completedCount = workout.modules.filter(m => m.status === 'completed').length;
  const totalModules = workout.modules.length;
  const totalExercises = workout.modules.reduce((sum, m) => sum + m.exercise_count, 0);
  const progressPercent = totalModules > 0 ? (completedCount / totalModules) * 100 : 0;
  const isComplete = completedCount === totalModules;
  const estimatedTime = totalExercises * 3; // rough estimate: 3 min per exercise

  return (
    <Card className={`border-2 ${isComplete ? 'bg-gradient-to-br from-green-500/10 via-green-500/5 to-background border-green-500/30' : 'bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/30'}`}>
      <CardContent className="p-6">
        <div className="flex flex-col gap-4">
          {/* Header row */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className={`p-4 rounded-full ${isComplete ? 'bg-green-500/20' : 'bg-primary/20'}`}>
                {isComplete ? (
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                ) : (
                  <Dumbbell className="h-8 w-8 text-primary" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</p>
                  <Badge variant="outline" className="text-xs">
                    {workout.programName}
                  </Badge>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold">
                  {workout.dayTitle}
                </h2>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Dumbbell className="h-4 w-4" />
                    {totalExercises} exercises
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    ~{estimatedTime} min
                  </span>
                  <Badge variant={isComplete ? "default" : "secondary"} className={isComplete ? "bg-green-500" : ""}>
                    {completedCount}/{totalModules} modules
                  </Badge>
                </div>
              </div>
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-2">
              {!isComplete ? (
                <Button
                  size="lg"
                  onClick={handleStartWorkout}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
                >
                  <Play className="h-5 w-5 mr-2" />
                  {completedCount > 0 ? 'Continue Workout' : 'Start Workout'}
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleStartWorkout}
                  className="border-green-500 text-green-600 hover:bg-green-500/10"
                >
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  View Completed
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => navigate('/client/workout/calendar')}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Full Week
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          {totalModules > 1 && (
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}

          {/* Module list (condensed) */}
          {workout.modules.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {workout.modules.map((module) => (
                <div
                  key={module.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                    module.status === 'completed'
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-background border-border'
                  }`}
                  onClick={() => navigate(`/client/workout/session/${module.id}`)}
                >
                  {module.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Dumbbell className="h-4 w-4 text-primary" />
                  )}
                  <span className="text-sm font-medium">{module.title}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
