import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dumbbell,
  Play,
  Calendar,
  Clock,
  CheckCircle2,
  ChevronRight,
  Sunrise,
  Moon,
  Coffee
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isTomorrow, isPast, startOfDay } from "date-fns";
import { useNavigate } from "react-router-dom";

interface TodaysWorkoutHeroProps {
  userId: string;
}

interface TodayWorkout {
  dayId: string;
  dayTitle: string;
  dayIndex: number;
  programName: string;
  date: Date;
  modules: {
    id: string;
    title: string;
    module_type: string;
    status: string;
    exercise_count: number;
  }[];
}

interface UpcomingWorkout {
  dayId: string;
  dayTitle: string;
  date: Date;
  moduleCount: number;
}

export function TodaysWorkoutHero({ userId }: TodaysWorkoutHeroProps) {
  const [workout, setWorkout] = useState<TodayWorkout | null>(null);
  const [upcomingWorkout, setUpcomingWorkout] = useState<UpcomingWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: "Good morning", icon: Sunrise };
    if (hour < 17) return { text: "Good afternoon", icon: Coffee };
    return { text: "Good evening", icon: Moon };
  };

  const fetchTodayWorkout = useCallback(async () => {
    try {
      const today = startOfDay(new Date());
      const todayStr = format(today, 'yyyy-MM-dd');

      // Get active program with all days
      const { data: program, error: programError } = await supabase
        .from("client_programs")
        .select(`
          id,
          status,
          program_id,
          client_program_days (
            id,
            title,
            day_index,
            date,
            client_day_modules (
              id,
              title,
              module_type,
              status,
              sort_order,
              client_module_exercises (count)
            )
          )
        `)
        .eq("user_id", userId)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (programError) throw programError;

      if (!program || !program.client_program_days) {
        setWorkout(null);
        setUpcomingWorkout(null);
        setLoading(false);
        return;
      }

      // Fetch program name separately (FK join from client_programs to programs is unreliable in PostgREST)
      let programName = 'Your Program';
      if (program.program_id) {
        const { data: programData } = await supabase
          .from("programs")
          .select("name")
          .eq("id", program.program_id)
          .maybeSingle();
        if (programData?.name) programName = programData.name;
      }

      const days = program.client_program_days;
      let todayWorkout: TodayWorkout | null = null;
      let nextWorkout: UpcomingWorkout | null = null;

      // Sort days by date
      const sortedDays = [...days].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      for (const day of sortedDays) {
        const dayDate = new Date(day.date);
        const modules = (day.client_day_modules || []).map((m: any) => ({
          id: m.id,
          title: m.title,
          module_type: m.module_type,
          status: m.status,
          exercise_count: m.client_module_exercises?.[0]?.count || 0,
        }));

        // Check if this is today
        if (isToday(dayDate)) {
          todayWorkout = {
            dayId: day.id,
            dayTitle: day.title || `Day ${day.day_index}`,
            dayIndex: day.day_index,
            programName,
            date: dayDate,
            modules,
          };
        }

        // Find the next upcoming day (after today, has modules)
        if (!isPast(dayDate) && !isToday(dayDate) && modules.length > 0) {
          if (!nextWorkout || dayDate < nextWorkout.date) {
            nextWorkout = {
              dayId: day.id,
              dayTitle: day.title || `Day ${day.day_index}`,
              date: dayDate,
              moduleCount: modules.length,
            };
          }
        }
      }

      setWorkout(todayWorkout);
      setUpcomingWorkout(nextWorkout);
    } catch (error) {
      console.error("Error fetching today's workout:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTodayWorkout();
  }, [fetchTodayWorkout]);

  const handleStartWorkout = () => {
    if (workout && workout.modules.length > 0) {
      // Find first incomplete module, or first module if all complete
      const incompleteModule = workout.modules.find(m => m.status !== 'completed');
      const targetModule = incompleteModule || workout.modules[0];
      navigate(`/client/workout/session/${targetModule.id}`);
    }
  };

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardContent className="p-6">
          <div className="space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // No workout today - show rest day with upcoming workout preview
  if (!workout) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardContent className="p-0">
          {/* Header with greeting */}
          <div className="p-6 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <GreetingIcon className="h-4 w-4" />
              <span className="text-sm">{greeting.text}</span>
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">Rest Day Today</h2>
              <Badge variant="secondary">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Recovery
              </Badge>
            </div>
          </div>

          {/* Upcoming workout preview or calendar link */}
          <div className="px-6 pb-6">
            {upcomingWorkout ? (
              <div className="rounded-xl p-5 bg-muted/50 border border-border">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Coming {isTomorrow(upcomingWorkout.date) ? "Tomorrow" : format(upcomingWorkout.date, "EEEE, MMM d")}
                    </p>
                    <h3 className="text-xl font-bold">{upcomingWorkout.dayTitle}</h3>
                    <p className="text-muted-foreground">{upcomingWorkout.moduleCount} module{upcomingWorkout.moduleCount !== 1 ? 's' : ''}</p>
                  </div>
                  <Badge variant="secondary">Upcoming</Badge>
                </div>
                <Button
                  variant="default"
                  size="lg"
                  className="w-full h-12"
                  onClick={() => navigate("/client/workout/calendar")}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  View Full Schedule
                </Button>
              </div>
            ) : (
              <div className="rounded-xl p-5 bg-muted/50 border border-border text-center">
                <Dumbbell className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground mb-4">No upcoming workouts scheduled</p>
                <Button variant="outline" onClick={() => navigate('/client/workout/calendar')}>
                  <Calendar className="h-4 w-4 mr-2" />
                  View Calendar
                </Button>
              </div>
            )}
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
  const estimatedTime = Math.max(20, totalExercises * 3); // rough estimate: 3 min per exercise, min 20 min

  return (
    <Card className={`border-2 overflow-hidden ${isComplete ? 'bg-gradient-to-br from-green-500/10 via-green-500/5 to-background border-green-500/30' : 'bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/30'}`}>
      <CardContent className="p-0">
        {/* Header with greeting */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <GreetingIcon className="h-4 w-4" />
            <span className="text-sm">{greeting.text}</span>
          </div>
          <h2 className="text-2xl font-bold">Today's Workout</h2>
        </div>

        {/* Workout Card */}
        <div className="px-6 pb-6">
          <div className={`rounded-xl p-5 ${isComplete ? 'bg-green-500/10 border border-green-500/20' : 'bg-primary/10 border border-primary/20'}`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  {format(workout.date, "EEEE, MMMM d")}
                </p>
                <h3 className="text-xl font-bold">{workout.dayTitle}</h3>
                <p className="text-muted-foreground">{workout.programName}</p>
              </div>
              <Badge variant={isComplete ? "default" : "secondary"} className={isComplete ? "bg-green-500" : ""}>
                {completedCount}/{totalModules} complete
              </Badge>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-5">
              <span className="flex items-center gap-1.5">
                <Dumbbell className="h-4 w-4" />
                {totalExercises} exercises
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                ~{estimatedTime} min
              </span>
            </div>

            {/* Progress bar */}
            {totalModules > 1 && (
              <div className="mb-5">
                <Progress value={progressPercent} className="h-2" />
              </div>
            )}

            <div className="flex gap-3">
              {!isComplete ? (
                <Button
                  size="lg"
                  className="flex-1 h-12 text-base font-semibold"
                  onClick={handleStartWorkout}
                >
                  <Play className="h-5 w-5 mr-2" />
                  {completedCount > 0 ? 'Continue Workout' : 'Start Workout'}
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 h-12 border-green-500 text-green-600 hover:bg-green-500/10"
                  onClick={handleStartWorkout}
                >
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  View Completed
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                className="h-12"
                onClick={() => navigate('/client/workout/calendar')}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Calendar
              </Button>
            </div>
          </div>
        </div>

        {/* Module list (condensed) - shown inside workout card area */}
        {workout.modules.length > 1 && (
          <div className="px-6 pb-4">
            <div className="flex flex-wrap gap-2">
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
          </div>
        )}

        {/* Up next preview - show if there's an upcoming workout */}
        {upcomingWorkout && (
          <div className="px-6 pb-4">
            <button
              onClick={() => navigate("/client/workout/calendar")}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
            >
              <span className="text-muted-foreground">
                Up next: <span className="text-foreground font-medium">{upcomingWorkout.dayTitle}</span>
                {" · "}
                {isTomorrow(upcomingWorkout.date) ? "Tomorrow" : format(upcomingWorkout.date, "EEEE")}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
