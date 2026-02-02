import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, ChevronRight, CheckCircle2, Clock, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

interface TodayWorkoutsCardProps {
  userId: string;
}

interface TodayModule {
  id: string;
  title: string;
  module_type: string;
  status: string;
  sort_order: number;
  completed_at: string | null;
  module_owner_coach_id: string;
  coach_name?: string;
  exercise_count: number;
}

export function TodayWorkoutsCard({ userId }: TodayWorkoutsCardProps) {
  const [modules, setModules] = useState<TodayModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayId, setDayId] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchTodayWorkouts = useCallback(async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Get today's program day
      const { data: dayData, error: dayError } = await supabase
        .from("client_program_days")
        .select(`
          id,
          client_program_id,
          client_programs!inner (
            user_id,
            status
          )
        `)
        .eq("date", today)
        .eq("client_programs.user_id", userId)
        .eq("client_programs.status", "active")
        .maybeSingle();

      if (dayError) throw dayError;
      
      if (!dayData) {
        setModules([]);
        setLoading(false);
        return;
      }

      setDayId(dayData.id);

      // Get modules for today with coach info
      const { data: modulesData, error: modulesError } = await supabase
        .from("client_day_modules")
        .select(`
          id,
          title,
          module_type,
          status,
          sort_order,
          completed_at,
          module_owner_coach_id,
          coaches_public!client_day_modules_module_owner_coach_id_fkey (
            first_name,
            nickname
          ),
          client_module_exercises (count)
        `)
        .eq("client_program_day_id", dayData.id)
        .order("sort_order");

      if (modulesError) throw modulesError;

      const formattedModules: TodayModule[] = (modulesData || []).map((m: any) => ({
        id: m.id,
        title: m.title,
        module_type: m.module_type,
        status: m.status,
        sort_order: m.sort_order,
        completed_at: m.completed_at,
        module_owner_coach_id: m.module_owner_coach_id,
        coach_name: m.coaches_public?.nickname || m.coaches_public?.first_name || 'Coach',
        exercise_count: m.client_module_exercises?.[0]?.count || 0,
      }));

      setModules(formattedModules);
    } catch (error) {
      console.error("Error fetching today's workouts:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTodayWorkouts();
  }, [fetchTodayWorkouts]);

  const completedCount = modules.filter(m => m.status === 'completed').length;
  const totalCount = modules.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const getModuleTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      primary_strength: "bg-primary/10 text-primary border-primary/20",
      physio: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      mobility: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      running: "bg-green-500/10 text-green-500 border-green-500/20",
      calisthenics: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    };
    return colors[type] || "bg-muted text-muted-foreground";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'available':
        return <Dumbbell className="h-4 w-4 text-primary" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (modules.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-primary" />
            Today's Workouts
          </CardTitle>
          <CardDescription>
            {format(new Date(), 'EEEE, MMMM d')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Dumbbell className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>No workouts scheduled for today</p>
            <p className="text-sm mt-1">Enjoy your rest day!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-primary" />
              Today's Workouts
            </CardTitle>
            <CardDescription>
              {format(new Date(), 'EEEE, MMMM d')}
            </CardDescription>
          </div>
          <Badge variant="outline" className={progressPercent === 100 ? "bg-green-500/10 text-green-500" : ""}>
            {completedCount}/{totalCount} completed
          </Badge>
        </div>
        {totalCount > 0 && (
          <Progress value={progressPercent} className="mt-3 h-2" />
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {modules.map((module) => (
          <div
            key={module.id}
            className={`flex items-center justify-between p-4 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
              module.status === 'completed' ? 'bg-green-500/5 border-green-500/20' : 'border-border'
            }`}
            onClick={() => navigate(`/client/workout/session/${module.id}`)}
          >
            <div className="flex items-center gap-3">
              {getStatusIcon(module.status)}
              <div>
                <p className="font-medium">{module.title}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" className={`text-xs ${getModuleTypeColor(module.module_type)}`}>
                    {module.module_type.replace(/_/g, ' ')}
                  </Badge>
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {module.coach_name}
                  </span>
                  <span>• {module.exercise_count} exercises</span>
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        ))}
        
        <Button 
          variant="outline" 
          className="w-full mt-4"
          onClick={() => navigate('/client/workout/calendar')}
        >
          View Calendar
        </Button>
      </CardContent>
    </Card>
  );
}
